/** Wrap async route handlers so rejections reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** JSON 404 for unknown API routes. */
const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

/** Centralized error handler — never leak stack traces in production. */
const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';

  // Mongoose validation errors → 400 with readable messages.
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Duplicate key (e.g. email already registered) → 409.
  if (err.code === 11000) {
    status = 409;
    message = 'That email is already registered';
  }

  // Invalid ObjectId → 400.
  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid id provided';
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(status).json({ message });
};

module.exports = { asyncHandler, notFound, errorHandler };
