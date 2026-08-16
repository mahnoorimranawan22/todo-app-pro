// ==========================================================
// Todo App Pro — main controller.
// Handles auth flow, dashboard rendering, CRUD, subtasks,
// filters, export/import, and all UI interactions.
// ==========================================================

import { api, setToken, getToken, ApiError } from './api.js';
import {
  esc,
  debounce,
  dueInfo,
  animateCount,
  toast,
  openModal,
  closeModal,
  initials,
  confettiBurst,
} from './ui.js';

const $ = (id) => document.getElementById(id);

// ---------- State ----------
const state = {
  user: null,
  tasks: [],
  stats: { total: 0, completed: 0, remaining: 0, percent: 0, overdue: 0 },
  filter: 'all',
  sort: 'newest',
  q: '',
  loading: false,
  editingId: null,
  prevPercent: 0,
  authMode: 'login',
};

const expanded = new Set(); // task ids with the details panel open

// ==========================================================
// Auth
// ==========================================================

function showAuth() {
  $('authView').classList.remove('hidden');
  $('appView').classList.add('hidden');
  $('linkView').classList.add('hidden');
  setAuthMode('login');
  $('authEmail').focus();
}

function setAuthMode(mode) {
  state.authMode = mode;
  $('authTabLogin').classList.toggle('active', mode === 'login');
  $('authTabRegister').classList.toggle('active', mode === 'register');
  $('nameField').classList.toggle('hidden', mode !== 'register');
  $('passwordHint').classList.toggle('hidden', mode !== 'register');
  $('authSubmit').querySelector('.btn-label').textContent =
    mode === 'login' ? 'Log in' : 'Create account';
}

function showAuthError(message) {
  const el = $('authError');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideAuthError() {
  $('authError').classList.add('hidden');
}

function setAuthLoading(loading) {
  const btn = $('authSubmit');
  btn.disabled = loading;
  btn.querySelector('.btn-label').classList.toggle('hidden', loading);
  btn.querySelector('.spinner').classList.toggle('hidden', !loading);
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  hideAuthError();

  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;

  if (!email || !password) return showAuthError('Please fill in all fields');

  if (state.authMode === 'register') {
    if (!$('authName').value.trim()) return showAuthError('Please enter your name');
    if (password.length < 6) return showAuthError('Password must be at least 6 characters');
  }

  setAuthLoading(true);
  try {
    const data =
      state.authMode === 'login'
        ? await api.login(email, password)
        : await api.register($('authName').value.trim(), email, password);

    setToken(data.token);
    state.user = data.user;
    enterApp();
    toast('success', `Welcome, ${data.user.name.split(' ')[0]}!`);
  } catch (err) {
    showAuthError(err.message);
  } finally {
    setAuthLoading(false);
  }
}

function logout() {
  setToken(null);
  state.user = null;
  state.tasks = [];
  state.stats = { total: 0, completed: 0, remaining: 0, percent: 0, overdue: 0 };
  expanded.clear();
  $('userDropdown').classList.add('hidden');
  showAuth();
  toast('info', 'Logged out');
}

// ==========================================================
// App entry + data loading
// ==========================================================

function enterApp() {
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('userName').textContent = state.user.name;
  $('userEmail').textContent = state.user.email;
  $('userInitials').textContent = initials(state.user.name);
  refreshTasks();
}

function handleUnauthorized() {
  setToken(null);
  state.user = null;
  showAuth();
  toast('error', 'Session expired — please log in again');
}

async function refreshTasks() {
  state.loading = true;
  if (state.tasks.length === 0) render(); // show skeleton while first load

  try {
    const data = await api.getTasks({
      status: state.filter,
      q: state.q,
      sort: state.sort,
    });
    state.tasks = data.tasks;
    state.stats = data.stats;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      handleUnauthorized();
      return;
    }
    toast('error', err.message);
  } finally {
    state.loading = false;
    render();
  }
}

