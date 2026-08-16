const express = require('express');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

const router = express.Router();
router.use(protect); // every task route requires authentication

const VALID_CATEGORIES = ['Study', 'Work', 'Personal', 'Other'];
const VALID_PRIORITIES = ['High', 'Medium', 'Low'];
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const SORT_WHITELIST = ['newest', 'oldest', 'due', 'priority', 'az'];

/**
 * Load a task belonging to the authenticated user.
 * Returns [task, errorResponse] — callers short-circuit on errorResponse.
 */
const loadOwnedTask = async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
  if (!task) {
    res.status(404).json({ message: 'Task not found' });
    return [null, true];
  }
  return [task, false];
};

/** Build a Mongo sort object from a whitelisted key. */
const buildSort = (key) => {
  switch (key) {
    case 'oldest':
      return { createdAt: 1 };
    case 'az':
      return { text: 1 };
    default:
      return { createdAt: -1 };
  }
};

/** Sort keys that need aggregation (enum ranking / nulls-last). */
const AGG_SORTS = ['priority', 'due'];

const buildAggSort = (key) => {
  if (key === 'priority') {
    return {
      addFields: {
        priorityRank: {
          $switch: {
            branches: [
              { case: { $eq: ['$priority', 'High'] }, then: 0 },
              { case: { $eq: ['$priority', 'Medium'] }, then: 1 },
              { case: { $eq: ['$priority', 'Low'] }, then: 2 },
            ],
            default: 3,
          },
        },
      },
      sort: { priorityRank: 1, createdAt: -1 },
    };
  }
  // due — dates ascending, tasks without a due date last
  return {
    addFields: {
      noDueDate: { $cond: [{ $eq: ['$dueDate', null] }, 1, 0] },
    },
    sort: { noDueDate: 1, dueDate: 1, createdAt: -1 },
  };
};

/**
 * GET /api/tasks
 * Query: ?status=all|active|completed & q=<search> & sort=<key> & category=<name>
 * Returns { tasks, stats } where stats are computed across ALL of the user's tasks.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status = 'all', q = '', sort = 'newest', category } = req.query;

    const query = { user: req.user._id };
    if (status === 'active') query.completed = false;
    if (status === 'completed') query.completed = true;
    if (category && VALID_CATEGORIES.includes(category)) query.category = category;
    if (q) query.text = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const sortKey = SORT_WHITELIST.includes(sort) ? sort : 'newest';
    let tasks;

    if (AGG_SORTS.includes(sortKey)) {
      const { addFields, sort } = buildAggSort(sortKey);
      const ranked = await Task.aggregate([
        { $match: query },
        { $addFields: addFields },
        { $sort: sort },
        { $limit: 1000 },
      ]);
      tasks = ranked.map((t) => new Task(t).toSafeJSON());
    } else {
      tasks = (await Task.find(query).sort(buildSort(sortKey)).limit(1000)).map((t) => t.toSafeJSON());
    }

    // Stats across the user's whole list (unfiltered) for the dashboard.
    const all = await Task.find({ user: req.user._id });
    const completed = all.filter((t) => t.completed).length;
    const now = new Date();
    const overdue = all.filter((t) => !t.completed && t.dueDate && t.dueDate < now).length;
    const stats = {
      total: all.length,
      completed,
      remaining: all.length - completed,
      percent: all.length === 0 ? 0 : Math.round((completed / all.length) * 100),
      overdue,
    };

    res.json({ tasks, stats });
  })
);

/**
 * GET /api/tasks/analytics — dashboard chart data.
 * Weekly completion counts (last 8 weeks) + category/priority breakdown.
 */
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const user = req.user._id;
    const all = await Task.find({ user });

    // Monday-starting weeks for the last 8 weeks.
    const monday = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      const day = (x.getDay() + 6) % 7;
      x.setDate(x.getDate() - day);
      return x;
    };
    const startWeek = monday(new Date());
    startWeek.setDate(startWeek.getDate() - 7 * 7);

    const weeks = new Map();
    for (let i = 0; i < 8; i++) {
      const wk = new Date(startWeek);
      wk.setDate(startWeek.getDate() + i * 7);
      weeks.set(wk.toISOString().slice(0, 10), {
        label: wk.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        count: 0,
      });
    }
    for (const t of all) {
      if (!t.completed || !t.completedAt) continue;
      const key = monday(t.completedAt).toISOString().slice(0, 10);
      if (weeks.has(key)) weeks.get(key).count++;
    }

    const catCount = {};
    VALID_CATEGORIES.forEach((c) => (catCount[c] = 0));
    const priCount = {};
    VALID_PRIORITIES.forEach((p) => (priCount[p] = 0));
    all.forEach((t) => {
      if (catCount[t.category] !== undefined) catCount[t.category]++;
      if (priCount[t.priority] !== undefined) priCount[t.priority]++;
    });

    const completed = all.filter((t) => t.completed).length;
    res.json({
      weeks: [...weeks.values()],
      categories: VALID_CATEGORIES.map((name) => ({ name, count: catCount[name] })),
      priorities: VALID_PRIORITIES.map((name) => ({ name, count: priCount[name] })),
      percent: all.length === 0 ? 0 : Math.round((completed / all.length) * 100),
      total: all.length,
      completed,
    });
  })
);

