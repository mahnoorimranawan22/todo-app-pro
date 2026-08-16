# 📝 Todo App Pro

A professional full-stack task manager with **Express + MongoDB + JWT authentication** and a polished, animated frontend in a unique **violet → fuchsia "Aurora" theme**.

---

## ✨ Features

### Authentication & Accounts
- **Register / log in** with JWT tokens (bcrypt-hashed passwords)
- Session persistence via token, auto re-auth on reload, graceful session-expiry handling
- **Email verification + password reset** (Resend, optional) with one-time links
- Per-user task isolation — every user only ever sees their own tasks

### Task Management
- Create, edit, toggle, and delete tasks with **undo** for accidental deletes
- **Subtasks** with their own progress bar
- **Notes** on every task
- Categories (Study / Work / Personal / Other), priorities (High / Medium / Low)
- Due dates with smart badges: *Due today*, *Due tomorrow*, *Overdue*
- **Live search**, **status filters** (All / Active / Done), and **5 sort modes** (newest, oldest, due date, priority, A–Z)
- **Bulk clear completed**, **export to JSON**, **import from JSON**

### Dashboard & UX
- **Analytics view**: completion ring, 8-week completion chart, category & priority breakdown
- Animated statistic counters and a gradient progress bar with confetti at 100%
- Toast notifications (success / error / info) with inline actions
- Staggered task entrance animations, modal transitions, ambient animated background
- Dark / light mode with system-preference detection and state memory
- Keyboard shortcuts: `Enter` to add, `/` to focus search, `Esc` to close
- Fully responsive, accessible (focus rings, `prefers-reduced-motion`), skeleton loading states

---

## 🛠️ Tech Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Vanilla ES Modules, HTML5, CSS3 (custom properties, animations) |
| Backend   | Node.js, Express |
| Database  | MongoDB via Mongoose |
| Auth      | JWT (`jsonwebtoken`) + bcrypt password hashing |
| Extra     | `express-rate-limit` (brute-force protection), `cors`, `morgan` |

---

## 📁 Project Structure

```
├── TO-DO APP/            # Frontend (served by the Express server)
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── api.js        # API client (fetch + JWT)
│       ├── ui.js         # Toasts, modal, confetti, helpers
│       └── app.js        # Main controller
└── server/               # Express REST API
    ├── server.js
    ├── config/db.js
    ├── models/           # User, Task
    ├── middleware/       # auth (JWT), error handling
    ├── routes/           # auth, tasks
    └── utils/jwt.js
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+**
- A MongoDB instance — either:
  - **MongoDB Atlas** (free tier, recommended): [create a cluster](https://www.mongodb.com/atlas) and copy the connection string, or
  - A local MongoDB (`mongod`) or Docker container

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/todoapp
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRES_IN=7d

# Optional — transactional emails (verification + password reset) via Resend
# Get a free API key at https://resend.com/api-keys
RESEND_API_KEY=
APP_URL=http://localhost:5000
EMAIL_FROM=Todo App Pro <onboarding@resend.dev>
```

> Without `RESEND_API_KEY`, the app runs normally but skips sending emails.


### 3. Run

```bash
npm run dev      # with auto-reload (nodemon)
# or
npm start
```

Open **http://localhost:5000** — the server serves both the API and the frontend.

---

## 🔌 API Reference

Base URL: `http://localhost:5000/api`

### Auth

| Method | Endpoint            | Body                              | Description            |
|--------|---------------------|-----------------------------------|------------------------|
| POST   | `/auth/register`    | `{ name, email, password }`       | Create account → token |
| POST   | `/auth/login`       | `{ email, password }`              | Log in → token         |
| GET    | `/auth/me`          | — (Bearer token)                  | Current user           |

### Tasks (all require `Authorization: Bearer <token>`)

| Method | Endpoint                       | Description                                |
|--------|--------------------------------|--------------------------------------------|
| GET    | `/tasks`                       | List tasks (see query params below)        |
| POST   | `/tasks`                       | Create task                                |
| PATCH  | `/tasks/:id`                   | Partial update                             |
| DELETE | `/tasks/:id`                   | Delete task                                |
| DELETE | `/tasks?scope=completed`       | Delete all completed tasks                 |
| POST   | `/tasks/import`                | Bulk import `{ tasks: [...] }`             |
| POST   | `/tasks/:id/subtasks`          | Add subtask                                |
| PATCH  | `/tasks/:id/subtasks/:subId`   | Update / toggle subtask                    |
| DELETE | `/tasks/:id/subtasks/:subId`   | Delete subtask                             |

**`GET /tasks` query params:**

| Param      | Values                              | Default  |
|------------|-------------------------------------|----------|
| `status`   | `all` \| `active` \| `completed`    | `all`    |
| `q`        | search text (case-insensitive)      | —        |
| `sort`     | `newest` \| `oldest` \| `due` \| `priority` \| `az` | `newest` |
| `category` | `Study` \| `Work` \| `Personal` \| `Other` | —        |

Returns `{ tasks, stats }` where `stats` = `{ total, completed, remaining, percent, overdue }`.

**Task shape:**

```json
{
  "id": "60f...",
  "text": "Ship the release",
  "category": "Work",
  "priority": "High",
  "dueDate": "2026-08-20T00:00:00.000Z",
  "notes": "",
  "subtasks": [{ "id": "...", "text": "Write changelog", "completed": false }],
  "completed": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## ☁️ Deployment

The Express server serves the frontend from `TO-DO APP/` via `express.static`, so a single deploy target runs the whole app.

### Render (recommended — free tier, auto-deploys from GitHub)

A [`render.yaml`](render.yaml) blueprint is included:

1. Push this repo to GitHub.
2. On [render.com](https://render.com), click **New → Blueprint** and point it at the repo (or use **Deploy from repo** on the web service).
3. Set the env vars in the Render dashboard:
   - `MONGODB_URI` — your Atlas connection string
   - `JWT_SECRET` — a long random string
   - `APP_URL` — your deployed URL, e.g. `https://todo-app-pro.onrender.com` (used in email links)
   - `RESEND_API_KEY` — optional, enables verification/reset emails
4. Deploy — Render installs `server/` deps and runs `npm start`.

The same env vars work on Railway, Fly.io, Heroku, or any VPS.

> **Netlify note:** the previous static-only deploy no longer applies — the app requires a running Node server. Use a platform that runs Node processes.
