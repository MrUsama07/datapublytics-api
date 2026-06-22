const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const PLAN_PRICES = { '100k': 10, '10m': 40, 'unlimited': 55 };
const WALLET_ADDRESS = process.env.BEP20_WALLET_ADDRESS || 'PUT_YOUR_BEP20_USDT_WALLET_ADDRESS_HERE';

// ---------- Get payment instructions for a plan ----------
router.get('/instructions/:plan', requireAuth, (req, res) => {
  const plan = req.params.plan;
  if (!PLAN_PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' });
  res.json({
    plan,
    amount_usd: PLAN_PRICES[plan],
    network: 'BEP20 (Binance Smart Chain)',
    pay_to_wallet: WALLET_ADDRESS,
    note: 'Send the exact USDT amount via BEP20 network only. Submit your transaction hash (TxID) below after payment.'
  });
});

// ---------- User submits proof of payment (tx hash) ----------
router.post('/submit', requireAuth, async (req, res) => {
  const { plan, tx_hash } = req.body;
  if (!PLAN_PRICES[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!tx_hash || tx_hash.length < 10) return res.status(400).json({ error: 'Valid transaction hash required' });

  await pool.query(
    `INSERT INTO payments (user_id, plan, amount_usd, network, pay_to_wallet, tx_hash, status)
     VALUES (?,?,?,?,?,?,'pending')`,
    [req.user.id, plan, PLAN_PRICES[plan], 'BEP20', WALLET_ADDRESS, tx_hash]
  );

  res.json({ message: 'Payment submitted. It will be verified within 24 hours.' });
});

// ---------- ADMIN: list pending payments ----------
router.get('/admin/pending', requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*, u.name, u.email FROM payments p
     JOIN users u ON u.id = p.user_id
     WHERE p.status = 'pending' ORDER BY p.submitted_at ASC`
  );
  res.json(rows);
});

// ---------- ADMIN: approve / reject a payment ----------
router.post('/admin/verify', requireAuth, requireAdmin, async (req, res) => {
  const { payment_id, approve } = req.body;
  const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [payment_id]);
  if (!rows.length) return res.status(404).json({ error: 'Payment not found' });
  const payment = rows[0];

  if (approve) {
    await pool.query(
      `UPDATE payments SET status = 'verified', verified_at = NOW(), verified_by = ? WHERE id = ?`,
      [req.user.id, payment_id]
    );
    const renewDate = new Date();
    renewDate.setDate(renewDate.getDate() + 30); // 30-day plan validity

    await pool.query(
      `UPDATE users SET plan = ?, plan_renews_at = ? WHERE id = ?`,
      [payment.plan, renewDate, payment.user_id]
    );
    res.json({ message: 'Payment verified, plan activated for 30 days.' });
  } else {
    await pool.query(`UPDATE payments SET status = 'rejected' WHERE id = ?`, [payment_id]);
    res.json({ message: 'Payment rejected.' });
  }
});

module.exports = router;
