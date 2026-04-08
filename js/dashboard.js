// ============ CONFIG ============
// API base: set to VPS tunnel URL for GitHub Pages, empty for local
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? '' : 'https://ready-concentrate-immediate-providers.trycloudflare.com';
const REFRESH_INTERVAL = 30000;
let tradesData = null;
let betsData = null;
let currentTab = 'trades';
let refreshTimer = null;

// ============ AUTH ============
async function authenticate() {
  const input = document.getElementById('access-key').value;
  if (!input || input.length < 4) {
    showError('Key must be at least 4 characters');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/verify?key=' + encodeURIComponent(input));
    const data = await res.json();

    if (data.valid) {
      localStorage.setItem('journal_session', '1');
      showDashboard();
    } else {
      showError('Wrong key. Try again.');
      document.getElementById('access-key').value = '';
    }
  } catch (e) {
    showError('Connection error');
  }
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function showDashboard() {
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadData();
  refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
}

function logout() {
  localStorage.removeItem('journal_session');
  location.reload();
}

// Auto-login check
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('journal_session')) {
    showDashboard();
  }

  document.getElementById('access-key')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') authenticate();
  });
});

// ============ DATA LOADING ============
async function loadData() {
  try {
    const [tradesRes, betsRes] = await Promise.all([
      fetch(API_BASE + '/data/trades.json?t=' + Date.now()),
      fetch(API_BASE + '/data/bets.json?t=' + Date.now())
    ]);

    tradesData = await tradesRes.json();
    betsData = await betsRes.json();

    updateStats();
    populateFilters();
    renderCurrentTab();
    updateLastUpdated();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

function refreshData() { loadData(); }

// ============ STATS ============
function updateStats() {
  const trades = tradesData.trades || [];
  const bets = betsData.bets || [];

  const closedTrades = trades.filter(t => t.status === 'closed');
  const tradePnl = closedTrades.reduce((sum, t) => sum + (t.pnl_usd || 0), 0);
  const closedBets = bets.filter(b => b.status === 'closed');
  const betPnl = closedBets.reduce((sum, b) => sum + (b.pnl_usd || 0), 0);
  const totalPnl = tradePnl + betPnl;

  const closedTradesWins = closedTrades.filter(t => (t.pnl_usd || 0) > 0).length;
  const closedBetsWins = closedBets.filter(b => (b.pnl_usd || 0) > 0).length;
  const totalClosed = closedTrades.length + closedBets.length;
  const totalWins = closedTradesWins + closedBetsWins;
  const winRate = totalClosed > 0 ? ((totalWins / totalClosed) * 100).toFixed(1) : 0;

  const openTrades = trades.filter(t => t.status === 'open').length;
  const openBets = bets.filter(b => b.status === 'open').length;

  const pnlEl = document.getElementById('stat-total-pnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2);
  pnlEl.className = 'stat-value ' + (totalPnl >= 0 ? 'positive' : 'negative');

  document.getElementById('stat-winrate').textContent = winRate + '%';
  document.getElementById('stat-open').textContent = openTrades + openBets;
  document.getElementById('stat-total').textContent = trades.length + bets.length;
}

// ============ FILTERS ============
function populateFilters() {
  const trades = tradesData.trades || [];
  const assets = [...new Set(trades.map(t => t.asset))].sort();
  const assetSelect = document.getElementById('filter-asset');
  const current = assetSelect.value;
  assetSelect.innerHTML = '<option value="all">All Assets</option>';
  assets.forEach(a => { assetSelect.innerHTML += `<option value="${a}">${a}</option>`; });
  assetSelect.value = current || 'all';
}

function getFilteredData(type) {
  const agent = document.getElementById('filter-agent').value;
  const status = document.getElementById('filter-status').value;
  const asset = document.getElementById('filter-asset').value;
  let data = type === 'trades' ? (tradesData.trades || []) : (betsData.bets || []);
  if (agent !== 'all') data = data.filter(d => d.agent === agent);
  if (status !== 'all') data = data.filter(d => d.status === status);
  if (type === 'trades' && asset !== 'all') data = data.filter(d => d.asset === asset);
  data.sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));
  return data;
}

// ============ TABS ============
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === 'trades') renderTrades();
  else if (currentTab === 'bets') renderBets();
  else if (currentTab === 'log') renderLog();
}

