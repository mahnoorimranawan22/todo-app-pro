const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { signToken, signPurposeToken, readPurposeToken } = require('../utils/jwt');
const { sendEmail, verificationEmail, resetEmail } = require('../utils/email');

// Public base URL used to build email links (set APP_URL in production).
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;

const router = express.Router();

// Slow down repeated auth attempts (brute-force protection).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts — please try again in 15 minutes' },
});
router.use(authLimiter);

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'That email is already registered' });
    }

    const user = await User.create({ name, email, password });
    const token = signToken(user._id);

    // Fire-and-forget verification email — never blocks registration,
    // and silently no-ops when no email provider is configured.
    const verifyToken = signPurposeToken(user._id, 'verify-email');
    sendEmail({
      to: user.email,
      subject: 'Verify your Todo App Pro account',
      html: verificationEmail(`${APP_URL}/verify-email?token=${verifyToken}`),
    });

    res.status(201).json({ token, user: user.toSafeJSON() });
  })
);

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(user._id);
    res.json({ token, user: user.toSafeJSON() });
  })
);

/**
 * POST /api/auth/forgot-password
 * Body: { email } — emails a reset link. Always returns the same
 * message whether or not the address exists (no user enumeration).
 */
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (user) {
      const resetToken = signPurposeToken(user._id, 'reset-password');
      await sendEmail({
        to: user.email,
        subject: 'Reset your Todo App Pro password',
        html: resetEmail(`${APP_URL}/reset-password?token=${resetToken}`),
      });
    }

    res.json({ message: 'If that email is registered, a reset link is on its way' });
  })
);

/**
 * POST /api/auth/reset-password
 * Body: { token, password } — sets a new password from a reset link.
 */
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ message: 'Reset link is missing' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const userId = readPurposeToken(token, 'reset-password');
    if (!userId) return res.status(400).json({ message: 'Invalid or expired reset link' });

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' });

    user.password = String(password); // pre-save hook hashes it
    await user.save();
    res.json({ message: 'Password updated — you can log in now' });
  })
);

/**
 * GET /api/auth/verify-email?token=… — confirms an email address.
 */
router.get(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const userId = readPurposeToken(req.query.token, 'verify-email');
    if (!userId) return res.status(400).json({ message: 'Invalid or expired verification link' });

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification link' });

    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }
    res.json({ message: 'Email verified — thanks!' });
  })
);

/**
 * GET /api/auth/me — current logged-in user.
 */
router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toSafeJSON() });
  })
);

module.exports = router;