// ==========================================================
// Rendering
// ==========================================================

const skeletonHTML = () => `
  <li class="skeleton" style="height:72px"></li>
  <li class="skeleton" style="height:72px"></li>
  <li class="skeleton" style="height:72px"></li>`;

function emptyHTML() {
  let title;
  let sub;
  if (state.q) {
    title = 'No matches';
    sub = `Nothing found for “${esc(state.q)}”.`;
  } else if (state.filter === 'completed') {
    title = 'Nothing done yet';
    sub = 'Complete a task and it will show up here.';
  } else if (state.filter === 'active') {
    title = 'All caught up';
    sub = 'No active tasks — enjoy the calm.';
  } else {
    title = 'No tasks yet';
    sub = 'Add your first task above to get started.';
  }
  return `<li class="empty-state">
    <img class="empty-img"
         src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=400&q=70"
         alt="" loading="lazy" width="400" height="300">
    <h3>${title}</h3>
    <p>${sub}</p>
  </li>`;
}

function taskItemHTML(task, i) {
  const due = dueInfo(task);
  const subs = task.subtasks || [];
  const subDone = subs.filter((s) => s.completed).length;
  const subPct = subs.length ? Math.round((subDone / subs.length) * 100) : 0;
  const open = expanded.has(task.id) ? '' : 'hidden';

  return `
  <li class="task ${task.completed ? 'completed' : ''}" data-id="${esc(task.id)}" style="--i:${i}">
    <div class="task-main">
      <button class="check" data-action="toggle"
              title="${task.completed ? 'Mark as active' : 'Mark as complete'}">
        <i class="fa-solid fa-check"></i>
      </button>

      <div class="task-content">
        <div class="task-title-row">
          <span class="task-title">${esc(task.text)}</span>
          <span class="badge priority ${esc(task.priority.toLowerCase())}">${esc(task.priority)}</span>
        </div>
        <div class="task-meta">
          <span class="badge category">${esc(task.category)}</span>
          ${due ? `<span class="meta-date ${due.cls}"><i class="fa-solid fa-calendar-day"></i>${esc(due.label)}</span>` : ''}
          ${task.notes ? '<span class="meta-notes" title="Has notes"><i class="fa-solid fa-note-sticky"></i></span>' : ''}
          ${
            subs.length
              ? `<span class="meta-subtasks" title="${subDone}/${subs.length} subtasks done">
                  <svg class="sub-ring${subPct === 100 ? ' full' : ''}" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
                    <circle class="ring-bg" cx="10" cy="10" r="7.5"></circle>
                    <circle class="ring-fg" cx="10" cy="10" r="7.5" style="stroke-dasharray:47.12;stroke-dashoffset:${(47.12 * (1 - subPct / 100)).toFixed(2)}"></circle>
                  </svg>${subDone}/${subs.length}
                </span>`
              : ''
          }
        </div>
      </div>

      <div class="task-actions">
        <button class="icon-btn small edit-btn" data-action="edit" title="Edit task">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-btn small delete-btn" data-action="delete" title="Delete task">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>

    <div class="task-extras ${open}">
      ${task.notes ? `<div class="task-notes">${esc(task.notes)}</div>` : ''}
      ${
        subs.length
          ? `
        <div class="subtask-head">
          <span>Subtasks</span>
          <div class="subtask-bar"><span style="width:${subPct}%"></span></div>
        </div>
        <ul class="subtask-list">
          ${subs
            .map(
              (s) => `
            <li class="subtask ${s.completed ? 'completed' : ''}" data-subid="${esc(s.id)}">
              <button class="check" data-action="subtoggle" title="Toggle subtask"><i class="fa-solid fa-check"></i></button>
              <span class="subtask-text">${esc(s.text)}</span>
              <button class="subtask-del" data-action="subdelete" title="Remove subtask"><i class="fa-solid fa-xmark"></i></button>
            </li>`
            )
            .join('')}
        </ul>`
          : ''
      }
      <div class="subtask-add">
        <input type="text" placeholder="Add a subtask…" maxlength="200" data-role="subtask-input">
        <button data-action="subadd" title="Add subtask"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>
  </li>`;
}

