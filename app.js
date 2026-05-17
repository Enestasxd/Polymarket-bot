/* ── PolyHedge App v2 ──
   Yenilikler:
   - Fee hesabı düzeltildi: %2 taker × 2 taraf = sabit $4 per $100+$100
   - Auto-refresh her 30 saniyede bir
   - Telegram onay sistemi
   - Multi-wallet (Cüzdan A → YES, Cüzdan B → NO)
   - CSV export (işlem geçmişi)
   - Polymarket CLOB API ile gerçek trade execution
*/

const POLY_API   = 'https://gamma-api.polymarket.com/markets';
const CLOB_API   = 'https://clob.polymarket.com';
const FETCH_LIMIT = 500;
const REFRESH_INTERVAL = 30; // saniye
const TAKER_FEE = 0.02; // %2 her iki taraf için
const TWITTER_HANDLE = 'FenasKripto';
const SITE_URL = 'https://polymarket-bot-lac.vercel.app';

// ── Dil dosyası ──
const i18n = {
  tr: {
    settings: '⚙ Ayarlar', tg_desc: 'Bot bir fırsat bulduğunda sana Telegram\'dan sorar.',
    tg_token: 'Bot Token', tg_chat: 'Chat ID', tg_test: 'Test Mesajı Gönder',
    wallet_a: 'Cüzdan A — YES tarafı', wallet_a_desc: 'Bu cüzdan YES pozisyonu alır.',
    wallet_b: 'Cüzdan B — NO tarafı', wallet_b_desc: 'Bu cüzdan NO pozisyonu alır.',
    pk: 'Private Key', addr: 'Adres (otomatik dolar)',
    trade_amount: 'İşlem Tutarı', trade_amount_label: 'Her cüzdandan USDC miktarı ($)',
    trade_amount_desc: 'Her iki cüzdana da bu kadar girilir. Toplam exposure: 2×',
    save: 'Kaydet', pk_warning: '⚠ Private key\'ler sadece tarayıcı localStorage\'ında tutulur.',
    trade_confirm: 'Trade Onayla', cancel: 'İptal', trade_send: '✓ Trade At',
    hero_title: 'Her İki Tarafa Gir.<br/><em>Airdrop\'u Kazan.</em>',
    hero_sub: 'Polymarket\'ta 50/50\'ye en yakın marketler. YES + NO al. Sıfır yönsel risk.',
    max_dist: '50¢\'ye max uzaklık', expires: 'Bitiş süresi',
    min_liq: 'Min likidite', scan: 'Marketleri Tara', all: 'Hepsi',
    markets_scanned: 'market tarandı', matches: 'eşleşme bulundu',
    best_spread: 'en iyi fark', last_updated: 'son güncelleme', trades_sent: 'trade gönderildi',
    empty_state: '<strong>Marketleri Tara</strong>\'ya bas ve fırsatları bul.',
    nfa: 'Finansal tavsiye değildir. Kendi araştırmanızı yapın.',
    share: '𝕏 Paylaş',
  },
  en: {
    settings: '⚙ Settings', tg_desc: 'Bot notifies you on Telegram when it finds an opportunity.',
    tg_token: 'Bot Token', tg_chat: 'Chat ID', tg_test: 'Send Test Message',
    wallet_a: 'Wallet A — YES side', wallet_a_desc: 'This wallet takes the YES position.',
    wallet_b: 'Wallet B — NO side', wallet_b_desc: 'This wallet takes the NO position.',
    pk: 'Private Key', addr: 'Address (auto-derived)',
    trade_amount: 'Trade Amount', trade_amount_label: 'USDC per wallet ($)',
    trade_amount_desc: 'Each wallet sends this amount. Total exposure: 2×',
    save: 'Save', pk_warning: '⚠ Private keys are stored only in browser localStorage.',
    trade_confirm: 'Confirm Trade', cancel: 'Cancel', trade_send: '✓ Execute',
    hero_title: 'Hedge Both Sides.<br/><em>Farm the Airdrop.</em>',
    hero_sub: 'Closest 50/50 markets on Polymarket — sorted by proximity. Buy YES + NO. Zero directional risk.',
    max_dist: 'Max distance from 50¢', expires: 'Expires within',
    min_liq: 'Min liquidity', scan: 'Scan Markets', all: 'All',
    markets_scanned: 'markets scanned', matches: 'matches found',
    best_spread: 'best spread', last_updated: 'last updated', trades_sent: 'trades sent',
    empty_state: 'Hit <strong>Scan Markets</strong> to find opportunities.',
    nfa: 'Not financial advice. Do your own research.',
    share: '𝕏 Share',
  }
};

