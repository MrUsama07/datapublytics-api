/*!
 * DataPublytics Tracker v1.0
 * Embed on your website:
 * <script src="https://api.datapublytics.com/tracker/analytics.js" data-tracking-id="DPX-XXXXXXXX"></script>
 */
(function () {
  var scriptTag = document.currentScript;
  var trackingId = scriptTag.getAttribute('data-tracking-id');
  var API_BASE = scriptTag.getAttribute('data-api') || 'https://api.datapublytics.com/api';

  if (!trackingId) {
    console.warn('DataPublytics: missing data-tracking-id on script tag');
    return;
  }

  // ---------- Visitor ID (persistent, 2 years) ----------
  function getOrSetCookie(name, days) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return match[2];
    var value = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    var expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
    return value;
  }

  // ---------- Session ID (resets after 30 min inactivity, stored in sessionStorage) ----------
  function getSessionId() {
    var sid = sessionStorage.getItem('dp_session_id');
    if (!sid) {
      sid = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('dp_session_id', sid);
    }
    return sid;
  }

  var visitorId = getOrSetCookie('dp_visitor_id', 730);
  var sessionId = getSessionId();

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign')
    };
  }

  function send(endpoint, payload) {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + endpoint, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(API_BASE + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  }

  // ---------- Track pageview ----------
  function trackPageview() {
    send('/track/pageview', {
      tracking_id: trackingId,
      session_uid: sessionId,
      visitor_uid: visitorId,
      url: window.location.href,
      page_title: document.title,
      referrer: document.referrer || null,
      utm: getUtmParams()
    });
  }

  // ---------- Heartbeat every 20s while tab is visible (powers live active-user counters) ----------
  function startHeartbeat() {
    setInterval(function () {
      if (document.visibilityState === 'visible') {
        send('/track/heartbeat', { tracking_id: trackingId, session_uid: sessionId });
      }
    }, 20000);
  }

  // ---------- Public API for custom events ----------
  window.datapublytics = window.datapublytics || {};
  window.datapublytics.track = function (eventName, props, category) {
    send('/track/event', {
      tracking_id: trackingId,
      session_uid: sessionId,
      event_name: eventName,
      event_category: category || 'general',
      page_url: window.location.href,
      props: props || {}
    });
  };

  // ---------- Track SPA route changes (pushState/popState) ----------
  var originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    trackPageview();
  };
  window.addEventListener('popstate', trackPageview);

  trackPageview();
  startHeartbeat();
})();
