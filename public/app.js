/* ============ ANDRÔMEDA — app.js ============ */
const TAX = 0.1215;
const $ = id => document.getElementById(id);

let token = localStorage.getItem('andromeda_token') || sessionStorage.getItem('andromeda_token') || null;

/* ================= céu galáctico: constelações + meteoros dourados ================= */
let moneyVals = [48, 75, 120, 32, 96, 210, 64, 155]; // atualizado com valores reais após o load
(function () {
  const canvas = $('fx');
  const c = canvas.getContext('2d');
  let W, H;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let stars = [], links = [];
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
  }

  function buildStars() {
    stars = [];
    const count = Math.floor((W * H) / 10000);
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.4, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.8 });
    }
    links = [];
    const maxD = 100;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) links.push([i, j, 1 - d / maxD]);
      }
    }
  }

  let meteors = [], bursts = [], moneyTexts = [];

  function spawnMeteor() {
    meteors.push({
      x: Math.random() * W * 0.85 + W * 0.1, y: -20,
      vx: -2.2 - Math.random() * 1.3, vy: 5.0 + Math.random() * 1.8,
      landY: H * (0.3 + Math.random() * 0.45)
    });
  }

  function burstAt(x, y) {
    const n = 9 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 2.2;
      bursts.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 1 + Math.random() * 1.6, life: 1 });
    }
    if (Math.random() < 0.65) {
      const val = moneyVals[Math.floor(Math.random() * moneyVals.length)];
      moneyTexts.push({ x, y, vy: -0.5, life: 1, text: '+R$ ' + val });
    }
  }

  let lastSpawn = 0;
  function frame(ts) {
    c.clearRect(0, 0, W, H);

    for (let l = 0; l < links.length; l++) {
      const a = stars[links[l][0]], b = stars[links[l][1]];
      c.strokeStyle = 'rgba(201,187,255,' + (links[l][2] * 0.08).toFixed(3) + ')';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }

    for (let s = 0; s < stars.length; s++) {
      const st = stars[s];
      const alpha = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin((ts || 0) * 0.001 * st.speed + st.phase));
      c.beginPath();
      c.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
      c.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      c.fill();
    }

    if (!reduced) {
      if (!lastSpawn || ts - lastSpawn > (2600 + Math.random() * 2200)) {
        lastSpawn = ts; spawnMeteor();
      }

      for (let m = meteors.length - 1; m >= 0; m--) {
        const mt = meteors[m];
        mt.x += mt.vx; mt.y += mt.vy;
        const tailX = mt.x - mt.vx * 11, tailY = mt.y - mt.vy * 11;
        const grd = c.createLinearGradient(tailX, tailY, mt.x, mt.y);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(1, '#F5B766');
        c.strokeStyle = grd; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(tailX, tailY); c.lineTo(mt.x, mt.y); c.stroke();
        c.beginPath(); c.fillStyle = '#FFD9A0'; c.arc(mt.x, mt.y, 1.7, 0, Math.PI * 2); c.fill();

        if (mt.y >= mt.landY || mt.x < -40 || mt.y > H + 40) {
          burstAt(mt.x, mt.y); meteors.splice(m, 1);
        }
      }

      for (let bi = bursts.length - 1; bi >= 0; bi--) {
        const bu = bursts[bi];
        bu.x += bu.vx; bu.y += bu.vy; bu.vy += 0.03; bu.life -= 0.02;
        if (bu.life <= 0) { bursts.splice(bi, 1); continue; }
        c.beginPath(); c.globalAlpha = Math.max(bu.life, 0);
        c.fillStyle = '#FBC98A'; c.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }

      for (let ti = moneyTexts.length - 1; ti >= 0; ti--) {
        const mtx = moneyTexts[ti];
        mtx.y += mtx.vy; mtx.life -= 0.011;
        if (mtx.life <= 0) { moneyTexts.splice(ti, 1); continue; }
        c.globalAlpha = Math.max(mtx.life, 0);
        c.fillStyle = '#F5B766'; c.font = '600 11px "JetBrains Mono", monospace';
        c.fillText(mtx.text, mtx.x + 6, mtx.y);
        c.globalAlpha = 1;
      }
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();

/* ================= helpers ================= */
function fmtBRL(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBRLshort(v) {
  return 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
}
function brToday(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
function parseVal(s) {
  if (typeof s === 'number') return s;
  s = String(s).replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function countUpBRL(el, target, short) {
  const from = el._val || 0;
  el._val = target;
  const t0 = performance.now(), dur = 1100;
  const fmt = short ? fmtBRLshort : fmtBRL;
  function step(ts) {
    const p = Math.min((ts - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const svgUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 17L17 7M7 7h10v10"/></svg>';
const svgDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 7l10 10M17 7v10H7"/></svg>';
function setDelta(el, curr, prev) {
  if (prev == null || prev === 0 || curr == null) { el.innerHTML = ''; return; }
  const p = Math.round(((curr - prev) / Math.abs(prev)) * 100);
  el.className = 'mcard-delta ' + (p >= 0 ? 'up' : 'down');
  el.innerHTML = (p >= 0 ? svgUp : svgDown) + Math.abs(p) + '%';
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(opts.headers || {}) }
  });
  if (res.status === 401) { logout(); throw new Error('sessão expirada'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro no servidor');
  return data;
}

function toast(msg, cls = 'ok') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + cls;
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ================= LOGIN ================= */
let pin = '';
function renderDots() {
  [...$('pinDots').children].forEach((s, i) => s.classList.toggle('on', i < pin.length));
}
$('pad').addEventListener('click', async e => {
  const k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  if (navigator.vibrate) navigator.vibrate(8);
  if (k === 'del') { pin = pin.slice(0, -1); renderDots(); return; }
  if (pin.length >= 4) return;
  pin += k; renderDots();
  if (pin.length === 4) {
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'PIN incorreto');
      token = data.token;
      const store = $('keepConnected').checked ? localStorage : sessionStorage;
      store.setItem('andromeda_token', token);
      pin = ''; renderDots(); $('pinError').textContent = '';
      showApp();
    } catch (err) {
      $('pinError').textContent = err.message;
      $('pinDots').classList.add('shake');
      setTimeout(() => { $('pinDots').classList.remove('shake'); pin = ''; renderDots(); }, 450);
    }
  }
});

function logout() {
  localStorage.removeItem('andromeda_token');
  sessionStorage.removeItem('andromeda_token');
  token = null;
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
}

/* ================= MENU / NAVEGAÇÃO ================= */
function openMenu() { $('drawer').classList.add('open'); $('drawerVeil').classList.remove('hidden'); }
function closeMenu() { $('drawer').classList.remove('open'); $('drawerVeil').classList.add('hidden'); }
$('btnMenu').addEventListener('click', openMenu);
$('btnCloseMenu').addEventListener('click', closeMenu);
$('drawerVeil').addEventListener('click', closeMenu);

function goto(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  $('page-' + page).classList.remove('hidden');
  window.scrollTo({ top: 0 });
  closeMenu();
  if (page === 'anuncios') loadSpendList();
  if (page === 'painel') refreshAll();
}
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => goto(b.dataset.goto)));
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => goto('painel')));

/* ================= DASHBOARD ================= */
let chartEv = null, chartHours = null;
let evDays = 7, hDays = 1, compareOn = false;

const tooltipStyle = {
  backgroundColor: '#171429', borderColor: 'rgba(245,183,102,0.4)', borderWidth: 1,
  titleColor: '#F8F5FF', bodyColor: '#A9A2C7', padding: 10, cornerRadius: 8, displayColors: false
};

async function loadSummary() {
  const s = await api('/api/summary');
  const t = s.today, y = s.yesterday, m = s.month;

  // anteontem (para o delta do card "faturado ontem")
  let before = null;
  try {
    const bRows = await api(`/api/daily?from=${brToday(2)}&to=${brToday(2)}`);
    before = bRows[0] || null;
  } catch (e) { /* sem dado, sem delta */ }

  const el = $('heroLucro');
  countUpBRL(el, t.profit);
  el.classList.toggle('neg', t.profit < 0);

  const delta = $('heroDelta');
  if (y.profit !== 0) {
    const p = Math.round(((t.profit - y.profit) / Math.abs(y.profit)) * 100);
    delta.innerHTML = (p >= 0 ? svgUp : svgDown) + (p >= 0 ? '+' : '') + p + '% vs ontem';
    delta.classList.toggle('neg', p < 0);
  } else delta.textContent = 'hoje';

  countUpBRL($('heroFat'), t.revenue);
  $('heroVendas').textContent = t.salesCount + ' venda' + (t.salesCount === 1 ? '' : 's');
  $('hInvestido').textContent = fmtBRLshort(t.cost);
  $('hRoi').textContent = t.roi != null ? String(t.roi).replace('.', ',') + 'x' : '—';

  $('spendToday').textContent = fmtBRL(t.spend);
  $('spendTaxToday').textContent = '+ ' + fmtBRL(t.tax) + ' de imposto';

  // cards com deltas reais
  $('mFatHoje').textContent = fmtBRLshort(t.revenue);
  setDelta($('dFatHoje'), t.revenue, y.revenue);
  $('mFatOntem').textContent = fmtBRLshort(y.revenue);
  setDelta($('dFatOntem'), y.revenue, before ? before.revenue : null);
  $('mInvestido').textContent = fmtBRLshort(t.cost);
  setDelta($('dInvestido'), t.cost, y.cost);
  $('mRoi').textContent = t.roi != null ? String(t.roi).replace('.', ',') + 'x' : '—';
  setDelta($('dRoi'), t.roi, y.roi);

  $('mLucroMes').textContent = fmtBRLshort(m.profit);
  $('mLucroMes').classList.toggle('neg', m.profit < 0);
  $('mFatMes').textContent = fmtBRLshort(m.revenue);
  $('mVendasMes').textContent = m.salesCount;

  // meteoros mostram valores reais (ticket médio ± variação)
  if (m.salesCount > 0) {
    const ticket = Math.round(m.revenue / m.salesCount);
    moneyVals = [ticket, Math.round(ticket * 0.7), Math.round(ticket * 1.3), Math.round(ticket * 0.5), Math.round(ticket * 2)];
  }

  const [, mm, dd] = t.date.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  $('todayPill').textContent = `${+dd} de ${meses[+mm - 1]}`;
}

async function loadEvolution() {
  const to = brToday(), from = brToday(evDays - 1);
  const rows = await api(`/api/daily?from=${from}&to=${to}`);
  const map = Object.fromEntries(rows.map(r => [r.date, r]));
  const labels = [], curr = [];
  for (let i = evDays - 1; i >= 0; i--) {
    const d = brToday(i);
    labels.push(+d.slice(8, 10) + '/' + +d.slice(5, 7));
    curr.push(map[d] ? map[d].revenue : 0);
  }

  let prev = null;
  if (compareOn) {
    const pRows = await api(`/api/daily?from=${brToday(evDays * 2 - 1)}&to=${brToday(evDays)}`);
    const pMap = Object.fromEntries(pRows.map(r => [r.date, r]));
    prev = [];
    for (let i = evDays * 2 - 1; i >= evDays; i--) {
      const d = brToday(i);
      prev.push(pMap[d] ? pMap[d].revenue : 0);
    }
  }

  const ctx = $('chartEv').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 190);
  grad.addColorStop(0, 'rgba(245,183,102,0.35)');
  grad.addColorStop(1, 'rgba(245,183,102,0)');

  const datasets = [{
    label: 'Período atual', data: curr, borderColor: '#F5B766', backgroundColor: grad,
    borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5,
    pointHoverBackgroundColor: '#F5B766', pointHoverBorderColor: '#0B0917', pointHoverBorderWidth: 2
  }];
  if (prev) datasets.push({
    label: 'Período anterior', data: prev, borderColor: '#8C7BEF', backgroundColor: 'rgba(0,0,0,0)',
    borderWidth: 2, borderDash: [5, 4], fill: false, tension: 0.4, pointRadius: 0, pointHoverRadius: 4,
    pointHoverBackgroundColor: '#8C7BEF', pointHoverBorderColor: '#0B0917', pointHoverBorderWidth: 2
  });

  $('evLegend').innerHTML =
    '<span><span class="dot" style="background:var(--gold)"></span>Período atual</span>' +
    (prev ? '<span><span class="dot" style="background:var(--violet)"></span>Período anterior</span>' : '');

  if (chartEv) chartEv.destroy();
  chartEv = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      animation: { duration: 1300, easing: 'easeOutCubic' },
      plugins: { legend: { display: false }, tooltip: { ...tooltipStyle,
        callbacks: { label: c => c.dataset.label + ': ' + fmtBRL(c.parsed.y) }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#615C82', font: { size: 10.5, family: 'Inter' }, maxTicksLimit: 8, maxRotation: 0 } },
                y: { display: false } }
    }
  });
}

