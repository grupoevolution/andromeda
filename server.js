const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const webpush = require('web-push');

const VERSION = require('./package.json').version;
const PORT = process.env.PORT || 3000;
const PIN = process.env.PIN || '1234';
const TAX_RATE = 0.1215; // imposto do Facebook sobre o gasto de anúncio
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'andromeda.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  amount REAL NOT NULL,
  date TEXT NOT NULL,        -- YYYY-MM-DD (horário de Brasília)
  hour INTEGER,              -- 0-23
  product TEXT,
  customer TEXT,
  source TEXT DEFAULT 'webhook',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ad_spend (
  date TEXT PRIMARY KEY,     -- YYYY-MM-DD
  amount REAL NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  sub TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS webhook_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT DEFAULT (datetime('now')),
  event TEXT,
  amount REAL,
  date TEXT,
  hour INTEGER,
  result TEXT,
  raw TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
`);

// ---- VAPID keys (geradas uma vez e guardadas no banco) ----
function getSetting(k) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? r.value : null;
}
function setSetting(k, v) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
}
let vapidPublic = getSetting('vapid_public');
let vapidPrivate = getSetting('vapid_private');
if (!vapidPublic || !vapidPrivate) {
  const keys = webpush.generateVAPIDKeys();
  vapidPublic = keys.publicKey;
  vapidPrivate = keys.privateKey;
  setSetting('vapid_public', vapidPublic);
  setSetting('vapid_private', vapidPrivate);
}
webpush.setVapidDetails('mailto:admin@andromeda.app', vapidPublic, vapidPrivate);

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ type: 'text/csv', limit: '10mb' }));

// ---- data/hora de Brasília ----
function brNow() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return { date: s.slice(0, 10), hour: parseInt(s.slice(11, 13), 10) };
}
function brDateHourFrom(isoLike) {
  if (!isoLike) return null;
  const s = String(isoLike).trim();
  // dd/mm/aaaa hh:mm — horário do Brasil, usa direto
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return { date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, hour: m[4] != null ? parseInt(m[4], 10) : null };
  // aaaa-mm-dd hh:mm SEM fuso — a Kirvano manda no horário de Brasília, usa direto
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, hour: parseInt(m[4], 10) };
  // só a data
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { date: s, hour: null };
  // com fuso explícito (Z ou ±hh:mm) — converte pra Brasília
  const d = new Date(s);
  if (isNaN(d)) return null;
  const t = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return { date: t.slice(0, 10), hour: parseInt(t.slice(11, 13), 10) };
}

// ---- auth ----
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token && db.prepare('SELECT 1 FROM sessions WHERE token=?').get(token)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

let loginFails = 0, loginLockUntil = 0;
app.post('/api/login', (req, res) => {
  if (Date.now() < loginLockUntil) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 1 minuto.' });
  if (String(req.body.pin) !== String(PIN)) {
    if (++loginFails >= 5) { loginFails = 0; loginLockUntil = Date.now() + 60000; }
    return res.status(401).json({ error: 'PIN incorreto' });
  }
  loginFails = 0;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token) VALUES(?)').run(token);
  res.json({ token });
});

// ---- webhook Kirvano ----
function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    let s = v.replace(/[^\d.,-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  return null;
}

// taxas da Kirvano (pra estimar a comissão quando o webhook não manda o valor líquido)
const FIXED_FEE = parseFloat(process.env.KIRVANO_FIXED_FEE || '1.00');   // R$ por produto
const PCT_FEE = parseFloat(process.env.KIRVANO_PCT_FEE || '4.9') / 100; // % sobre o valor

function extractSale(body) {
  // 1) se o payload trouxer a comissão/valor líquido, usa direto
  let amount = parseAmount(
    body.commission ?? body.commission_amount ?? body.producer_amount ??
    body.net_amount ?? body.net_value ?? body.my_commission ?? null
  );

  // 2) senão, estima: total − (R$1 fixo + 4,9%) por produto (taxa da Kirvano)
  if (amount == null) {
    const total = parseAmount(
      body.total_price ?? body.charge_amount ?? body.price ?? body.amount ??
      body.sale_amount ?? (body.plan && body.plan.charge_amount) ?? null
    );
    if (total != null) {
      const nProducts = Array.isArray(body.products) && body.products.length ? body.products.length : 1;
      // a Kirvano trunca a taxa nos centavos antes de descontar
      const fee = Math.floor((nProducts * FIXED_FEE + total * PCT_FEE) * 100) / 100;
      amount = +(total - fee).toFixed(2);
      if (amount < 0) amount = total;
    }
  }
  const externalId = body.sale_id || body.checkout_id || body.transaction_id || body.id || null;
  const when = body.created_at || body.approved_at || body.event_date || null;
  const dh = (when && brDateHourFrom(when)) || brNow();
  const product = (body.products && body.products[0] && body.products[0].name) ||
    (body.product && (body.product.name || body.product)) || body.product_name || null;
  const customer = (body.customer && (body.customer.name || body.customer.email)) || null;
  return { amount, externalId, date: dh.date, hour: dh.hour, product, customer };
}

const logWebhook = (event, s, result, body) => {
  try {
    db.prepare('INSERT INTO webhook_log(event, amount, date, hour, result, raw) VALUES(?,?,?,?,?,?)')
      .run(event || null, s ? s.amount : null, s ? s.date : null, s ? s.hour : null, result, JSON.stringify(body).slice(0, 3000));
    db.prepare("DELETE FROM webhook_log WHERE id NOT IN (SELECT id FROM webhook_log ORDER BY id DESC LIMIT 50)").run();
  } catch (e) { /* log nunca derruba o webhook */ }
};

app.post('/webhook/kirvano', (req, res) => {
  const body = req.body || {};
  const event = String(body.event || body.event_type || body.type || body.status || '').toUpperCase();
  const s = extractSale(body);

  if (event.includes('APPROVED') || event.includes('APROVAD')) {
    if (s.amount == null) { logWebhook(event, s, 'erro: sem valor', body); return res.status(400).json({ error: 'valor não encontrado no payload' }); }
    try {
      db.prepare('INSERT INTO sales(external_id, amount, date, hour, product, customer) VALUES(?,?,?,?,?,?)')
        .run(s.externalId, s.amount, s.date, s.hour, s.product, s.customer);
    } catch (e) {
      if (String(e).includes('UNIQUE')) { logWebhook(event, s, 'duplicada', body); return res.json({ ok: true, duplicate: true }); }
      throw e;
    }
    logWebhook(event, s, 'venda registrada', body);
    sendPush('Venda aprovada 💰', `+ R$ ${s.amount.toFixed(2).replace('.', ',')}${s.product ? ' — ' + s.product : ''}`);
    return res.json({ ok: true });
  }

  if (event.includes('REFUND') || event.includes('REEMBOLS') || event.includes('CHARGEBACK') || event.includes('CHARGED_BACK')) {
    let removed = 0;
    if (s.externalId) removed = db.prepare('DELETE FROM sales WHERE external_id=?').run(s.externalId).changes;
    if (!removed && s.amount != null) {
      const row = db.prepare('SELECT id FROM sales WHERE amount=? ORDER BY id DESC LIMIT 1').get(s.amount);
      if (row) removed = db.prepare('DELETE FROM sales WHERE id=?').run(row.id).changes;
    }
    if (removed) sendPush('Reembolso ↩️', `- R$ ${(s.amount || 0).toFixed(2).replace('.', ',')} removido do painel`);
    logWebhook(event, s, removed ? 'reembolso removido' : 'reembolso: venda não encontrada', body);
    return res.json({ ok: true, removed });
  }

  logWebhook(event, s, 'ignorado', body);
  res.json({ ok: true, ignored: event || 'sem evento' });
});

// ---- diagnóstico ----
app.get('/api/webhook-log', auth, (req, res) => {
  res.json(db.prepare('SELECT id, received_at, event, amount, date, hour, result FROM webhook_log ORDER BY id DESC LIMIT 20').all());
});

// corrige a data de vendas do webhook usando a hora em que o evento CHEGOU (convertida pra Brasília)
app.post('/api/repair-dates', auth, (req, res) => {
  const rows = db.prepare("SELECT id, created_at, date, hour FROM sales WHERE source='webhook'").all();
  const upd = db.prepare('UPDATE sales SET date=?, hour=? WHERE id=?');
  let fixed = 0;
  for (const r of rows) {
    const d = new Date(r.created_at.replace(' ', 'T') + 'Z'); // created_at é UTC
    if (isNaN(d)) continue;
    const t = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const date = t.slice(0, 10), hour = parseInt(t.slice(11, 13), 10);
    if (date !== r.date || hour !== r.hour) { upd.run(date, hour, r.id); fixed++; }
  }
  res.json({ ok: true, fixed, total: rows.length });
});

// ---- push ----
function sendPush(title, body) {
  const subs = db.prepare('SELECT endpoint, sub FROM push_subs').all();
  for (const row of subs) {
    webpush.sendNotification(JSON.parse(row.sub), JSON.stringify({ title, body }))
      .catch(err => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(row.endpoint);
        }
      });
  }
}
app.get('/api/push/key', auth, (req, res) => res.json({ key: vapidPublic }));
app.post('/api/push/subscribe', auth, (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'subscription inválida' });
  db.prepare('INSERT INTO push_subs(endpoint, sub) VALUES(?,?) ON CONFLICT(endpoint) DO UPDATE SET sub=excluded.sub')
    .run(sub.endpoint, JSON.stringify(sub));
  res.json({ ok: true });
});
app.post('/api/push/test', auth, (req, res) => { sendPush('Andrômeda 🔥', 'Notificações funcionando!'); res.json({ ok: true }); });

// ---- gasto de anúncio ----
app.get('/api/spend', auth, (req, res) => {
  const { from, to } = req.query;
  const rows = db.prepare('SELECT date, amount FROM ad_spend WHERE date BETWEEN ? AND ? ORDER BY date DESC').all(from, to);
  res.json(rows);
});
app.put('/api/spend/:date', auth, (req, res) => {
  const amount = parseAmount(req.body.amount);
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'data inválida' });
  if (amount == null || amount < 0) return res.status(400).json({ error: 'valor inválido' });
  if (amount === 0) db.prepare('DELETE FROM ad_spend WHERE date=?').run(date);
  else db.prepare(`INSERT INTO ad_spend(date, amount, updated_at) VALUES(?,?,datetime('now'))
    ON CONFLICT(date) DO UPDATE SET amount=excluded.amount, updated_at=datetime('now')`).run(date, amount);
  res.json({ ok: true, amount, tax: +(amount * TAX_RATE).toFixed(2), total: +(amount * (1 + TAX_RATE)).toFixed(2) });
});

// ---- vendas ----
app.get('/api/sales', auth, (req, res) => {
  const { from, to, limit } = req.query;
  let rows;
  if (from && to) rows = db.prepare('SELECT * FROM sales WHERE date BETWEEN ? AND ? ORDER BY date DESC, hour DESC, id DESC').all(from, to);
  else rows = db.prepare('SELECT * FROM sales ORDER BY date DESC, hour DESC, id DESC LIMIT ?').all(parseInt(limit || '50', 10));
  res.json(rows);
});
app.delete('/api/sales/:id', auth, (req, res) => {
  db.prepare('DELETE FROM sales WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
app.post('/api/sales', auth, (req, res) => {
  const amount = parseAmount(req.body.amount);
  const date = req.body.date;
  if (amount == null || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'dados inválidos' });
  db.prepare('INSERT INTO sales(amount, date, hour, product, source) VALUES(?,?,?,?,?)')
    .run(amount, date, req.body.hour ?? null, req.body.product || null, 'manual');
  res.json({ ok: true });
});

// ---- importação CSV (vendas retroativas — aceita o export bruto da Kirvano) ----
function splitCsvLine(line, sep) {
  // respeita aspas: campos podem conter o separador
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

app.post('/api/import', auth, (req, res) => {
  const text = typeof req.body === 'string' ? req.body : (req.body.csv || '');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: 'CSV vazio' });

  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitCsvLine(lines[0].toLowerCase(), sep).map(h => h.replace(/["']/g, '').trim());
  const find = (...names) => header.findIndex(h => names.some(n => typeof n === 'string' ? h.includes(n) : n.test(h)));

  // data: prioridade pra "Finalizada em" (Kirvano), depois "Iniciada em", depois genéricos
  let iDate = find('finalizada');
  if (iDate < 0) iDate = find('iniciada');
  if (iDate < 0) iDate = find('data', 'date', 'criado', 'created');
  // valor: prioridade pra "Comissão" (o que você recebe), depois "Valor Pago" e genéricos
  let iVal = find(/comiss/);
  if (iVal < 0) iVal = find('valor pago');
  if (iVal < 0) iVal = find('total', 'valor', 'preço', 'preco', 'price', 'amount');
  const iStatus = find('status', 'situa');
  const iProd = find('produto', 'product', 'oferta');
  const iId = find(/c.?digo/, 'transa', /^id$/);
  const iRefund = find('estornada');
  if (iDate < 0 || iVal < 0) return res.status(400).json({ error: 'Não encontrei colunas de data e valor. Exporte o relatório de vendas da Kirvano ou use um CSV com cabeçalho "data" e "valor".' });

  function parseDate(s) {
    s = s.trim().replace(/["']/g, '');
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, hour: hourOf(s) };
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return { date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, hour: hourOf(s) };
    return null;
  }
  function hourOf(s) {
    const m = s.match(/(\d{1,2}):\d{2}/);
    return m ? parseInt(m[1], 10) : null;
  }

  let imported = 0, skipped = 0, duplicates = 0, updated = 0;
  // reimportar o mesmo período corrige o valor de vendas já importadas
  const insert = db.prepare(`INSERT INTO sales(external_id, amount, date, hour, product, source) VALUES(?,?,?,?,?,?)
    ON CONFLICT(external_id) DO UPDATE SET amount=excluded.amount, date=excluded.date, hour=excluded.hour, product=excluded.product`);
  const insertNoId = db.prepare('INSERT INTO sales(external_id, amount, date, hour, product, source) VALUES(?,?,?,?,?,?)');
  const getByExt = db.prepare('SELECT amount FROM sales WHERE external_id=?');
  const dupCheck = db.prepare("SELECT 1 FROM sales WHERE date=? AND amount=? AND (hour IS ? OR hour=?) AND source!='import' LIMIT 1");
  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i], sep).map(c => c.replace(/^"|"$/g, ''));
      if (iStatus >= 0) {
        const st = (cols[iStatus] || '').toLowerCase();
        if (st && !st.includes('aprovad') && !st.includes('approved') && !st.includes('paid') && !st.includes('pago')) { skipped++; continue; }
      }
      if (iRefund >= 0 && (cols[iRefund] || '').trim()) { skipped++; continue; } // venda estornada
      const d = parseDate(cols[iDate] || '');
      const v = parseAmount(cols[iVal] || '');
      if (!d || v == null || v <= 0) { skipped++; continue; }
      // evita duplicar venda que já entrou pelo webhook (mesmo dia, hora e valor)
      if (dupCheck.get(d.date, v, d.hour, d.hour)) { duplicates++; continue; }
      const extId = iId >= 0 && cols[iId] ? 'import-' + cols[iId].trim() : null;
      const prod = iProd >= 0 ? (cols[iProd] || '').trim() : null;
      if (extId) {
        const existing = getByExt.get(extId);
        insert.run(extId, v, d.date, d.hour, prod, 'import');
        if (!existing) imported++;
        else if (Math.abs(existing.amount - v) > 0.001) updated++;
        else duplicates++;
      } else {
        insertNoId.run(null, v, d.date, d.hour, prod, 'import');
        imported++;
      }
    }
  });
  tx();
  res.json({ ok: true, imported, skipped, duplicates, updated });
});

// ---- resumo / dashboard ----
function statsFor(from, to) {
  const rev = db.prepare('SELECT COALESCE(SUM(amount),0) t, COUNT(*) n FROM sales WHERE date BETWEEN ? AND ?').get(from, to);
  const spend = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM ad_spend WHERE date BETWEEN ? AND ?').get(from, to);
  const tax = spend.t * TAX_RATE;
  const cost = spend.t + tax;
  return {
    revenue: +rev.t.toFixed(2),
    salesCount: rev.n,
    spend: +spend.t.toFixed(2),
    tax: +tax.toFixed(2),
    cost: +cost.toFixed(2),
    profit: +(rev.t - cost).toFixed(2),
    roi: cost > 0 ? +(rev.t / cost).toFixed(2) : null
  };
}

app.get('/api/summary', auth, (req, res) => {
  const nowDate = brNow().date;
  // ?date=AAAA-MM-DD permite ver o painel de um dia específico
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : nowDate;
  const y = new Date(date + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  const monthStart = date.slice(0, 8) + '01';
  res.json({
    today: { date, ...statsFor(date, date) },
    yesterday: { date: yesterday, ...statsFor(yesterday, yesterday) },
    month: { from: monthStart, to: date, ...statsFor(monthStart, date) },
    now: { date: nowDate, ...statsFor(nowDate, nowDate) },
    taxRate: TAX_RATE
  });
});

app.get('/api/daily', auth, (req, res) => {
  const { from, to } = req.query;
  const sales = db.prepare('SELECT date, SUM(amount) revenue, COUNT(*) n FROM sales WHERE date BETWEEN ? AND ? GROUP BY date').all(from, to);
  const spend = db.prepare('SELECT date, amount FROM ad_spend WHERE date BETWEEN ? AND ?').all(from, to);
  const map = {};
  for (const s of sales) map[s.date] = { date: s.date, revenue: +s.revenue.toFixed(2), sales: s.n, spend: 0 };
  for (const sp of spend) {
    if (!map[sp.date]) map[sp.date] = { date: sp.date, revenue: 0, sales: 0, spend: 0 };
    map[sp.date].spend = +sp.amount.toFixed(2);
  }
  const out = Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1)
    .map(d => ({ ...d, cost: +(d.spend * (1 + TAX_RATE)).toFixed(2), profit: +(d.revenue - d.spend * (1 + TAX_RATE)).toFixed(2) }));
  res.json(out);
});

app.get('/api/hours', auth, (req, res) => {
  const { from, to } = req.query;
  const rows = db.prepare('SELECT hour, COUNT(*) n, SUM(amount) total FROM sales WHERE date BETWEEN ? AND ? AND hour IS NOT NULL GROUP BY hour').all(from, to);
  const out = Array.from({ length: 24 }, (_, h) => ({ hour: h, sales: 0, revenue: 0 }));
  for (const r of rows) { out[r.hour] = { hour: r.hour, sales: r.n, revenue: +r.total.toFixed(2) }; }
  res.json(out);
});

app.get('/api/compare', auth, (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: 'informe as duas datas' });
  res.json({ a: { date: a, ...statsFor(a, a) }, b: { date: b, ...statsFor(b, b) } });
});

app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🔥 Andrômeda rodando na porta ${PORT}`));
