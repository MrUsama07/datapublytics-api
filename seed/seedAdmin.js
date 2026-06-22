// Run with: node seed/seedAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedAdmin() {
  const email = 'admin@datapublytics.com';
  const plainPassword = 'Admin@123'; // CHANGE after first login

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    console.log('Admin already exists. Skipping.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(plainPassword, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, plan, trial_start, trial_end, is_free_forever, status)
     VALUES (?,?,?, 'admin', 'unlimited', NOW(), DATE_ADD(NOW(), INTERVAL 100 YEAR), 1, 'active')`,
    ['Super Admin', email, hash]
  );

  console.log('✅ Admin account created!');
  console.log('   Email:', email);
  console.log('   Password:', plainPassword, '(change this immediately)');
  process.exit(0);
}

seedAdmin().catch(err => { console.error(err); process.exit(1); });
