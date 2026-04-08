// ============ CONFIG ============
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? '' : 'https://ready-concentrate-immediate-providers.trycloudflare.com';
const REFRESH_INTERVAL = 30000;
let tradesData = null;
let betsData = null;
let autoTraderState = null;
let dailyPnl = null;
let currentTab = 'dashboard';
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
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('main-content').style.display = 'block';
  loadData();
  refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
}

function logout() {
  localStorage.removeItem('journal_session');
  location.reload();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main-content');
  const overlay = document.getElementById('sidebar-overlay');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
  }
}

// Close mobile sidebar when nav item clicked
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item');
  if (navItem && window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
  }
});

// Auto-login
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('journal_session')) showDashboard();
  document.getElementById('access-key')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') authenticate();
  });
});

// ============ DATA LOADING ============
async function loadData() {
  try {
    const [tradesRes, betsRes, stateRes, dailyRes] = await Promise.all([
      fetch(API_BASE + '/data/trades.json?t=' + Date.now()).catch(() => null),
      fetch(API_BASE + '/data/bets.json?t=' + Date.now()).catch(() => null),
      fetch(API_BASE + '/data/auto_trader_state.json?t=' + Date.now()).catch(() => null),
      fetch(API_BASE + '/data/daily_pnl.json?t=' + Date.now()).catch(() => null),
    ]);

    if (tradesRes) tradesData = await tradesRes.json();
    if (betsRes) betsData = await betsRes.json();
    if (stateRes) autoTraderState = await stateRes.json();
    if (dailyRes) {
      try { dailyPnl = await dailyRes.json(); } catch { dailyPnl = null; }
    }

    updateStats();
    renderPositions();
    renderCurrentTab();
    updateLastUpdated();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

function refreshData() { loadData(); }

// ============ STATS ============
function updateStats() {
  const trades = tradesData?.trades || [];
  const bets = betsData?.bets || [];
  const positions = autoTraderState?.positions || {};

  // Cash & portfolio
  const cash = 99928.34; // fallback, ideally from API
  let unrealizedPnl = 0;
  let openCount = 0;

  for (const [sym, pos] of Object.entries(positions)) {
    const current = pos.current_price || pos.entry_price;
    const pnl = ((current - pos.entry_price) / pos.entry_price) * (pos.quantity * pos.entry_price);
    unrealizedPnl += pnl;
    openCount++;
  }

  // Realized P&L
  const closedTrades = trades.filter(t => t.status === 'closed');
  const tradePnl = closedTrades.reduce((sum, t) => sum + (t.pnl_usd || 0), 0);
  const closedBets = bets.filter(b => b.status === 'closed');
  const betPnl = closedBets.reduce((sum, b) => sum + (b.pnl_usd || 0), 0);
  const realizedPnl = tradePnl + betPnl;

  // Win rate
  const wins = closedTrades.filter(t => (t.pnl_usd || 0) > 0).length + closedBets.filter(b => (b.pnl_usd || 0) > 0).length;
  const totalClosed = closedTrades.length + closedBets.length;
  const winRate = totalClosed > 0 ? ((wins / totalClosed) * 100).toFixed(1) : '0';

  // Portfolio value
  const portfolioValue = cash + unrealizedPnl;

  // Update DOM
  const pnlEl = document.getElementById('stat-portfolio');
  pnlEl.textContent = '$' + portfolioValue.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});

  document.getElementById('stat-cash').textContent = '$' + cash.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});

  const unrealEl = document.getElementById('stat-unrealized');
  unrealEl.textContent = (unrealizedPnl >= 0 ? '+' : '') + '$' + unrealizedPnl.toFixed(2);
  unrealEl.className = 'stat-value ' + (unrealizedPnl >= 0 ? 'positive' : 'negative');

  document.getElementById('stat-open-positions').textContent = openCount;

  const realizedEl = document.getElementById('stat-realized');
  realizedEl.textContent = (realizedPnl >= 0 ? '+' : '') + '$' + realizedPnl.toFixed(2);
  realizedEl.className = 'stat-value ' + (realizedPnl > 0 ? 'positive' : realizedPnl < 0 ? 'negative' : '');

  document.getElementById('stat-winrate').textContent = winRate + '%';

  // Today's trades
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = (dailyPnl?.trades || []).filter(t => t.time?.startsWith(today));
  document.getElementById('stat-today-trades').textContent = todayTrades.length;

  // Daily loss bar
  const dailyPnlPct = dailyPnl?.total_pnl_pct || 0;
  const maxLoss = 5; // 5% max daily loss
  const lossRatio = Math.min(Math.abs(Math.min(dailyPnlPct, 0)) / maxLoss * 100, 100);
  const fillEl = document.getElementById('daily-loss-fill');
  fillEl.style.width = lossRatio + '%';
  fillEl.className = 'progress-fill' + (lossRatio > 80 ? ' danger' : lossRatio > 50 ? ' warning' : '');
  document.getElementById('daily-loss-pct').textContent = dailyPnlPct.toFixed(1) + '% / -5.0%';

  // Daily P&L badge
  const dailyBadge = document.getElementById('stat-daily-pnl');
  dailyBadge.textContent = (dailyPnlPct >= 0 ? '+' : '') + dailyPnlPct.toFixed(2) + '%';
  dailyBadge.className = 'stat-badge ' + (dailyPnlPct >= 0 ? 'positive' : 'negative');
}

