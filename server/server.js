require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const { notFound, errorHandler } = require('./middleware/error');

// Fail fast with clear guidance when critical env vars are missing.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me')) {
  console.error(
    '\n❌ JWT_SECRET is missing or still the placeholder.\n' +
      '  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      '  then set it in server/.env\n'
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ---- Basic security headers ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// ---- Global rate limit (auth routes add their own stricter limiter) ----
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests — please slow down' },
  })
);

// ---- API routes ----
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found' }));

// ---- Serve the frontend (production / single-process deploy) ----
const clientPath = path.join(__dirname, '..', 'TO-DO APP');
app.use(express.static(clientPath));
app.get('*', (req, res) => res.sendFile(path.join(clientPath, 'index.html')));

// ---- Error handling ----
app.use(notFound);
app.use(errorHandler);

// ---- Start ----
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

start();
