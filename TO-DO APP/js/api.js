// ==========================================================
// API client — talks to the Express backend.
// JWT is kept in localStorage and attached as a Bearer token.
// ==========================================================

// ---- API base resolution ----
// 1. window.API_BASE_URL (set in index.html or by the host) wins.
// 2. Otherwise, probe the API server on this machine's default port.
// 3. Otherwise fall back to same-origin (an API server running on a
//    non-default port that also serves the frontend).
// Probing the API port first keeps the console clean when the page is
// served by a plain static host (e.g. Live Server) that 404s on /api/*.

const DEFAULT_API_PORT = 5000;

let apiBasePromise = null;

function resolveApiBase() {
  if (apiBasePromise) return apiBasePromise;

  const explicit = window.API_BASE_URL;
  if (explicit) {
    apiBasePromise = Promise.resolve(explicit);
    return apiBasePromise;
  }

  const host = location.hostname || 'localhost';
  const defaultOrigin = `http://${host}:${DEFAULT_API_PORT}`;
  apiBasePromise = fetch(`${defaultOrigin}/api/health`)
    .then((res) => (res.ok ? defaultOrigin : null))
    .catch(() => null)
    .then((base) => (base !== null ? base : ''));

  return apiBasePromise;
}

let token = localStorage.getItem('token') || null;

export function setToken(t) {
  token = t || null;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const base = await resolveApiBase();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server — is it running?', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.message || 'Something went wrong', res.status);
  }
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // Auth
  register: (name, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { name, email, password } }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) =>
    request('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
  verifyEmail: (token) => request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),

  // Tasks
  getTasks: (params = {}) => request(`/api/tasks${qs(params)}`),
  analytics: () => request('/api/tasks/analytics'),
  createTask: (task) => request('/api/tasks', { method: 'POST', body: task }),
  updateTask: (id, patch) => request(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  clearCompleted: () => request('/api/tasks?scope=completed', { method: 'DELETE' }),
  importTasks: (tasks) => request('/api/tasks/import', { method: 'POST', body: { tasks } }),

  // Subtasks
  addSubtask: (id, text) =>
    request(`/api/tasks/${id}/subtasks`, { method: 'POST', body: { text } }),
  updateSubtask: (id, subId, patch) =>
    request(`/api/tasks/${id}/subtasks/${subId}`, { method: 'PATCH', body: patch }),
  deleteSubtask: (id, subId) =>
    request(`/api/tasks/${id}/subtasks/${subId}`, { method: 'DELETE' }),
};