// ============ POSITIONS ============
function renderPositions() {
  const positions = autoTraderState?.positions || {};
  const entries = Object.entries(positions);

  // Sidebar count
  document.getElementById('pos-count').textContent = entries.length;

  // Dashboard list
  const listEl = document.getElementById('positions-list');
  if (!entries.length) {
    listEl.innerHTML = '<div class="empty-state">No open positions — waiting for signals</div>';
    return;
  }

  // Badge labels (no emoji)
  const sideLabels = { long: 'LONG', short: 'SHORT' };
  const closeLabels = {
    tp_hit: 'TP Hit',
    sl_hit: 'SL Hit',
    trailing_hit: 'Trail SL',
    early_exit: 'Early Exit',
    open: 'Open',
    closed: 'Closed',
  };

  listEl.innerHTML = entries.map(([sym, pos]) => {
    const current = pos.current_price || pos.entry_price;
    const pnlPct = ((current - pos.entry_price) / pos.entry_price * 100);
    const pnlUsd = (current - pos.entry_price) * pos.quantity;
    const isPositive = pnlPct >= 0;
    const trailing = pos.trailing_active;
    const tpNearest = pos.tp_levels ? Math.min(...pos.tp_levels) : null;
    const slPrice = pos.sl_price || pos.entry_price * 0.98;
    const entryTime = pos.entry_time ? new Date(pos.entry_time).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : '—';

    return `
      <div class="position-card">
        <div class="pos-header">
          <span class="pos-symbol">
            <span class="badge long">LONG</span>
            ${sym}
          </span>
          <span class="pos-pnl ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}${pnlPct.toFixed(2)}% (${isPositive ? '+' : ''}$${pnlUsd.toFixed(2)})
          </span>
        </div>
        <div class="pos-details">
          <div class="pos-detail">
            <div class="pos-detail-label">Entry</div>
            <div class="pos-detail-value">$${pos.entry_price.toLocaleString()}</div>
          </div>
          <div class="pos-detail">
            <div class="pos-detail-label">Current</div>
            <div class="pos-detail-value">$${current.toLocaleString()}</div>
          </div>
          <div class="pos-detail">
            <div class="pos-detail-label">Size</div>
            <div class="pos-detail-value">${pos.quantity}</div>
          </div>
          <div class="pos-detail">
            <div class="pos-detail-label">TP Target</div>
            <div class="pos-detail-value" style="color:var(--green)">${tpNearest ? '$' + tpNearest.toLocaleString() : '—'}</div>
          </div>
          <div class="pos-detail">
            <div class="pos-detail-label">SL</div>
            <div class="pos-detail-value" style="color:var(--red)">$${slPrice.toLocaleString()}</div>
          </div>
          <div class="pos-detail">
            <div class="pos-detail-label">Opened</div>
            <div class="pos-detail-value">${entryTime}</div>
          </div>
        </div>
        ${trailing ? '<div class="pos-trailing">&#9650; Trailing stop active</div>' : ''}
      </div>
    `;
  }).join('');

  // Positions tab detail
  const detailEl = document.getElementById('positions-detail');
  detailEl.innerHTML = listEl.innerHTML;
}

