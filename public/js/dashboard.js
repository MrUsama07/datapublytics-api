const API_BASE = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : window.location.origin + '/api';
if (!token) window.location.href = 'login.html';

function authHeaders() {
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

let currentSiteId = null;
let dailyChartInstance = null;

// ---------- Sidebar group collapse/expand ----------
function toggleGroup(groupId) {
  const el = document.getElementById(groupId);
  const chev = document.getElementById('chev-' + groupId);
  el.classList.toggle('open');
  if (chev) chev.textContent = el.classList.contains('open') ? '▾' : '▸';
}

// ---------- Tab switching ----------
document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-tab]').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById('tab-' + item.dataset.tab).style.display = 'block';
    document.getElementById('pageTitle').textContent = item.textContent.trim();

    stopRealtimePolling();
    stopLiveChartPolling();

    const tab = item.dataset.tab;
    if (tab === 'realtime-overview') startRealtimePolling();
    else if (tab === 'realtime-content') loadRealtimeContent();
    else if (tab === 'realtime-sources') loadRealtimeSources();
    else if (tab === 'realtime-trends') startLiveChartPolling();
    else if (tab === 'audience-os') loadSimpleTable('os', 'os_table', ['os', 'sessions']);
    else if (tab === 'audience-hostname') loadSimpleTable('hostname', 'hostname_table', ['hostname', 'sessions']);
    else if (tab === 'acq-entry') loadSimpleTable('entry-pages', 'entry_table', ['url', 'sessions']);
    else if (tab === 'acq-exit') loadSimpleTable('exit-pages', 'exit_table', ['url', 'sessions']);
    else if (tab === 'acq-utm-source') loadSimpleTable('utm-source', 'utmsource_table', ['source', 'sessions']);
    else if (tab === 'acq-utm-medium') loadSimpleTable('utm-medium', 'utmmedium_table', ['medium', 'sessions']);
    else if (tab === 'acq-utm-campaign') loadSimpleTable('utm-campaign', 'utmcampaign_table', ['campaign', 'sessions']);
    else if (tab === 'acq-referrer') loadSimpleTable('referrer', 'referrer_table', ['referrer', 'sessions']);
    else if (tab === 'acq-source-medium') loadSourceMedium();
  });
});

// ---------- Load sites into dropdown ----------
async function loadSites() {
  const res = await fetch(`${API_BASE}/sites`, { headers: authHeaders() });
  const sites = await res.json();
  const select = document.getElementById('siteSelect');
  select.innerHTML = sites.map(s => `<option value="${s.id}">${s.site_name}</option>`).join('');
  if (sites.length) {
    currentSiteId = sites[0].id;
    renderTrackingSnippet(sites[0].tracking_id);
  }
  select.addEventListener('change', () => { currentSiteId = select.value; loadAll(); });
  return sites;
}

function renderTrackingSnippet(trackingId) {
  document.getElementById('trackingSnippet').textContent =
`<script src="https://api.datapublytics.com/tracker/analytics.js" data-tracking-id="${trackingId}"><\/script>`;
}

async function createSite() {
  const site_name = document.getElementById('newSiteName').value;
  const domain = document.getElementById('newSiteDomain').value;
  if (!site_name || !domain) return alert('Please fill both fields');
  const res = await fetch(`${API_BASE}/sites`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ site_name, domain }) });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  await loadSites();
  renderTrackingSnippet(data.tracking_id);
  alert('Site added! Tracking code generated.');
}

function getRange() { return document.getElementById('rangeSelect').value; }

// ---------- Date Range Selector ----------
let savedFrom = null;
let savedTo = null;

function onPresetRangeChange() {
  const isCustom = getRange() === 'custom';
  document.getElementById('customRangeBtn').style.display = isCustom ? 'inline-block' : 'none';
  document.getElementById('calendarPopup').classList.remove('open');
  if (!isCustom) { savedFrom = null; savedTo = null; loadAll(); }
}

function toggleCalendar() {
  const popup = document.getElementById('calendarPopup');
  popup.classList.toggle('open');
  if (popup.classList.contains('open')) {
    const startInput = document.getElementById('rangeStartInput');
    const endInput = document.getElementById('rangeEndInput');
    if (savedFrom) startInput.value = savedFrom;
    if (savedTo) endInput.value = savedTo;
    if (!endInput.value) endInput.value = new Date().toISOString().slice(0, 10);
  }
}

function applyCalendarRange() {
  const from = document.getElementById('rangeStartInput').value;
  const to = document.getElementById('rangeEndInput').value;
  if (!from || !to) { alert('Please select both a start and end date'); return; }
  if (from > to) { alert('Start date must be before end date'); return; }
  savedFrom = from;
  savedTo = to;
  document.getElementById('customRangeBtn').textContent = `📅 ${savedFrom} → ${savedTo}`;
  document.getElementById('calendarPopup').classList.remove('open');
  loadAll();
}

