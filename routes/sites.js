const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const { requireAuth, requireActivePlan } = require('../middleware/auth');

function genTrackingId() {
  return 'DPX-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

router.post('/', requireAuth, requireActivePlan, async (req, res) => {
  const { site_name, domain, timezone } = req.body;
  if (!site_name || !domain) return res.status(400).json({ error: 'site_name and domain are required' });

  const trackingId = genTrackingId();
  const [result] = await pool.query(
    `INSERT INTO sites (user_id, site_name, domain, tracking_id, timezone) VALUES (?,?,?,?,?)`,
    [req.user.id, site_name, domain, trackingId, timezone || 'Asia/Karachi']
  );
  res.json({ id: result.insertId, tracking_id: trackingId, site_name, domain });
});

router.get('/', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM sites WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  res.json(rows);
});

module.exports = router;
