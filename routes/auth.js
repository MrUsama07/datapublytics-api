const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ---------- REGISTER (everyone gets 5-day free trial automatically) ----------
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 5); // 5-day free trial

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, plan, trial_start, trial_end, is_free_forever)
       VALUES (?, ?, ?, 'user', 'trial', NOW(), ?, 0)`,
      [name, email, hash, trialEnd]
    );

    const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      message: '5-day free trial activated!',
      token,
      trial_end: trialEnd
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ---------- LOGIN ----------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, plan: user.plan,
        is_free_forever: !!user.is_free_forever,
        trial_end: user.trial_end
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