// ---------- Welcome banner ----------
function updateBanner() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = (state.user?.name || 'there').split(' ')[0];
  $('bannerGreeting').textContent = `${part}, ${first} 👋`;

  const { total, remaining, overdue } = state.stats;
  let sub;
  if (total === 0) sub = 'Ready when you are — add your first task.';
  else if (overdue > 0) sub = `${overdue} overdue task${overdue > 1 ? 's' : ''} — let's knock them out.`;
  else if (remaining > 0) sub = `${remaining} task${remaining > 1 ? 's' : ''} to go. You've got this.`;
  else sub = 'All done — beautifully organized. 🎉';
  $('bannerSub').textContent = sub;
}

function render() {
  const { stats, tasks } = state;

  // Stats with animated counters
  animateCount($('totalTasks'), stats.total);
  animateCount($('completedTasks'), stats.completed);
  animateCount($('remainingTasks'), stats.remaining);

  // Filter tab counts
  $('countAll').textContent = stats.total;
  $('countActive').textContent = stats.remaining;
  $('countDone').textContent = stats.completed;

  // Progress
  const pct = stats.percent;
  $('progressBar').style.width = `${pct}%`;
  $('progressPercent').textContent = `${pct}%`;
  $('progressBar').parentElement.setAttribute('aria-valuenow', pct);
  $('progressLabel').textContent = stats.overdue > 0
    ? `${stats.overdue} overdue · Daily progress`
    : 'Daily progress';

  // Confetti when the list is fully completed
  if (pct === 100 && stats.completed > 0 && state.prevPercent < 100) confettiBurst();
  state.prevPercent = pct;

  // Bulk action visibility
  $('clearCompletedBtn').classList.toggle('hidden', stats.completed === 0);

  // Task list
  const list = $('taskList');
  if (state.loading && tasks.length === 0) {
    list.innerHTML = skeletonHTML();
  } else if (tasks.length === 0) {
    list.innerHTML = emptyHTML();
  } else {
    list.innerHTML = tasks.map((t, i) => taskItemHTML(t, i)).join('');
  }

  updateBanner();
}

// ==========================================================
// Task actions
// ==========================================================