document.addEventListener('click', (e) => {
  const popup = document.getElementById('calendarPopup');
  const btn = document.getElementById('customRangeBtn');
  if (popup && !popup.contains(e.target) && e.target !== btn) {
    popup.classList.remove('open');
  }
});

function dateQueryParams() {
  if (getRange() === 'custom') {
    if (savedFrom && savedTo) return `from=${savedFrom}&to=${savedTo}`;
    return `range=1month`;
  }
  return `range=${getRange()}`;
}

// ---------- Generic simple-table loader (used by most Audience/Acquisition tabs) ----------
async function loadSimpleTable(endpoint, tbodyId, columns) {
  if (!currentSiteId) return;
  const res = await fetch(`${API_BASE}/stats/${endpoint}?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  const data = await res.json();
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = (data || []).map(row =>
    `<tr>${columns.map(c => `<td>${row[c] ?? '-'}</td>`).join('')}</tr>`
  ).join('') || `<tr><td colspan="${columns.length}">No data for this period</td></tr>`;
}

// ---------- OVERVIEW ----------
async function loadOverview() {
  const res = await fetch(`${API_BASE}/stats/overview?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  const data = await res.json();
  const t = data.totals || {};
  document.getElementById('ov_sessions').textContent = t.total_sessions || 0;
  document.getElementById('ov_newusers').textContent = t.new_users || 0;
  document.getElementById('ov_totalusers').textContent = t.total_users || 0;
  document.getElementById('ov_pageviews').textContent = t.total_pageviews || 0;
  document.getElementById('ov_duration').textContent = Math.round(t.avg_duration || 0) + 's';

  const labels = (data.daily || []).map(d => d.day);
  const values = (data.daily || []).map(d => d.sessions);

  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(document.getElementById('dailyChart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sessions', data: values, borderColor: '#2f80ff', backgroundColor: 'rgba(47,128,255,0.15)', tension: 0.35, fill: true }] },
    options: { plugins: { legend: { labels: { color: '#eaf1ff' } } }, scales: { x: { ticks: { color: '#8fa3c4' } }, y: { ticks: { color: '#8fa3c4' } } } }
  });
}