// ============ RENDER TRADES ============
function renderTrades() {
  const trades = getFilteredData('trades');
  const tbody = document.getElementById('trades-body');
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#8892a4;padding:40px">No trades yet. Agents will log entries here.</td></tr>';
    return;
  }
  tbody.innerHTML = trades.map(t => {
    const pnlClass = t.pnl_usd > 0 ? 'pnl-positive' : t.pnl_usd < 0 ? 'pnl-negative' : 'pnl-neutral';
    const sb = t.side === 'long' ? 'long' : 'short';
    const ab = t.agent === 'hermes1' ? 'hermes1' : 'hermes2';
    const stb = t.status === 'open' ? 'open' : t.close_reason === 'tp_hit' ? 'tp' : t.close_reason === 'sl_hit' ? 'sl' : 'closed';
    return `<tr>
      <td>${fmtTime(t.opened_at)}</td>
      <td><span class="badge ${ab}">${t.agent}</span></td>
      <td><strong>${t.asset}</strong></td>
      <td><span class="badge ${sb}">${t.side}</span></td>
      <td>$${fmtNum(t.entry_price)}</td>
      <td>${t.exit_price ? '$' + fmtNum(t.exit_price) : '—'}</td>
      <td>$${fmtNum(t.size_usd)}</td>
      <td class="${pnlClass}">${t.pnl_usd !== null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + t.pnl_usd.toFixed(2) + ' (' + t.pnl_pct + '%)' : '—'}</td>
      <td><span class="badge ${stb}">${t.close_reason || t.status}</span></td>
      <td title="${t.notes || ''}">${trunc(t.notes, 30)}</td>
    </tr>`;
  }).join('');
}

// ============ RENDER BETS ============
function renderBets() {
  const bets = getFilteredData('bets');
  const tbody = document.getElementById('bets-body');
  if (!bets.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8892a4;padding:40px">No bets yet.</td></tr>';
    return;
  }
  tbody.innerHTML = bets.map(b => {
    const pnlClass = b.pnl_usd > 0 ? 'pnl-positive' : b.pnl_usd < 0 ? 'pnl-negative' : 'pnl-neutral';
    const ab = b.agent === 'hermes1' ? 'hermes1' : 'hermes2';
    return `<tr>
      <td>${fmtTime(b.opened_at)}</td>
      <td><span class="badge ${ab}">${b.agent}</span></td>
      <td>${b.market}</td>
      <td>${b.outcome}</td>
      <td>${(b.entry_price * 100).toFixed(0)}¢</td>
      <td>$${fmtNum(b.size_usd)}</td>
      <td class="${pnlClass}">${b.pnl_usd !== null ? (b.pnl_usd >= 0 ? '+' : '') + '$' + b.pnl_usd.toFixed(2) : '—'}</td>
      <td><span class="badge ${b.status === 'closed' ? (b.close_reason || 'closed') : b.status}">${b.status === 'closed' ? (b.close_reason || 'closed') : b.status}</span></td>
      <td title="${b.notes || ''}">${trunc(b.notes, 30)}</td>
    </tr>`;
  }).join('');
}

// ============ RENDER LOG ============
function renderLog() {
  const trades = tradesData.trades || [];
  const bets = betsData.bets || [];
  const entries = [];

  trades.forEach(t => {
    const c = t.agent === 'hermes1' ? '#c084fc' : '#67e8f9';
    entries.push({ time: t.opened_at, type: 'trade-open',
      text: `<span class="log-agent" style="color:${c}">${t.agent}</span> OPENED ${t.side.toUpperCase()} ${t.asset} @ $${fmtNum(t.entry_price)} ($${fmtNum(t.size_usd)})` });
    if (t.status === 'closed') {
      const r = t.close_reason === 'tp_hit' ? '🎯 TP HIT' : t.close_reason === 'sl_hit' ? '🛑 SL HIT' : '✅ CLOSED';
      entries.push({ time: t.closed_at, type: t.close_reason === 'tp_hit' ? 'trade-tp' : t.close_reason === 'sl_hit' ? 'trade-sl' : 'trade-close',
        text: `<span class="log-agent" style="color:${c}">${t.agent}</span> ${r} ${t.asset} — P&L: ${(t.pnl_usd >= 0 ? '+' : '')}$${t.pnl_usd.toFixed(2)} (${t.pnl_pct}%)` });
    }
  });

  bets.forEach(b => {
    const c = b.agent === 'hermes1' ? '#c084fc' : '#67e8f9';
    entries.push({ time: b.opened_at, type: 'trade-open',
      text: `<span class="log-agent" style="color:${c}">${b.agent}</span> BET ${b.outcome} on "${b.market}" @ ${(b.entry_price * 100).toFixed(0)}¢ ($${fmtNum(b.size_usd)})` });
  });

  entries.sort((a, b) => new Date(b.time) - new Date(a.time));
  const container = document.getElementById('log-entries');
  if (!entries.length) { container.innerHTML = '<p style="color:#8892a4;text-align:center;padding:40px">No log entries</p>'; return; }

  container.innerHTML = entries.map(e => `
    <div class="log-entry ${e.type}">
      <div class="log-time">${fmtTimeFull(e.time)}</div>
      <div>${e.text}</div>
    </div>`).join('');
}

// ============ UTILS ============
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtTimeFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
function fmtNum(n) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function trunc(s, l) { return !s ? '' : s.length > l ? s.substring(0, l) + '…' : s; }
function updateLastUpdated() {
  const t = tradesData?.metadata?.last_updated;
  const b = betsData?.metadata?.last_updated;
  const latest = [t, b].filter(Boolean).sort().pop();
  if (latest) document.getElementById('last-updated').textContent = 'Updated: ' + fmtTimeFull(latest);
}
