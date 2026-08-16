const { Resend } = require('resend');

// Wrapper around Resend. Returns true on success and false when emails
// are unavailable (no API key) or sending fails — callers decide
// whether that should be fatal.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM || 'Todo App Pro <onboarding@resend.dev>';

async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping "${subject}" to ${to}`);
    return false;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}

// ---------- Templates ----------

const layout = (title, inner) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#faf5f0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #f0e2d6;">
        <tr><td style="padding-bottom:16px;">
          <div style="background:linear-gradient(135deg,#f59e0b,#e11d48);border-radius:10px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:800;">✓</div>
        </td></tr>
        <tr><td style="font-size:22px;font-weight:700;color:#2b211c;padding-bottom:8px;">${title}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#5b4a3d;">${inner}</td></tr>
      </table>
      <p style="font-size:12px;color:#b39e8c;margin-top:16px;">Todo App Pro — you received this email because an account uses your address.</p>
    </td></tr>
  </table>
</body>
</html>`;

const buttonHTML = (href, label) => `
  <a href="${href}" style="display:inline-block;margin-top:18px;background:linear-gradient(135deg,#f59e0b,#e11d48);color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${label}</a>`;

const verificationEmail = (link) =>
  layout(
    'Verify your email',
    `<p>Welcome to <strong>Todo App Pro</strong>! Confirm your address to finish setting up your account.</p>
     ${buttonHTML(link, 'Verify email')}
     <p style="font-size:13px;color:#8b7463;margin-top:22px;">This link expires in 1 hour. If you didn't sign up, you can ignore this email.</p>`
  );

const resetEmail = (link) =>
  layout(
    'Reset your password',
    `<p>We received a request to reset your password. Click below to choose a new one.</p>
     ${buttonHTML(link, 'Reset password')}
     <p style="font-size:13px;color:#8b7463;margin-top:22px;">This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>`
  );

module.exports = { sendEmail, verificationEmail, resetEmail };
