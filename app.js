/* ── PolyHedge App ── */

const POLY_API = 'https://corsproxy.io/?url=https://gamma-api.polymarket.com/markets';
const FETCH_LIMIT = 500;

// ── State ──
let state = {
  maxDistance: 10,
  maxDays: 7,
  minLiquidity: 5000,
  markets: [],
  loading: false,
};

// ── DOM refs ──
const distanceSlider = document.getElementById('distanceSlider');
const distanceVal    = document.getElementById('distanceVal');
const scanBtn        = document.getElementById('scanBtn');
const resultsEl      = document.getElementById('results');
const statsBar       = document.getElementById('statsBar');
const emptyState     = document.getElementById('emptyState');

// ── Controls ──
distanceSlider.addEventListener('input', () => {
  state.maxDistance = parseInt(distanceSlider.value);
  distanceVal.textContent = `${state.maxDistance}¢`;
  if (state.markets.length) renderResults(filterMarkets(state.markets));
});

document.getElementById('daysFilter').addEventListener('click', e => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  document.querySelectorAll('#daysFilter .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  state.maxDays = parseInt(pill.dataset.days);
  if (state.markets.length) renderResults(filterMarkets(state.markets));
});

document.getElementById('liqFilter').addEventListener('click', e => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  document.querySelectorAll('#liqFilter .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  state.minLiquidity = parseInt(pill.dataset.liq);
  if (state.markets.length) renderResults(filterMarkets(state.markets));
});

scanBtn.addEventListener('click', scan);

// ── Fetch ──
async function fetchAllMarkets() {
  const markets = [];
  let offset = 0;
  const batch = 100;

  while (markets.length < FETCH_LIMIT) {
    const target = `https://gamma-api.polymarket.com/markets?limit=${batch}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`;
    const url = `https://corsproxy.io/?url=${encodeURIComponent(target)}`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Origin': 'https://polymarket.com' }
    });
    if (!r.ok) break;
    const data = await r.json();
    if (!data || !data.length) break;
    markets.push(...data);
    offset += batch;
    if (data.length < batch) break;
  }
  return markets;
}

// ── Parse prices ──
function parsePrices(market) {
  try {
    let prices   = market.outcomePrices;
    let outcomes = market.outcomes;
    if (typeof prices   === 'string') prices   = JSON.parse(prices);
    if (typeof outcomes === 'string') outcomes = JSON.parse(outcomes);

    if (prices && outcomes) {
      let yesPrice = null, noPrice = null;
      outcomes.forEach((o, i) => {
        const label = String(o).toUpperCase();
        const p = Math.round(parseFloat(prices[i]) * 100);
        if (['YES','TRUE','1'].includes(label)) yesPrice = p;
        else if (['NO','FALSE','0'].includes(label)) noPrice = p;
      });
      if (yesPrice && noPrice) return { yes: yesPrice, no: noPrice };
      if (prices.length === 2) {
        const yes = Math.round(parseFloat(prices[0]) * 100);
        const no  = Math.round(parseFloat(prices[1]) * 100);
        if (yes >= 1 && yes <= 99) return { yes, no };
      }
    }
    const p = market.lastTradePrice;
    if (p) {
      const yes = Math.round(parseFloat(p) * 100);
      return { yes, no: 100 - yes };
    }
  } catch {}
  return null;
}

// ── Time helpers ──
function parseTimeLeft(endDate) {
  if (!endDate) return null;
  try {
    const end   = new Date(endDate);
    const now   = new Date();
    const diffMs = end - now;
    if (diffMs <= 0) return null;
    const totalHours = diffMs / 3600000;
    const days  = Math.floor(totalHours / 24);
    const hours = Math.floor(totalHours % 24);
    const mins  = Math.floor((diffMs % 3600000) / 60000);
    return { days, hours, mins, totalHours };
  } catch { return null; }
}

function formatTimeLeft(t) {
  if (!t) return { text: '?', cls: '' };
  if (t.days === 0 && t.hours < 12)
    return { text: `⚡ ${t.hours}h ${t.mins}m left`, cls: 'time-urgent' };
  if (t.days === 0)
    return { text: `${t.hours}h ${t.mins}m left`, cls: 'time-urgent' };
  if (t.days === 1)
    return { text: `1d ${t.hours}h left`, cls: 'time-soon' };
  return { text: `${t.days}d ${t.hours}h left`, cls: '' };
}

