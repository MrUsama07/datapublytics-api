const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { parseDevice, classifySource } = require('../utils/parser');
const { lookupGeo, hashIp } = require('../utils/geo');
const crypto = require('crypto');

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// ---------- PAGEVIEW / NEW SESSION ----------
router.post('/pageview', async (req, res) => {
  try {
    const { tracking_id, session_uid, visitor_uid, url, page_title, referrer, utm } = req.body;
    if (!tracking_id || !session_uid || !visitor_uid || !url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [siteRows] = await pool.query('SELECT id FROM sites WHERE tracking_id = ?', [tracking_id]);
    if (!siteRows.length) return res.status(404).json({ error: 'Invalid tracking ID' });
    const siteId = siteRows[0].id;

    const ip = getClientIp(req);
    const geo = lookupGeo(ip);
    const device = parseDevice(req.headers['user-agent']);
    const src = classifySource(referrer, utm || {});

    // Find existing session (started < 30 min ago)
    const [existingSession] = await pool.query(
      `SELECT id, page_count FROM sessions
       WHERE site_id = ? AND session_uid = ? AND last_seen_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)`,
      [siteId, session_uid]
    );

    let sessionDbId;

    if (existingSession.length) {
      sessionDbId = existingSession[0].id;
      await pool.query(
        `UPDATE sessions SET last_seen_at = NOW(), page_count = page_count + 1,
         duration_sec = TIMESTAMPDIFF(SECOND, started_at, NOW()) WHERE id = ?`,
        [sessionDbId]
      );
    } else {
      // is this visitor brand new (never seen before on this site)?
      const [prior] = await pool.query(
        'SELECT id FROM sessions WHERE site_id = ? AND visitor_uid = ? LIMIT 1',
        [siteId, visitor_uid]
      );
      const isNewUser = prior.length === 0 ? 1 : 0;

      const [insertResult] = await pool.query(
        `INSERT INTO sessions
         (site_id, session_uid, visitor_uid, is_new_user, source, medium, campaign, referrer,
          landing_page, country, country_code, city, device_type, browser, os, ip_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [siteId, session_uid, visitor_uid, isNewUser, src.source, src.medium, src.campaign, referrer || null,
         url, geo.country, geo.country_code, geo.city, device.deviceType, device.browser, device.os, hashIp(ip)]
      );
      sessionDbId = insertResult.insertId;
    }

    await pool.query(
      `INSERT INTO pageviews (site_id, session_id, url, page_title) VALUES (?,?,?,?)`,
      [siteId, sessionDbId, url, page_title || null]
    );

    res.json({ ok: true, session_db_id: sessionDbId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tracking error' });
  }
});

// ---------- HEARTBEAT (keeps session "live" for real-time active-user counts) ----------
router.post('/heartbeat', async (req, res) => {
  try {
    const { tracking_id, session_uid } = req.body;
    const [siteRows] = await pool.query('SELECT id FROM sites WHERE tracking_id = ?', [tracking_id]);
    if (!siteRows.length) return res.status(404).json({ error: 'Invalid tracking ID' });

    await pool.query(
      `UPDATE sessions SET last_seen_at = NOW() WHERE site_id = ? AND session_uid = ?`,
      [siteRows[0].id, session_uid]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Heartbeat error' });
  }
});

// ---------- CUSTOM EVENT ----------
router.post('/event', async (req, res) => {
  try {
    const { tracking_id, session_uid, event_name, event_category, page_url, props } = req.body;
    if (!tracking_id || !session_uid || !event_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [siteRows] = await pool.query('SELECT id FROM sites WHERE tracking_id = ?', [tracking_id]);
    if (!siteRows.length) return res.status(404).json({ error: 'Invalid tracking ID' });
    const siteId = siteRows[0].id;

    const [sessionRows] = await pool.query(
      `SELECT id FROM sessions WHERE site_id = ? AND session_uid = ? ORDER BY id DESC LIMIT 1`,
      [siteId, session_uid]
    );
    if (!sessionRows.length) return res.status(404).json({ error: 'Session not found' });

    await pool.query(
      `INSERT INTO events (site_id, session_id, event_name, event_category, page_url, props_json)
       VALUES (?,?,?,?,?,?)`,
      [siteId, sessionRows[0].id, event_name, event_category || 'general', page_url || null, JSON.stringify(props || {})]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Event tracking error' });
  }
});

module.exports = router;
