const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireActivePlan } = require('../middleware/auth');

// helper: verify the site belongs to logged-in user (or admin can view any)
async function ownsSite(userId, role, siteId) {
  if (role === 'admin') {
    const [r] = await pool.query('SELECT id FROM sites WHERE id = ?', [siteId]);
    return r.length > 0;
  }
  const [r] = await pool.query('SELECT id FROM sites WHERE id = ? AND user_id = ?', [siteId, userId]);
  return r.length > 0;
}

function rangeToDays(range) {
  if (range === '2months') return 60;
  if (range === '3months') return 90;
  return 30; // default 1 month
}

// Resolve the effective date window for a request.
// Priority: explicit calendar dates (from/to) > preset range (1month/2months/3months)
function getDateWindow(query) {
  const { from, to, range } = query;

  if (from && to) {
    return { start: `${from} 00:00:00`, end: `${to} 23:59:59` };
  }

  const days = rangeToDays(range);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { start: fmt(start), end: fmt(end) };
}

// ================= OVERVIEW =================
router.get('/overview', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total_sessions,
            SUM(is_new_user) AS new_users,
            COUNT(DISTINCT visitor_uid) AS total_users,
            AVG(duration_sec) AS avg_duration,
            SUM(page_count) AS total_pageviews
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?`,
    [site_id, start, end]
  );

  const [daily] = await pool.query(
    `SELECT DATE(started_at) AS day, COUNT(*) AS sessions, SUM(is_new_user) AS new_users
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY DATE(started_at) ORDER BY day ASC`,
    [site_id, start, end]
  );

  res.json({ totals, daily, window: { start, end } });
});

// ================= REALTIME (live counters) =================
router.get('/realtime', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id, window_seconds } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });

  const [[counts]] = await pool.query(
    `SELECT
      SUM(last_seen_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)) AS active_5min,
      SUM(last_seen_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)) AS active_15min,
      SUM(last_seen_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)) AS active_30min,
      SUM(last_seen_at > DATE_SUB(NOW(), INTERVAL 60 MINUTE)) AS active_1hour
     FROM sessions WHERE site_id = ? AND last_seen_at > DATE_SUB(NOW(), INTERVAL 60 MINUTE)`,
    [site_id]
  );

  // Generic window (in seconds) for the live "Active users" timeframe chart
  // (covers 15s, 30s, 1min, 5min, 15min, 30min selections)
  let activeInWindow = 0;
  if (window_seconds) {
    const [[windowResult]] = await pool.query(
      `SELECT COUNT(*) AS active FROM sessions
       WHERE site_id = ? AND last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [site_id, parseInt(window_seconds, 10) || 300]
    );
    activeInWindow = windowResult.active || 0;
  }

  const [activePages] = await pool.query(
    `SELECT p.url, COUNT(*) AS active_users FROM sessions s
     JOIN pageviews p ON p.session_id = s.id
     WHERE s.site_id = ? AND s.last_seen_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     GROUP BY p.url ORDER BY active_users DESC LIMIT 10`,
    [site_id]
  );

  const [activeSources] = await pool.query(
    `SELECT source, medium, COUNT(*) AS active_users FROM sessions
     WHERE site_id = ? AND last_seen_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     GROUP BY source, medium ORDER BY active_users DESC LIMIT 10`,
    [site_id]
  );

  res.json({
    active_5min: counts.active_5min || 0,
    active_15min: counts.active_15min || 0,
    active_30min: counts.active_30min || 0,
    active_1hour: counts.active_1hour || 0,
    active_in_window: activeInWindow,
    top_active_pages: activePages,
    top_active_sources: activeSources
  });
});

// ================= SOURCE / MEDIUM =================
router.get('/source-medium', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [sources] = await pool.query(
    `SELECT source, medium, COUNT(*) AS sessions, SUM(is_new_user) AS new_users
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY source, medium ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(sources);
});

// ================= COUNTRY =================
router.get('/country', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [countries] = await pool.query(
    `SELECT country, country_code, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY country, country_code ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(countries);
});