// ── State ──
let state = {
  maxDistance: 10,
  maxDays: 7,
  minLiquidity: 5000,
  markets: [],
  loading: false,
  refreshTimer: null,
  refreshSecondsLeft: REFRESH_INTERVAL,
  tradeHistory: [],
  pendingTrade: null,
  lang: localStorage.getItem('polyhedge_lang') || 'tr',
  theme: localStorage.getItem('polyhedge_theme') || 'dark',
  settings: loadSettings(),
};

// ── Settings persist ──
function loadSettings() {
  try {
    const s = localStorage.getItem('polyhedge_settings');
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function saveSettings() {
  localStorage.setItem('polyhedge_settings', JSON.stringify(state.settings));
}

// ── DOM refs ──
const distanceSlider   = document.getElementById('distanceSlider');
const distanceVal      = document.getElementById('distanceVal');
const scanBtn          = document.getElementById('scanBtn');
const resultsEl        = document.getElementById('results');
const statsBar         = document.getElementById('statsBar');
const refreshCountdown = document.getElementById('refreshCountdown');
const exportBtn        = document.getElementById('exportBtn');

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

scanBtn.addEventListener('click', () => {
  resetRefreshTimer();
  scan();
});

// ── Settings Modal ──
document.getElementById('settingsBtn').addEventListener('click', () => {
  openSettings();
});
document.getElementById('settingsClose').addEventListener('click', () => {
  document.getElementById('settingsOverlay').classList.remove('open');
});
document.getElementById('settingsOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('settingsOverlay'))
    document.getElementById('settingsOverlay').classList.remove('open');
});

function openSettings() {
  const s = state.settings;
  document.getElementById('tgToken').value    = s.tgToken    || '';
  document.getElementById('tgChatId').value   = s.tgChatId   || '';
  document.getElementById('walletAKey').value = s.walletAKey || '';
  document.getElementById('walletAAddr').value= s.walletAAddr|| '';
  document.getElementById('walletBKey').value = s.walletBKey || '';
  document.getElementById('walletBAddr').value= s.walletBAddr|| '';
  document.getElementById('tradeAmount').value= s.tradeAmount|| 100;
  document.getElementById('settingsOverlay').classList.add('open');
}

// Private key → adres otomatik hesapla
document.getElementById('walletAKey').addEventListener('change', async e => {
  const addr = await deriveAddress(e.target.value);
  if (addr) document.getElementById('walletAAddr').value = addr;
});
document.getElementById('walletBKey').addEventListener('change', async e => {
  const addr = await deriveAddress(e.target.value);
  if (addr) document.getElementById('walletBAddr').value = addr;
});

async function deriveAddress(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  } catch { return null; }
}

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  state.settings.tgToken     = document.getElementById('tgToken').value.trim();
  state.settings.tgChatId    = document.getElementById('tgChatId').value.trim();
  state.settings.walletAKey  = document.getElementById('walletAKey').value.trim();
  state.settings.walletAAddr = document.getElementById('walletAAddr').value.trim();
  state.settings.walletBKey  = document.getElementById('walletBKey').value.trim();
  state.settings.walletBAddr = document.getElementById('walletBAddr').value.trim();
  state.settings.tradeAmount = parseFloat(document.getElementById('tradeAmount').value) || 100;
  saveSettings();
  document.getElementById('settingsOverlay').classList.remove('open');
  showToast('✓ Ayarlar kaydedildi');
  if (state.tradeHistory.length > 0) exportBtn.style.display = 'block';
});