$('compareToggle').addEventListener('click', () => {
  compareOn = !compareOn;
  $('switchEl').classList.toggle('on', compareOn);
  loadEvolution();
});

async function loadHours() {
  const to = brToday(), from = brToday(hDays - 1);
  const rows = await api(`/api/hours?from=${from}&to=${to}`);
  const labels = rows.map(r => r.hour + 'h');
  const data = rows.map(r => r.sales);
  const max = Math.max(...data);
  const colors = data.map(v => (max > 0 && v === max) ? '#F5B766' : 'rgba(140,123,239,0.55)');
  const ctx = $('chartHours').getContext('2d');
  if (chartHours) chartHours.destroy();
  chartHours = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, borderSkipped: false, barPercentage: 0.62 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutCubic' },
      plugins: { legend: { display: false }, tooltip: { ...tooltipStyle,
        callbacks: { label: c => c.parsed.y + ' venda' + (c.parsed.y === 1 ? '' : 's') }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#615C82', font: { size: 9.5, family: 'Inter' }, maxTicksLimit: 12, maxRotation: 0 } },
                y: { display: false } }
    }
  });
  if (max > 0) {
    const idx = data.indexOf(max);
    $('peakText').textContent = `Pico às ${idx}h–${idx + 1}h · ${max} venda${max === 1 ? '' : 's'}`;
  } else {
    $('peakText').textContent = 'Sem vendas no período';
  }
}