async function addTask() {
  const text = $('taskInput').value.trim();
  if (!text) return;

  const btn = $('addBtn');
  btn.disabled = true;
  try {
    await api.createTask({
      text,
      category: $('categorySelect').value,
      priority: $('prioritySelect').value,
      dueDate: $('dueDateInput').value || null,
    });
    $('taskInput').value = '';
    $('dueDateInput').value = '';
    $('taskInput').focus();
    toast('success', 'Task added');
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function toggleComplete(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  try {
    await api.updateTask(id, { completed: !task.completed });
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  }
}

async function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  const li = $('taskList').querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (li) {
    li.style.transform = ''; // release any 3D tilt so the removal animation plays
    li.classList.add('removing');
  }

  const { id: _omit, ...data } = task;
  try {
    await api.deleteTask(id);
    await refreshTasks();
    toast('info', 'Task deleted', {
      action: () => restoreTask(data),
    });
  } catch (err) {
    toast('error', err.message);
    await refreshTasks();
  }
}

async function restoreTask(data) {
  try {
    await api.createTask({
      text: data.text,
      category: data.category,
      priority: data.priority,
      dueDate: data.dueDate || null,
      notes: data.notes || '',
      subtasks: (data.subtasks || []).map((s) => ({ text: s.text, completed: s.completed })),
    });
    toast('success', 'Task restored');
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  }
}

async function clearCompleted() {
  try {
    const res = await api.clearCompleted();
    toast('success', res.message);
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  }
}

// ---------- Subtasks ----------

async function addSubtask(id, inputEl) {
  const text = inputEl.value.trim();
  if (!text) return;
  try {
    await api.addSubtask(id, text);
    inputEl.value = '';
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  }
}

async function toggleSubtask(id, subId) {
  const task = state.tasks.find((t) => t.id === id);
  const sub = task?.subtasks.find((s) => s.id === subId);
  if (!task || !sub) return;
  try {
    await api.updateSubtask(id, subId, { completed: !sub.completed });
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  }
}

async function deleteSubtask(id, subId) {
  try {
    await api.deleteSubtask(id, subId);
    toast('info', 'Subtask removed');
    await refreshTasks();
  } catch (err) {
    toast('error', err.message);
  }
}

// ---------- Edit modal ----------

function openEdit(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  state.editingId = id;
  $('editText').value = task.text;
  $('editCategory').value = task.category;
  $('editPriority').value = task.priority;
  $('editDueDate').value = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '';
  $('editNotes').value = task.notes || '';
  $('modalError').classList.add('hidden');

  openModal();
  setTimeout(() => $('editText').focus(), 80);
}

function showModalError(message) {
  const el = $('modalError');
  el.textContent = message;
  el.classList.remove('hidden');
}

async function saveEdit(e) {
  e.preventDefault();

  const text = $('editText').value.trim();
  if (!text) return showModalError('Task text is required');

  const btn = $('saveEditBtn');
  btn.disabled = true;
  btn.querySelector('.btn-label').classList.add('hidden');
  btn.querySelector('.spinner').classList.remove('hidden');

  try {
    await api.updateTask(state.editingId, {
      text,
      category: $('editCategory').value,
      priority: $('editPriority').value,
      dueDate: $('editDueDate').value || null,
      notes: $('editNotes').value,
    });
    closeModal();
    toast('success', 'Task updated');
    await refreshTasks();
  } catch (err) {
    showModalError(err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-label').classList.remove('hidden');
    btn.querySelector('.spinner').classList.add('hidden');
  }
}

// ---------- Export / Import ----------

function exportTasks() {
  const payload = {
    app: 'todo-app-pro',
    exportedAt: new Date().toISOString(),
    tasks: state.tasks.map((t) => ({
      text: t.text,
      category: t.category,
      priority: t.priority,
      dueDate: t.dueDate,
      notes: t.notes,
      completed: t.completed,
      subtasks: t.subtasks,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todo-tasks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('success', `Exported ${state.tasks.length} task(s)`);
}

async function importTasks(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const tasks = Array.isArray(data) ? data : data.tasks || [];
    const res = await api.importTasks(tasks);
    toast('success', `Imported ${res.created} task(s)`);
    await refreshTasks();
  } catch (err) {
    toast('error', err.message || 'Could not read that file');
  }
}

// ==========================================================
// Email-link views (/reset-password, /verify-email)
// ==========================================================

function showLinkView(isReset, token) {
  $('authView').classList.add('hidden');
  $('appView').classList.add('hidden');
  $('linkView').classList.remove('hidden');

  if (isReset && token) {
    $('linkTitle').textContent = 'Set a new password';
    $('linkText').textContent = 'Choose a new password for your account.';
    $('linkFormWrap').classList.remove('hidden');
  } else if (isReset) {
    $('linkTitle').textContent = 'Invalid reset link';
    $('linkText').textContent = 'This link is missing or malformed — please request a new one.';
    $('linkFormWrap').classList.add('hidden');
  }
}

function showLinkError(message) {
  const el = $('linkError');
  el.textContent = message;
  el.classList.remove('hidden');
}

async function submitReset(token) {
  const pw = $('linkPassword').value;
  if (!pw || pw.length < 6) return showLinkError('Password must be at least 6 characters');
  try {
    await api.resetPassword(token, pw);
    $('linkFormWrap').classList.add('hidden');
    $('linkTitle').textContent = 'Password updated';
    $('linkText').textContent = 'You can now log in with your new password.';
    setTimeout(showAuth, 1800);
  } catch (err) {
    showLinkError(err.message);
  }
}

function handleEmailLink(route) {
  const token = new URLSearchParams(location.search).get('token');

  if (route === '/verify-email') {
    showLinkView(false, token);
    api
      .verifyEmail(token)
      .then((data) => {
        $('linkTitle').textContent = 'Email verified 🎉';
        $('linkText').textContent = `${data.message} You can close this tab and log in.`;
      })
      .catch((err) => {
        $('linkTitle').textContent = 'Verification failed';
        $('linkText').textContent = err.message;
      });
    return;
  }

  showLinkView(true, token);
  $('linkSubmit').addEventListener('click', () => submitReset(token));
  $('linkPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitReset(token);
  });
}

// ==========================================================
// Forgot password (auth card)
// ==========================================================

function setResetMode(on) {
  $('authTabs').classList.toggle('hidden', on);
  $('authForm').classList.toggle('hidden', on);
  $('resetPanel').classList.toggle('hidden', !on);
  $('resetError').classList.add('hidden');
  if (on) $('resetEmail').focus();
}

async function submitForgot() {
  const email = $('resetEmail').value.trim();
  if (!email) {
    $('resetError').textContent = 'Enter your email address';
    $('resetError').classList.remove('hidden');
    return;
  }
  const btn = $('resetSubmit');
  btn.disabled = true;
  try {
    await api.forgotPassword(email);
    $('resetPanel').innerHTML =
      '<p class="reset-intro">If that email is registered, a reset link is on its way. ' +
      'Check your inbox (and spam) — the link expires in 1 hour.</p>' +
      '<p class="auth-foot"><button id="backToLogin2" type="button" class="link-btn">← Back to login</button></p>';
    $('backToLogin2').addEventListener('click', () => setResetMode(false));
  } catch (err) {
    $('resetError').textContent = err.message;
    $('resetError').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

// ==========================================================
// Analytics
// ==========================================================

async function openAnalytics() {
  $('analyticsModal').classList.remove('hidden');
  try {
    const d = await api.analytics();
    renderAnalytics(d);
  } catch (err) {
    $('analyticsBody').innerHTML = `<p class="auth-error">${esc(err.message)}</p>`;
  }
}

function renderAnalytics(d) {
  const ringR = 34;
  const circ = 2 * Math.PI * ringR;
  $('completionRing').innerHTML = `
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle class="a-ring-bg" cx="40" cy="40" r="${ringR}"></circle>
      <circle class="a-ring-fg" cx="40" cy="40" r="${ringR}"
              style="stroke-dasharray:${circ.toFixed(2)};stroke-dashoffset:${(circ * (1 - d.percent / 100)).toFixed(2)}"></circle>
      <text x="40" y="47" text-anchor="middle">${d.percent}%</text>
    </svg>`;
  $('analyticsRate').textContent = `${d.percent}% complete`;
  $('analyticsMeta').textContent = `${d.completed} of ${d.total} tasks done`;

  const maxWeek = Math.max(1, ...d.weeks.map((w) => w.count));
  $('weekChart').innerHTML = d.weeks
    .map(
      (w) => `
      <div class="week-col" title="${w.count} completed">
        <div class="week-bar-wrap"><div class="week-bar" style="height:${(w.count / maxWeek) * 100}%"></div></div>
        <span class="week-label">${esc(w.label)}</span>
        <span class="week-count">${w.count}</span>
      </div>`
    )
    .join('');

  const catMax = Math.max(1, ...d.categories.map((x) => x.count));
  $('categoryBars').innerHTML = d.categories
    .map(
      (x) => `
      <li><span class="bar-name">${esc(x.name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(x.count / catMax) * 100}%"></div></div>
          <span class="bar-count">${x.count}</span></li>`
    )
    .join('');

  const priMax = Math.max(1, ...d.priorities.map((x) => x.count));
  $('priorityBars').innerHTML = d.priorities
    .map(
      (x) => `
      <li><span class="bar-name">${esc(x.name)}</span>
          <div class="bar-track"><div class="bar-fill pri-${esc(x.name.toLowerCase())}" style="width:${(x.count / priMax) * 100}%"></div></div>
          <span class="bar-count">${x.count}</span></li>`
    )
    .join('');
}

// ==========================================================
// Theme
// ==========================================================

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  $('themeBtn').innerHTML =
    theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved === 'dark' || (!saved && prefersDark) ? 'dark' : 'light');
}

// ==========================================================
// Events
// ==========================================================

function toggleExtras(li) {
  const extras = li.querySelector('.task-extras');
  if (!extras) return;

  const id = li.dataset.id;
  const willOpen = extras.classList.contains('hidden');
  extras.classList.toggle('hidden');

  if (willOpen) {
    expanded.add(id);
    const input = extras.querySelector('[data-role="subtask-input"]');
    input?.focus();
  } else {
    expanded.delete(id);
  }
}

function bindEvents() {
  // Auth
  $('authForm').addEventListener('submit', handleAuthSubmit);
  $('authTabLogin').addEventListener('click', () => setAuthMode('login'));
  $('authTabRegister').addEventListener('click', () => setAuthMode('register'));

  // Add task
  $('addBtn').addEventListener('click', addTask);
  $('taskInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
  });

  // Search + sort
  $('searchInput').addEventListener(
    'input',
    debounce((e) => {
      state.q = e.target.value.trim();
      refreshTasks();
    }, 300)
  );
  $('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    refreshTasks();
  });

  // Filter tabs
  $('filterTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    $('filterTabs').querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.filter = tab.dataset.status;
    refreshTasks();
  });

  // Bulk actions
  $('exportBtn').addEventListener('click', exportTasks);
  $('clearCompletedBtn').addEventListener('click', clearCompleted);
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importTasks(file);
    e.target.value = '';
  });

  // Theme + user menu
  $('themeBtn').addEventListener('click', () => {
    applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  });
  $('userBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('userDropdown').classList.toggle('hidden');
  });
  $('logoutBtn').addEventListener('click', logout);
  document.addEventListener('click', () => $('userDropdown').classList.add('hidden'));

  // Modal
  $('modalForm').addEventListener('submit', saveEdit);
  $('closeModalBtn').addEventListener('click', closeModal);
  $('cancelEditBtn').addEventListener('click', closeModal);
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
  });

  // Analytics modal
  $('analyticsBtn').addEventListener('click', openAnalytics);
  $('closeAnalyticsBtn').addEventListener('click', () => $('analyticsModal').classList.add('hidden'));
  $('analyticsModal').addEventListener('click', (e) => {
    if (e.target === $('analyticsModal')) $('analyticsModal').classList.add('hidden');
  });

  // Forgot password
  $('forgotLink').addEventListener('click', () => setResetMode(true));
  $('backToLogin').addEventListener('click', () => setResetMode(false));
  $('resetSubmit').addEventListener('click', submitForgot);
  $('resetEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitForgot();
  });

  // Task list (event delegation)
  const taskList = $('taskList');
  taskList.addEventListener('click', (e) => {
    const li = e.target.closest('.task');
    if (!li) return;
    const id = li.dataset.id;

    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === 'toggle') toggleComplete(id);
      else if (action === 'edit') openEdit(id);
      else if (action === 'delete') deleteTask(id);
      else if (action === 'subadd') {
        const input = li.querySelector('[data-role="subtask-input"]');
        addSubtask(id, input);
      } else if (action === 'subtoggle') {
        const subId = actionEl.closest('.subtask')?.dataset.subid;
        if (subId) toggleSubtask(id, subId);
      } else if (action === 'subdelete') {
        const subId = actionEl.closest('.subtask')?.dataset.subid;
        if (subId) deleteSubtask(id, subId);
      }
      return;
    }

    if (e.target.closest('.task-content')) toggleExtras(li);
  });

  taskList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('[data-role="subtask-input"]');
    if (!input) return;
    const li = input.closest('.task');
    if (li) addSubtask(li.dataset.id, input);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape') {
      if (!$('modal').classList.contains('hidden')) closeModal();
      $('analyticsModal').classList.add('hidden');
      $('userDropdown').classList.add('hidden');
      return;
    }
    if (e.key === '/' && !typing) {
      e.preventDefault();
      $('searchInput').focus();
    }
  });
}

