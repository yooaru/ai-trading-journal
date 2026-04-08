// ============ CONFIG ============
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? '' : 'https://ready-concentrate-immediate-providers.trycloudflare.com';
const REFRESH_INTERVAL = 30000;
let tradesData = null, betsData = null, autoTraderState = null, dailyPnl = null;
let refreshTimer = null;

// ============ NAV ============
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'trades', label: 'Trades', icon: '💹' },
  { id: 'bets', label: 'Bets', icon: '🎯' },
  { id: 'signals', label: 'Signals', icon: '📡' },
  { id: 'log', label: 'Log', icon: '📋' },
];

function buildNav() {
  const nav = document.getElementById('nav-links');
  nav.innerHTML = TABS.map(t => `
    <a onclick="switchTab('${t.id}')" data-tab="${t.id}"
      class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition
        ${t.id === 'dashboard' ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'}">
      <span class="w-5 text-center">${t.icon}</span> ${t.label}
    </a>
  `).join('');
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => {
    const isActive = n.dataset.tab === tab;
    n.classList.toggle('bg-white/[0.06]', isActive);
    n.classList.toggle('text-white', isActive);
    n.classList.toggle('text-gray-500', !isActive);
  });
  document.getElementById('page-title').textContent = TABS.find(t => t.id === tab)?.label || tab;
  closeSidebar();
}

// ============ SIDEBAR ============
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const isOpen = !sb.classList.contains('-translate-x-full');
  if (isOpen) { closeSidebar(); } else {
    sb.classList.remove('-translate-x-full');
    ov.classList.remove('hidden');
  }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.add('-translate-x-full');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ============ AUTH ============
async function authenticate() {
  const input = document.getElementById('access-key').value;
  if (!input || input.length < 4) return;
  try {
    const res = await fetch(API_BASE + '/verify?key=' + encodeURIComponent(input));
    const data = await res.json();
    if (data.valid) {
      localStorage.setItem('journal_session', '1');
      showApp();
    } else {
      document.getElementById('auth-error').classList.remove('hidden');
      document.getElementById('access-key').value = '';
    }
  } catch { document.getElementById('auth-error').textContent = 'Connection error'; document.getElementById('auth-error').classList.remove('hidden'); }
}
function showApp() {
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  buildNav();
  loadData();
  refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
}
function logout() { localStorage.removeItem('journal_session'); location.reload(); }
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('journal_session')) showApp();
  document.getElementById('access-key')?.addEventListener('keypress', e => { if (e.key === 'Enter') authenticate(); });
});

// ============ DATA ============
async function loadData() {
  try {
    const [tr, br, sr, dr] = await Promise.all([
      fetch(API_BASE + '/data/trades.json?t=' + Date.now()).catch(() => null),
      fetch(API_BASE + '/data/bets.json?t=' + Date.now()).catch(() => null),
      fetch(API_BASE + '/data/auto_trader_state.json?t=' + Date.now()).catch(() => null),
      fetch(API_BASE + '/data/daily_pnl.json?t=' + Date.now()).catch(() => null),
    ]);
    if (tr) tradesData = await tr.json();
    if (br) betsData = await br.json();
    if (sr) autoTraderState = await sr.json();
    if (dr) { try { dailyPnl = await dr.json(); } catch {} }
    updateStats(); renderPositions(); renderTradeStats(); renderTrades();
    const t = tradesData?.metadata?.last_updated || autoTraderState?.last_scan;
    if (t) document.getElementById('last-updated').textContent = 'Updated: ' + fmt(t);
  } catch (e) { console.error(e); }
}
function refreshData() { loadData(); }

