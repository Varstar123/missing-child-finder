// Admin session endpoint for the restricted Alerts page.
//   POST   /api/login  { email, password }  -> sign in (sets HttpOnly cookie)
//   GET    /api/login                        -> { authenticated, email }
//   DELETE /api/login                        -> sign out (clears the cookie)
const auth = require('../lib/auth');

module.exports = async (req, res) => {
  // Never let a proxy/browser cache an auth response.
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const email = auth.getSessionEmail(req);
      return res.json({ authenticated: !!email, email: email || null });
    }

    if (req.method === 'DELETE') {
      auth.clearSessionCookie(req, res);
      return res.json({ ok: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    if (!auth.isConfigured()) {
      return res.status(503).json({
        error:
          'Admin login is not configured on the server. Set ADMIN_EMAILS, ' +
          'ADMIN_PASSWORD and SESSION_SECRET (in .env locally, or in the Vercel ' +
          'project environment variables).',
      });
    }

    const { email, password } = req.body || {};
    // Evaluate both checks regardless, so timing/branching doesn't reveal whether
    // it was the email or the password that was wrong.
    const okEmail = auth.isAllowedEmail(email);
    const okPassword = auth.safeEqual(password || '', auth.adminPassword());
    if (!okEmail || !okPassword) {
      return res.status(401).json({
        error: 'That email is not authorized, or the password is incorrect.',
      });
    }

    auth.setSessionCookie(req, res, auth.createToken(email));
    res.json({ ok: true, email: String(email).trim().toLowerCase() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
};
