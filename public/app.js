/* ============ Andrômeda — app.js ============ */
const TAX = 0.1215;
const $ = id => document.getElementById(id);

let token = localStorage.getItem('andromeda_token') || sessionStorage.getItem('andromeda_token') || null;

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

/* ============ LOGIN ============ */
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

/* ============ NAV ============ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
    $('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'vendas') loadSales(true);
    if (btn.dataset.tab === 'anuncios') loadSpendList();
  });
});

/* ============ DASHBOARD ============ */
let chartEv = null, chartHours = null;
let evDays = 7, hDays = 1;

async function loadSummary() {
  const s = await api('/api/summary');
  const t = s.today, y = s.yesterday, m = s.month;

  const el = $('heroLucro');
  el.textContent = fmtBRL(t.profit);
  el.classList.toggle('neg', t.profit < 0);

  const delta = $('heroDelta');
  if (y.profit !== 0) {
    const p = Math.round(((t.profit - y.profit) / Math.abs(y.profit)) * 100);
    delta.textContent = (p >= 0 ? '↑ +' : '↓ ') + p + '% vs ontem';
    delta.classList.toggle('neg', p < 0);
  } else delta.textContent = 'hoje';

  $('hFat').textContent = fmtBRLshort(t.revenue);
  $('hVendas').textContent = t.salesCount;
  $('hRoi').textContent = t.roi != null ? String(t.roi).replace('.', ',') + 'x' : '—';

  $('spendToday').textContent = fmtBRL(t.spend);
  $('spendTaxToday').textContent = '+ ' + fmtBRL(t.tax) + ' de imposto (12,15%)';

  $('mLucroMes').textContent = fmtBRL(m.profit);
  $('mLucroMes').classList.toggle('neg', m.profit < 0);
  $('mFatMes').textContent = fmtBRL(m.revenue);
  $('mInvMes').textContent = fmtBRL(m.cost);
  $('mRoiMes').textContent = m.roi != null ? String(m.roi).replace('.', ',') + 'x' : '—';

  const [yy, mm, dd] = t.date.split('-');
  $('todayPill').textContent = `${dd}/${mm}/${yy}`;
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
  const grad = ctx.createLinearGradient(0, 0, 0, 190);
  grad.addColorStop(0, 'rgba(245,183,102,0.35)');
  grad.addColorStop(1, 'rgba(245,183,102,0)');
  if (chartEv) chartEv.destroy();
  chartEv = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { data: rev, borderColor: '#F5B766', backgroundColor: grad, borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
      { data: profit, borderColor: '#3FCE93', borderWidth: 2, borderDash: [5, 4], fill: false, tension: 0.4, pointRadius: 0, pointHoverRadius: 4 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#171429', borderColor: 'rgba(245,183,102,0.4)', borderWidth: 1,
        titleColor: '#F8F5FF', bodyColor: '#A9A2C7', padding: 10, cornerRadius: 8, displayColors: false,
        callbacks: { label: c => (c.datasetIndex === 0 ? 'Faturamento: ' : 'Lucro: ') + fmtBRL(c.parsed.y) }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#615C82', font: { size: 10, family: 'Inter' }, maxTicksLimit: 8, maxRotation: 0 } }, y: { display: false } }
    }
  });
}

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
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, borderSkipped: false, barPercentage: 0.65 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#171429', borderColor: 'rgba(245,183,102,0.4)', borderWidth: 1,
        titleColor: '#F8F5FF', bodyColor: '#A9A2C7', padding: 10, cornerRadius: 8, displayColors: false,
        callbacks: { label: c => c.parsed.y + ' venda' + (c.parsed.y === 1 ? '' : 's') }
      }},
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#615C82', font: { size: 9 }, maxTicksLimit: 12, maxRotation: 0 } }, y: { display: false } }
    }
  });
  if (max > 0) {
    const idx = data.indexOf(max);
    $('peakBadge').textContent = `🔥 Pico às ${idx}h–${idx + 1}h (${max} venda${max === 1 ? '' : 's'})`;
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

/* ============ GASTO RÁPIDO (modal do painel) ============ */
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

/* ============ ABA ANÚNCIOS ============ */
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
  loadSpendList(); loadSummary(); loadEvolution();
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

/* ============ IMPORTAÇÃO ============ */
$('btnImport').addEventListener('click', async () => {
  const csv = $('csvBox').value.trim();
  if (!csv) return toast('Cole o CSV primeiro', 'err');
  try {
    const r = await api('/api/import', { method: 'POST', body: JSON.stringify({ csv }) });
    $('importResult').textContent = `✓ ${r.imported} vendas importadas, ${r.skipped} ignoradas (não aprovadas ou duplicadas).`;
    $('csvBox').value = '';
    toast('Importação concluída ✓');
    refreshAll();
  } catch (e) {
    $('importResult').textContent = '✗ ' + e.message;
    toast('Erro na importação', 'err');
  }
});

/* ============ ABA VENDAS ============ */
let salesLimit = 30;
async function loadSales(reset) {
  if (reset) salesLimit = 30;
  const rows = await api('/api/sales?limit=' + salesLimit);
  const el = $('salesList');
  $('salesCount').textContent = rows.length ? `Últimas ${rows.length} vendas` : 'Nenhuma venda ainda';
  if (!rows.length) { el.innerHTML = '<div class="empty">As vendas aprovadas da Kirvano vão aparecer aqui</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="sale-row">
      <div class="sale-info">
        <div class="sale-amt" style="color:var(--green)">+ ${fmtBRL(r.amount)}</div>
        <div class="sale-meta">${fmtDate(r.date)}${r.hour != null ? ' às ' + r.hour + 'h' : ''}${r.product ? ' — ' + r.product : ''}${r.source === 'manual' ? ' (manual)' : r.source === 'import' ? ' (importada)' : ''}</div>
      </div>
      <button class="sale-del" data-del="${r.id}" aria-label="Excluir">✕</button>
    </div>`).join('');
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    openModal(`
      <div class="modal-title">Excluir venda?</div>
      <div class="modal-sub">Essa ação não pode ser desfeita.</div>
      <button class="btn-gold w100" id="mDelYes" style="background:linear-gradient(100deg,#FFB3C4,#EF7C99)">Excluir</button>
      <button class="btn-ghost w100" id="mDelNo" style="margin-top:10px">Cancelar</button>
    `);
    $('mDelNo').onclick = closeModal;
    $('mDelYes').onclick = async () => {
      await api('/api/sales/' + b.dataset.del, { method: 'DELETE' });
      closeModal(); toast('Venda excluída');
      loadSales(false); loadSummary(); loadEvolution(); loadHours();
    };
  }));
}
$('btnMoreSales').addEventListener('click', () => { salesLimit += 30; loadSales(false); });

$('btnAddSale').addEventListener('click', () => {
  openModal(`
    <div class="modal-title">Adicionar venda manual</div>
    <label class="field-label">Data</label>
    <input type="date" id="mSaleDate" class="input w100" value="${brToday()}">
    <label class="field-label">Valor</label>
    <input type="text" inputmode="decimal" id="mSaleVal" class="input w100" placeholder="Ex.: 97,00">
    <button class="btn-gold w100" id="mSaleSave">Adicionar</button>
    <button class="btn-ghost w100" id="mSaleCancel" style="margin-top:10px">Cancelar</button>
  `);
  $('mSaleCancel').onclick = closeModal;
  $('mSaleSave').onclick = async () => {
    const v = parseVal($('mSaleVal').value);
    if (v == null || v <= 0) return toast('Valor inválido', 'err');
    await api('/api/sales', { method: 'POST', body: JSON.stringify({ amount: v, date: $('mSaleDate').value }) });
    closeModal(); toast('Venda adicionada ✓');
    loadSales(true); refreshAll();
  };
});

/* ============ COMPARAR ============ */
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

/* ============ NOTIFICAÇÕES ============ */
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

/* ============ AJUSTES ============ */
$('btnLogout').addEventListener('click', logout);
$('btnCopyWebhook').addEventListener('click', () => {
  navigator.clipboard.writeText($('webhookUrl').textContent);
  toast('URL copiada ✓');
});

/* ============ MODAL ============ */
function openModal(html) {
  $('modalCard').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

/* ============ BOOT ============ */
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

/* atualiza sozinho a cada 60s quando visível */
setInterval(() => {
  if (!document.hidden && token && !$('app').classList.contains('hidden')) refreshAll();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && token && !$('app').classList.contains('hidden')) refreshAll();
});
