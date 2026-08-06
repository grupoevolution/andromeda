/* ============ ANDRÔMEDA — HUD ============ */
const TAX = 0.1215;
const $ = id => document.getElementById(id);

let token = localStorage.getItem('andromeda_token') || sessionStorage.getItem('andromeda_token') || null;

/* ================= céu sutil ================= */
(function () {
  const canvas = $('fx');
  const c = canvas.getContext('2d');
  let W, H;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let layers = [], comets = [];

  function resize() {
    W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    // 2 camadas de estrelas discretas com paralaxe
    layers = [0.3, 0.7].map((depth, li) => {
      const n = Math.floor((W * H) / (20000 - li * 6000));
      const stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 0.4 + depth * (0.3 + Math.random() * 0.6),
          phase: Math.random() * Math.PI * 2,
          tw: 0.3 + Math.random() * 0.7,
          hue: Math.random() < 0.1 ? 'rgba(138,155,255,' : 'rgba(220,225,245,'
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

    // brilho suave e lento no topo
    const breathe = 0.5 + 0.5 * Math.sin(ts * 0.0002);
    let g = c.createRadialGradient(W * 0.7, -H * 0.1, 0, W * 0.7, -H * 0.1, W * 0.9);
    g.addColorStop(0, `rgba(138,155,255,${(0.04 + breathe * 0.03).toFixed(3)})`);
    g.addColorStop(1, 'transparent');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // estrelas discretas com paralaxe
    for (const layer of layers) {
      const drift = reduced ? 0 : (ts * 0.0025 * layer.depth) % W;
      for (const s of layer.stars) {
        let x = s.x - drift; if (x < 0) x += W;
        const a = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(ts * 0.0008 * s.tw + s.phase));
        c.beginPath();
        c.fillStyle = s.hue + a.toFixed(2) + ')';
        c.arc(x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
    }

    // estrela cadente rara e suave
    if (!reduced) {
      if (!lastComet || ts - lastComet > 9000 + Math.random() * 9000) { lastComet = ts; spawnComet(); }
      for (let i = comets.length - 1; i >= 0; i--) {
        const m = comets[i];
        m.x += m.vx; m.y += m.vy;
        const tx = m.x - m.vx * 12, ty = m.y - m.vy * 12;
        const grd = c.createLinearGradient(tx, ty, m.x, m.y);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(220,225,245,0.5)');
        c.strokeStyle = grd; c.lineWidth = 1.3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(tx, ty); c.lineTo(m.x, m.y); c.stroke();
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

/* ================= DASHBOARD ================= */
let chartEv = null, chartHours = null;
let evDays = 7, hDays = 1, evCompare = false;

const tooltipStyle = {
  backgroundColor: '#16161F', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1,
  titleColor: '#F5F6FA', bodyColor: '#9CA0B8', padding: 11, cornerRadius: 10, displayColors: false,
  titleFont: { family: 'Inter', size: 12, weight: '600' }, bodyFont: { family: 'Inter', size: 12 }
};

async function loadSummary() {
  const s = await api('/api/summary');
  const t = s.today, y = s.yesterday, m = s.month;

  const el = $('heroLucro');
  countUpBRL(el, t.profit);
  el.classList.toggle('neg', t.profit < 0);

  const delta = $('heroDelta');
  if (y.profit !== 0) {
    const p = Math.round(((t.profit - y.profit) / Math.abs(y.profit)) * 100);
    delta.textContent = (p >= 0 ? '↑ +' : '↓ ') + p + '% vs ontem';
    delta.classList.toggle('neg', p < 0);
  } else delta.textContent = 'hoje';

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
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  $('todayPill').textContent = `${+dd} de ${meses[+mm - 1]} · online`;
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

  // período anterior (mesma quantidade de dias, logo antes)
  let prev = null;
  if (evCompare) {
    const pTo = brToday(evDays), pFrom = brToday(evDays * 2 - 1);
    const pRows = await api(`/api/daily?from=${pFrom}&to=${pTo}`);
    const pMap = Object.fromEntries(pRows.map(r => [r.date, r]));
    prev = [];
    for (let i = evDays * 2 - 1; i >= evDays; i--) {
      const d = brToday(i);
      prev.push(pMap[d] ? pMap[d].revenue : 0);
    }
  }

  const ctx = $('chartEv').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(138,155,255,0.28)');
  grad.addColorStop(1, 'rgba(138,155,255,0)');
  const datasets = [
    { label: 'Faturamento', data: rev, borderColor: '#8A9BFF', backgroundColor: grad, borderWidth: 2.4, fill: true, tension: 0.42, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#8A9BFF', pointHoverBorderColor: '#0A0A10', pointHoverBorderWidth: 2 },
    { label: 'Lucro', data: profit, borderColor: '#4ADE9C', borderWidth: 2, fill: false, tension: 0.42, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#4ADE9C', pointHoverBorderColor: '#0A0A10', pointHoverBorderWidth: 2 }
  ];
  if (prev) datasets.push({ label: 'Período anterior', data: prev, borderColor: 'rgba(245,246,250,0.45)', borderWidth: 1.6, borderDash: [5, 5], fill: false, tension: 0.42, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#F5F6FA', pointHoverBorderColor: '#0A0A10', pointHoverBorderWidth: 2 });

  $('evLegend').innerHTML =
    '<span><span class="dot" style="background:var(--accent)"></span>Faturamento</span>' +
    '<span><span class="dot" style="background:var(--green)"></span>Lucro</span>' +
    (prev ? '<span><span class="dot" style="background:rgba(245,246,250,0.5)"></span>Período anterior</span>' : '');

  if (chartEv) chartEv.destroy();
  chartEv = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      animation: { duration: 900, easing: 'easeOutCubic' },
      plugins: { legend: { display: false }, tooltip: { ...tooltipStyle,
        callbacks: { label: c => c.dataset.label + ': ' + fmtBRL(c.parsed.y) }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#5A5E75', font: { size: 11, family: 'Inter' }, maxTicksLimit: 8, maxRotation: 0 } },
                y: { display: false } }
    }
  });
}

$('evCompareToggle').addEventListener('click', () => {
  evCompare = !evCompare;
  $('evSwitch').classList.toggle('on', evCompare);
  loadEvolution();
});

async function loadHours() {
  const to = brToday(), from = brToday(hDays - 1);
  const rows = await api(`/api/hours?from=${from}&to=${to}`);
  const labels = rows.map(r => r.hour + 'h');
  const data = rows.map(r => r.sales);
  const max = Math.max(...data);
  const ctx = $('chartHours').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 170);
  grad.addColorStop(0, 'rgba(138,155,255,0.3)');
  grad.addColorStop(1, 'rgba(138,155,255,0)');
  if (chartHours) chartHours.destroy();
  chartHours = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      data, borderColor: '#8A9BFF', backgroundColor: grad, borderWidth: 2.4, fill: true, tension: 0.45,
      pointRadius: data.map(v => (max > 0 && v === max) ? 4 : 0),
      pointBackgroundColor: '#F5F6FA', pointBorderColor: '#8A9BFF', pointBorderWidth: 2,
      pointHoverRadius: 5, pointHoverBackgroundColor: '#8A9BFF', pointHoverBorderColor: '#0A0A10', pointHoverBorderWidth: 2
    }]},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      animation: { duration: 800, easing: 'easeOutCubic' },
      plugins: { legend: { display: false }, tooltip: { ...tooltipStyle,
        callbacks: { label: c => c.parsed.y + ' venda' + (c.parsed.y === 1 ? '' : 's') }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#5A5E75', font: { size: 10.5, family: 'Inter' }, maxTicksLimit: 12, maxRotation: 0 } },
                y: { display: false } }
    }
  });
  if (max > 0) {
    const idx = data.indexOf(max);
    $('peakBadge').textContent = `Pico às ${idx}h–${idx + 1}h · ${max} venda${max === 1 ? '' : 's'}`;
  } else {
    $('peakBadge').textContent = 'Sem vendas no período';
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
  if (!rows.length) { el.innerHTML = '<div class="empty">Nenhum gasto registrado ainda</div>'; return; }
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