$('evPeriods').addEventListener('click', e => {
  if (!e.target.dataset.days) return;
  [...$('evPeriods').children].forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  evDays = +e.target.dataset.days;
  loadEvolution();
});
$('hPeriods').addEventListener('click', e => {
  if (!e.target.dataset.hdays) return;
  [...$('hPeriods').children].forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  hDays = +e.target.dataset.hdays;
  loadHours();
});

/* ================= GASTO RÁPIDO ================= */
$('btnEditSpend').addEventListener('click', () => {
  const today = brToday();
  openModal(`
    <div class="modal-title">Gasto de hoje</div>
    <div class="modal-sub">${fmtDate(today)} — digite o valor sem imposto</div>
    <input type="text" inputmode="decimal" id="mSpendVal" class="input w100" placeholder="Ex.: 350,00" style="margin-top:8px">
    <div class="tax-preview" id="mTaxPrev"></div>
    <button class="btn-gold w100" id="mSaveSpend">Salvar</button>
    <button class="btn-ghost w100" id="mCancel" style="margin-top:10px">Cancelar</button>
  `);
  const inp = $('mSpendVal');
  inp.focus();
  inp.addEventListener('input', () => showTaxPreview(inp.value, $('mTaxPrev')));
  $('mCancel').onclick = closeModal;
  $('mSaveSpend').onclick = async () => {
    const v = parseVal(inp.value);
    if (v == null || v < 0) return toast('Valor inválido', 'err');
    await api('/api/spend/' + today, { method: 'PUT', body: JSON.stringify({ amount: v }) });
    closeModal(); toast('Gasto salvo ✓');
    refreshAll();
  };
});

