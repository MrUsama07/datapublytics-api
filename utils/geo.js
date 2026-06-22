const geoip = require('geoip-lite');
const crypto = require('crypto');

function lookupGeo(ip) {
  if (!ip) return { country: 'Unknown', country_code: 'XX', city: null };
  // normalize IPv6-mapped IPv4
  const cleanIp = ip.replace('::ffff:', '').split(',')[0].trim();
  const geo = geoip.lookup(cleanIp);
  if (!geo) return { country: 'Unknown', country_code: 'XX', city: null };
  return {
    country: geo.country || 'Unknown',
    country_code: geo.country || 'XX',
    city: geo.city || null
  };
}

// Hash IP for privacy-safe unique counting (never store raw IP)
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'dp_salt')).digest('hex');
}

module.exports = { lookupGeo, hashIp };