/**
 * POST /api/tasks — create a task.
 * Body: { text, category, priority, dueDate, notes, subtasks }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { text, category, priority, dueDate, notes, subtasks } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Task text is required' });
    }

    const task = await Task.create({
      user: req.user._id,
      text: text.trim(),
      category: VALID_CATEGORIES.includes(category) ? category : 'Personal',
      priority: VALID_PRIORITIES.includes(priority) ? priority : 'Medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || '',
      subtasks: Array.isArray(subtasks) ? subtasks : [],
    });

    res.status(201).json({ task: task.toSafeJSON() });
  })
);

/**
 * POST /api/tasks/import — bulk create tasks.
 * Body: { tasks: [ { text, category, priority, dueDate, notes, completed } ] }
 */
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ message: 'Provide a non-empty tasks array' });
    }

    const docs = tasks.slice(0, 200).map((t) => ({
      user: req.user._id,
      text: String(t.text || '').trim().slice(0, 200),
      category: VALID_CATEGORIES.includes(t.category) ? t.category : 'Personal',
      priority: VALID_PRIORITIES.includes(t.priority) ? t.priority : 'Medium',
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      notes: String(t.notes || '').slice(0, 2000),
      completed: Boolean(t.completed),
    }));

    const valid = docs.filter((d) => d.text.length > 0);
    if (valid.length === 0) {
      return res.status(400).json({ message: 'No valid tasks found in the import file' });
    }

    const created = await Task.insertMany(valid);
    res.status(201).json({ created: created.length, tasks: created.map((t) => t.toSafeJSON()) });
  })
);

/**
 * PATCH /api/tasks/:id — partial update.
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const [task, err] = await loadOwnedTask(req, res);
    if (err) return;

    const { text, category, priority, dueDate, notes, completed } = req.body || {};

    if (text !== undefined) task.text = String(text).trim().slice(0, 200);
    if (category !== undefined && VALID_CATEGORIES.includes(category)) task.category = category;
    if (priority !== undefined && VALID_PRIORITIES.includes(priority)) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) task.notes = String(notes).slice(0, 2000);
    if (completed !== undefined) {
      task.completed = Boolean(completed);
      task.completedAt = completed ? new Date() : null;
    }

    await task.save();
    res.json({ task: task.toSafeJSON() });
  })
);

/**
 * DELETE /api/tasks/:id — delete one task.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const [task, err] = await loadOwnedTask(req, res);
    if (err) return;

    await Task.deleteOne({ _id: task._id });
    res.json({ message: 'Task deleted' });
  })
);

/**
 * DELETE /api/tasks?scope=completed — bulk delete completed tasks.
 */
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    if (req.query.scope !== 'completed') {
      return res.status(400).json({ message: 'Use ?scope=completed to bulk delete' });
    }
    const result = await Task.deleteMany({ user: req.user._id, completed: true });
    res.json({ message: `${result.deletedCount} completed task(s) cleared` });
  })
);

/**
 * POST /api/tasks/:id/subtasks — add a subtask.
 */
router.post(
  '/:id/subtasks',
  asyncHandler(async (req, res) => {
    const [task, err] = await loadOwnedTask(req, res);
    if (err) return;

    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ message: 'Subtask text is required' });

    task.subtasks.push({ text: text.slice(0, 200), completed: false });
    await task.save();
    res.status(201).json({ task: task.toSafeJSON() });
  })
);

/**
 * PATCH /api/tasks/:id/subtasks/:subtaskId — update or toggle a subtask.
 * Body: { text?, completed? }
 */
router.patch(
  '/:id/subtasks/:subtaskId',
  asyncHandler(async (req, res) => {
    const [task, err] = await loadOwnedTask(req, res);
    if (err) return;

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ message: 'Subtask not found' });

    const { text, completed } = req.body || {};
    if (text !== undefined) subtask.text = String(text).trim().slice(0, 200);
    if (completed !== undefined) subtask.completed = Boolean(completed);

    await task.save();
    res.json({ task: task.toSafeJSON() });
  })
);

/**
 * DELETE /api/tasks/:id/subtasks/:subtaskId — remove a subtask.
 */
router.delete(
  '/:id/subtasks/:subtaskId',
  asyncHandler(async (req, res) => {
    const [task, err] = await loadOwnedTask(req, res);
    if (err) return;

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ message: 'Subtask not found' });

    subtask.deleteOne();
    await task.save();
    res.json({ task: task.toSafeJSON() });
  })
);

module.exports = router;

