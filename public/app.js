/* ============ ANDRÔMEDA — HUD ============ */
const TAX = 0.1215;
const $ = id => document.getElementById(id);

let token = localStorage.getItem('andromeda_token') || sessionStorage.getItem('andromeda_token') || null;

/* ================= espaço profundo ================= */
(function () {
  const canvas = $('fx');
  const c = canvas.getContext('2d');
  let W, H;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let layers = [], comets = [], gridT = 0;

  function resize() {
    W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    // 3 camadas de estrelas com paralaxe (fundo lento → frente rápido)
    layers = [0.35, 0.7, 1.2].map((depth, li) => {
      const n = Math.floor((W * H) / (14000 - li * 4000));
      const stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 0.4 + depth * (0.4 + Math.random() * 0.7),
          phase: Math.random() * Math.PI * 2,
          tw: 0.4 + Math.random() * 0.9,
          hue: Math.random() < 0.12 ? 'rgba(139,124,255,' : (Math.random() < 0.08 ? 'rgba(255,110,199,' : 'rgba(190,235,255,')
        });
      }
      return { depth, stars };
    });
  }

  function spawnComet() {
    const fromLeft = Math.random() < 0.5;
    comets.push({
      x: fromLeft ? -30 : W + 30, y: Math.random() * H * 0.45,
      vx: (fromLeft ? 1 : -1) * (3.2 + Math.random() * 2.2),
      vy: 1.1 + Math.random() * 1.2,
      life: 1
    });
  }

  let lastComet = 0;
  function frame(ts) {
    c.clearRect(0, 0, W, H);

    // nebulosa respirando
    const breathe = 0.5 + 0.5 * Math.sin(ts * 0.00025);
    let g = c.createRadialGradient(W * 0.75, H * 0.12, 0, W * 0.75, H * 0.12, W * 0.75);
    g.addColorStop(0, `rgba(79,216,255,${(0.05 + breathe * 0.04).toFixed(3)})`);
    g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(W * 0.12, H * 0.85, 0, W * 0.12, H * 0.85, W * 0.7);
    g.addColorStop(0, `rgba(139,124,255,${(0.04 + (1 - breathe) * 0.04).toFixed(3)})`);
    g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // grid de perspectiva no rodapé (chão holográfico)
    const horizon = H * 0.82;
    gridT = reduced ? 0 : (gridT + 0.35);
    c.save();
    c.globalAlpha = 0.16;
    c.strokeStyle = '#4FD8FF';
    c.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) {
      const p = ((i * 22 + gridT) % 198) / 198;           // 0..1
      const y = horizon + Math.pow(p, 2.1) * (H - horizon);
      c.globalAlpha = 0.03 + Math.pow(p, 1.6) * 0.16;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.globalAlpha = 0.07;
    for (let i = -6; i <= 6; i++) {
      c.beginPath();
      c.moveTo(W / 2 + i * W * 0.09, horizon);
      c.lineTo(W / 2 + i * W * 0.5, H + 40);
      c.stroke();
    }
    c.restore();

    // estrelas (paralaxe: deriva lenta pra esquerda)
    for (const layer of layers) {
      const drift = reduced ? 0 : (ts * 0.004 * layer.depth) % W;
      for (const s of layer.stars) {
        let x = s.x - drift; if (x < 0) x += W;
        const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(ts * 0.001 * s.tw + s.phase));
        c.beginPath();
        c.fillStyle = s.hue + a.toFixed(2) + ')';
        c.arc(x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
    }

    // cometas
    if (!reduced) {
      if (!lastComet || ts - lastComet > 3400 + Math.random() * 3000) { lastComet = ts; spawnComet(); }
      for (let i = comets.length - 1; i >= 0; i--) {
        const m = comets[i];
        m.x += m.vx; m.y += m.vy;
        const tx = m.x - m.vx * 14, ty = m.y - m.vy * 14;
        const grd = c.createLinearGradient(tx, ty, m.x, m.y);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.7, 'rgba(79,216,255,0.55)');
        grd.addColorStop(1, '#9BEBFF');
        c.strokeStyle = grd; c.lineWidth = 1.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(tx, ty); c.lineTo(m.x, m.y); c.stroke();
        c.beginPath(); c.fillStyle = '#DFF6FF';
        c.shadowColor = '#4FD8FF'; c.shadowBlur = 10;
        c.arc(m.x, m.y, 1.6, 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;
        if (m.x < -60 || m.x > W + 60 || m.y > H + 60) comets.splice(i, 1);
      }
    }
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
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
function countUpBRL(el, target) {
  const from = el._val || 0;
  el._val = target;
  const t0 = performance.now(), dur = 1000;
  function step(ts) {
    const p = Math.min((ts - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtBRL(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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

/* ================= glow plugin (gráficos neon) ================= */
const glowPlugin = {
  id: 'glow',
  beforeDatasetDraw(chart, args) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = args.meta.dataset ? args.meta.dataset.options.borderColor : 'rgba(79,216,255,0.8)';
    ctx.shadowBlur = 12;
  },
  afterDatasetDraw(chart) { chart.ctx.restore(); }
};

/* ================= DASHBOARD ================= */
let chartEv = null, chartHours = null;
let evDays = 7, hDays = 1;

async function loadSummary() {
  const s = await api('/api/summary');
  const t = s.today, y = s.yesterday, m = s.month;

  const el = $('heroLucro');
  countUpBRL(el, t.profit);
  el.classList.toggle('neg', t.profit < 0);

  const delta = $('heroDelta');
  if (y.profit !== 0) {
    const p = Math.round(((t.profit - y.profit) / Math.abs(y.profit)) * 100);
    delta.textContent = (p >= 0 ? '▲ +' : '▼ ') + p + '% vs ontem';
    delta.classList.toggle('neg', p < 0);
  } else delta.textContent = 'HOJE';

  $('hVendas').textContent = t.salesCount;
  $('hFat').textContent = fmtBRLshort(t.revenue);
  $('hRoi').textContent = t.roi != null ? String(t.roi).replace('.', ',') + 'x' : '—';

  // barra de energia: quanto do faturamento virou lucro
  const ratio = t.revenue > 0 ? Math.max(0, Math.min(1, t.profit / t.revenue)) : 0;
  $('energyBar').style.setProperty('--w', Math.round(ratio * 100) + '%');
  $('energyBar').style.width = Math.round(ratio * 100) + '%';

  $('spendToday').textContent = fmtBRL(t.spend);
  $('spendTaxToday').textContent = '+ ' + fmtBRL(t.tax) + ' imposto';

  countUpBRL($('mLucroMes'), m.profit);
  $('mLucroMes').classList.toggle('neg', m.profit < 0);
  countUpBRL($('mFatMes'), m.revenue);
  countUpBRL($('mInvMes'), m.cost);
  $('mRoiMes').textContent = m.roi != null ? String(m.roi).replace('.', ',') + 'x' : '—';
  $('mVendasMes').textContent = m.salesCount;
  $('mTicket').textContent = m.salesCount > 0 ? fmtBRLshort(m.revenue / m.salesCount) : '—';
  $('mOntem').textContent = fmtBRLshort(y.revenue);

  // gauge ROI: 3x = anel completo
  const circ = 163.4;
  const frac = m.roi != null ? Math.max(0, Math.min(1, m.roi / 3)) : 0;
  $('gaugeRoi').style.strokeDashoffset = (circ * (1 - frac)).toFixed(1);

  const [yy, mm, dd] = t.date.split('-');
  $('todayPill').textContent = `${dd}.${mm}.${yy} · ONLINE`;
}

async function loadEvolution() {
  const to = brToday(), from = brToday(evDays - 1);
  const rows = await api(`/api/daily?from=${from}&to=${to}`);
  const map = Object.fromEntries(rows.map(r => [r.date, r]));
  const labels = [], rev = [], profit = [];
  for (let i = evDays - 1; i >= 0; i--) {
    const d = brToday(i);
    labels.push(d.slice(8, 10) + '/' + d.slice(5, 7));
    rev.push(map[d] ? map[d].revenue : 0);
    profit.push(map[d] ? map[d].profit : 0);
  }
  const ctx = $('chartEv').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 195);
  grad.addColorStop(0, 'rgba(79,216,255,0.30)');
  grad.addColorStop(1, 'rgba(79,216,255,0)');
  if (chartEv) chartEv.destroy();
  chartEv = new Chart(ctx, {
    type: 'line',
    plugins: [glowPlugin],
    data: { labels, datasets: [
      { data: rev, borderColor: '#4FD8FF', backgroundColor: grad, borderWidth: 2.2, fill: true, tension: 0.42, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#4FD8FF', pointHoverBorderColor: '#020409', pointHoverBorderWidth: 2 },
      { data: profit, borderColor: '#3EF2A5', borderWidth: 1.8, borderDash: [5, 4], fill: false, tension: 0.42, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#3EF2A5', pointHoverBorderColor: '#020409', pointHoverBorderWidth: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      animation: { duration: 1100, easing: 'easeOutCubic' },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: 'rgba(7,15,28,0.97)', borderColor: 'rgba(79,216,255,0.4)', borderWidth: 1,
        titleColor: '#EAF6FF', bodyColor: '#8FB0C9', padding: 10, cornerRadius: 4, displayColors: false,
        titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 11 },
        callbacks: { label: c => (c.datasetIndex === 0 ? 'Faturamento: ' : 'Lucro: ') + fmtBRL(c.parsed.y) }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#4A6480', font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 8, maxRotation: 0 } },
                y: { display: false } }
    }
  });
}

async function loadHours() {
  const to = brToday(), from = brToday(hDays - 1);
  const rows = await api(`/api/hours?from=${from}&to=${to}`);
  const labels = rows.map(r => r.hour + 'h');
  const data = rows.map(r => r.sales);
  const max = Math.max(...data);
  const ctx = $('chartHours').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, 'rgba(79,216,255,0.9)');
  grad.addColorStop(1, 'rgba(139,124,255,0.25)');
  const colors = data.map(v => (max > 0 && v === max) ? '#9BEBFF' : grad);
  if (chartHours) chartHours.destroy();
  chartHours = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 2, borderSkipped: false, barPercentage: 0.6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutCubic' },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: 'rgba(7,15,28,0.97)', borderColor: 'rgba(79,216,255,0.4)', borderWidth: 1,
        titleColor: '#EAF6FF', bodyColor: '#8FB0C9', padding: 10, cornerRadius: 4, displayColors: false,
        titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 11 },
        callbacks: { label: c => c.parsed.y + ' venda' + (c.parsed.y === 1 ? '' : 's') }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#4A6480', font: { size: 8.5, family: 'JetBrains Mono' }, maxTicksLimit: 12, maxRotation: 0 } },
                y: { display: false } }
    }
  });
  if (max > 0) {
    const idx = data.indexOf(max);
    $('peakBadge').textContent = `◉ PICO ÀS ${idx}H–${idx + 1}H · ${max} VENDA${max === 1 ? '' : 'S'}`;
  } else {
    $('peakBadge').textContent = 'SEM VENDAS NO PERÍODO';
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
    <div class="modal-title">GASTO DE HOJE</div>
    <div class="modal-sub">${fmtDate(today)} — digite o valor sem imposto</div>
    <input type="text" inputmode="decimal" id="mSpendVal" class="input w100" placeholder="Ex.: 350,00" style="margin-top:8px">
    <div class="tax-preview" id="mTaxPrev"></div>
    <button class="btn-neon w100" id="mSaveSpend">SALVAR</button>
    <button class="btn-ghost w100" id="mCancel" style="margin-top:10px">CANCELAR</button>
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
  if (!rows.length) { el.innerHTML = '<div class="empty">// nenhum gasto registrado</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="sale-row">
      <div class="sale-info">
        <div class="sale-amt">${fmtBRL(r.amount)} <span style="color:var(--magenta);font-size:10.5px">+${fmtBRL(r.amount * TAX)}</span></div>
        <div class="sale-meta">${fmtDate(r.date)} — total ${fmtBRL(r.amount * (1 + TAX))}</div>
      </div>
      <button class="btn-ghost" data-editspend="${r.date}" data-val="${r.amount}">EDITAR</button>
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

/* ================= COMPARAR ================= */
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