// ============ STATS ============
function updateStats() {
  const trades = tradesData?.trades || [];
  const bets = betsData?.bets || [];
  const positions = autoTraderState?.positions || {};
  let unreal = 0;
  for (const [s, p] of Object.entries(positions)) {
    const c = p.current_price || p.entry_price;
    unreal += (c - p.entry_price) * p.quantity;
  }
  const closed = trades.filter(t => t.status === 'closed');
  const closedB = bets.filter(b => b.status === 'closed');
  const realized = closed.reduce((s, t) => s + (t.pnl_usd || 0), 0) + closedB.reduce((s, b) => s + (b.pnl_usd || 0), 0);
  const wins = closed.filter(t => (t.pnl_usd || 0) > 0).length + closedB.filter(b => (b.pnl_usd || 0) > 0).length;
  const totalC = closed.length + closedB.length;
  const wr = totalC > 0 ? (wins / totalC * 100).toFixed(1) : '0';

  $('#stat-portfolio', '$' + (99928 + unreal).toLocaleString('en', {maximumFractionDigits: 0}));
  $('#stat-cash', '$99,928');
  $('#stat-unrealized', (unreal >= 0 ? '+' : '') + '$' + unreal.toFixed(2));
  el('stat-unrealized').className = 'text-xl md:text-2xl font-bold font-mono ' + (unreal >= 0 ? 'text-green-400' : 'text-red-400');
  $('#stat-open', Object.keys(positions).length);
  $('#stat-realized', (realized >= 0 ? '+' : '') + '$' + realized.toFixed(2));
  el('stat-realized').className = 'text-xl md:text-2xl font-bold font-mono ' + (realized > 0 ? 'text-green-400' : realized < 0 ? 'text-red-400' : '');
  $('#stat-winrate', wr + '%');

  const d = dailyPnl || {};
  const today = new Date().toISOString().slice(0, 10);
  const tt = (d.trades || []).filter(t => t.time?.startsWith(today));
  $('#stat-today', tt.length);
  const dp = d.total_pnl_pct || 0;
  $('#stat-daily-badge', (dp >= 0 ? '+' : '') + dp.toFixed(2) + '%');
  el('stat-daily-badge').className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ' + (dp >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400');

  const lossRatio = Math.min(Math.abs(Math.min(dp, 0)) / 5 * 100, 100);
  el('daily-loss-bar').style.width = lossRatio + '%';
  el('daily-loss-bar').className = 'h-full rounded-full transition-all duration-500 ' + (lossRatio > 80 ? 'bg-red-500' : lossRatio > 50 ? 'bg-amber-500' : 'bg-green-500');
  $('#daily-loss-text', dp.toFixed(1) + '% / -5.0%');
}

// ============ POSITIONS ============
function renderPositions() {
  const pos = autoTraderState?.positions || {};
  const entries = Object.entries(pos);
  $('#pos-count', entries.length);
  const el = document.getElementById('positions-list');
  if (!entries.length) { el.innerHTML = '<div class="text-center text-gray-600 text-sm py-8">No positions</div>'; return; }
  el.innerHTML = entries.map(([sym, p]) => {
    const c = p.current_price || p.entry_price;
    const pnl = ((c - p.entry_price) / p.entry_price * 100);
    const usd = (c - p.entry_price) * p.quantity;
    const pos = pnl >= 0;
    const trail = p.trailing_active;
    return `
      <div class="bg-[#08090a] border border-white/5 rounded-lg p-3">
        <div class="flex justify-between items-center mb-2">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">LONG</span>
            <span class="font-semibold text-sm">${sym}</span>
          </div>
          <span class="font-mono text-sm font-medium ${pos ? 'text-green-400' : 'text-red-400'}">
            ${pos ? '+' : ''}${pnl.toFixed(2)}% (${pos ? '+' : ''}$${usd.toFixed(2)})
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs">
          <div><div class="text-gray-500 mb-0.5">Entry</div><div class="font-mono">$${p.entry_price.toLocaleString()}</div></div>
          <div><div class="text-gray-500 mb-0.5">Current</div><div class="font-mono">$${c.toLocaleString()}</div></div>
          <div><div class="text-gray-500 mb-0.5">Size</div><div class="font-mono">${p.quantity}</div></div>
          <div><div class="text-gray-500 mb-0.5">TP</div><div class="font-mono text-green-400">${p.tp_levels ? '$' + Math.min(...p.tp_levels).toLocaleString() : '—'}</div></div>
          <div><div class="text-gray-500 mb-0.5">SL</div><div class="font-mono text-red-400">$${(p.sl_price || 0).toLocaleString()}</div></div>
          <div><div class="text-gray-500 mb-0.5">Opened</div><div class="font-mono">${p.entry_time ? new Date(p.entry_time).toLocaleString('en', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : '—'}</div></div>
        </div>
        ${trail ? '<div class="mt-2 text-xs text-accent flex items-center gap-1">▲ Trailing stop active</div>' : ''}
      </div>`;
  }).join('');
}