document.getElementById('testTgBtn').addEventListener('click', async () => {
  const token  = document.getElementById('tgToken').value.trim();
  const chatId = document.getElementById('tgChatId').value.trim();
  const status = document.getElementById('tgStatus');
  if (!token || !chatId) { status.textContent = '❌ Token ve Chat ID gerekli'; return; }
  status.textContent = 'Gönderiliyor...';
  const ok = await sendTelegram(token, chatId, '✅ PolyHedge bağlantısı başarılı! Trade bildirimleri bu sohbete gelecek.');
  status.textContent = ok ? '✅ Gönderildi!' : '❌ Hata — token/chat ID kontrol et';
});

// ── Telegram ──
async function sendTelegram(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const d = await r.json();
    return d.ok;
  } catch { return false; }
}

async function notifyTelegramTrade(market) {
  const s = state.settings;
  if (!s.tgToken || !s.tgChatId) return;
  const amount = s.tradeAmount || 100;
  const cost   = calcCost(market.yes, market.no, amount);
  const text = `🔀 <b>PolyHedge — Yeni Fırsat</b>

📌 <b>${escHtml(market.question)}</b>

YES: <b>${market.yes}¢</b>  ·  NO: <b>${market.no}¢</b>
50/50'ye uzaklık: <b>${market.distance}¢</b>
Tahmini maliyet: <b>$${cost.worst}</b> (${amount}+${amount} USDC)
Likidite: <b>${fmtMoney(market.liquidity)}</b>
Kalan süre: <b>${formatTimeLeft(market.timeLeft).text}</b>

Bu markete hedge trade girilsin mi?`;
  await sendTelegram(s.tgToken, s.tgChatId, text);
}

// ── Trade Modal ──
document.getElementById('tradeClose').addEventListener('click', () => {
  document.getElementById('tradeOverlay').classList.remove('open');
  state.pendingTrade = null;
});
document.getElementById('tradeCancel').addEventListener('click', () => {
  document.getElementById('tradeOverlay').classList.remove('open');
  state.pendingTrade = null;
});
document.getElementById('tradeConfirm').addEventListener('click', async () => {
  if (!state.pendingTrade) return;
  await executeTrade(state.pendingTrade);
});

function openTradeModal(market) {
  state.pendingTrade = market;
  const s    = state.settings;
  const amount = s.tradeAmount || 100;
  const cost = calcCost(market.yes, market.no, amount);

  document.getElementById('tradeQuestion').textContent = market.question;
  document.getElementById('tradeDetails').innerHTML = `
    <div class="trade-row"><span>Cüzdan A</span><span>${s.walletAAddr ? shortAddr(s.walletAAddr) : '—'} → YES ${market.yes}¢ × $${amount}</span></div>
    <div class="trade-row"><span>Cüzdan B</span><span>${s.walletBAddr ? shortAddr(s.walletBAddr) : '—'} → NO ${market.no}¢ × $${amount}</span></div>
    <div class="trade-row"><span>Fee (2%×2)</span><span>$${(amount * TAKER_FEE * 2).toFixed(2)}</span></div>
    <div class="trade-row"><span>Spread kaybı</span><span>$${(parseFloat(cost.worst) - amount * TAKER_FEE * 2).toFixed(2)}</span></div>
    <div class="trade-row total"><span>Toplam max kayıp</span><span>$${cost.worst}</span></div>`;
  document.getElementById('tradeLog').innerHTML = '';
  document.getElementById('tradeOverlay').classList.add('open');

  // Telegram'a da bildir
  notifyTelegramTrade(market);
}

