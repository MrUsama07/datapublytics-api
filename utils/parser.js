const UAParser = require('ua-parser-js');

function parseDevice(userAgentString) {
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();

  let deviceType = 'desktop';
  if (result.device.type === 'mobile') deviceType = 'mobile';
  else if (result.device.type === 'tablet') deviceType = 'tablet';
  else if (/bot|crawler|spider|curl|wget|python-requests/i.test(userAgentString || '')) deviceType = 'server';

  return {
    deviceType,
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown'
  };
}

// Classify traffic source/medium like GA's channel grouping
function classifySource(referrer, urlParams) {
  const utmSource = urlParams.utm_source;
  const utmMedium = urlParams.utm_medium;
  const utmCampaign = urlParams.utm_campaign;

  if (utmSource) {
    return { source: utmSource, medium: utmMedium || 'campaign', campaign: utmCampaign || null };
  }

  if (!referrer) {
    return { source: 'direct', medium: 'none', campaign: null };
  }

  try {
    const refHost = new URL(referrer).hostname.replace('www.', '');

    const searchEngines = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.', 'yandex.'];
    const socialNetworks = ['facebook.', 'instagram.', 'twitter.', 'x.com', 't.co', 'linkedin.', 'tiktok.', 'pinterest.', 'reddit.', 'youtube.', 'whatsapp.', 'telegram.'];

    if (searchEngines.some(s => refHost.includes(s))) {
      return { source: refHost, medium: 'organic', campaign: null };
    }
    if (socialNetworks.some(s => refHost.includes(s))) {
      return { source: refHost, medium: 'social', campaign: null };
    }
    return { source: refHost, medium: 'referral', campaign: null };
  } catch {
    return { source: 'direct', medium: 'none', campaign: null };
  }
}

module.exports = { parseDevice, classifySource };