// ============ SIGNALS ============
async function refreshSignals() {
  const el = document.getElementById('signals-list');
  el.innerHTML = '<div class="text-center text-gray-600 text-sm py-8">Scanning...</div>';
  const assets = ['BTC','ETH','SOL','PAXG','WLD','SUI','DOGE','XRP','LINK','AVAX'];
  const signals = [];
  for (const sym of assets) {
    try {
      const r = await fetch(API_BASE + '/api/indicators?symbol=' + sym + '&interval=1h');
      if (!r.ok) continue;
      const d = await r.json();
      if (d.error) continue;
      let score = 0;
      if (d.rsi < 35) score += 2; else if (d.rsi > 65) score -= 2;
      if ((d.macd_hist || 0) > 0) score += 1; else score -= 1;
      if ((d.bb_position || 0.5) < 0.25) score += 2; else if ((d.bb_position || 0.5) > 0.75) score -= 2;
      const rec = d.recommendation || '';
      if (rec.includes('BUY')) score += 1; else if (rec.includes('SELL')) score -= 1;
      let sig = 'HOLD', str = 50;
      if (score >= 3) { sig = 'BUY'; str = Math.min(50 + score * 8, 95); }
      else if (score <= -3) { sig = 'SELL'; str = Math.min(50 + Math.abs(score) * 8, 95); }
      signals.push({ sym, sig, str, rsi: d.rsi || 50, macd: d.macd_hist || 0, price: d.close || 0 });
    } catch {}
  }
  if (!signals.length) { el.innerHTML = '<div class="text-center text-gray-600 text-sm py-8">No data</div>'; return; }
  el.innerHTML = signals.map(s => `
    <div class="flex items-center justify-between bg-[#08090a] border border-white/5 rounded-lg px-3 py-2.5">
      <div>
        <div class="font-semibold text-sm">${s.sym}</div>
        <div class="font-mono text-xs text-gray-500">$${s.price.toLocaleString()}</div>
      </div>
      <span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${
        s.sig === 'BUY' ? 'bg-green-500/15 text-green-400' :
        s.sig === 'SELL' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-gray-500'
      }">${s.sig}</span>
      <span class="font-mono text-xs text-gray-500">${s.str}%</span>
    </div>
  `).join('');
}

// ============ TRADE STATS ============
function renderTradeStats() {
  const trades = tradesData?.trades || [];
  const bets = betsData?.bets || [];
  const period = document.getElementById('stats-period')?.value || 'all';
  const all = [
    ...trades.filter(t => t.status === 'closed').map(t => ({ pnl: t.pnl_usd || 0, pnl_pct: t.pnl_pct || 0, asset: t.asset, opened: t.opened_at, closed: t.closed_at })),
    ...bets.filter(b => b.status === 'closed').map(b => ({ pnl: b.pnl_usd || 0, pnl_pct: 0, asset: b.market, opened: b.opened_at, closed: b.closed_at })),
  ];
  const now = new Date();
  let f = all;
  if (period === 'today') { const d = now.toISOString().slice(0, 10); f = all.filter(t => t.closed?.startsWith(d)); }
  else if (period === 'week') { const w = new Date(now - 7 * 864e5); f = all.filter(t => t.closed && new Date(t.closed) >= w); }
  else if (period === 'month') { const m = new Date(now.getFullYear(), now.getMonth(), 1); f = all.filter(t => t.closed && new Date(t.closed) >= m); }

  const tot = f.length, wins = f.filter(t => t.pnl > 0), losses = f.filter(t => t.pnl < 0);
  const totalPnl = f.reduce((s, t) => s + t.pnl, 0);
  const wr = tot > 0 ? (wins.length / tot * 100) : 0;
  const avgW = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgL = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const best = f.length ? f.reduce((a, b) => a.pnl > b.pnl ? a : b) : null;
  const worst = f.length ? f.reduce((a, b) => a.pnl < b.pnl ? a : b) : null;
  const gp = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = gl > 0 ? (gp / gl) : (gp > 0 ? Infinity : 0);
  const ht = f.filter(t => t.opened && t.closed).map(t => (new Date(t.closed) - new Date(t.opened)) / 6e4);
  const avgH = ht.length ? (ht.reduce((a, b) => a + b, 0) / ht.length) : 0;
  const dd = f.length ? Math.min(...f.map(t => t.pnl_pct)) : 0;
  const exp = (wr / 100 * avgW) + ((100 - wr) / 100 * avgL);

  const bestStr = best ? best.asset + ' +$' + best.pnl.toFixed(2) : '—';
  const worstStr = worst ? worst.asset + ' -$' + Math.abs(worst.pnl).toFixed(2) : '—';
  const holdStr = avgH >= 60 ? (avgH / 60).toFixed(1) + 'h' : avgH.toFixed(0) + 'm';
  const pfStr = pf === Infinity ? '∞' : pf.toFixed(2);

  // Desktop
  const sd = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  sd('td-total-pnl', (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2));
  sd('td-winrate', wr.toFixed(1) + '%');
  sd('td-total-trades', tot);
  sd('td-wl', wins.length + ' / ' + losses.length);
  sd('td-avg-win', '+$' + avgW.toFixed(2));
  sd('td-avg-loss', '-$' + Math.abs(avgL).toFixed(2));
  sd('td-best', bestStr);
  sd('td-worst', worstStr);
  sd('td-pf', pfStr);
  sd('td-hold', holdStr);
  sd('td-dd', dd.toFixed(1) + '%');
  sd('td-exp', (exp >= 0 ? '+' : '') + '$' + exp.toFixed(2));

  // Mobile (tdm- prefix)
  sd('tdm-total-pnl', (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2));
  sd('tdm-winrate', wr.toFixed(1) + '%');
  sd('tdm-trades', tot);
  sd('tdm-wl', wins.length + ' / ' + losses.length);
  sd('tdm-avg-win', '+$' + avgW.toFixed(2));
  sd('tdm-avg-loss', '-$' + Math.abs(avgL).toFixed(2));
  sd('tdm-best', bestStr);
  sd('tdm-worst', worstStr);
  sd('tdm-pf', pfStr);
  sd('tdm-hold', holdStr);
  sd('tdm-dd', dd.toFixed(1) + '%');
  sd('tdm-exp', (exp >= 0 ? '+' : '') + '$' + exp.toFixed(2));

  // Color
  const sc = (id, v) => { const e = document.getElementById(id); if (e) e.className = 'font-mono text-sm font-medium ' + (v >= 0 ? 'text-green-400' : 'text-red-400'); };
  sc('td-total-pnl', totalPnl); sc('tdm-total-pnl', totalPnl);
  sc('td-exp', exp); sc('tdm-exp', exp);
}