// ── Trade Execution ──
// Polymarket CLOB API ile piyasa emri: önce L1 approval gerekiyor.
// Bu fonksiyon temel akışı gösterir; production için Polymarket py-clob-client
// mantığının JS port'u — approve + sign + submit.
async function executeTrade(market) {
  const logEl  = document.getElementById('tradeLog');
  const btn    = document.getElementById('tradeConfirm');
  const s      = state.settings;
  const amount = s.tradeAmount || 100;

  if (!s.walletAKey || !s.walletBKey) {
    logEl.innerHTML = '<span class="log-err">❌ Ayarlardan her iki cüzdanı da ekle.</span>';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⟳ Gönderiliyor...';
  logEl.innerHTML = '';

  const log = (msg, cls = '') => {
    logEl.innerHTML += `<div class="log-line ${cls}">${msg}</div>`;
  };

  try {
    const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
    const walletA  = new ethers.Wallet(s.walletAKey, provider);
    const walletB  = new ethers.Wallet(s.walletBKey, provider);

    log(`Cüzdan A: ${shortAddr(walletA.address)}`);
    log(`Cüzdan B: ${shortAddr(walletB.address)}`);

    // 1. CLOB'dan kondisyon token ID'lerini al
    log('Market token ID\'leri alınıyor...');
    const tokenIds = await fetchTokenIds(market.conditionId || market.slug);

    if (!tokenIds) {
      log('❌ Token ID bulunamadı. Market slug: ' + market.slug, 'log-err');
      btn.disabled = false; btn.textContent = '✓ Trade At';
      return;
    }

    // 2. USDC approval + YES order (Cüzdan A)
    log('Cüzdan A USDC approve ediliyor...');
    const usdcAmt = ethers.parseUnits(amount.toString(), 6); // USDC 6 decimals
    const approveOk = await approveUSDC(walletA, usdcAmt);
    if (!approveOk) { log('❌ Approve başarısız (Cüzdan A)', 'log-err'); return; }
    log('✓ Cüzdan A approve tamam');

    log('Cüzdan B USDC approve ediliyor...');
    const approveOkB = await approveUSDC(walletB, usdcAmt);
    if (!approveOkB) { log('❌ Approve başarısız (Cüzdan B)', 'log-err'); return; }
    log('✓ Cüzdan B approve tamam');

    // 3. YES order — Cüzdan A
    log('YES order gönderiliyor (Cüzdan A)...');
    const yesOrder = await submitClobOrder(walletA, {
      tokenId: tokenIds.yes,
      side: 'BUY',
      price: market.yes / 100,
      amount,
    });
    const yesOk = yesOrder && yesOrder.success;
    log(yesOk ? `✓ YES order kabul edildi (${market.yes}¢)` : '⚠ YES order reddedildi — manuel kontrol et', yesOk ? '' : 'log-warn');

    // 4. NO order — Cüzdan B
    log('NO order gönderiliyor (Cüzdan B)...');
    const noOrder = await submitClobOrder(walletB, {
      tokenId: tokenIds.no,
      side: 'BUY',
      price: market.no / 100,
      amount,
    });
    const noOk = noOrder && noOrder.success;
    log(noOk ? `✓ NO order kabul edildi (${market.no}¢)` : '⚠ NO order reddedildi — manuel kontrol et', noOk ? '' : 'log-warn');

    // 5. Geçmişe ekle
    const cost = calcCost(market.yes, market.no, amount);
    const record = {
      timestamp: new Date().toISOString(),
      question: market.question,
      yes: market.yes,
      no: market.no,
      amount_each: amount,
      fee: (amount * TAKER_FEE * 2).toFixed(2),
      max_loss: cost.worst,
      yes_status: yesOk ? 'sent' : 'failed',
      no_status: noOk ? 'sent' : 'failed',
      wallet_a: walletA.address,
      wallet_b: walletB.address,
      url: market.url,
    };
    state.tradeHistory.push(record);
    document.getElementById('statTrades').textContent = state.tradeHistory.length;
    exportBtn.style.display = 'block';

    // Telegram teyit
    if (s.tgToken && s.tgChatId) {
      const statusText = (yesOk && noOk) ? '✅ Her iki taraf da gönderildi' : '⚠ Bir taraf başarısız — kontrol et';
      await sendTelegram(s.tgToken, s.tgChatId,
        `${statusText}\n📌 ${market.question}\nYES: ${yesOk ? '✓' : '✗'}  NO: ${noOk ? '✓' : '✗'}\nMaks kayıp: $${cost.worst}`);
    }

    log('──────────');
    log(yesOk && noOk ? '✅ Hedge tamamlandı!' : '⚠ Kısmi başarı — Polymarket\'i kontrol et', yesOk && noOk ? 'log-ok' : 'log-warn');

  } catch (err) {
    log('❌ Hata: ' + err.message, 'log-err');
  }

  btn.disabled = false;
  btn.textContent = '✓ Trade At';
  state.pendingTrade = null;
}

// ── CLOB Helpers ──
async function fetchTokenIds(conditionIdOrSlug) {
  try {
    const r = await fetch(`${CLOB_API}/markets/${conditionIdOrSlug}`);
    if (!r.ok) return null;
    const d = await r.json();
    const tokens = d.tokens;
    if (!tokens || tokens.length < 2) return null;
    let yes = null, no = null;
    for (const t of tokens) {
      const out = (t.outcome || '').toUpperCase();
      if (['YES','TRUE'].includes(out)) yes = t.token_id;
      else if (['NO','FALSE'].includes(out)) no = t.token_id;
    }
    if (!yes) yes = tokens[0].token_id;
    if (!no)  no  = tokens[1].token_id;
    return { yes, no };
  } catch { return null; }
}

const USDC_POLYGON   = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CTF_EXCHANGE   = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'; // Polymarket CTF Exchange
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

async function approveUSDC(wallet, amount) {
  try {
    const usdc     = new ethers.Contract(USDC_POLYGON, ERC20_ABI, wallet);
    const existing = await usdc.allowance(wallet.address, CTF_EXCHANGE);
    if (existing >= amount) return true; // zaten yeterli
    const tx = await usdc.approve(CTF_EXCHANGE, ethers.MaxUint256);
    await tx.wait();
    return true;
  } catch { return false; }
}

async function submitClobOrder(wallet, { tokenId, side, price, amount }) {
  // CLOB API L2 order: imzalı EIP-712 mesajı gönderiyoruz
  try {
    const nonce    = Date.now();
    const expiry   = Math.floor(Date.now() / 1000) + 3600; // 1 saat geçerli
    const sizeWei  = Math.floor(amount * 1e6); // USDC 6 decimal
    const priceWei = Math.round(price * 1e6);

    // EIP-712 domain & types (Polymarket CLOB spec)
    const domain = {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: 137,
    };
    const types = {
      Order: [
        { name: 'salt',      type: 'uint256' },
        { name: 'maker',     type: 'address' },
        { name: 'signer',    type: 'address' },
        { name: 'taker',     type: 'address' },
        { name: 'tokenId',   type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration',  type: 'uint256' },
        { name: 'nonce',       type: 'uint256' },
        { name: 'feeRateBps',  type: 'uint256' },
        { name: 'side',        type: 'uint8'   },
        { name: 'signatureType', type: 'uint8' },
      ]
    };

    const makerAmt = side === 'BUY' ? sizeWei : Math.floor(sizeWei * price);
    const takerAmt = side === 'BUY' ? Math.floor(sizeWei * price) : sizeWei;

    const orderData = {
      salt:       BigInt(nonce),
      maker:      wallet.address,
      signer:     wallet.address,
      taker:      '0x0000000000000000000000000000000000000000',
      tokenId:    BigInt(tokenId),
      makerAmount: BigInt(makerAmt),
      takerAmount: BigInt(takerAmt),
      expiration:  BigInt(expiry),
      nonce:       BigInt(nonce),
      feeRateBps:  BigInt(200), // %2
      side:        side === 'BUY' ? 0 : 1,
      signatureType: 0,
    };

    const signature = await wallet.signTypedData(domain, types, orderData);

    const body = {
      order: {
        ...Object.fromEntries(Object.entries(orderData).map(([k,v]) => [k, v.toString()])),
        signature,
      },
      owner: wallet.address,
      orderType: 'GTC',
    };

    const r = await fetch(`${CLOB_API}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const d = await r.json();
    return { success: r.ok, data: d };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── CSV Export ──
exportBtn.addEventListener('click', exportCSV);

function exportCSV() {
  if (!state.tradeHistory.length) return;
  const headers = ['timestamp','question','yes_price','no_price','amount_each','fee','max_loss','yes_status','no_status','wallet_a','wallet_b','url'];
  const rows = state.tradeHistory.map(r => headers.map(h => {
    const v = r[h] ?? '';
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `polyhedge_trades_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ── Fetch markets ──
async function fetchAllMarkets() {
  const markets = [];
  let offset = 0;
  const batch = 100;
  while (markets.length < FETCH_LIMIT) {
    const url = `${POLY_API}?limit=${batch}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`;
    const r = await fetch(url, { headers: { Accept: 'application/json', Origin: 'https://polymarket.com' } });
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
    const diffMs = new Date(endDate) - new Date();
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
  if (t.days === 0 && t.hours < 12) return { text: `⚡ ${t.hours}h ${t.mins}m left`, cls: 'time-urgent' };
  if (t.days === 0) return { text: `${t.hours}h ${t.mins}m left`, cls: 'time-urgent' };
  if (t.days === 1) return { text: `1d ${t.hours}h left`, cls: 'time-soon' };
  return { text: `${t.days}d ${t.hours}h left`, cls: '' };
}

// ── Fee hesabı (DÜZELTİLDİ) ──
// Polymarket: %2 taker fee her iki taraf için ayrı ayrı
// $amount YES + $amount NO girişinde:
//   - YES fee: amount × 0.02
//   - NO fee:  amount × 0.02
//   - Toplam fee: amount × 0.04 (sabit, fiyattan bağımsız)
// Buna ek olarak spread kaybı: (yesPrice + noPrice - 100) × amount / 100
// Örnek: YES=48¢, NO=49¢ → spread=3¢ eksik → $100'da $3 spread kaybı
function calcCost(yesPrice, noPrice, amount) {
  amount = amount || (state.settings.tradeAmount || 100);

  // Sabit fee: her iki taker işlemde %2
  const fixedFee = amount * TAKER_FEE * 2; // $100 için $4

  // Spread kaybı: iki tarafın fiyat toplamı 100¢'den ne kadar düşük
  // YES+NO toplamı 100 olmalı. Eğer az ise spread yoktur (free money bile olur).
  // Eğer fazlaysa (örn YES=51, NO=51 → toplam 102¢) spread kaybı var.
  const spread = (yesPrice + noPrice) - 100; // negatifse kazanç, pozitifse kayıp
  const spreadLoss = (spread / 100) * amount; // $'a çevir

  const totalWorstLoss = fixedFee + Math.max(0, spreadLoss);

  return {
    fee: fixedFee.toFixed(2),
    spreadLoss: spreadLoss.toFixed(2),
    worst: totalWorstLoss.toFixed(2),
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
    const volume    = parseFloat(m.volume    || 0);
    if (liquidity < state.minLiquidity) continue;
    if (volume < 1000) continue;

    const timeLeft = parseTimeLeft(m.endDate);
    if (!timeLeft) continue;
    if (timeLeft.days > state.maxDays) continue;

    const cost = calcCost(prices.yes, prices.no);
    results.push({
      question:    (m.question || '').trim(),
      yes:          prices.yes,
      no:           prices.no,
      distance,
      liquidity,
      volume,
      timeLeft,
      cost,
      conditionId: m.conditionId || '',
      slug:        m.slug || '',
      groupSlug:   m.groupSlug || '',
      url:         buildEventUrl(m),
    });
  }
  results.sort((a, b) => a.distance - b.distance || a.timeLeft.totalHours - b.timeLeft.totalHours);
  return results.slice(0, 30);
}

// ── URL Builder ──
// Doğru URL m.events[0].slug içinde geliyor.
// Örnek: m.slug = "new-rhianna-album-before-gta-vi-926" (yanlış)
//        m.events[0].slug = "what-will-happen-before-gta-vi" (doğru ✓)
function buildEventUrl(m) {
  const eventSlug = m.events && m.events[0] && m.events[0].slug;
  const slug = eventSlug || m.groupSlug || m.slug || '';
  return `https://polymarket.com/event/${slug}`;
}

// URL'yi aç — her zaman buildEventUrl sonucunu kullan
async function openMarketUrl(r) {
  window.open(r.url, '_blank', 'noopener');
}

// ── Format ──
function fmtMoney(v) {
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function shortAddr(a) {
  if (!a || a.length < 10) return a;
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-icon">◈</div><p>No markets match your filters. Try loosening the distance or liquidity settings.</p></div>`;
    return;
  }

  document.getElementById('statBest').textContent = `${results[0].distance}¢ from 50`;

  const hasWallets = !!(state.settings.walletAKey && state.settings.walletBKey);
  const amount     = state.settings.tradeAmount || 100;

  const cards = results.map((r, i) => {
    const distCls   = r.distance <= 2 ? 'dist-0' : r.distance <= 5 ? 'dist-1' : 'dist-2';
    const distLabel = r.distance === 0 ? 'EXACT 50/50' : `${r.distance}¢ off`;
    const time      = formatTimeLeft(r.timeLeft);
    const costNum   = parseFloat(r.cost.worst);
    const costGood  = costNum < 5;
    const spreadNum = parseFloat(r.cost.spreadLoss);

    return `
      <div class="card" data-idx="${i}">
        <div class="card-rank">#${String(i+1).padStart(2,'0')}</div>
        <div class="card-body">
          <div class="card-question">${escHtml(r.question)}</div>
          <div class="card-meta">
            <span>VOL <span class="val">${fmtMoney(r.volume)}</span></span>
            <span>LIQ <span class="val">${fmtMoney(r.liquidity)}</span></span>
            <span>FEE <span class="val">$${r.cost.fee}</span></span>
            <span>SPREAD <span class="val ${spreadNum > 0 ? 'text-danger' : 'text-ok'}">${spreadNum > 0 ? '-$'+r.cost.spreadLoss : '0'}</span></span>
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
            ${costGood ? '✓' : '!'} $${r.cost.worst} max loss
          </span>
          <div class="card-btns">
            <a class="btn-link" href="${r.url}" target="_blank" rel="noopener">Polymarket ↗</a>
            <button class="btn-share" data-idx="${i}">𝕏 ${t('share')}</button>
            ${hasWallets ? `<button class="btn-trade" data-idx="${i}">⚡ Hedge</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  resultsEl.innerHTML = `<div class="cards-grid">${cards}</div>`;

  // Share butonları
  resultsEl.querySelectorAll('.btn-share').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      shareMarket(results[parseInt(btn.dataset.idx)]);
    });
  });

  // Hedge buton event'leri
  resultsEl.querySelectorAll('.btn-trade').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      openTradeModal(results[idx]);
    });
  });

  // Kart tıklama → Polymarket linki (trade butonu hariç)
  resultsEl.querySelectorAll('.card').forEach((card, i) => {
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-trade') || e.target.closest('.btn-link')) return;
      openMarketUrl(results[i]);
    });
    card.style.cursor = 'pointer';
  });

  // "Polymarket ↗" butonları
  resultsEl.querySelectorAll('.btn-link').forEach((btn, i) => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openMarketUrl(results[i]);
    });
  });
}