// ── Cost calc ──
function calcCost(yesPrice, noPrice, amount = 100) {
  const feeRate = 0.02;
  const totalIn = amount * 2;
  const payoutIfYes = amount / (yesPrice / 100) * (1 - feeRate);
  const payoutIfNo  = amount / (noPrice  / 100) * (1 - feeRate);
  const lossIfYes = totalIn - payoutIfYes;
  const lossIfNo  = totalIn - payoutIfNo;
  return {
    lossIfYes: lossIfYes.toFixed(2),
    lossIfNo:  lossIfNo.toFixed(2),
    worst:     Math.max(lossIfYes, lossIfNo).toFixed(2),
  };
}

// ── Filter ──
function filterMarkets(markets) {
  const results = [];

  for (const m of markets) {
    let outcomes = m.outcomes;
    if (typeof outcomes === 'string') { try { outcomes = JSON.parse(outcomes); } catch { continue; } }
    if (!outcomes || outcomes.length !== 2) continue;

    const prices = parsePrices(m);
    if (!prices) continue;

    const distance = Math.abs(prices.yes - 50);
    if (distance > state.maxDistance) continue;

    const liquidity = parseFloat(m.liquidity || 0);
    const volume    = parseFloat(m.volume || 0);
    if (liquidity < state.minLiquidity) continue;
    if (volume < 1000) continue;

    const timeLeft = parseTimeLeft(m.endDate);
    if (!timeLeft) continue; // already ended
    if (timeLeft.days > state.maxDays) continue;

    const cost = calcCost(prices.yes, prices.no);

    results.push({
      question: (m.question || '').trim(),
      yes: prices.yes,
      no:  prices.no,
      distance,
      liquidity,
      volume,
      timeLeft,
      cost,
      url: `https://polymarket.com/event/${m.slug || ''}`,
    });
  }

  results.sort((a, b) => a.distance - b.distance || a.timeLeft.totalHours - b.timeLeft.totalHours);
  return results.slice(0, 30);
}

// ── Format money ──
function fmtMoney(v) {
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Render ──
function renderSkeletons(n = 6) {
  resultsEl.innerHTML = Array(n).fill('<div class="skeleton"></div>').join('');
}

function renderResults(results) {
  statsBar.style.display = 'flex';
  document.getElementById('statFound').textContent = results.length;
  document.getElementById('statTime').textContent = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

  if (!results.length) {
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◈</div>
        <p>No markets match your filters. Try loosening the distance or liquidity settings.</p>
      </div>`;
    return;
  }

  const best = results[0];
  document.getElementById('statBest').textContent = `${best.distance}¢ from 50`;

  const cards = results.map((r, i) => {
    const distCls = r.distance <= 2 ? 'dist-0' : r.distance <= 5 ? 'dist-1' : 'dist-2';
    const distLabel = r.distance === 0 ? 'EXACT 50/50' : `${r.distance}¢ off`;
    const time = formatTimeLeft(r.timeLeft);
    const costNum = parseFloat(r.cost.worst);
    const costGood = costNum < 5;

    return `
      <a class="card" href="${r.url}" target="_blank" rel="noopener">
        <div class="card-rank">#${String(i+1).padStart(2,'0')}</div>
        <div class="card-body">
          <div class="card-question">${escHtml(r.question)}</div>
          <div class="card-meta">
            <span>VOL <span class="val">${fmtMoney(r.volume)}</span></span>
            <span>LIQ <span class="val">${fmtMoney(r.liquidity)}</span></span>
            <span>HEDGE COST <span class="val">~$${r.cost.worst} / $200 in</span></span>
          </div>
        </div>
        <div class="card-right">
          <span class="badge-distance ${distCls}">${distLabel}</span>
          <div class="prices">
            <span class="price-yes">YES ${r.yes}¢</span>
            <span class="price-sep">·</span>
            <span class="price-no">NO ${r.no}¢</span>
          </div>
          <span class="time-badge ${time.cls}">${time.text}</span>
          <span class="cost-pill ${costGood ? 'good' : ''}">
            ${costGood ? '✓' : '!'} $${r.cost.worst} worst loss
          </span>
        </div>
      </a>`;
  }).join('');

  resultsEl.innerHTML = `<div class="cards-grid">${cards}</div>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Scan ──
async function scan() {
  if (state.loading) return;
  state.loading = true;
  scanBtn.classList.add('loading');
  scanBtn.disabled = true;
  scanBtn.innerHTML = '<span class="scan-icon">⟳</span> Scanning...';
  renderSkeletons();
  statsBar.style.display = 'none';

  try {
    state.markets = await fetchAllMarkets();
    document.getElementById('statTotal').textContent = state.markets.length;
    const filtered = filterMarkets(state.markets);
    renderResults(filtered);
  } catch (err) {
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠</div>
        <p>Failed to fetch markets. Check your connection and try again.</p>
      </div>`;
  } finally {
    state.loading = false;
    scanBtn.classList.remove('loading');
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<span class="scan-icon">⟳</span> Scan Markets';
  }
}