// ============ TRADES TABLE ============
function renderTrades() {
  const agent = document.getElementById('filter-agent')?.value || 'all';
  const status = document.getElementById('filter-status')?.value || 'all';
  let trades = tradesData?.trades || [];
  if (agent !== 'all') trades = trades.filter(t => t.agent === agent);
  if (status !== 'all') trades = trades.filter(t => t.status === status);
  trades.sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));

  const closeLabels = { tp_hit: 'TP Hit', sl_hit: 'SL Hit', trailing_hit: 'Trail', early_exit: 'Early', open: 'Open', closed: 'Closed' };
  const tbody = document.getElementById('trades-body');
  tbody.innerHTML = trades.map(t => {
    const pnlC = t.pnl_usd > 0 ? 'text-green-400' : t.pnl_usd < 0 ? 'text-red-400' : 'text-gray-500';
    const sideC = t.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400';
    const agentC = t.agent === 'hermes1' ? 'bg-purple-500/15 text-purple-400' : 'bg-cyan-500/15 text-cyan-400';
    const st = t.status === 'open' ? 'bg-blue-500/15 text-blue-400' : t.close_reason === 'tp_hit' ? 'bg-green-500/15 text-green-400' : t.close_reason === 'sl_hit' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-gray-400';
    return `<tr class="hover:bg-white/[0.02]">
      <td class="px-4 py-3 whitespace-nowrap">${fmt(t.opened_at)}</td>
      <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${agentC}">${t.agent}</span></td>
      <td class="px-4 py-3 font-semibold">${t.asset}</td>
      <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${sideC}">${t.side?.toUpperCase()}</span></td>
      <td class="px-4 py-3 font-mono">$${fn(t.entry_price)}</td>
      <td class="px-4 py-3 font-mono hidden md:table-cell">${t.exit_price ? '$' + fn(t.exit_price) : '—'}</td>
      <td class="px-4 py-3 font-mono">$${fn(t.size_usd)}</td>
      <td class="px-4 py-3 font-mono font-medium ${pnlC}">${t.pnl_usd !== null ? (t.pnl_usd >= 0 ? '+' : '') + '$' + t.pnl_usd.toFixed(2) : '—'}</td>
      <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${st}">${closeLabels[t.close_reason] || t.status}</span></td>
      <td class="px-4 py-3 text-gray-500 hidden lg:table-cell" title="${t.notes || ''}">${trunc(t.notes, 30)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="text-center text-gray-600 py-8">No trades</td></tr>';
}

// ============ UTILS ============
function el(id) { return document.getElementById(id); }
function $(id, v) { const e = el(id); if (e) e.textContent = v; }
function fmt(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('en', {month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en', {hour:'2-digit',minute:'2-digit',hour12:false}); }
function fn(n) { if (n == null) return '—'; return n.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2}); }
function trunc(s, l) { return !s ? '' : s.length > l ? s.substring(0, l) + '…' : s; }