// ---------- REALTIME : OVERVIEW (counters) ----------
let realtimeInterval = null;
async function loadRealtimeCounters() {
  const res = await fetch(`${API_BASE}/stats/realtime?site_id=${currentSiteId}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('rt_5').textContent = data.active_5min;
  document.getElementById('rt_15').textContent = data.active_15min;
  document.getElementById('rt_30').textContent = data.active_30min;
  document.getElementById('rt_60').textContent = data.active_1hour;
}
function startRealtimePolling() { loadRealtimeCounters(); realtimeInterval = setInterval(loadRealtimeCounters, 10000); }
function stopRealtimePolling() { if (realtimeInterval) clearInterval(realtimeInterval); }

// ---------- REALTIME : CONTENT (active pages) ----------
async function loadRealtimeContent() {
  const res = await fetch(`${API_BASE}/stats/realtime?site_id=${currentSiteId}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('rt_pages').innerHTML = (data.top_active_pages || [])
    .map(p => `<tr><td>${p.url}</td><td>${p.active_users}</td></tr>`).join('') || '<tr><td colspan="2">No active visitors right now</td></tr>';
}

// ---------- REALTIME : SOURCES (active by source) ----------
async function loadRealtimeSources() {
  const res = await fetch(`${API_BASE}/stats/realtime?site_id=${currentSiteId}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('rt_sources').innerHTML = (data.top_active_sources || [])
    .map(s => `<tr><td>${s.source}</td><td>${s.medium}</td><td>${s.active_users}</td></tr>`).join('') || '<tr><td colspan="3">No active visitors right now</td></tr>';
}

// ---------- REALTIME : TRENDS (live timeframe bar chart) ----------
let liveChartInstance = null;
let liveChartInterval = null;
let liveChartHistory = []; // rolling buffer of {label, value}

function onLiveTimeframeChange() {
  liveChartHistory = [];
  if (liveChartInstance) { liveChartInstance.data.labels = []; liveChartInstance.data.datasets[0].data = []; liveChartInstance.update(); }
}

async function pollLiveChart() {
  const windowSeconds = document.getElementById('liveTimeframe').value;
  const res = await fetch(`${API_BASE}/stats/realtime?site_id=${currentSiteId}&window_seconds=${windowSeconds}`, { headers: authHeaders() });
  const data = await res.json();

  const now = new Date();
  const label = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  liveChartHistory.push({ label, value: data.active_in_window || 0 });
  if (liveChartHistory.length > 20) liveChartHistory.shift(); // keep last 20 samples

  if (!liveChartInstance) {
    liveChartInstance = new Chart(document.getElementById('liveChart'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Active Users', data: [], backgroundColor: 'rgba(24,201,135,0.75)', borderRadius: 4 }] },
      options: {
        animation: false,
        plugins: { legend: { labels: { color: '#eaf1ff' } } },
        scales: { x: { ticks: { color: '#8fa3c4' } }, y: { beginAtZero: true, ticks: { color: '#8fa3c4', precision: 0 } } }
      }
    });
  }
  liveChartInstance.data.labels = liveChartHistory.map(h => h.label);
  liveChartInstance.data.datasets[0].data = liveChartHistory.map(h => h.value);
  liveChartInstance.update();
}

function startLiveChartPolling() {
  liveChartHistory = [];
  pollLiveChart();
  // poll every 5s regardless of selected window — gives a smooth rolling history
  liveChartInterval = setInterval(pollLiveChart, 5000);
}
function stopLiveChartPolling() { if (liveChartInterval) clearInterval(liveChartInterval); }

// ---------- AUDIENCE : OVERVIEW (daily records) ----------
async function loadAudience() {
  const res = await fetch(`${API_BASE}/stats/audience?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('aud_table').innerHTML = data.map(d =>
    `<tr><td>${d.day}</td><td>${d.total_sessions}</td><td>${d.new_users}</td><td>${d.unique_users}</td></tr>`).join('');
}

// ---------- AUDIENCE : DEVICE + BROWSER ----------
async function loadDevices() {
  const res = await fetch(`${API_BASE}/stats/devices?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('device_table').innerHTML = (data.devices || []).map(d =>
    `<tr><td>${d.device_type}</td><td>${d.sessions}</td></tr>`).join('');
  document.getElementById('browser_table').innerHTML = (data.browsers || []).map(d =>
    `<tr><td>${d.browser}</td><td>${d.sessions}</td></tr>`).join('');
}

// ---------- AUDIENCE : COUNTRY ----------
async function loadCountry() {
  const res = await fetch(`${API_BASE}/stats/country?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('country_table').innerHTML = data.map(d =>
    `<tr><td>${d.country}</td><td>${d.sessions}</td></tr>`).join('');
}

// ---------- ACQUISITION : SOURCE / MEDIUM (with search + pagination) ----------
let sourceMediumData = [];
let sourcePage = 1;

async function loadSourceMedium() {
  const res = await fetch(`${API_BASE}/stats/source-medium?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  sourceMediumData = await res.json();
  sourcePage = 1;
  renderSourceMediumPage();
}

function renderSourceMediumPage() {
  const search = (document.getElementById('srcSearchInput')?.value || '').toLowerCase();
  const pageSize = parseInt(document.getElementById('srcPageSize')?.value || '20', 10);

  let filtered = sourceMediumData;
  if (search) {
    filtered = filtered.filter(d =>
      (d.source || '').toLowerCase().includes(search) || (d.medium || '').toLowerCase().includes(search)
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (sourcePage > totalPages) sourcePage = totalPages;
  const startIdx = (sourcePage - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  document.getElementById('src_table').innerHTML = pageRows.map(d =>
    `<tr><td>${d.source}</td><td>${d.medium}</td><td>${d.sessions}</td><td>${d.new_users}</td></tr>`
  ).join('') || '<tr><td colspan="4">No matching results</td></tr>';

  document.getElementById('srcPageInfo').textContent =
    `Showing ${filtered.length ? startIdx + 1 : 0}-${Math.min(startIdx + pageSize, filtered.length)} of ${filtered.length}`;
}

function changeSourcePage(delta) {
  sourcePage += delta;
  if (sourcePage < 1) sourcePage = 1;
  renderSourceMediumPage();
}

// ---------- EVENTS ----------
async function loadEvents() {
  const res = await fetch(`${API_BASE}/stats/events?site_id=${currentSiteId}&${dateQueryParams()}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('events_table').innerHTML = data.map(d =>
    `<tr><td>${d.event_name}</td><td>${d.event_category}</td><td>${d.total}</td></tr>`).join('');
}

// ---------- BILLING ----------
async function loadPaymentInstructions() {
  const plan = document.getElementById('planSelect').value;
  const res = await fetch(`${API_BASE}/payment/instructions/${plan}`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById('payInstructions').innerHTML = `
    <p><b>Amount:</b> $${data.amount_usd} USDT</p>
    <p><b>Network:</b> ${data.network}</p>
    <p><b>Send to wallet:</b> <code style="color:var(--gold)">${data.pay_to_wallet}</code></p>
    <p style="color:var(--text-dim);font-size:12.5px;margin-top:6px;">${data.note}</p>`;
}

async function submitPayment() {
  const plan = document.getElementById('planSelect').value;
  const tx_hash = document.getElementById('txHash').value;
  const res = await fetch(`${API_BASE}/payment/submit`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ plan, tx_hash }) });
  const data = await res.json();
  document.getElementById('billingMsg').textContent = data.message || data.error;
}

function logout() {
  localStorage.removeItem('dp_token');
  localStorage.removeItem('dp_user');
  window.location.href = 'login.html';
}

// ---------- Load everything (called on init + when site/date range changes) ----------
async function loadAll() {
  if (!currentSiteId) return;
  loadOverview();
  loadAudience();
  loadDevices();
  loadCountry();
  loadEvents();
}

(async function init() {
  await loadSites();
  await loadAll();
  loadPaymentInstructions();
})();
