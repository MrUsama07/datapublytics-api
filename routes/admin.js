const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, plan, trial_end, plan_renews_at, is_free_forever, status, created_at FROM users ORDER BY id DESC`
  );
  res.json(rows);
});

router.get('/sites', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.*, u.email AS owner_email FROM sites s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC`
  );
  res.json(rows);
});

router.post('/suspend', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, status } = req.body; // status: 'active' | 'suspended'
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
  res.json({ message: `User ${status}` });
});

module.exports = router;
