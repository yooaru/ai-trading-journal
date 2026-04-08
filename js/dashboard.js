// ============ CONFIG ============
const IS_VERCEL = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('.vercel.');
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? '' : IS_VERCEL ? '' : 'https://ready-concentrate-immediate-providers.trycloudflare.com';
const REFRESH_INTERVAL = 30000;
let tradesData = null, betsData = null, autoTraderState = null, dailyPnl = null;
let refreshTimer = null;
let surfingMode = false;

// ============ THEME ============
function setTheme(name) {
  document.body.setAttribute('data-theme', name);
  localStorage.setItem('ct-theme', name);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('theme-' + name);
  if (btn) btn.classList.add('active');
  // Update CT logo colors for each theme
  document.querySelectorAll('.ct-c').forEach(el => el.style.color = name === 'warm' ? '#d4a853' : '#a1a1aa');
  document.querySelectorAll('.ct-t').forEach(el => el.style.color = name === 'warm' ? '#8a7a50' : '#52525b');
}

function loadTheme() {
  const saved = localStorage.getItem('ct-theme') || 'mono';
  setTheme(saved);
}

// ============ DEMO DATA (surfing mode) ============
const DEMO = {
  trades: {
    metadata: { last_updated: new Date().toISOString() },
    trades: [
      { id: "demo_001", agent: "hermes1", asset: "BTC", side: "long", entry_price: 84200, exit_price: 85800, size_usd: 100, status: "closed", pnl_usd: 1.89, pnl_pct: 1.9, close_reason: "tp_hit", opened_at: "2026-04-08T06:30:00Z", closed_at: "2026-04-08T08:15:00Z", notes: "RSI oversold bounce" },
      { id: "demo_002", agent: "hermes2", asset: "ETH", side: "long", entry_price: 1820, exit_price: 1795, size_usd: 75, status: "closed", pnl_usd: -1.03, pnl_pct: -1.4, close_reason: "sl_hit", opened_at: "2026-04-08T04:00:00Z", closed_at: "2026-04-08T05:30:00Z", notes: "Breakout fake" },
      { id: "demo_003", agent: "hermes1", asset: "SOL", side: "long", entry_price: 128.50, exit_price: null, size_usd: 100, status: "open", pnl_usd: null, pnl_pct: null, close_reason: null, opened_at: "2026-04-08T10:00:00Z", closed_at: null, notes: "Support bounce" },
    ]
  },
  bets: {
    bets: [
      { id: "demo_b1", agent: "hermes1", market: "UCL: Real Madrid vs Bayern", outcome: "Real Madrid", entry_price: 0.37, size_usd: 2.50, status: "closed", pnl_usd: 1.69, close_reason: "win", opened_at: "2026-04-07T20:00:00Z", closed_at: "2026-04-07T22:00:00Z", notes: "Home advantage + form" },
      { id: "demo_b2", agent: "hermes2", market: "UCL: Sporting vs Arsenal", outcome: "Draw", entry_price: 0.26, size_usd: 1.50, status: "closed", pnl_usd: -1.50, close_reason: "loss", opened_at: "2026-04-07T20:00:00Z", closed_at: "2026-04-07T22:00:00Z", notes: "Low EV draw" },
    ]
  },
  state: {
    last_scan: new Date().toISOString(),
    positions: {
      SOL: { entry_price: 128.50, current_price: 131.20, quantity: 0.778, entry_time: "2026-04-08T10:00:00Z", tp_levels: [135, 140], sl_price: 124, trailing_active: false }
    }
  },
  daily: {
    total_pnl_pct: 0.87,
    trades: [
      { time: "2026-04-08T06:30:00Z" },
      { time: "2026-04-08T04:00:00Z" },
      { time: "2026-04-08T10:00:00Z" },
    ]
  }
};

// ============ NAV ============
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◆' },
  { id: 'trades', label: 'Trades', icon: '◇' },
  { id: 'bets', label: 'Bets', icon: '◈' },
  { id: 'signals', label: 'Signals', icon: '▣' },
  { id: 'log', label: 'Log', icon: '▤' },
];

function buildNav() {
  const nav = document.getElementById('nav-links');
  nav.innerHTML = TABS.map(t => `
    <a onclick="switchTab('${t.id}')" data-tab="${t.id}"
      class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer
        ${t.id === 'dashboard' ? 'bg-white/[0.06] text-white active-nav' : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'}">
      <span class="w-5 text-center">${t.icon}</span> ${t.label}
    </a>
  `).join('');
}