// ============ SIGNALS ============
async function refreshSignals() {
  const listEl = document.getElementById('signals-list');
  const detailEl = document.getElementById('signals-detail');
  listEl.innerHTML = '<div class="empty-state">Scanning...</div>';
  detailEl.innerHTML = '<div class="empty-state">Scanning 10 assets...</div>';

  const assets = ['BTC', 'ETH', 'SOL', 'PAXG', 'WLD', 'SUI', 'DOGE', 'XRP', 'LINK', 'AVAX'];
  const signals = [];

  for (const sym of assets) {
    try {
      const res = await fetch(API_BASE + '/api/indicators?symbol=' + sym + '&interval=1h');
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;

      const rsi = data.rsi || 50;
      const macd = data.macd_hist || 0;
      const bbPos = data.bb_position || 0.5;
      const rec = data.recommendation || 'NEUTRAL';

      let signal = 'HOLD';
      let strength = 50;
      let score = 0;

      if (rsi < 35) score += 2;
      else if (rsi < 45) score += 1;
      else if (rsi > 65) score -= 2;
      else if (rsi > 55) score -= 1;

      if (macd > 0) score += 1;
      else score -= 1;

      if (bbPos < 0.25) score += 2;
      else if (bbPos < 0.4) score += 1;
      else if (bbPos > 0.75) score -= 2;
      else if (bbPos > 0.6) score -= 1;

      if (rec.includes('BUY')) score += 1;
      else if (rec.includes('SELL')) score -= 1;

      if (score >= 3) { signal = 'BUY'; strength = Math.min(50 + score * 8, 95); }
      else if (score <= -3) { signal = 'SELL'; strength = Math.min(50 + Math.abs(score) * 8, 95); }

      signals.push({ sym, signal, strength, rsi, macd, bbPos, price: data.close || 0, rec });
    } catch (e) {}
  }

  // Render sidebar signals
  const buySignals = signals.filter(s => s.signal === 'BUY').sort((a,b) => b.strength - a.strength);
  const sellSignals = signals.filter(s => s.signal === 'SELL').sort((a,b) => b.strength - a.strength);
  const holdSignals = signals.filter(s => s.signal === 'HOLD');

  const topSignals = [...buySignals.slice(0, 3), ...sellSignals.slice(0, 3)];

  if (!topSignals.length) {
    listEl.innerHTML = '<div class="empty-state">No strong signals detected</div>';
  } else {
    listEl.innerHTML = topSignals.map(s => `
      <div class="signal-card">
        <div>
          <div class="signal-asset">${s.sym}</div>
          <div class="signal-price">$${s.price.toLocaleString()}</div>
        </div>
        <span class="signal-type ${s.signal.toLowerCase()}">${s.signal}</span>
        <span class="signal-strength">${s.strength}%</span>
      </div>
    `).join('');
  }

  // Render full detail
  detailEl.innerHTML = signals.map(s => {
    const typeClass = s.signal === 'BUY' ? 'buy' : s.signal === 'SELL' ? 'sell' : 'hold';
    return `
      <div class="signal-detail-card">
        <div class="signal-detail-header">
          <span class="pos-symbol">${s.sym}</span>
          <span class="signal-type ${typeClass}">${s.signal} (${s.strength}%)</span>
        </div>
        <div class="signal-detail-grid">
          <div class="signal-metric">
            <div class="signal-metric-label">Price</div>
            <div class="signal-metric-value">$${s.price.toLocaleString()}</div>
          </div>
          <div class="signal-metric">
            <div class="signal-metric-label">RSI</div>
            <div class="signal-metric-value" style="color:${s.rsi < 35 ? 'var(--green)' : s.rsi > 65 ? 'var(--red)' : 'var(--text-secondary)'}">${s.rsi.toFixed(0)}</div>
          </div>
          <div class="signal-metric">
            <div class="signal-metric-label">MACD Hist</div>
            <div class="signal-metric-value" style="color:${s.macd > 0 ? 'var(--green)' : 'var(--red)'}">${s.macd.toFixed(2)}</div>
          </div>
          <div class="signal-metric">
            <div class="signal-metric-label">BB Position</div>
            <div class="signal-metric-value">${(s.bbPos * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============ TABS ============
const TAB_TITLES = {
  dashboard: 'Dashboard',
  positions: 'Positions',
  trades: 'Trades',
  bets: 'Bets',
  signals: 'Signal Scanner',
  log: 'Activity Log',
};

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('page-title').textContent = TAB_TITLES[tab] || tab;
  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === 'trades') renderAllTrades();
  else if (currentTab === 'bets') renderBets();
  else if (currentTab === 'log') renderLog();
}

// ============ RENDER TRADES ============
function renderTrades() { renderAllTrades(); }

function renderAllTrades() {
  const agent = document.getElementById('filter-agent')?.value || 'all';
  const status = document.getElementById('filter-status')?.value || 'all';
  let trades = tradesData?.trades || [];
  if (agent !== 'all') trades = trades.filter(t => t.agent === agent);
  if (status !== 'all') trades = trades.filter(t => t.status === status);
  trades.sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));

  const renderRow = (t) => {
    const pnlClass = t.pnl_usd > 0 ? 'pnl-positive' : t.pnl_usd < 0 ? 'pnl-negative' : 'pnl-neutral';
    const sb = t.side === 'long' ? 'long' : 'short';
    const ab = t.agent === 'hermes1' ? 'hermes1' : 'hermes2';
    const stb = t.status === 'open' ? 'open' : t.close_reason === 'tp_hit' ? 'tp' : t.close_reason === 'sl_hit' ? 'sl' : t.close_reason === 'trailing_hit' ? 'trailing_hit' : 'closed';
    const closeLabel = t.close_reason === 'tp_hit' ? '🎯 TP' : t.close_reason === 'sl_hit' ? '🛑 SL' : t.close_reason === 'trailing_hit' ? '📈 Trail' : t.status;
    return `<tr>
      <td>${fmtTime(t.opened_at)}</td>
      <td><span class="badge ${ab}">${t.agent}</span></td>
      <td><strong>${t.asset}</strong></td>
      <td><span class="badge ${sb}">${t.side}</span></td>
      <td>$${fmtNum(t.entry_price)}</td>
      <td>${t.exit_price ? '$' + fmtNum(t.exit_price) : '—'}</td>
      <td>$${fmtNum(t.size_usd)}</td>
      <td class="${pnlClass}">${t.pnl_usd !== null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + t.pnl_usd.toFixed(2) + ' (' + t.pnl_pct + '%)' : '—'}</td>
      <td><span class="badge ${stb}">${closeLabel}</span></td>
      <td title="${t.notes || ''}">${trunc(t.notes, 30)}</td>
    </tr>`;
  };

  const html = trades.map(renderRow).join('') || '<tr><td colspan="10" class="empty-state">No trades yet</td></tr>';

  const tbody = document.getElementById('trades-body');
  if (tbody) tbody.innerHTML = html;
  const allTbody = document.getElementById('all-trades-body');
  if (allTbody) allTbody.innerHTML = html;
}

// ============ RENDER BETS ============
function renderBets() {
  const bets = betsData?.bets || [];
  const tbody = document.getElementById('bets-body');
  if (!bets.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No bets yet</td></tr>';
    return;
  }
  tbody.innerHTML = bets.sort((a,b) => new Date(b.opened_at) - new Date(a.opened_at)).map(b => {
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
      <td><span class="badge ${b.status}">${b.close_reason || b.status}</span></td>
      <td title="${b.notes || ''}">${trunc(b.notes, 30)}</td>
    </tr>`;
  }).join('');
}

