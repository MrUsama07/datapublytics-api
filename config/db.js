const mysql = require('mysql2/promise');
require('dotenv').config();

// Hostinger MySQL connection pool
// Get these credentials from hPanel -> Databases -> MySQL Databases
const pool = mysql.createPool({
  host: process.env.DB_HOST,        // usually 'localhost' on Hostinger
  user: process.env.DB_USER,        // e.g. u123456789_dpuser
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,    // e.g. u123456789_datapublytics
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  decimalNumbers: true
});

module.exports = pool;
