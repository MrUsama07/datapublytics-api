const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Verify JWT and attach user to request
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Login required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admins (is_free_forever = 1) bypass trial/payment checks completely.
// Everyone else: must be inside trial_end OR have an active paid plan.
async function requireActivePlan(req, res, next) {
  const u = req.user;

  if (u.is_free_forever) return next(); // Admin = always free, full access

  const now = new Date();
  const trialEnd = new Date(u.trial_end);
  const stillInTrial = now <= trialEnd && u.plan === 'trial';
  const hasPaidPlan = ['100k', '10m', 'unlimited'].includes(u.plan) &&
    (!u.plan_renews_at || new Date(u.plan_renews_at) >= now);

  if (stillInTrial || hasPaidPlan) return next();

  return res.status(402).json({
    error: 'Trial expired. Please upgrade your plan to continue.',
    upgrade_url: '/pricing.html'
  });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access only' });
}

module.exports = { requireAuth, requireActivePlan, requireAdmin };
