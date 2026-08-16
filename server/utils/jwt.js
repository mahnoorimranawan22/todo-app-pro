const jwt = require('jsonwebtoken');

/**
 * Sign a JWT for a user id.
 */
const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/**
 * Sign a short-lived, single-purpose token (email verification,
 * password reset). The purpose is embedded so tokens can't be reused
 * for a different flow.
 */
const signPurposeToken = (userId, purpose, expiresIn = '1h') =>
  jwt.sign({ id: userId, purpose }, process.env.JWT_SECRET, { expiresIn });

/**
 * Verify a purpose token. Returns the user id, or null when the token
 * is invalid, expired, or carries a different purpose.
 */
const readPurposeToken = (token, purpose) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload && payload.purpose === purpose ? payload.id : null;
  } catch {
    return null;
  }
};

module.exports = { signToken, signPurposeToken, readPurposeToken };