// ================= EVENTS =================
router.get('/events', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [events] = await pool.query(
    `SELECT event_name, event_category, COUNT(*) AS total
     FROM events WHERE site_id = ? AND occurred_at BETWEEN ? AND ?
     GROUP BY event_name, event_category ORDER BY total DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(events);
});

// ================= AUDIENCE (daily records, sessions, new users) =================
router.get('/audience', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [daily] = await pool.query(
    `SELECT DATE(started_at) AS day,
            COUNT(*) AS total_sessions,
            SUM(is_new_user) AS new_users,
            COUNT(DISTINCT visitor_uid) AS unique_users
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY DATE(started_at) ORDER BY day ASC`,
    [site_id, start, end]
  );
  res.json(daily);
});

// ================= DEVICES (mobile/web/server split) =================
router.get('/devices', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [devices] = await pool.query(
    `SELECT device_type, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY device_type ORDER BY sessions DESC`,
    [site_id, start, end]
  );

  const [browsers] = await pool.query(
    `SELECT browser, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY browser ORDER BY sessions DESC LIMIT 10`,
    [site_id, start, end]
  );

  res.json({ devices, browsers });
});

// ================= UTM SOURCE (Acquisition) =================
router.get('/utm-source', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [rows] = await pool.query(
    `SELECT source, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY source ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= UTM MEDIUM (Acquisition) =================
router.get('/utm-medium', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [rows] = await pool.query(
    `SELECT medium, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY medium ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= UTM CAMPAIGN (Acquisition) =================
router.get('/utm-campaign', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [rows] = await pool.query(
    `SELECT COALESCE(campaign, '(not set)') AS campaign, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY campaign ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= REFERRER =================
router.get('/referrer', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [rows] = await pool.query(
    `SELECT COALESCE(referrer, '(direct)') AS referrer, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY referrer ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= ENTRY PAGES (Acquisition) =================
router.get('/entry-pages', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  // landing_page is recorded on each session at the moment it's created (the first pageview)
  const [rows] = await pool.query(
    `SELECT landing_page AS url, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ? AND landing_page IS NOT NULL
     GROUP BY landing_page ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= EXIT PAGES (Acquisition) =================
router.get('/exit-pages', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  // last pageview per session = exit page
  const [rows] = await pool.query(
    `SELECT p.url, COUNT(*) AS sessions FROM (
       SELECT session_id, MAX(viewed_at) AS last_view
       FROM pageviews pv
       JOIN sessions s ON s.id = pv.session_id
       WHERE s.site_id = ? AND s.started_at BETWEEN ? AND ?
       GROUP BY session_id
     ) latest
     JOIN pageviews p ON p.session_id = latest.session_id AND p.viewed_at = latest.last_view
     GROUP BY p.url ORDER BY sessions DESC LIMIT 50`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= OPERATING SYSTEM (Audience) =================
router.get('/os', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [rows] = await pool.query(
    `SELECT os, COUNT(*) AS sessions
     FROM sessions WHERE site_id = ? AND started_at BETWEEN ? AND ?
     GROUP BY os ORDER BY sessions DESC LIMIT 20`,
    [site_id, start, end]
  );
  res.json(rows);
});

// ================= HOSTNAME (Audience) =================
router.get('/hostname', requireAuth, requireActivePlan, async (req, res) => {
  const { site_id } = req.query;
  if (!(await ownsSite(req.user.id, req.user.role, site_id))) return res.status(403).json({ error: 'Forbidden' });
  const { start, end } = getDateWindow(req.query);

  const [rows] = await pool.query(
    `SELECT p.url FROM pageviews p
     JOIN sessions s ON s.id = p.session_id
     WHERE s.site_id = ? AND s.started_at BETWEEN ? AND ?`,
    [site_id, start, end]
  );

  // Parse hostname from each full URL in JS (more reliable than SQL string functions)
  const counts = {};
  for (const row of rows) {
    try {
      const host = new URL(row.url).hostname;
      counts[host] = (counts[host] || 0) + 1;
    } catch { /* skip malformed URLs */ }
  }
  const result = Object.entries(counts)
    .map(([hostname, sessions]) => ({ hostname, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  res.json(result);
});

module.exports = router;
