// Temporary smoke test — exercises the live API end-to-end.
import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Task from './models/Task.js';

const BASE = 'http://localhost:5000/api';
const email = `smoke-${Date.now()}@test.dev`;
let token = '';

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

const expect = (cond, label) => {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
};

const run = async () => {
  console.log('▶ Registering user…');
  let r = await call('/auth/register', {
    method: 'POST',
    body: { name: 'Smoke Test', email, password: 'secret123' },
    auth: false,
  });
  expect(r.status === 201, `register → ${r.status}`);
  token = r.data.token;

  r = await call('/auth/me');
  expect(r.status === 200 && r.data.user.email === email, 'GET /auth/me');

  r = await call('/tasks', {
    method: 'POST',
    body: { text: 'Smoke task', category: 'Work', priority: 'High', dueDate: '2026-09-01' },
  });
  expect(r.status === 201, 'create task');
  const taskId = r.data.task.id;

  r = await call('/tasks?sort=due');
  expect(r.status === 200 && r.data.tasks.length === 1 && r.data.stats.total === 1, 'list + stats');

  r = await call(`/tasks/${taskId}`, { method: 'PATCH', body: { completed: true } });
  expect(r.status === 200 && r.data.task.completed === true, 'toggle complete');

  r = await call(`/tasks/${taskId}/subtasks`, { method: 'POST', body: { text: 'sub one' } });
  expect(r.status === 201 && r.data.task.subtasks.length === 1, 'add subtask');
  const subId = r.data.task.subtasks[0].id;

  r = await call(`/tasks/${taskId}/subtasks/${subId}`, { method: 'PATCH', body: { completed: true } });
  expect(r.status === 200 && r.data.task.subtasks[0].completed === true, 'toggle subtask');

  const unauth = await fetch(BASE + '/tasks').then((res) => res.status);
  expect(unauth === 401, 'tasks blocked without token');

  r = await call(`/tasks/${taskId}`, { method: 'DELETE' });
  expect(r.status === 200, 'delete task');

  r = await call('/auth/login', {
    method: 'POST',
    body: { email, password: 'secret123' },
    auth: false,
  });
  expect(r.status === 200 && !!r.data.token, 'login');

  console.log('\nALL SMOKE TESTS PASSED ✅');

  // Cleanup: remove the smoke-test user and any of their data.
  await mongoose.connect(process.env.MONGODB_URI);
  const u = await User.findOne({ email });
  if (u) {
    await Task.deleteMany({ user: u._id });
    await User.deleteOne({ _id: u._id });
    console.log('  cleaned up smoke-test user');
  }
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error('\nSMOKE TEST FAILED ❌', e.message);
  process.exit(1);
});