// ============ RENDER LOG ============
function renderLog() {
  const trades = tradesData?.trades || [];
  const bets = betsData?.bets || [];
  const entries = [];

  trades.forEach(t => {
    const c = t.agent === 'hermes1' ? '#c084fc' : '#67e8f9';
    entries.push({ time: t.opened_at, type: 'trade-open',
      text: `<span class="log-agent" style="color:${c}">${t.agent}</span> OPENED ${t.side.toUpperCase()} ${t.asset} @ $${fmtNum(t.entry_price)} ($${fmtNum(t.size_usd)})` });
    if (t.status === 'closed') {
      const labels = { tp_hit: 'TP HIT', sl_hit: 'SL HIT', trailing_hit: 'TRAILING SL', early_exit: 'EARLY EXIT' };
      const types = { tp_hit: 'trade-tp', sl_hit: 'trade-sl', trailing_hit: 'trailing_hit', early_exit: 'trade-close' };
      const r = labels[t.close_reason] || 'CLOSED';
      entries.push({ time: t.closed_at, type: types[t.close_reason] || 'trade-close',
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
  if (!entries.length) { container.innerHTML = '<p class="empty-state">No log entries</p>'; return; }
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
  const s = autoTraderState?.last_scan;
  const latest = [t, s].filter(Boolean).sort().pop();
  if (latest) document.getElementById('last-updated').textContent = 'Updated: ' + fmtTimeFull(latest);
}