// ==========================================================
// Parallax backdrop
// ==========================================================

// Drifts the fixed photo backdrop as the page scrolls
// (skipped entirely for users who prefer reduced motion).
function initParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const apply = () => {
    const y = Math.min(window.scrollY, 800) * 0.25;
    document.body.style.setProperty('--parallax-y', `${y}px`);
  };

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        apply();
        ticking = false;
      });
    },
    { passive: true }
  );
  apply();
}

// ==========================================================
// 3D tilt (stats cards + task rows)
// ==========================================================

// Subtle cursor tilt for lists, via delegation so re-rendered
// rows keep working. Only the hovered element is tilted; moving
// to a new element (or leaving the container) resets the old one.
function initElementTilts(selector, maxDeg, root) {
  let lastEl = null;

  root.addEventListener('mousemove', (e) => {
    const el = e.target.closest(selector);
    if (el !== lastEl) {
      if (lastEl) lastEl.style.transform = '';
      lastEl = el || null;
    }
    if (!el) return;

    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rotY = (px - 0.5) * 2 * maxDeg;
    const rotX = (0.5 - py) * 2 * maxDeg;
    el.style.transform =
      `perspective(700px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
  });

  root.addEventListener('mouseleave', () => {
    if (lastEl) {
      lastEl.style.transform = '';
      lastEl = null;
    }
  });
}

function initTilts() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce || !fineHover) return;

  const stats = document.querySelector('.stats');
  const taskList = $('taskList');
  if (stats) initElementTilts('.card', 6, stats);
  if (taskList) initElementTilts('.task', 4, taskList);
}

// ==========================================================
// 3D tilt (auth card)
// ==========================================================

// Tilts the auth card toward the cursor and moves a glare
// highlight to match. Skipped for touch devices and users who
// prefer reduced motion.
function initTilt() {
  const wrap = document.querySelector('.tilt-wrap');
  if (!wrap) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce || !fineHover) return;

  const MAX = 8; // max tilt in degrees

  wrap.addEventListener('mousemove', (e) => {
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rotY = (px - 0.5) * 2 * MAX;
    const rotX = (0.5 - py) * 2 * MAX;

    wrap.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
    wrap.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    wrap.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  });

  wrap.addEventListener('mouseleave', () => {
    wrap.style.transform = '';
  });
}

// ==========================================================
// Init
// ==========================================================

async function init() {
  initTheme();
  bindEvents();
  initParallax();
  initTilt();
  initTilts();

  // Email-link routes (/reset-password, /verify-email) bypass normal auth.
  const route = location.pathname;
  if (route === '/reset-password' || route === '/verify-email') {
    handleEmailLink(route);
    return;
  }

  if (!getToken()) {
    showAuth();
    return;
  }

  try {
    const { user } = await api.me();
    state.user = user;
    enterApp();
  } catch (err) {
    // Only discard the token on a genuine auth failure (401); keep it on
    // transient network errors so the user isn't logged out by a blip.
    if (err instanceof ApiError && err.status === 401) setToken(null);
    showAuth();
  }
}

init();