function switchTab(tab) {
  // Update nav styling
  document.querySelectorAll('.nav-item').forEach(n => {
    const isActive = n.dataset.tab === tab;
    n.classList.toggle('bg-white/[0.06]', isActive);
    n.classList.toggle('text-white', isActive);
    n.classList.toggle('active-nav', isActive);
    n.classList.toggle('text-gray-500', !isActive);
  });
  // Show/hide tab content
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const target = document.getElementById('tab-' + tab);
  if (target) target.classList.add('active');
  // Update title
  document.getElementById('page-title').textContent = TABS.find(t => t.id === tab)?.label || tab;
  // Render content for the tab
  if (tab === 'trades') renderAllTrades();
  else if (tab === 'bets') renderBets();
  else if (tab === 'log') renderLog();
  else if (tab === 'signals') { buildAssetCheckboxes(); refreshSignals(); }
  // Close sidebar on mobile
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
  if (surfingMode) {
    document.getElementById('preview-badge').classList.remove('hidden');
  }
  buildNav();
  loadData();
  refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
}
function enterSurfing() {
  surfingMode = true;
  showApp();
}
function logout() { localStorage.removeItem('journal_session'); surfingMode = false; location.reload(); }
window.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  if (localStorage.getItem('journal_session')) showApp();
  document.getElementById('access-key')?.addEventListener('keypress', e => { if (e.key === 'Enter') authenticate(); });
});