function showTaxPreview(raw, el) {
  const v = parseVal(raw);
  if (v == null) { el.innerHTML = ''; return; }
  const tax = v * TAX;
  el.innerHTML = `Imposto (12,15%): <b>${fmtBRL(tax)}</b><br>Custo total: <b>${fmtBRL(v + tax)}</b>`;
}

/* ================= PÁGINA ANÚNCIOS ================= */
$('spendDate').value = brToday();
$('spendValue').addEventListener('input', () => showTaxPreview($('spendValue').value, $('taxPreview')));
$('btnSaveSpend').addEventListener('click', async () => {
  const v = parseVal($('spendValue').value);
  const d = $('spendDate').value;
  if (!d) return toast('Escolha a data', 'err');
  if (v == null || v < 0) return toast('Valor inválido', 'err');
  await api('/api/spend/' + d, { method: 'PUT', body: JSON.stringify({ amount: v }) });
  toast('Gasto salvo ✓');
  $('spendValue').value = ''; $('taxPreview').innerHTML = '';
  loadSpendList();
});

async function loadSpendList() {
  const to = brToday(), from = brToday(59);
  const rows = await api(`/api/spend?from=${from}&to=${to}`);
  const el = $('spendList');
  if (!rows.length) { el.innerHTML = '<div class="empty">Nenhum gasto registrado ainda</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="sale-row">
      <div class="sale-info">
        <div class="sale-amt">${fmtBRL(r.amount)} <span style="color:var(--rose);font-size:11px">+${fmtBRL(r.amount * TAX)}</span></div>
        <div class="sale-meta">${fmtDate(r.date)} — total ${fmtBRL(r.amount * (1 + TAX))}</div>
      </div>
      <button class="btn-ghost" data-editspend="${r.date}" data-val="${r.amount}">Editar</button>
    </div>`).join('');
  el.querySelectorAll('[data-editspend]').forEach(b => b.addEventListener('click', () => {
    $('spendDate').value = b.dataset.editspend;
    $('spendValue').value = String(b.dataset.val).replace('.', ',');
    showTaxPreview(b.dataset.val, $('taxPreview'));
    $('spendValue').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

/* ================= IMPORTAÇÃO ================= */
$('btnImport').addEventListener('click', async () => {
  const csv = $('csvBox').value.trim();
  if (!csv) return toast('Cole o CSV primeiro', 'err');
  try {
    const r = await api('/api/import', { method: 'POST', body: JSON.stringify({ csv }) });
    $('importResult').textContent = `✓ ${r.imported} vendas importadas, ${r.skipped} ignoradas (não aprovadas ou duplicadas).`;
    $('csvBox').value = '';
    toast('Importação concluída ✓');
  } catch (e) {
    $('importResult').textContent = '✗ ' + e.message;
    toast('Erro na importação', 'err');
  }
});

/* ================= COMPARAR DIAS ================= */
$('cmpA').value = brToday();
(function () {
  const d = new Date(brToday() + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  $('cmpB').value = d.toISOString().slice(0, 10);
})();
$('btnCompare').addEventListener('click', async () => {
  const a = $('cmpA').value, b = $('cmpB').value;
  if (!a || !b) return toast('Escolha as duas datas', 'err');
  const r = await api(`/api/compare?a=${a}&b=${b}`);
  const rows = [
    ['Faturamento', r.a.revenue, r.b.revenue, fmtBRL],
    ['Vendas', r.a.salesCount, r.b.salesCount, v => v],
    ['Investido (c/ imposto)', r.a.cost, r.b.cost, fmtBRL],
    ['Lucro', r.a.profit, r.b.profit, fmtBRL],
    ['ROI', r.a.roi, r.b.roi, v => v != null ? String(v).replace('.', ',') + 'x' : '—']
  ];
  const el = $('cmpResult');
  el.classList.remove('hidden');
  el.innerHTML = `<table class="cmp-table">
    <tr><th></th><th>${fmtDate(a)}</th><th>${fmtDate(b)}</th></tr>
    ${rows.map(([label, va, vb, f]) => {
      const winA = (va || 0) > (vb || 0), winB = (vb || 0) > (va || 0);
      return `<tr><td>${label}</td><td class="${winA ? 'cmp-win' : ''}">${f(va)}</td><td class="${winB ? 'cmp-win' : ''}">${f(vb)}</td></tr>`;
    }).join('')}
  </table>`;
});

/* ================= NOTIFICAÇÕES ================= */
$('btnEnablePush').addEventListener('click', async () => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return $('pushStatus').textContent = 'Este navegador não suporta notificações push. No iPhone, adicione o app à tela de início primeiro.';
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return $('pushStatus').textContent = 'Permissão negada pelo navegador.';
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
    $('pushStatus').textContent = '✓ Notificações ativadas neste aparelho.';
    toast('Notificações ativadas ✓');
  } catch (e) {
    $('pushStatus').textContent = '✗ ' + e.message;
  }
});
$('btnTestPush').addEventListener('click', async () => {
  await api('/api/push/test', { method: 'POST' });
  toast('Teste enviado');
});
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* ================= CONFIG ================= */
$('btnLogout').addEventListener('click', logout);
$('btnCopyWebhook').addEventListener('click', () => {
  navigator.clipboard.writeText($('webhookUrl').textContent);
  toast('URL copiada ✓');
});

/* ================= MODAL ================= */
function openModal(html) {
  $('modalCard').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

/* ================= BOOT ================= */
function refreshAll() {
  loadSummary().catch(() => {});
  loadEvolution().catch(() => {});
  loadHours().catch(() => {});
}

async function showApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('webhookUrl').textContent = location.origin + '/webhook/kirvano';
  refreshAll();
}

(async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (token) {
    try { await api('/api/summary'); showApp(); return; } catch (e) { /* token inválido → login */ }
  }
  $('loginScreen').classList.remove('hidden');
})();

setInterval(() => {
  if (!document.hidden && token && !$('app').classList.contains('hidden')) refreshAll();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && token && !$('app').classList.contains('hidden')) refreshAll();
});
