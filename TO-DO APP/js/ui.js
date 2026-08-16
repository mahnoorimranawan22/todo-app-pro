// ==========================================================
// UI helpers — toasts, modal, escaping, dates, counters, confetti.
// ==========================================================

// ---------- HTML escaping ----------
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

// ---------- Debounce ----------
export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// ---------- Date formatting ----------
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Returns { cls, label } describing a task's due date status. */
export function dueInfo(task) {
  if (!task.dueDate) return null;
  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay - today) / 86400000);

  if (task.completed) return { cls: '', label: `Due ${formatDate(task.dueDate)}` };
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return { cls: 'overdue', label: n <= 14 ? `Overdue · ${n}d late` : `Overdue · ${formatDate(task.dueDate)}` };
  }
  if (diffDays === 0) return { cls: 'due-soon', label: 'Due today' };
  if (diffDays === 1) return { cls: 'due-soon', label: 'Due tomorrow' };
  if (diffDays <= 14) return { cls: 'due-soon', label: `Due in ${diffDays} days` };
  return { cls: '', label: `Due ${formatDate(task.dueDate)}` };
}

// ---------- Animated counter ----------
export function animateCount(el, to, duration = 600) {
  const from = Number(el.dataset.value || 0);
  if (from === to) {
    el.textContent = to;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.dataset.value = to;
  };
  el.dataset.value = to;
  requestAnimationFrame(step);
}

// ---------- Toasts ----------
export function toast(type = 'info', message, { action, actionLabel = 'Undo' } = {}) {
  const container = document.getElementById('toasts');
  if (!container) return;

  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info}"></i>
    <span class="toast-text">${esc(message)}</span>
  `;

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      action();
      dismiss();
    });
    el.appendChild(btn);
  }

  container.appendChild(el);

  const dismiss = () => {
    if (!el.isConnected) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  };

  setTimeout(dismiss, 3500);
}

// ---------- Modal ----------
export function openModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ---------- Avatar initials ----------
export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------- Confetti ----------
export function confettiBurst() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#f59e0b', '#fb923c', '#f43f5e', '#e11d48', '#fcd34d', '#ffffff'];
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    vx: -1.5 + Math.random() * 3,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: -0.15 + Math.random() * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // gravity
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(1 - frame / 220, 0);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame += 1;
    if (frame < 260) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  animate();
}