// ============ DATA ============
async function loadData() {
  // Surfing mode — use demo data, skip fetch
  if (surfingMode) {
    tradesData = JSON.parse(JSON.stringify(DEMO.trades));
    betsData = JSON.parse(JSON.stringify(DEMO.bets));
    autoTraderState = JSON.parse(JSON.stringify(DEMO.state));
    dailyPnl = JSON.parse(JSON.stringify(DEMO.daily));
    updateStats(); renderPositions(); renderTradeStats(); renderTrades();
    document.getElementById('last-updated').textContent = 'Preview data';
    return;
  }
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
function refreshData() { if (!surfingMode) loadData(); }

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
  el('daily-loss-bar').className = 'h-full bar-glow rounded-full ' + (lossRatio > 80 ? 'bg-red-500' : lossRatio > 50 ? 'bg-amber-500' : 'bg-green-500');
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
      <div class="pos-card bg-[#08090a] border border-white/5 rounded-lg p-3">
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
        ${trail ? '<div class="mt-2 text-xs text-zinc-500 flex items-center gap-1">▲ Trailing stop active</div>' : ''}
      </div>`;
  }).join('');
}

// ============ SIGNALS ============
const ALL_ASSETS = ['BTC','ETH','SOL','PAXG','XRP','DOGE','WLD','SUI','LINK','AVAX','BNB','ADA','DOT','NEAR','ARB','OP'];
let selectedAssets = ['BTC','ETH','SOL'];

function buildAssetCheckboxes() {
  const el = document.getElementById('asset-checkboxes');
  if (!el) return;
  el.innerHTML = ALL_ASSETS.map(a => `
    <label class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition
      ${selectedAssets.includes(a) ? 'bg-zinc-700/40 border-zinc-600 text-zinc-200' : 'bg-transparent border-white/5 text-zinc-500 hover:border-white/10'}">
      <input type="checkbox" class="hidden" value="${a}" ${selectedAssets.includes(a) ? 'checked' : ''} onchange="toggleAsset('${a}')">
      <span class="text-xs font-medium">${a}</span>
    </label>
  `).join('');
}

function toggleAsset(sym) {
  const i = selectedAssets.indexOf(sym);
  if (i >= 0) selectedAssets.splice(i, 1); else selectedAssets.push(sym);
  buildAssetCheckboxes();
}

async function runFullScan() {
  const el = document.getElementById('signals-detail');
  const interval = document.getElementById('scan-interval')?.value || '1h';
  if (!selectedAssets.length) { el.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">Select at least one asset</div>'; return; }

  // Surfing mode
  if (surfingMode) {
    el.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">Scanning...</div>';
    await new Promise(r => setTimeout(r, 800));
    const demoSignals = selectedAssets.map((sym, i) => ({
      sym, sig: ['BUY','HOLD','SELL','BUY','HOLD'][i % 5], str: 40 + Math.floor(Math.random()*50), price: 100 + Math.random()*80000
    }));
    renderSignalList(el, demoSignals);
    return;
  }

  el.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">Scanning ' + selectedAssets.length + ' assets...</div>';
  const signals = [];
  for (const sym of selectedAssets) {
    try {
      const r = await fetch(API_BASE + '/api/indicators?symbol=' + sym + '&interval=' + interval);
      if (!r.ok) continue;
      const d = await r.json();
      // Always process — server returns fallback data on error
      let score = 0;
      // RSI — wider zones
      const rsi = d.rsi || 50;
      if (rsi < 30) score += 3;
      else if (rsi < 40) score += 1;
      else if (rsi > 70) score -= 3;
      else if (rsi > 60) score -= 1;
      // MACD — treat 0 as neutral
      const mh = d.macd_hist || 0;
      if (mh > 5) score += 2;
      else if (mh > 0) score += 1;
      else if (mh < -5) score -= 2;
      else if (mh < 0) score -= 1;
      // Recommendation — handle STRONG variants
      const rec = (d.recommendation || '').toUpperCase();
      if (rec.includes('STRONG_BUY')) score += 3;
      else if (rec.includes('BUY')) score += 2;
      else if (rec.includes('STRONG_SELL')) score -= 3;
      else if (rec.includes('SELL')) score -= 2;
      // Stochastic
      const sk = d.stoch_k || 50;
      if (sk < 20) score += 1;
      else if (sk > 80) score -= 1;
      // EMA trend
      if (d.ema10 && d.ema20 && d.close) {
        if (d.close > d.ema10 && d.ema10 > d.ema20) score += 1;
        else if (d.close < d.ema10 && d.ema10 < d.ema20) score -= 1;
      }
      let sig = 'HOLD', str = 50;
      if (d.fallback) { sig = 'NO DATA'; str = 0; }
      else if (score >= 3) { sig = 'BUY'; str = Math.min(50 + score * 6, 95); }
      else if (score <= -3) { sig = 'SELL'; str = Math.min(50 + Math.abs(score) * 6, 95); }
      else if (score >= 1) { sig = 'LEAN BUY'; str = 50 + score * 5; }
      else if (score <= -1) { sig = 'LEAN SELL'; str = 50 + Math.abs(score) * 5; }
      signals.push({ sym, sig, str, rsi: d.rsi || 50, macd: d.macd_hist || 0, price: d.close || 0 });
    } catch {}
  }
  if (!signals.length) { el.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">No data — check server</div>'; return; }
  renderSignalList(el, signals);
}

async function refreshSignals() {
  const el = document.getElementById('signals-list');
  el.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">Scanning...</div>';

  // Surfing mode — demo signals
  if (surfingMode) {
    await new Promise(r => setTimeout(r, 800));
    const demoSignals = [
      { sym: 'BTC', sig: 'BUY', str: 72, price: 84520 },
      { sym: 'ETH', sig: 'HOLD', str: 51, price: 1815 },
      { sym: 'SOL', sig: 'BUY', str: 68, price: 131.20 },
      { sym: 'PAXG', sig: 'HOLD', str: 48, price: 2345 },
      { sym: 'DOGE', sig: 'SELL', str: 61, price: 0.168 },
    ];
    renderSignalList(el, demoSignals);
    return;
  }
  const assets = selectedAssets.slice(0, 5);
  const signals = [];
  for (const sym of assets) {
    try {
      const r = await fetch(API_BASE + '/api/indicators?symbol=' + sym + '&interval=1h');
      if (!r.ok) continue;
      const d = await r.json();
      // Always process — server returns fallback data on error
      let score = 0;
      // RSI — wider zones
      const rsi = d.rsi || 50;
      if (rsi < 30) score += 3;
      else if (rsi < 40) score += 1;
      else if (rsi > 70) score -= 3;
      else if (rsi > 60) score -= 1;
      // MACD — treat 0 as neutral
      const mh = d.macd_hist || 0;
      if (mh > 5) score += 2;
      else if (mh > 0) score += 1;
      else if (mh < -5) score -= 2;
      else if (mh < 0) score -= 1;
      // Recommendation — handle STRONG variants
      const rec = (d.recommendation || '').toUpperCase();
      if (rec.includes('STRONG_BUY')) score += 3;
      else if (rec.includes('BUY')) score += 2;
      else if (rec.includes('STRONG_SELL')) score -= 3;
      else if (rec.includes('SELL')) score -= 2;
      // Stochastic
      const sk = d.stoch_k || 50;
      if (sk < 20) score += 1;
      else if (sk > 80) score -= 1;
      // EMA trend
      if (d.ema10 && d.ema20 && d.close) {
        if (d.close > d.ema10 && d.ema10 > d.ema20) score += 1;
        else if (d.close < d.ema10 && d.ema10 < d.ema20) score -= 1;
      }
      let sig = 'HOLD', str = 50;
      if (d.fallback) { sig = 'NO DATA'; str = 0; }
      else if (score >= 3) { sig = 'BUY'; str = Math.min(50 + score * 6, 95); }
      else if (score <= -3) { sig = 'SELL'; str = Math.min(50 + Math.abs(score) * 6, 95); }
      else if (score >= 1) { sig = 'LEAN BUY'; str = 50 + score * 5; }
      else if (score <= -1) { sig = 'LEAN SELL'; str = 50 + Math.abs(score) * 5; }
      signals.push({ sym, sig, str, rsi: d.rsi || 50, macd: d.macd_hist || 0, price: d.close || 0 });
    } catch {}
  }
  if (!signals.length) { el.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">No data</div>'; return; }
  renderSignalList(el, signals);
}

function renderSignalList(container, signals) {
  container.innerHTML = signals.map(s => {
    const sigColor = s.sig === 'BUY' ? 'bg-green-500' : s.sig === 'SELL' ? 'bg-red-500' : s.sig === 'LEAN BUY' ? 'bg-green-500/60' : s.sig === 'LEAN SELL' ? 'bg-red-500/60' : s.sig === 'NO DATA' ? 'bg-amber-500/40' : 'bg-zinc-600';
    return `
    <div class="flex items-center justify-between bg-[#09090b] border border-white/5 rounded-lg px-3 py-2.5 hover:border-white/10 transition">
      <div>
        <div class="font-semibold text-sm">${s.sym}</div>
        <div class="font-mono text-xs text-zinc-500">$${s.price.toLocaleString()}</div>
      </div>
      <div class="flex items-center gap-3">
        <div class="w-16">
          ${s.str > 0 ? `<div class="signal-bar"><div class="signal-fill ${sigColor}" style="width:${s.str}%"></div></div><div class="text-[9px] text-zinc-600 text-center mt-0.5 font-mono">${s.str}%</div>` : '<div class="text-[9px] text-zinc-600 text-center font-mono">—</div>'}
        </div>
        <span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${
          s.sig === 'BUY' ? 'bg-green-500/15 text-green-400' :
          s.sig === 'SELL' ? 'bg-red-500/15 text-red-400' :
          s.sig === 'LEAN BUY' ? 'bg-green-500/10 text-green-500' :
          s.sig === 'LEAN SELL' ? 'bg-red-500/10 text-red-500' :
          s.sig === 'NO DATA' ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-zinc-500'
        }">${s.sig}</span>
      </div>
    </div>`;
  }).join('');
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
  const html = tradeRows(trades);
  const tbody = document.getElementById('trades-body');
  if (tbody) tbody.innerHTML = html;
  const allTbody = document.getElementById('all-trades-body');
  if (allTbody) allTbody.innerHTML = html;
}

function renderAllTrades() {
  const agent = document.getElementById('filter-agent')?.value || 'all';
  const status = document.getElementById('filter-status')?.value || 'all';
  const from = document.getElementById('trades-from')?.value;
  const to = document.getElementById('trades-to')?.value;
  const sort = document.getElementById('trades-sort')?.value || 'newest';
  let trades = [...(tradesData?.trades || [])];
  if (agent !== 'all') trades = trades.filter(t => t.agent === agent);
  if (status !== 'all') trades = trades.filter(t => t.status === status);
  if (from) trades = trades.filter(t => t.opened_at && t.opened_at >= from);
  if (to) trades = trades.filter(t => t.opened_at && t.opened_at.slice(0,10) <= to);
  trades = sortTrades(trades, sort);
  const html = tradeRows(trades);
  const tbody = document.getElementById('all-trades-body');
  if (tbody) tbody.innerHTML = html;
  // Also update dashboard mini table
  const dashTbody = document.getElementById('trades-body');
  if (dashTbody) dashTbody.innerHTML = html;
}

function sortTrades(trades, sort) {
  switch(sort) {
    case 'oldest': return trades.sort((a,b) => new Date(a.opened_at) - new Date(b.opened_at));
    case 'pnl-high': return trades.sort((a,b) => (b.pnl_usd||0) - (a.pnl_usd||0));
    case 'pnl-low': return trades.sort((a,b) => (a.pnl_usd||0) - (b.pnl_usd||0));
    case 'size': return trades.sort((a,b) => (b.size_usd||0) - (a.size_usd||0));
    default: return trades.sort((a,b) => new Date(b.opened_at) - new Date(a.opened_at));
  }
}

function tradeRows(trades) {
  const closeLabels = { tp_hit: 'TP Hit', sl_hit: 'SL Hit', trailing_hit: 'Trail', early_exit: 'Early', open: 'Open', closed: 'Closed' };
  return trades.map(t => {
    const pnlC = t.pnl_usd > 0 ? 'text-green-400' : t.pnl_usd < 0 ? 'text-red-400' : 'text-gray-500';
    const sideC = t.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400';
    const agentC = t.agent === 'hermes1' ? 'bg-zinc-700/50 text-zinc-300' : 'bg-zinc-600/30 text-zinc-400';
    const st = t.status === 'open' ? 'bg-blue-500/15 text-blue-400' : t.close_reason === 'tp_hit' ? 'bg-green-500/15 text-green-400' : t.close_reason === 'sl_hit' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-gray-400';
    return `<tr class="trade-row">
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

// ============ BETS ============
function renderBets() {
  const from = document.getElementById('bets-from')?.value;
  const to = document.getElementById('bets-to')?.value;
  const sort = document.getElementById('bets-sort')?.value || 'newest';
  let bets = [...(betsData?.bets || [])];
  if (from) bets = bets.filter(b => b.opened_at && b.opened_at >= from);
  if (to) bets = bets.filter(b => b.opened_at && b.opened_at.slice(0,10) <= to);
  switch(sort) {
    case 'oldest': bets.sort((a,b) => new Date(a.opened_at) - new Date(b.opened_at)); break;
    case 'pnl-high': bets.sort((a,b) => (b.pnl_usd||0) - (a.pnl_usd||0)); break;
    case 'pnl-low': bets.sort((a,b) => (a.pnl_usd||0) - (b.pnl_usd||0)); break;
    default: bets.sort((a,b) => new Date(b.opened_at) - new Date(a.opened_at));
  }
  const tbody = document.getElementById('bets-body');
  if (!bets.length) { tbody.innerHTML = '<tr><td colspan="9" class="text-center text-zinc-600 py-8">No bets</td></tr>'; return; }
  tbody.innerHTML = bets.map(b => {
    const pnlC = b.pnl_usd > 0 ? 'text-green-400' : b.pnl_usd < 0 ? 'text-red-400' : 'text-gray-500';
    const agentC = b.agent === 'hermes1' ? 'bg-zinc-700/50 text-zinc-300' : 'bg-zinc-600/30 text-zinc-400';
    return `<tr class="trade-row">
      <td class="px-4 py-3 whitespace-nowrap">${fmt(b.opened_at)}</td>
      <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${agentC}">${b.agent}</span></td>
      <td class="px-4 py-3">${b.market}</td>
      <td class="px-4 py-3">${b.outcome}</td>
      <td class="px-4 py-3 font-mono">${(b.entry_price * 100).toFixed(0)}¢</td>
      <td class="px-4 py-3 font-mono">$${fn(b.size_usd)}</td>
      <td class="px-4 py-3 font-mono font-medium ${pnlC}">${b.pnl_usd !== null ? (b.pnl_usd >= 0 ? '+' : '') + '$' + b.pnl_usd.toFixed(2) : '—'}</td>
      <td class="px-4 py-3"><span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-gray-400">${b.close_reason || b.status}</span></td>
      <td class="px-4 py-3 text-gray-500">${trunc(b.notes, 30)}</td>
    </tr>`;
  }).join('');
}

// ============ LOG ============
function renderLog() {
  const from = document.getElementById('log-from')?.value;
  const to = document.getElementById('log-to')?.value;
  const type = document.getElementById('log-type')?.value || 'all';
  const sort = document.getElementById('log-sort')?.value || 'newest';
  const trades = tradesData?.trades || [];
  const bets = betsData?.bets || [];
  const entries = [];

  if (type !== 'bets') {
    trades.forEach(t => {
      const c = t.agent === 'hermes1' ? '#a1a1aa' : '#71717a';
      entries.push({ time: t.opened_at, color: c, agent: t.agent, kind: 'trade',
        text: `OPENED ${t.side?.toUpperCase()} ${t.asset} @ $${fn(t.entry_price)} ($${fn(t.size_usd)})` });
      if (t.status === 'closed') {
        const labels = { tp_hit: 'TP HIT', sl_hit: 'SL HIT', trailing_hit: 'TRAILING SL', early_exit: 'EARLY EXIT' };
        const colors = { tp_hit: 'border-green-500', sl_hit: 'border-red-500', trailing_hit: 'border-amber-500' };
        entries.push({ time: t.closed_at, color: c, agent: t.agent, kind: 'trade',
          border: colors[t.close_reason] || 'border-green-500',
          text: `${labels[t.close_reason] || 'CLOSED'} ${t.asset} — P&L: ${(t.pnl_usd >= 0 ? '+' : '')}$${t.pnl_usd?.toFixed(2)} (${t.pnl_pct}%)` });
      }
    });
  }

  if (type !== 'trades') {
    bets.forEach(b => {
      const c = b.agent === 'hermes1' ? '#a1a1aa' : '#71717a';
      entries.push({ time: b.opened_at, color: c, agent: b.agent, kind: 'bet',
        text: `BET ${b.outcome} on "${b.market}" @ ${(b.entry_price * 100).toFixed(0)}¢ ($${fn(b.size_usd)})` });
    });
  }

  // Date filter
  if (from) entries.splice(0, entries.length, ...entries.filter(e => e.time && e.time >= from));
  if (to) entries.splice(0, entries.length, ...entries.filter(e => e.time && e.time.slice(0,10) <= to));

  // Sort
  entries.sort((a, b) => sort === 'oldest' ? new Date(a.time) - new Date(b.time) : new Date(b.time) - new Date(a.time));

  const container = document.getElementById('log-entries');
  if (!entries.length) { container.innerHTML = '<div class="text-center text-zinc-600 text-sm py-8">No log entries</div>'; return; }
  container.innerHTML = entries.map(e => `
    <div class="log-entry bg-[#09090b] border-l-2 ${e.border || 'log-accent'} rounded-r-lg px-4 py-3">
      <div class="text-[10px] text-gray-600 font-mono mb-1">${fmt(e.time)}</div>
      <div class="text-sm"><span class="font-medium" style="color:${e.color}">${e.agent}</span> ${e.text}</div>
    </div>
  `).join('');
}

// ============ UTILS ============
function el(id) { return document.getElementById(id); }
function $(id, v) { const e = el(id); if (e) e.textContent = v; }
function fmt(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('en', {month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en', {hour:'2-digit',minute:'2-digit',hour12:false}); }
function fn(n) { if (n == null) return '—'; return n.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2}); }
function trunc(s, l) { return !s ? '' : s.length > l ? s.substring(0, l) + '…' : s; }

// ============ FILTERS ============
function clearFilters(section) {
  if (section === 'trades') {
    const f = document.getElementById('trades-from'); if (f) f.value = '';
    const t = document.getElementById('trades-to'); if (t) t.value = '';
    const s = document.getElementById('trades-sort'); if (s) s.value = 'newest';
    const fa = document.getElementById('filter-agent'); if (fa) fa.value = 'all';
    const fs = document.getElementById('filter-status'); if (fs) fs.value = 'all';
    renderAllTrades();
  } else if (section === 'bets') {
    const f = document.getElementById('bets-from'); if (f) f.value = '';
    const t = document.getElementById('bets-to'); if (t) t.value = '';
    const s = document.getElementById('bets-sort'); if (s) s.value = 'newest';
    renderBets();
  } else if (section === 'log') {
    const f = document.getElementById('log-from'); if (f) f.value = '';
    const t = document.getElementById('log-to'); if (t) t.value = '';
    const ty = document.getElementById('log-type'); if (ty) ty.value = 'all';
    const s = document.getElementById('log-sort'); if (s) s.value = 'newest';
    renderLog();
  }
}