// ── Auto-refresh ──
function startRefreshTimer() {
  state.refreshSecondsLeft = REFRESH_INTERVAL;
  updateCountdown();

  state.refreshTimer = setInterval(async () => {
    state.refreshSecondsLeft--;
    updateCountdown();
    if (state.refreshSecondsLeft <= 0) {
      state.refreshSecondsLeft = REFRESH_INTERVAL;
      if (!state.loading) {
        await silentRefresh();
      }
    }
  }, 1000);
}

function resetRefreshTimer() {
  clearInterval(state.refreshTimer);
  startRefreshTimer();
}

function updateCountdown() {
  refreshCountdown.textContent = `⟳ ${state.refreshSecondsLeft}s`;
}

async function silentRefresh() {
  try {
    const fresh    = await fetchAllMarkets();
    state.markets  = fresh;
    document.getElementById('statTotal').textContent = fresh.length;
    const filtered = filterMarkets(fresh);
    renderResults(filtered);
  } catch {}
}

// ── Toast ──
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
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
    renderResults(filterMarkets(state.markets));
    if (!state.refreshTimer) startRefreshTimer();
  } catch {
    resultsEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>Failed to fetch markets. Check your connection and try again.</p></div>`;
  } finally {
    state.loading = false;
    scanBtn.classList.remove('loading');
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<span class="scan-icon">⟳</span> Scan Markets';
  }
}

// Init: export butonu durumu
if (state.tradeHistory.length > 0) exportBtn.style.display = 'block';
document.getElementById('statTrades').textContent = state.tradeHistory.length;

// ── Splash ──
const splashOverlay = document.getElementById('splashOverlay');
const enterBtn      = document.getElementById('enterBtn');
const followBtn     = document.getElementById('followBtn');

enterBtn.addEventListener('click', () => {
  if (enterBtn.disabled || enterBtn.classList.contains('locked')) return;
  if (!window.visitedX || !window.visitedYt) return;
  localStorage.setItem('polyhedge_unlocked', '1');
  splashOverlay.classList.add('hidden');
  setTimeout(() => splashOverlay.style.display = 'none', 400);
});

// ── Tema ──
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeBtn').textContent = theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('polyhedge_theme', theme);
}

document.getElementById('themeBtn').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
});

applyTheme(state.theme);

// ── Dil ──
function t(key) {
  return i18n[state.lang][key] || i18n['en'][key] || key;
}

function applyLang(lang) {
  state.lang = lang;
  localStorage.setItem('polyhedge_lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.innerHTML = val;
  });
  document.getElementById('langBtn').textContent = lang === 'tr' ? '🇹🇷' : '🇬🇧';
  // Scan butonunu da güncelle
  if (!state.loading) {
    scanBtn.innerHTML = `<span class="scan-icon">⟳</span> ${t('scan')}`;
  }
}

document.getElementById('langBtn').addEventListener('click', () => {
  applyLang(state.lang === 'tr' ? 'en' : 'tr');
});

applyLang(state.lang);

// ── Share Butonu ──
function shareMarket(r) {
  const cost  = r.cost.worst;
  const text  = `🔀 PolyHedge fırsatı buldu!\n\n📌 ${r.question}\n\nYES ${r.yes}¢ · NO ${r.no}¢\nMax kayıp: $${cost} / $${(state.settings.tradeAmount||100)*2} hedge\n\n@Polymarket airdrop farming 🚀\n\n@${TWITTER_HANDLE} tarafından — ${SITE_URL}`;
  const url   = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}
