/* =========================================================
   dashboard.js — لوحة المالك
   ========================================================= */
const D = { customers: [], services: [], barbers: [], invoices: [], appts: [], tx: [], expenses: [], staff: [], shop: { ...DEFAULT_SHOP }, migration: undefined };
let TODAY = localDate();
const WIN_START = monthFirst(TODAY, -1);   // الفواتير من أول الشهر اللي فات بتفضل محمّلة لايف
let CUR = 'overview';
const EXP_CATS = ['إيجار', 'كهرباء ومياه', 'أدوات ومستلزمات', 'منتجات', 'صيانة', 'مرتبات', 'نثريات', 'أخرى'];
const COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9'];

const onErr = e => { console.error(e); toast('⚠️ ' + fsErr(e), 'err'); };
const actCust = () => D.customers.filter(c => !c.deleted);
const actSvc = () => D.services.filter(s => !s.deleted).sort(svcSort);
const actBar = () => D.barbers.filter(b => !b.deleted).sort(byName);
const getC = id => D.customers.find(c => c.id === id);
const getS = id => D.services.find(s => s.id === id);
const getB = id => D.barbers.find(b => b.id === id);
const custLabel = c => c.phone ? `${c.name} • ${c.phone}` : c.name;
function custFromLabel(v) {
  v = String(v || '').trim(); if (!v) return null;
  const L = actCust();
  return L.find(c => custLabel(c) === v) || L.find(c => c.name === v) || L.find(c => c.phone && digits(c.phone) === digits(v)) || undefined;
}
function fillCustList() { $('custList').innerHTML = actCust().sort(byName).map(c => `<option value="${esc(custLabel(c))}">`).join(''); }
function barberOptions(selected, emptyLabel = '— بدون —') {
  return `<option value="">${emptyLabel}</option>` + actBar().map(b => `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${esc(b.name)}${b.active === false ? ' (موقوف)' : ''}</option>`).join('');
}

// ===== جلب الفواتير لفترة =====
const fetchCache = new Map();
async function getInvoices(from, to) {
  if (from >= WIN_START) return D.invoices.filter(i => i.date >= from && i.date <= to);
  const k = from + '|' + to;
  if (fetchCache.has(k)) return fetchCache.get(k);
  const s = await fs.collection('invoices').where('date', '>=', from).where('date', '<=', to).get();
  const L = snapList(s); fetchCache.set(k, L); return L;
}
function allLoadedInvoices() { const m = new Map(); D.invoices.forEach(i => m.set(i.id, i)); fetchCache.forEach(L => L.forEach(i => { if (!m.has(i.id)) m.set(i.id, i); })); (H.data || []).forEach(i => { if (!m.has(i.id)) m.set(i.id, i); }); return m; }
const findInv = id => allLoadedInvoices().get(id);

// ===== INIT =====
requireAuth(['owner'], me => {
  $('meName').textContent = me.name || 'المالك';
  $('meEmail').textContent = me.email;
  $('setEmail').textContent = me.email;
  $('todayLabel').textContent = fmtDateLong(TODAY);
  const L = (ref, key, after) => ref.onSnapshot(s => { D[key] = snapList(s); if (after) after(); scheduleRender(); }, onErr);
  L(fs.collection('customers'), 'customers');
  L(fs.collection('services'), 'services');
  L(fs.collection('barbers'), 'barbers');
  L(fs.collection('invoices').where('date', '>=', WIN_START), 'invoices');
  L(fs.collection('appointments').where('date', '>=', addDays(TODAY, -60)), 'appts', updateApptBadge);
  L(fs.collection('barberTx'), 'tx');
  L(fs.collection('expenses'), 'expenses');
  L(fs.collection('staff'), 'staff');
  fs.collection('settings').doc('shop').onSnapshot(s => { D.shop = { ...DEFAULT_SHOP, ...(s.data() || {}) }; applyShop(); scheduleRender(); }, onErr);
  fs.collection('meta').doc('migration').onSnapshot(s => {
    D.migration = s.exists ? s.data() : null;
    if (!s.exists && !s.metadata.fromCache) checkMigration();
    renderMigStatus();
  }, onErr);

  $('bmMonth').value = TODAY.slice(0, 7);
  $('exMonth').value = TODAY.slice(0, 7);
  $('ivFrom').value = monthFirst(TODAY); $('ivTo').value = TODAY;
  setInterval(() => {
    const d = localDate();
    if (d !== TODAY) { if (d.slice(0, 7) !== TODAY.slice(0, 7)) location.reload(); TODAY = d; $('todayLabel').textContent = fmtDateLong(TODAY); scheduleRender(); }
  }, 60000);
  hideLoader();
  go((location.hash || '').slice(1) || 'overview');
});

// ===== NAVIGATION & RENDER =====
const PAGES = {
  overview: ['نظرة عامة', 'ملخص أداء الصالون'], reports: ['التقارير والإيرادات', 'المبيعات بالتفصيل لأي فترة'],
  invoices: ['الفواتير', 'عرض وتعديل وطباعة الفواتير'], appointments: ['المواعيد', 'إدارة الحجوزات'],
  customers: ['العملاء', 'قاعدة بيانات العملاء'], services: ['الخدمات والأسعار', 'إدارة الخدمات'],
  barbers: ['الحلاقين والرواتب', 'المبيعات والعمولات والسلف'], expenses: ['المصروفات', 'مصروفات المحل الشهرية'],
  staff: ['المستخدمين', 'حسابات الدخول للكاشير والمالك'], settings: ['الإعدادات', 'بيانات المحل والحساب']
};
const RENDER = {
  overview: () => renderOverview(), reports: () => renderReports(), invoices: () => renderInvoicesPage(),
  appointments: () => renderAppts(), customers: () => renderCustomers(), services: () => renderServices(),
  barbers: () => renderBarbers(), expenses: () => renderExpenses(), staff: () => renderStaff(), settings: () => renderSettings()
};
function go(name) {
  if (!PAGES[name]) name = 'overview';
  CUR = name;
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'pg-' + name));
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.p === name));
  $('pageTitle').textContent = PAGES[name][0]; $('pageSub').textContent = PAGES[name][1];
  try { history.replaceState(null, '', '#' + name); } catch (e) {}
  toggleSidebar(false);
  RENDER[name]();
  window.scrollTo(0, 0);
}
function toggleSidebar(on) { $('sidebar').classList.toggle('open', on); $('sbBackdrop').classList.toggle('open', on); }
let _raf = null;
function scheduleRender() { if (_raf) return; _raf = requestAnimationFrame(() => { _raf = null; try { RENDER[CUR](); } catch (e) { console.error(e); } }); }
function applyShop() { $('sbShopName').textContent = D.shop.name; document.title = 'لوحة المالك — ' + D.shop.name; }
function updateApptBadge() {
  const n = D.appts.filter(a => a.date === TODAY && a.status === 'pending').length;
  const b = $('apptBadge'); b.textContent = n; b.classList.toggle('hidden', !n);
}
const kpi = (icon, label, val, sub, color) => `<div class="kpi" style="--kc:${color}"><div class="kpi-head"><div class="kpi-icon">${icon}</div><div class="kpi-lbl">${label}</div></div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
const emptyBox = (icon, msg) => `<div class="empty"><div class="ei">${icon}</div><p>${msg}</p></div>`;
const emptyRow = (cols, icon, msg) => `<tr><td colspan="${cols}">${emptyBox(icon, msg)}</td></tr>`;
function barList(rows, valFmt = money) {
  if (!rows.length) return emptyBox('📊', 'لسه مفيش بيانات');
  const mx = Math.max(...rows.map(r => r.v), 1);
  return rows.map(r => `<div class="bar-row"><div class="bar-name" title="${esc(r.n)}">${esc(r.n)}</div><div class="bar-track"><div class="bar-fill" style="width:${(r.v / mx) * 100}%"></div></div><div class="bar-val">${valFmt(r.v)}${r.s ? ` <span class="muted">${r.s}</span>` : ''}</div></div>`).join('');
}
function svcCounts(invs) {
  const m = {};
  invs.forEach(inv => (inv.items || []).forEach(it => { const k = it.name || '—'; m[k] = m[k] || { n: k, c: 0, r: 0 }; m[k].c++; m[k].r += +it.price || 0; }));
  return Object.values(m).sort((a, b) => b.c - a.c);
}
function barberAgg(invs) {
  const m = {};
  invs.forEach(inv => { const k = inv.barberId || '_'; m[k] = m[k] || { id: inv.barberId, n: inv.barberName || 'بدون حلاق', c: 0, v: 0 }; m[k].c++; m[k].v += +inv.total || 0; });
  return Object.values(m).sort((a, b) => b.v - a.v);
}

// ===================== OVERVIEW =====================
function renderOverview() {
  const t = TODAY, ms = monthFirst(t), lms = monthFirst(t, -1);
  const lmDays = parseDate(monthLast(lms)).getDate();
  const lmEnd = localDate(new Date(parseDate(lms).getFullYear(), parseDate(lms).getMonth(), Math.min(parseDate(t).getDate(), lmDays)));
  const todayI = D.invoices.filter(i => i.date === t);
  const monthI = D.invoices.filter(i => i.date >= ms && i.date <= t);
  const lastI = D.invoices.filter(i => i.date >= lms && i.date <= lmEnd);
  const tRev = sum(todayI, i => i.total), mRev = sum(monthI, i => i.total), lRev = sum(lastI, i => i.total);
  const growth = lRev ? Math.round((mRev - lRev) / lRev * 100) : null;
  const mExp = sum(D.expenses.filter(e => e.date >= ms && e.date <= monthLast(t)), e => e.amount);
  const avg = monthI.length ? mRev / monthI.length : 0;
  const custs = actCust();
  const newCust = custs.filter(c => c.createdAt && localDate(c.createdAt) >= ms).length;
  const tAppts = D.appts.filter(a => a.date === t && a.status !== 'cancelled').sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const pend = tAppts.filter(a => a.status === 'pending').length;
  const gTxt = growth === null ? 'مفيش مقارنة بالشهر اللي فات' : `<span class="${growth >= 0 ? 'c-green' : 'c-red'}">${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth)}%</span> عن نفس الفترة الشهر اللي فات`;
  $('ovKpis').innerHTML =
    kpi('💰', 'إيراد النهارده', money(tRev), `${todayI.length} فاتورة`, 'var(--accent)') +
    kpi('📈', 'إيراد الشهر', money(mRev), gTxt, 'var(--green)') +
    kpi('🧾', 'متوسط الفاتورة', money(avg), `${monthI.length} فاتورة الشهر ده`, 'var(--purple)') +
    kpi('💸', 'مصروفات الشهر', money(mExp), `الصافي: <b class="${mRev - mExp >= 0 ? 'c-green' : 'c-red'}">${money(mRev - mExp)}</b>`, 'var(--red)') +
    kpi('📅', 'مواعيد النهارده', tAppts.length, `${pend} منتظر`, 'var(--amber)') +
    kpi('👥', 'العملاء', custs.length, `+${newCust} جديد الشهر ده`, 'var(--accent)');

  const days = []; let wk = 0;
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(t, -i), rev = sum(D.invoices.filter(x => x.date === ds), x => x.total);
    wk += rev; days.push({ ds, rev, lbl: parseDate(ds).toLocaleDateString('ar-EG', { weekday: 'short' }) });
  }
  const mx = Math.max(1, ...days.map(d => d.rev));
  $('ovWeek').textContent = 'الإجمالي ' + money(wk);
  $('ovBars').innerHTML = days.map(d => `<div class="vbar-col" title="${fmtDate(d.ds)}: ${money(d.rev)}"><div class="vbar-val">${d.rev ? fmtNum(d.rev) : ''}</div><div class="vbar-area"><div class="vbar ${d.ds === t ? 'today' : ''}" style="height:${Math.max(d.rev / mx * 100, 2)}%"></div></div><div class="vbar-lbl">${d.lbl}</div></div>`).join('');

  $('ovAppts').innerHTML = tAppts.length ? tAppts.map(a => `<div class="li"><div class="li-time">${esc(fmt12(a.time))}</div><div class="li-body"><h4>${esc(a.customerName || '—')}</h4><p>${esc(a.serviceName || '')}${a.barberName ? ' • ✂️ ' + esc(a.barberName) : ''}</p></div><div class="dot ${a.status}"></div></div>`).join('') : emptyBox('📅', 'مفيش مواعيد النهارده');
  $('ovSvcs').innerHTML = barList(svcCounts(monthI).slice(0, 6).map(s => ({ n: s.n, v: s.c })), v => v + '×');
  $('ovBarbers').innerHTML = barList(barberAgg(monthI).slice(0, 6).map(b => ({ n: b.n, v: b.v, s: `(${b.c})` })));
  const top = [...custs].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 6).filter(c => c.totalSpent > 0);
  $('ovCust').innerHTML = top.length ? top.map((c, i) => `<div class="li"><div class="rank">${i + 1}</div><div class="li-body"><h4>${esc(c.name)}</h4><p>${c.visits || 0} زيارة</p></div><b class="c-accent">${money(c.totalSpent)}</b></div>`).join('') : emptyBox('👥', 'لسه مفيش بيانات');
}

// ===================== REPORTS =====================
const R = { from: null, to: null, data: [], quick: 'month', token: 0 };
function setRange(k) {
  const t = TODAY; let f = t, to = t;
  if (k === 'yesterday') f = to = addDays(t, -1);
  else if (k === 'week') f = addDays(t, -6);
  else if (k === 'month') f = monthFirst(t);
  else if (k === 'lastMonth') { f = monthFirst(t, -1); to = monthLast(t, -1); }
  else if (k === 'year') f = t.slice(0, 4) + '-01-01';
  R.quick = k; $('rFrom').value = f; $('rTo').value = to;
  loadReport();
}
function customRange() { R.quick = null; loadReport(); }
async function loadReport() {
  let f = $('rFrom').value, t = $('rTo').value;
  if (!f || !t) return;
  if (f > t) { [f, t] = [t, f]; $('rFrom').value = f; $('rTo').value = t; }
  R.from = f; R.to = t;
  document.querySelectorAll('#rQuick button').forEach(b => b.classList.toggle('active', b.dataset.r === R.quick));
  const tk = ++R.token;
  if (f < WIN_START) $('rKpis').innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center"><span class="spinner" style="display:inline-block;width:22px;height:22px"></span></div>`;
  try { const d = await getInvoices(f, t); if (tk !== R.token) return; R.data = d; } catch (e) { onErr(e); return; }
  drawReport();
}
function renderReports() { if (!R.from) { setRange('month'); return; } if (R.from >= WIN_START) R.data = D.invoices.filter(i => i.date >= R.from && i.date <= R.to); drawReport(); }
function drawReport() {
  const L = R.data, rev = sum(L, i => i.total), disc = sum(L, i => i.discount);
  const exps = D.expenses.filter(e => e.date >= R.from && e.date <= R.to), exp = sum(exps, e => e.amount);
  const custSet = new Set(L.filter(i => i.customerId).map(i => i.customerId));
  $('rKpis').innerHTML =
    kpi('💰', 'إجمالي المبيعات', money(rev), `${fmtDate(R.from)} ← ${fmtDate(R.to)}`, 'var(--accent)') +
    kpi('🧾', 'عدد الفواتير', L.length, `متوسط ${money(L.length ? rev / L.length : 0)}`, 'var(--purple)') +
    kpi('🏷️', 'الخصومات', money(disc), `${L.filter(i => +i.discount > 0).length} فاتورة بخصم`, 'var(--amber)') +
    kpi('💸', 'المصروفات', money(exp), `${exps.length} بند`, 'var(--red)') +
    kpi('✅', 'الصافي', money(rev - exp), 'المبيعات − المصروفات', rev - exp >= 0 ? 'var(--green)' : 'var(--red)') +
    kpi('👥', 'عملاء مختلفين', custSet.size, `${L.filter(i => !i.customerId).length} فاتورة نقدي`, 'var(--accent)');
  const ba = barberAgg(L);
  $('rBarbers').innerHTML = ba.length ? ba.map(b => { const br = b.id ? getB(b.id) : null; const com = br && br.commission ? b.v * br.commission / 100 : 0; return `<tr><td><b>${esc(b.n)}</b></td><td>${b.c}</td><td class="c-accent bold">${money(b.v)}</td><td>${com ? money(com) + ` <span class="sub">(${br.commission}%)</span>` : '—'}</td></tr>`; }).join('') : emptyRow(4, '✂️', 'مفيش بيانات');
  const sc = svcCounts(L);
  $('rSvcs').innerHTML = sc.length ? sc.map(s => `<tr><td>${esc(s.n)}</td><td>${s.c}×</td><td class="c-accent bold">${money(s.r)}</td></tr>`).join('') : emptyRow(3, '💈', 'مفيش بيانات');
  const pm = {}; L.forEach(i => { const k = i.payMethod || 'cash'; pm[k] = pm[k] || { c: 0, v: 0 }; pm[k].c++; pm[k].v += +i.total || 0; });
  $('rPay').innerHTML = barList(Object.entries(pm).sort((a, b) => b[1].v - a[1].v).map(([k, x]) => ({ n: PAY[k] || k, v: x.v, s: `(${x.c})` })));
  const days = {};
  L.forEach(i => { days[i.date] = days[i.date] || { c: 0, v: 0, e: 0 }; days[i.date].c++; days[i.date].v += +i.total || 0; });
  exps.forEach(e => { days[e.date] = days[e.date] || { c: 0, v: 0, e: 0 }; days[e.date].e += +e.amount || 0; });
  const dk = Object.keys(days).sort().reverse();
  $('rDays').innerHTML = dk.length ? dk.map(d => `<tr><td>${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${days[d].c}</td><td class="c-accent bold">${money(days[d].v)}</td><td class="c-red">${days[d].e ? money(days[d].e) : '—'}</td></tr>`).join('') : emptyRow(4, '📆', 'مفيش بيانات');
}
function exportReport() {
  if (!R.data.length) { toast('مفيش فواتير في الفترة دي'); return; }
  downloadFile(`تقرير_${R.from}_${R.to}.csv`, invoicesCSV(R.data));
}
function invoicesCSV(L) {
  const rows = [['رقم الفاتورة', 'التاريخ', 'الوقت', 'العميل', 'التليفون', 'الحلاق', 'الخدمات', 'المجموع', 'الخصم', 'الإجمالي', 'طريقة الدفع', 'الكاشير', 'ملاحظات']];
  [...L].sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date))).forEach(i => rows.push([i.number, i.date, fmtTime(i.createdAt), i.customerName, i.customerPhone, i.barberName, (i.items || []).map(x => x.name).join(' + '), i.subtotal ?? i.total, i.discount || 0, i.total, PAY[i.payMethod] || 'كاش', i.createdByName || '', i.notes || '']));
  return toCSV(rows);
}

// ===================== INVOICES =====================
const IV = { data: [], limit: 200, token: 0 };
function renderInvoicesPage() {
  $('ivBarber').innerHTML = barberOptions($('ivBarber').value, 'كل الحلاقين');
  if ($('ivFrom').value >= WIN_START) { IV.data = D.invoices.filter(i => i.date >= $('ivFrom').value && i.date <= $('ivTo').value); renderInvoicesTable(); }
  else loadInvoices();
}
async function loadInvoices() {
  let f = $('ivFrom').value, t = $('ivTo').value; if (!f || !t) return;
  if (f > t) { [f, t] = [t, f]; $('ivFrom').value = f; $('ivTo').value = t; }
  IV.limit = 200;
  const tk = ++IV.token;
  if (f < WIN_START) $('ivBody').innerHTML = '<tr class="loading-row"><td colspan="9">⏳ جاري التحميل...</td></tr>';
  try { const d = await getInvoices(f, t); if (tk !== IV.token) return; IV.data = d; } catch (e) { onErr(e); return; }
  renderInvoicesTable();
}
function filteredInvoices() {
  const q = norm($('ivSearch').value), qd = digits($('ivSearch').value), bid = $('ivBarber').value, pay = $('ivPay').value;
  return IV.data.filter(i => (!bid || i.barberId === bid) && (!pay || (i.payMethod || 'cash') === pay) &&
    (!q || norm(i.customerName).includes(q) || String(i.number) === q || (qd.length >= 3 && digits(i.customerPhone).includes(qd))))
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
}
function renderInvoicesTable() {
  const L = filteredInvoices();
  $('ivSummary').innerHTML = `${L.length} فاتورة • الإجمالي <b class="c-accent">${money(sum(L, i => i.total))}</b>`;
  $('ivBody').innerHTML = L.length ? L.slice(0, IV.limit).map(inv => `<tr>
    <td class="muted">${esc(inv.number ?? '')}</td>
    <td><b>${esc(inv.customerName || 'عميل نقدي')}</b></td>
    <td>${inv.barberName ? `<span class="chip chip-purple">✂️ ${esc(inv.barberName)}</span>` : '—'}</td>
    <td class="muted small" style="max-width:220px">${esc((inv.items || []).map(x => x.name).join('، '))}</td>
    <td class="c-accent bold">${money(inv.total)}${+inv.discount ? `<div class="sub">خصم ${money(inv.discount)}</div>` : ''}</td>
    <td><span class="chip chip-gray">${esc(PAY[inv.payMethod] || 'كاش')}</span></td>
    <td class="muted">${fmtDate(inv.date)}</td>
    <td class="muted">${fmtTime(inv.createdAt) || '—'}</td>
    <td><div class="btn-row"><button class="btn btn-xs" title="وصل" onclick="showReceipt('${inv.id}')">🖨️</button><button class="btn btn-xs" title="تعديل" onclick="openInvEdit('${inv.id}')">✏️</button><button class="btn btn-xs btn-danger" title="حذف" onclick="delInvoice('${inv.id}')">🗑️</button></div></td>
  </tr>`).join('') : emptyRow(9, '🧾', 'مفيش فواتير في الفترة دي');
  $('ivMore').classList.toggle('hidden', L.length <= IV.limit);
}
function exportInvoices() { const L = filteredInvoices(); if (!L.length) { toast('مفيش فواتير'); return; } downloadFile(`فواتير_${$('ivFrom').value}_${$('ivTo').value}.csv`, invoicesCSV(L)); }

let currentReceipt = null;
function showReceipt(id) { const inv = findInv(id); if (!inv) return; currentReceipt = inv; $('receiptBody').innerHTML = receiptHTML(inv, D.shop); openModal('receiptModal'); }
function printCurrent() { if (currentReceipt) printReceipt(currentReceipt, D.shop); }

// ----- تعديل فاتورة -----
const IE = { inv: null, items: new Map(), orig: new Map() };
function openInvEdit(id) {
  const inv = findInv(id); if (!inv) return;
  IE.inv = inv;
  IE.items = new Map(); IE.orig = new Map();
  (inv.items || []).forEach((it, i) => { const k = it.serviceId || ('x' + i); IE.items.set(k, { ...it }); IE.orig.set(k, { ...it }); });
  fillCustList();
  $('ieTitle').textContent = `✏️ تعديل الفاتورة #${inv.number ?? ''}`;
  const c = inv.customerId ? getC(inv.customerId) : null;
  $('ieCust').value = c ? custLabel(c) : (inv.customerId ? inv.customerName : '');
  $('ieBarber').innerHTML = barberOptions(inv.barberId);
  if (inv.barberId && !getB(inv.barberId)) $('ieBarber').insertAdjacentHTML('beforeend', `<option value="${inv.barberId}" selected>${esc(inv.barberName)} (محذوف)</option>`);
  $('ieDate').value = inv.date; $('ieDisc').value = inv.discount || ''; $('iePay').value = inv.payMethod || 'cash'; $('ieNotes').value = inv.notes || '';
  drawIEChips(); openModal('invModal');
}
function drawIEChips() {
  const keys = new Map();
  actSvc().filter(s => s.active !== false).forEach(s => keys.set(s.id, { name: s.name, price: s.price }));
  IE.orig.forEach((it, k) => { if (!keys.has(k)) keys.set(k, { name: it.name, price: it.price }); });
  $('ieSvcs').innerHTML = [...keys].map(([k, s]) => { const cur = IE.items.get(k) || IE.orig.get(k) || s; return `<div class="svc-chip ${IE.items.has(k) ? 'sel' : ''}" onclick="toggleIE('${k}')">${esc(cur.name)} — ${money(cur.price)}</div>`; }).join('');
  calcIE();
}
function toggleIE(k) {
  if (IE.items.has(k)) IE.items.delete(k);
  else if (IE.orig.has(k)) IE.items.set(k, { ...IE.orig.get(k) });
  else { const s = getS(k); if (s) IE.items.set(k, { serviceId: s.id, name: s.name, price: +s.price || 0 }); }
  drawIEChips();
}
function calcIE() { const sub = sum([...IE.items.values()], i => i.price); const d = Math.min(Math.max(+$('ieDisc').value || 0, 0), sub); $('ieTotal').textContent = money(sub - d); }
async function saveInvEdit() {
  const inv = IE.inv; if (!inv) return;
  const items = [...IE.items.values()];
  if (!items.length) { toast('⚠️ اختار خدمة واحدة على الأقل'); return; }
  const subtotal = round2(sum(items, i => i.price)), discount = round2(Math.min(Math.max(+$('ieDisc').value || 0, 0), subtotal)), total = round2(subtotal - discount);
  const cv = $('ieCust').value.trim();
  let c = custFromLabel(cv), customerId, customerName, customerPhone;
  if (c === undefined) {
    if (inv.customerId && cv === inv.customerName) { customerId = inv.customerId; customerName = inv.customerName; customerPhone = inv.customerPhone || ''; }
    else { toast('⚠️ العميل مش موجود — اختاره من القائمة أو سيب الخانة فاضية لعميل نقدي'); return; }
  } else if (c === null) { customerId = null; customerName = 'عميل نقدي'; customerPhone = ''; }
  else { customerId = c.id; customerName = c.name; customerPhone = c.phone || ''; }
  const barberId = $('ieBarber').value || null, b = barberId ? getB(barberId) : null;
  const date = $('ieDate').value || inv.date;
  const upd = { customerId, customerName, customerPhone, barberId, barberName: b ? b.name : (barberId === inv.barberId ? inv.barberName || '' : ''), items, subtotal, discount, total, date, payMethod: $('iePay').value, notes: $('ieNotes').value.trim(), editedAt: new Date().toISOString(), editedBy: ME.uid };
  const btn = $('ieSave'); setBusy(btn, true);
  try {
    await fs.runTransaction(async tx => {
      const ref = fs.collection('invoices').doc(inv.id);
      const snap = await tx.get(ref); if (!snap.exists) throw new Error('الفاتورة مش موجودة');
      const old = snap.data();
      const oRef = old.customerId ? fs.collection('customers').doc(old.customerId) : null;
      const nRef = customerId ? fs.collection('customers').doc(customerId) : null;
      const oS = oRef ? await tx.get(oRef) : null;
      const nS = nRef && (!oRef || nRef.id !== oRef.id) ? await tx.get(nRef) : null;
      tx.update(ref, upd);
      if (oRef && nRef && oRef.id === nRef.id) {
        if (oS.exists) { const u = { totalSpent: FV.increment(total - (+old.total || 0)) }; if (date > (oS.data().lastVisit || '')) u.lastVisit = date; tx.update(oRef, u); }
      } else {
        if (oS && oS.exists) tx.update(oRef, { visits: FV.increment(-1), totalSpent: FV.increment(-(+old.total || 0)) });
        if (nS && nS.exists) { const u = { visits: FV.increment(1), totalSpent: FV.increment(total) }; if (date > (nS.data().lastVisit || '')) u.lastVisit = date; tx.update(nRef, u); }
      }
    });
    Object.assign(inv, upd); fetchCache.clear();
    closeModal('invModal'); toast('✅ تم تعديل الفاتورة', 'ok');
    if (CUR === 'invoices') loadInvoices(); else scheduleRender();
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
async function delInvoice(id) {
  const inv = findInv(id); if (!inv) return;
  if (!confirm(`حذف الفاتورة #${inv.number} (${money(inv.total)}) نهائياً؟`)) return;
  try {
    await fs.runTransaction(async tx => {
      const ref = fs.collection('invoices').doc(id);
      const snap = await tx.get(ref); if (!snap.exists) return;
      const old = snap.data();
      const cRef = old.customerId ? fs.collection('customers').doc(old.customerId) : null;
      const cS = cRef ? await tx.get(cRef) : null;
      tx.delete(ref);
      if (cS && cS.exists) tx.update(cRef, { visits: FV.increment(-1), totalSpent: FV.increment(-(+old.total || 0)) });
    });
    fetchCache.clear(); IV.data = IV.data.filter(i => i.id !== id);
    toast('🗑️ تم حذف الفاتورة');
    if (CUR === 'invoices') renderInvoicesTable(); else scheduleRender();
  } catch (e) { onErr(e); }
}

// ===================== APPOINTMENTS =====================
let apFilter = 'upcoming';
function setApptFilter(f) { apFilter = f; document.querySelectorAll('#apTabs button').forEach(b => b.classList.toggle('active', b.dataset.f === f)); renderAppts(); }
function renderAppts() {
  updateApptBadge();
  let L = [...D.appts];
  if (apFilter === 'upcoming') L = L.filter(a => a.status === 'pending' && a.date >= TODAY);
  else if (apFilter === 'today') L = L.filter(a => a.date === TODAY);
  else if (apFilter !== 'all') L = L.filter(a => a.status === apFilter);
  const desc = apFilter === 'done' || apFilter === 'cancelled' || apFilter === 'all';
  L.sort((a, b) => (String(a.date + a.time).localeCompare(String(b.date + b.time))) * (desc ? -1 : 1));
  const sm = { pending: ['منتظر', 'chip-amber'], done: ['تم', 'chip-green'], cancelled: ['ملغي', 'chip-red'] };
  $('apBody').innerHTML = L.length ? L.map(a => {
    const [lbl, cls] = sm[a.status] || ['—', 'chip-gray'];
    const late = a.status === 'pending' && a.date < TODAY;
    return `<tr><td><b>${esc(a.customerName || '—')}</b>${a.customerPhone ? `<div class="sub ltr">${esc(a.customerPhone)}</div>` : ''}</td>
      <td>${a.barberName ? `<span class="chip chip-purple">✂️ ${esc(a.barberName)}</span>` : '—'}</td>
      <td>${esc(a.serviceName || '—')}</td>
      <td class="${late ? 'c-red' : 'muted'}">${fmtDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
      <td>${esc(fmt12(a.time))}</td>
      <td><span class="chip ${cls}">${lbl}</span>${a.cancelReason ? `<div class="sub">${esc(a.cancelReason)}</div>` : ''}${a.notes ? `<div class="sub">📝 ${esc(a.notes)}</div>` : ''}</td>
      <td><div class="btn-row">
        <button class="btn btn-xs" onclick="openApptModal('${a.id}')">✏️</button>
        ${a.status === 'pending' ? `<button class="btn btn-xs btn-success" title="تم" onclick="setApptStatus('${a.id}','done')">✓</button><button class="btn btn-xs btn-warn" title="إلغاء" onclick="setApptStatus('${a.id}','cancelled')">✕</button>` : `<button class="btn btn-xs" title="رجوع لمنتظر" onclick="setApptStatus('${a.id}','pending')">↺</button>`}
        ${a.customerPhone ? `<a class="btn btn-xs btn-success" target="_blank" title="واتساب" href="${waLink(a.customerPhone)}?text=${encodeURIComponent(`أهلاً ${a.customerName}، تذكير بموعدك في ${D.shop.name} يوم ${fmtDate(a.date, { weekday: 'long', day: 'numeric', month: 'long' })} الساعة ${fmt12(a.time)} ✂️`)}">💬</a>` : ''}
        <button class="btn btn-xs btn-danger" onclick="delAppt('${a.id}')">🗑️</button>
      </div></td></tr>`;
  }).join('') : emptyRow(7, '📅', 'مفيش مواعيد');
}
function openApptModal(id) {
  const a = id ? D.appts.find(x => x.id === id) : null;
  fillCustList();
  $('apId').value = id || '';
  $('apModalTitle').textContent = a ? 'تعديل الموعد' : 'حجز موعد جديد';
  const c = a && a.customerId ? getC(a.customerId) : null;
  $('apCust').value = c ? custLabel(c) : (a ? a.customerName : '');
  $('apBarber').innerHTML = barberOptions(a ? a.barberId : '', '— أي حلاق —');
  $('apSvc').innerHTML = '<option value="">— اختار الخدمة —</option>' + actSvc().map(s => `<option value="${s.id}" ${a && a.serviceId === s.id ? 'selected' : ''}>${esc(s.name)} — ${money(s.price)}</option>`).join('');
  $('apDate').value = a ? a.date : TODAY; $('apTime').value = a ? a.time : ''; $('apNotes').value = a ? a.notes || '' : '';
  openModal('apptModal');
}
async function saveAppt() {
  const id = $('apId').value, old = id ? D.appts.find(x => x.id === id) : null;
  let c = custFromLabel($('apCust').value);
  if (!c && old && $('apCust').value.trim() === old.customerName) c = { id: old.customerId, name: old.customerName, phone: old.customerPhone };
  if (!c) { toast('⚠️ اختار العميل من القائمة (أو ضيفه الأول من صفحة العملاء)'); return; }
  const serviceId = $('apSvc').value, date = $('apDate').value, time = $('apTime').value, barberId = $('apBarber').value || null;
  if (!serviceId || !date || !time) { toast('⚠️ اختار الخدمة والتاريخ والوقت'); return; }
  if (barberId) {
    const clash = D.appts.find(a => a.id !== id && a.status === 'pending' && a.date === date && a.time === time && a.barberId === barberId);
    if (clash && !confirm(`الحلاق عنده موعد تاني في نفس الوقت مع "${clash.customerName}". تكمّل؟`)) return;
  }
  const s = getS(serviceId), b = barberId ? getB(barberId) : null;
  const data = { customerId: c.id, customerName: c.name, customerPhone: c.phone || '', barberId, barberName: b ? b.name : '', serviceId, serviceName: s ? s.name : '', date, time, notes: $('apNotes').value.trim(), updatedAt: new Date().toISOString() };
  const btn = $('apSave'); setBusy(btn, true);
  try {
    if (id) await fs.collection('appointments').doc(id).update(data);
    else await fs.collection('appointments').add({ ...data, status: 'pending', createdAt: new Date().toISOString(), createdBy: ME.uid });
    closeModal('apptModal'); toast('✅ تم حفظ الموعد', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
function setApptStatus(id, st) { const u = { status: st, updatedAt: new Date().toISOString() }; if (st === 'cancelled') u.cancelReason = 'ألغاه المالك'; if (st === 'pending') u.cancelReason = FV.delete(); fs.collection('appointments').doc(id).update(u).then(() => toast('✅ تم التحديث')).catch(onErr); }
function delAppt(id) { if (!confirm('حذف الموعد نهائياً؟')) return; fs.collection('appointments').doc(id).delete().then(() => toast('🗑️ تم الحذف')).catch(onErr); }

// ===================== CUSTOMERS =====================
const CU = { limit: 100 };
function filteredCustomers() {
  const q = norm($('cuSearch').value), qd = digits($('cuSearch').value), sort = $('cuSort').value;
  let L = actCust();
  if (q) L = L.filter(c => norm(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)));
  const sorters = {
    spent: (a, b) => (b.totalSpent || 0) - (a.totalSpent || 0), visits: (a, b) => (b.visits || 0) - (a.visits || 0),
    last: (a, b) => String(b.lastVisit || '').localeCompare(String(a.lastVisit || '')), new: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')), name: byName
  };
  return L.sort(sorters[sort] || sorters.spent);
}
function renderCustomers() {
  const L = filteredCustomers();
  $('cuCount').textContent = `${L.length} من ${actCust().length} عميل`;
  $('cuBody').innerHTML = L.length ? L.slice(0, CU.limit).map(c => {
    const days = c.lastVisit ? Math.round((parseDate(TODAY) - parseDate(c.lastVisit)) / 864e5) : null;
    return `<tr><td><b>${esc(c.name)}</b>${c.notes ? `<div class="sub">📝 ${esc(c.notes)}</div>` : ''}</td>
    <td><span class="ltr muted">${esc(c.phone || '—')}</span>${c.phone ? `<a class="wa" target="_blank" href="${waLink(c.phone)}" title="واتساب">💬</a>` : ''}</td>
    <td><span class="chip chip-blue">${c.visits || 0} زيارة</span></td>
    <td class="c-accent bold">${money(c.totalSpent || 0)}</td>
    <td class="muted">${c.lastVisit ? fmtDate(c.lastVisit) + (days > 45 ? ` <span class="chip chip-amber">من ${days} يوم</span>` : '') : '—'}</td>
    <td><div class="btn-row"><button class="btn btn-xs" onclick="openHistory('${c.id}')">📜 السجل</button><button class="btn btn-xs" onclick="openCustModal('${c.id}')">✏️</button><button class="btn btn-xs btn-danger" onclick="delCustomer('${c.id}')">🗑️</button></div></td></tr>`;
  }).join('') : emptyRow(6, '🔍', $('cuSearch').value ? 'مفيش عميل بالاسم أو الرقم ده' : 'مفيش عملاء');
  $('cuMore').classList.toggle('hidden', L.length <= CU.limit);
}
function openCustModal(id) {
  const c = id ? getC(id) : null;
  $('cuId').value = id || ''; $('cuModalTitle').textContent = c ? 'تعديل بيانات العميل' : 'إضافة عميل جديد';
  $('cuName').value = c ? c.name : ''; $('cuPhone').value = c ? c.phone || '' : ''; $('cuNotes').value = c ? c.notes || '' : '';
  openModal('custModal');
}
async function saveCustomer() {
  const id = $('cuId').value, name = $('cuName').value.trim(), phone = digits($('cuPhone').value), notes = $('cuNotes').value.trim();
  if (!name) { toast('⚠️ اكتب الاسم'); return; }
  if (phone) {
    const dup = actCust().find(c => c.id !== id && digits(c.phone) === phone);
    if (dup) { toast(`⚠️ الرقم ده متسجل باسم "${dup.name}"`); return; }
    if (!validPhone(phone) && !confirm('الرقم شكله مش رقم موبايل مصري صحيح. تحفظه كده؟')) return;
  }
  const btn = $('cuSave'); setBusy(btn, true);
  try {
    if (id) {
      const old = getC(id);
      await fs.collection('customers').doc(id).update({ name, phone, notes, updatedAt: new Date().toISOString() });
      if (old && (old.name !== name || (old.phone || '') !== phone)) {
        // تحديث الاسم في الفواتير والمواعيد القديمة
        const [iv, ap] = await Promise.all([fs.collection('invoices').where('customerId', '==', id).get(), fs.collection('appointments').where('customerId', '==', id).get()]);
        const refs = [...iv.docs, ...ap.docs].map(d => d.ref);
        for (let i = 0; i < refs.length; i += 400) { const b = fs.batch(); refs.slice(i, i + 400).forEach(r => b.update(r, { customerName: name, customerPhone: phone })); await b.commit(); }
        fetchCache.clear();
      }
    } else {
      await fs.collection('customers').add({ name, phone, notes, visits: 0, totalSpent: 0, lastVisit: null, active: true, deleted: false, createdAt: new Date().toISOString(), createdBy: ME.uid });
    }
    closeModal('custModal'); toast('✅ تم حفظ العميل', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
function delCustomer(id) {
  const c = getC(id); if (!c) return;
  if (!confirm(`حذف العميل "${c.name}"؟\n(فواتيره القديمة هتفضل موجودة باسمه في التقارير)`)) return;
  fs.collection('customers').doc(id).update({ deleted: true, active: false, deletedAt: new Date().toISOString() }).then(() => toast('🗑️ تم الحذف')).catch(onErr);
}
function exportCustomers() {
  const rows = [['الاسم', 'التليفون', 'الزيارات', 'إجمالي الإنفاق', 'آخر زيارة', 'تاريخ التسجيل', 'ملاحظات']];
  filteredCustomers().forEach(c => rows.push([c.name, c.phone, c.visits || 0, c.totalSpent || 0, c.lastVisit || '', c.createdAt ? localDate(c.createdAt) : '', c.notes || '']));
  downloadFile(`العملاء_${TODAY}.csv`, toCSV(rows));
}
const H = { data: [] };
async function openHistory(id) {
  const c = getC(id); if (!c) return;
  $('histTitle').textContent = '📜 سجل ' + c.name;
  $('histKpis').innerHTML = ''; $('histBody').innerHTML = '<tr class="loading-row"><td colspan="6">⏳ جاري التحميل...</td></tr>';
  openModal('histModal');
  try {
    const s = await fs.collection('invoices').where('customerId', '==', id).get();
    H.data = snapList(s).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    const tot = sum(H.data, i => i.total);
    const fav = svcCounts(H.data)[0];
    const bc = barberAgg(H.data).filter(b => b.id).sort((a, b) => b.c - a.c)[0];
    $('histKpis').innerHTML = kpi('🧾', 'الزيارات', H.data.length, '', 'var(--accent)') + kpi('💰', 'الإنفاق', money(tot), H.data.length ? 'متوسط ' + money(tot / H.data.length) : '', 'var(--green)') +
      kpi('💈', 'الخدمة المفضلة', esc(fav ? fav.n : '—'), fav ? fav.c + ' مرة' : '', 'var(--purple)') + kpi('✂️', 'الحلاق المفضل', esc(bc ? bc.n : '—'), bc ? bc.c + ' مرة' : '', 'var(--amber)');
    $('histBody').innerHTML = H.data.length ? H.data.map(i => `<tr><td class="muted">${esc(i.number ?? '')}</td><td>${fmtDate(i.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="small">${esc((i.items || []).map(x => x.name).join('، '))}</td><td>${esc(i.barberName || '—')}</td><td class="c-accent bold">${money(i.total)}</td><td><button class="btn btn-xs" onclick="showReceipt('${i.id}')">🖨️</button></td></tr>`).join('') : emptyRow(6, '🧾', 'مفيش فواتير للعميل ده');
  } catch (e) { onErr(e); }
}

// ===================== SERVICES =====================
function renderServices() {
  const ms = monthFirst(TODAY), monthI = D.invoices.filter(i => i.date >= ms && i.date <= TODAY);
  const cnt = {}; monthI.forEach(inv => (inv.items || []).forEach(it => { if (it.serviceId) cnt[it.serviceId] = (cnt[it.serviceId] || 0) + 1; }));
  const L = actSvc();
  $('svBody').innerHTML = L.length ? L.map(s => `<tr class="${s.active === false ? 'muted' : ''}">
    <td><b>${esc(s.name)}</b></td><td class="c-accent bold">${money(s.price)}</td><td class="muted">${s.duration ? esc(s.duration) + ' د' : '—'}</td>
    <td><span class="chip chip-blue">${cnt[s.id] || 0}×</span></td>
    <td>${s.active === false ? '<span class="chip chip-gray">موقوفة</span>' : '<span class="chip chip-green">شغالة</span>'}</td>
    <td><div class="btn-row"><button class="btn btn-xs" onclick="openSvcModal('${s.id}')">✏️</button><button class="btn btn-xs ${s.active === false ? 'btn-success' : 'btn-warn'}" onclick="toggleSvcActive('${s.id}')">${s.active === false ? 'تشغيل' : 'إيقاف'}</button><button class="btn btn-xs btn-danger" onclick="delSvc('${s.id}')">🗑️</button></div></td></tr>`).join('')
    : emptyRow(6, '💈', 'مفيش خدمات — ضيف أول خدمة');
  const sc = svcCounts(monthI), total = sum(sc, s => s.c);
  $('svDonutNum').textContent = total;
  const r = 55, cx = 75, cy = 75, circ = 2 * Math.PI * r; let off = 0;
  $('svDonut').innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(56,189,248,.08)" stroke-width="18"/>` + sc.slice(0, 8).map((s, i) => {
    const dash = s.c / Math.max(total, 1) * circ; const p = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="18" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-off}"/>`; off += dash; return p;
  }).join('');
  $('svLegend').innerHTML = sc.length ? sc.slice(0, 8).map((s, i) => `<div class="legend-item"><div class="legend-dot" style="background:${COLORS[i % COLORS.length]}"></div><span style="flex:1">${esc(s.n)}</span><span class="muted">${s.c}× • ${Math.round(s.c / total * 100)}%</span></div>`).join('') : emptyBox('🍩', 'مفيش طلبات الشهر ده');
}
function openSvcModal(id) {
  const s = id ? getS(id) : null;
  $('svId').value = id || ''; $('svModalTitle').textContent = s ? 'تعديل الخدمة' : 'إضافة خدمة جديدة';
  $('svName').value = s ? s.name : ''; $('svPrice').value = s ? s.price : ''; $('svDuration').value = s ? s.duration || '' : 30;
  $('svOrder').value = s ? (s.order ?? '') : actSvc().length + 1;
  openModal('svcModal');
}
async function saveService() {
  const id = $('svId').value, name = $('svName').value.trim(), price = parseFloat($('svPrice').value);
  if (!name || isNaN(price) || price < 0) { toast('⚠️ اكتب الاسم والسعر'); return; }
  const data = { name, price: round2(price), duration: parseInt($('svDuration').value) || 0, order: parseInt($('svOrder').value) || 999 };
  const btn = $('svSave'); setBusy(btn, true);
  try {
    if (id) await fs.collection('services').doc(id).update(data);
    else await fs.collection('services').add({ ...data, active: true, deleted: false, createdAt: new Date().toISOString() });
    closeModal('svcModal'); toast('✅ تم حفظ الخدمة', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
function toggleSvcActive(id) { const s = getS(id); if (s) fs.collection('services').doc(id).update({ active: s.active === false }).catch(onErr); }
function delSvc(id) { const s = getS(id); if (!s || !confirm(`حذف خدمة "${s.name}"؟\n(الفواتير القديمة مش هتتأثر)`)) return; fs.collection('services').doc(id).update({ deleted: true, active: false }).then(() => toast('🗑️ تم الحذف')).catch(onErr); }

// ===================== BARBERS =====================
const BM = { inv: [], token: 0 };
async function renderBarbers() {
  const ym = $('bmMonth').value || TODAY.slice(0, 7), from = ym + '-01', to = monthLast(from);
  const tk = ++BM.token;
  try { const d = await getInvoices(from, to); if (tk !== BM.token) return; BM.inv = d; } catch (e) { onErr(e); return; }
  const txs = D.tx.filter(x => x.date >= from && x.date <= to);
  const isCur = ym === TODAY.slice(0, 7);
  const L = actBar();
  $('bmGrid').innerHTML = L.length ? L.map(b => {
    const my = BM.inv.filter(i => i.barberId === b.id), sales = sum(my, i => i.total), cnt = my.length;
    const commission = round2(sales * (+b.commission || 0) / 100);
    const t = txs.filter(x => x.barberId === b.id);
    const adv = sum(t.filter(x => x.type === 'advance'), x => x.amount), bon = sum(t.filter(x => x.type === 'bonus'), x => x.amount), ded = sum(t.filter(x => x.type === 'deduct'), x => x.amount);
    const salary = +b.salary || 0, net = salary + commission + bon - adv - ded;
    const todayI = my.filter(i => i.date === TODAY);
    const target = +b.target || 0, pct = target ? Math.min(Math.round(cnt / target * 100), 100) : 0;
    return `<div class="bcard ${b.active === false ? 'off' : ''}">
      <div class="bc-head"><div style="display:flex;align-items:center;gap:11px"><div class="bc-av">✂️</div><div><h3>${esc(b.name)} ${b.active === false ? '<span class="chip chip-gray">موقوف</span>' : ''}</h3><p class="ltr">${esc(b.phone || 'بدون رقم')}</p></div></div>
        <button class="btn btn-xs" onclick="openBarberDetails('${b.id}')">📋 تفاصيل</button></div>
      <div class="bc-stats">
        <div class="bc-stat blue"><div class="l">🧾 فواتير ${isCur ? 'الشهر' : fmtMonth(ym)}</div><div class="v">${cnt}</div><div class="s">${isCur ? 'النهارده: ' + todayI.length : ''}</div></div>
        <div class="bc-stat green"><div class="l">💰 المبيعات</div><div class="v">${fmtNum(sales)}</div><div class="s">${isCur ? 'النهارده: ' + money(sum(todayI, i => i.total)) : 'جنيه'}</div></div>
      </div>
      ${target ? `<div class="bc-target"><div class="top"><span>🎯 التارجت: ${cnt} / ${target}</span><span>${pct}%</span></div><div class="progress"><div class="${pct >= 100 ? 'p-done' : pct >= 50 ? 'p-mid' : 'p-low'}" style="width:${pct}%"></div></div></div>` : ''}
      <div class="fin-grid">
        <div class="fin"><div class="l">💰 الراتب</div><div class="v c-green">${money(salary)}</div></div>
        <div class="fin"><div class="l">📊 العمولة ${b.commission ? '(' + b.commission + '%)' : ''}</div><div class="v c-accent">${commission ? '+' + money(commission) : '—'}</div></div>
        <div class="fin"><div class="l">🎁 البونص</div><div class="v c-purple">${bon ? '+' + money(bon) : '—'}</div></div>
        <div class="fin"><div class="l">💵 السلف</div><div class="v c-amber">${adv ? '-' + money(adv) : '—'}</div></div>
        <div class="fin" style="grid-column:1/-1"><div class="l">✂️ الخصومات</div><div class="v c-red">${ded ? '-' + money(ded) : '—'}</div></div>
      </div>
      <div class="net-row"><span class="l">الصافي المستحق</span><span class="v ${net >= 0 ? 'c-accent' : 'c-red'}">${money(net)}</span></div>
      <div class="bc-actions">
        <button class="btn btn-sm btn-warn" onclick="openTxModal('${b.id}','advance')">💵 سلفة</button>
        <button class="btn btn-sm btn-purple" onclick="openTxModal('${b.id}','bonus')">🎁 بونص</button>
        <button class="btn btn-sm btn-danger" onclick="openTxModal('${b.id}','deduct')">✂️ خصم</button>
        <button class="btn btn-sm" onclick="openBarberModal('${b.id}')">✏️ تعديل</button>
        <button class="btn btn-sm ${b.active === false ? 'btn-success' : 'btn-ghost'}" onclick="toggleBarberActive('${b.id}')">${b.active === false ? '▶ تشغيل' : '⏸ إيقاف'}</button>
        <button class="btn btn-sm btn-danger" onclick="delBarber('${b.id}')">🗑️ حذف</button>
      </div></div>`;
  }).join('') : `<div class="card" style="grid-column:1/-1">${emptyBox('💇', 'مفيش حلاقين — دوس "+ إضافة حلاق"')}</div>`;
  const tl = [...txs].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  const tm = { advance: ['💵 سلفة', 'chip-amber', '-'], bonus: ['🎁 بونص', 'chip-purple', '+'], deduct: ['✂️ خصم', 'chip-red', '-'] };
  $('bmTxCount').textContent = tl.length + ' معاملة';
  $('bmTxBody').innerHTML = tl.length ? tl.map(x => { const [l, c, sg] = tm[x.type] || ['—', 'chip-gray', '']; const b = getB(x.barberId); return `<tr><td><b>${esc(b ? b.name : x.barberName || '—')}</b></td><td><span class="chip ${c}">${l}</span></td><td class="bold ${sg === '+' ? 'c-green' : 'c-red'}">${sg}${money(x.amount)}</td><td class="muted small">${esc(x.note || '—')}</td><td class="muted">${fmtDate(x.date)}</td><td><button class="btn btn-xs btn-danger" onclick="delTx('${x.id}')">🗑️</button></td></tr>`; }).join('') : emptyRow(6, '📋', 'مفيش معاملات في الشهر ده');
}
function openBarberModal(id) {
  const b = id ? getB(id) : null;
  $('brId').value = id || ''; $('brModalTitle').textContent = b ? 'تعديل بيانات الحلاق' : 'إضافة حلاق جديد';
  $('brName').value = b ? b.name : ''; $('brPhone').value = b ? b.phone || '' : '';
  $('brSalary').value = b ? b.salary || 0 : 0; $('brCommission').value = b ? b.commission || 0 : 0; $('brTarget').value = b ? b.target || 0 : 0;
  $('brActive').checked = b ? b.active !== false : true;
  openModal('barberModal');
}
async function saveBarber() {
  const id = $('brId').value, name = $('brName').value.trim();
  if (!name) { toast('⚠️ اكتب الاسم'); return; }
  const data = { name, phone: digits($('brPhone').value), salary: +$('brSalary').value || 0, commission: Math.min(Math.max(+$('brCommission').value || 0, 0), 100), target: parseInt($('brTarget').value) || 0, active: $('brActive').checked };
  const btn = $('brSave'); setBusy(btn, true);
  try {
    if (id) await fs.collection('barbers').doc(id).update(data);
    else await fs.collection('barbers').add({ ...data, deleted: false, createdAt: new Date().toISOString() });
    closeModal('barberModal'); toast('✅ تم حفظ الحلاق', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
function toggleBarberActive(id) { const b = getB(id); if (b) fs.collection('barbers').doc(id).update({ active: b.active === false }).catch(onErr); }
function delBarber(id) { const b = getB(id); if (!b || !confirm(`حذف الحلاق "${b.name}"؟\n(فواتيره ومعاملاته القديمة هتفضل في التقارير)`)) return; fs.collection('barbers').doc(id).update({ deleted: true, active: false }).then(() => toast('🗑️ تم الحذف')).catch(onErr); }
let txType = 'advance';
function setTxType(t) { txType = t; document.querySelectorAll('#txSeg button').forEach(b => b.classList.toggle('active', b.dataset.t === t)); }
function openTxModal(bid, type) {
  const b = getB(bid); $('txBarber').value = bid; $('txTitle').textContent = 'معاملة مالية — ' + (b ? b.name : '');
  $('txAmount').value = ''; $('txNote').value = '';
  const ym = $('bmMonth').value; $('txDate').value = ym === TODAY.slice(0, 7) ? TODAY : monthLast(ym + '-01');
  setTxType(type || 'advance'); openModal('txModal');
}
async function saveTx() {
  const barberId = $('txBarber').value, amount = parseFloat($('txAmount').value);
  if (!barberId || isNaN(amount) || amount <= 0) { toast('⚠️ اكتب مبلغ صحيح'); return; }
  const b = getB(barberId), btn = $('txSave'); setBusy(btn, true);
  try {
    await fs.collection('barberTx').add({ barberId, barberName: b ? b.name : '', type: txType, amount: round2(amount), note: $('txNote').value.trim(), date: $('txDate').value || TODAY, createdAt: new Date().toISOString(), createdBy: ME.uid });
    closeModal('txModal'); toast('✅ تم التسجيل', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
function delTx(id) { if (!confirm('حذف المعاملة دي؟')) return; fs.collection('barberTx').doc(id).delete().then(() => toast('🗑️ تم الحذف')).catch(onErr); }
let bdBarber = null;
function openBarberDetails(id) { bdBarber = id; const b = getB(id); $('bdTitle').textContent = `📋 فواتير ${b ? b.name : ''} — ${fmtMonth($('bmMonth').value)}`; $('bdDay').value = ''; renderBarberDetails(); openModal('bdModal'); }
function renderBarberDetails() {
  const day = $('bdDay').value;
  const L = BM.inv.filter(i => i.barberId === bdBarber && (!day || i.date === day)).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  $('bdSum').innerHTML = `${L.length} فاتورة • <b class="c-accent">${money(sum(L, i => i.total))}</b>`;
  $('bdBody').innerHTML = L.length ? L.map(i => `<tr><td class="muted">${esc(i.number ?? '')}</td><td>${fmtDate(i.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td class="muted">${fmtTime(i.createdAt)}</td><td>${esc(i.customerName)}</td><td class="small muted">${esc((i.items || []).map(x => x.name).join('، '))}</td><td class="c-accent bold">${money(i.total)}</td></tr>`).join('') : emptyRow(6, '🧾', 'مفيش فواتير');
}

// ===================== EXPENSES =====================
function renderExpenses() {
  const ym = $('exMonth').value || TODAY.slice(0, 7), from = ym + '-01', to = monthLast(from);
  const L = D.expenses.filter(e => e.date >= from && e.date <= to).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tot = sum(L, e => e.amount);
  const prevF = monthFirst(from, -1), prevT = monthLast(from, -1), prev = sum(D.expenses.filter(e => e.date >= prevF && e.date <= prevT), e => e.amount);
  const cats = {}; L.forEach(e => { cats[e.category] = (cats[e.category] || 0) + (+e.amount || 0); });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  $('exKpis').innerHTML = kpi('💸', 'مصروفات ' + fmtMonth(ym), money(tot), `${L.length} بند`, 'var(--red)') +
    kpi('📅', 'الشهر اللي قبله', money(prev), prev ? (tot >= prev ? '▲ ' : '▼ ') + money(Math.abs(tot - prev)) : '', 'var(--amber)') +
    kpi('🏷️', 'أكبر بند', topCat ? esc(topCat[0]) : '—', topCat ? money(topCat[1]) : '', 'var(--purple)');
  $('exCats').innerHTML = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip chip-gray">${esc(k)}: ${money(v)}</span>`).join(' ');
  $('exBody').innerHTML = L.length ? L.map(e => `<tr><td class="muted">${fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td><span class="chip chip-purple">${esc(e.category || 'أخرى')}</span></td><td class="c-red bold">${money(e.amount)}</td><td class="muted small">${esc(e.note || '—')}</td><td><div class="btn-row"><button class="btn btn-xs" onclick="openExpModal('${e.id}')">✏️</button><button class="btn btn-xs btn-danger" onclick="delExpense('${e.id}')">🗑️</button></div></td></tr>`).join('') : emptyRow(5, '💸', 'مفيش مصروفات في الشهر ده');
}
function openExpModal(id) {
  const e = id ? D.expenses.find(x => x.id === id) : null;
  $('exId').value = id || ''; $('exModalTitle').textContent = e ? 'تعديل مصروف' : 'إضافة مصروف';
  $('exCat').innerHTML = EXP_CATS.map(c => `<option ${e && e.category === c ? 'selected' : ''}>${c}</option>`).join('');
  $('exAmount').value = e ? e.amount : ''; $('exNote').value = e ? e.note || '' : '';
  const ym = $('exMonth').value; $('exDate').value = e ? e.date : (ym === TODAY.slice(0, 7) ? TODAY : ym + '-01');
  openModal('expModal');
}
async function saveExpense() {
  const id = $('exId').value, amount = parseFloat($('exAmount').value);
  if (isNaN(amount) || amount <= 0) { toast('⚠️ اكتب مبلغ صحيح'); return; }
  const data = { category: $('exCat').value, amount: round2(amount), note: $('exNote').value.trim(), date: $('exDate').value || TODAY };
  const btn = $('exSave'); setBusy(btn, true);
  try {
    if (id) await fs.collection('expenses').doc(id).update(data);
    else await fs.collection('expenses').add({ ...data, createdAt: new Date().toISOString(), createdBy: ME.uid });
    closeModal('expModal'); toast('✅ تم الحفظ', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
function delExpense(id) { if (!confirm('حذف المصروف ده؟')) return; fs.collection('expenses').doc(id).delete().then(() => toast('🗑️ تم الحذف')).catch(onErr); }

// ===================== STAFF =====================
function renderStaff() {
  const L = [...D.staff].sort((a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) || byName(a, b));
  $('stBody').innerHTML = L.length ? L.map(s => {
    const me = s.id === ME.uid;
    return `<tr><td><b>${esc(s.name || '—')}</b>${me ? ' <span class="chip chip-blue">أنت</span>' : ''}</td><td class="ltr muted">${esc(s.email || '')}</td>
      <td><span class="chip ${s.role === 'owner' ? 'chip-purple' : 'chip-blue'}">${ROLE[s.role] || s.role}</span></td>
      <td>${s.active === false ? '<span class="chip chip-red">موقوف</span>' : '<span class="chip chip-green">فعّال</span>'}</td>
      <td>${me ? '<span class="sub">—</span>' : `<div class="btn-row">
        <button class="btn btn-xs ${s.active === false ? 'btn-success' : 'btn-warn'}" onclick="toggleStaff('${s.id}')">${s.active === false ? 'تفعيل' : 'إيقاف'}</button>
        <button class="btn btn-xs" onclick="switchRole('${s.id}')">${s.role === 'owner' ? 'خليه كاشير' : 'خليه مالك'}</button>
        <button class="btn btn-xs" onclick="resetStaffPass('${s.id}')">🔑 لينك باسورد</button></div>`}</td></tr>`;
  }).join('') : emptyRow(5, '🔐', 'مفيش مستخدمين');
}
function openStaffModal() { ['sfName', 'sfEmail', 'sfPass'].forEach(i => $(i).value = ''); $('sfRole').value = 'cashier'; openModal('staffModal'); }
async function saveStaff() {
  const name = $('sfName').value.trim(), email = $('sfEmail').value.trim(), pass = $('sfPass').value, role = $('sfRole').value;
  if (!name || !email) { toast('⚠️ اكتب الاسم والإيميل'); return; }
  if (pass.length < 6) { toast('⚠️ الباسورد ٦ حروف على الأقل'); return; }
  const btn = $('sfSave'); setBusy(btn, true, 'جاري الإنشاء...');
  // تطبيق ثانوي عشان إنشاء الحساب ميعملش تسجيل خروج للمالك
  const sec = firebase.apps.find(a => a.name === 'secondary') || firebase.initializeApp(firebaseConfig, 'secondary');
  try {
    const cred = await sec.auth().createUserWithEmailAndPassword(email, pass);
    await fs.collection('staff').doc(cred.user.uid).set({ name, email: cred.user.email, role, active: true, createdAt: new Date().toISOString(), createdBy: ME.uid });
    await sec.auth().signOut();
    closeModal('staffModal'); toast('✅ تم إنشاء الحساب — يقدر يدخل دلوقتي', 'ok');
  } catch (e) { toast('⚠️ ' + (e.code === 'auth/email-already-in-use' ? 'الإيميل ده مستخدم قبل كده — لو كان موظف موقوف فعّله من الجدول' : fsErr(e)), 'err'); }
  setBusy(btn, false);
}
function toggleStaff(id) { const s = D.staff.find(x => x.id === id); if (!s) return; if (s.active !== false && !confirm(`إيقاف حساب "${s.name}"؟ مش هيقدر يدخل تاني لحد ما تفعّله.`)) return; fs.collection('staff').doc(id).update({ active: s.active === false }).catch(onErr); }
function switchRole(id) { const s = D.staff.find(x => x.id === id); if (!s) return; const nr = s.role === 'owner' ? 'cashier' : 'owner'; if (!confirm(`تغيير صلاحية "${s.name}" لـ ${ROLE[nr]}؟`)) return; fs.collection('staff').doc(id).update({ role: nr }).catch(onErr); }
function resetStaffPass(id) { const s = D.staff.find(x => x.id === id); if (!s || !s.email) return; auth.sendPasswordResetEmail(s.email).then(() => toast('✅ اتبعت لينك تغيير الباسورد على ' + s.email)).catch(onErr); }

// ===================== SETTINGS =====================
function renderSettings() {
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#pg-settings')) return;
  $('shName').value = D.shop.name || ''; $('shPhone').value = D.shop.phone || ''; $('shAddress').value = D.shop.address || ''; $('shFooter').value = D.shop.footer || '';
  renderMigStatus();
}
function renderMigStatus() {
  const m = D.migration, el = $('migStatus'); if (!el) return;
  el.innerHTML = m === undefined ? '...' : !m ? '<span class="c-amber">لسه متعملش</span> <button class="btn btn-xs" onclick="migChecked=false;checkMigration()">ابدأ الترحيل</button>' : m.skipped ? '<span class="c-green">مفيش بيانات قديمة — بداية جديدة</span>' : `<span class="c-green">✓ تم ${m.at ? 'يوم ' + fmtDate(localDate(m.at), { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>`;
}
async function saveShop() {
  const name = $('shName').value.trim(); if (!name) { toast('⚠️ اكتب اسم المحل'); return; }
  const btn = $('shSave'); setBusy(btn, true);
  try { await fs.collection('settings').doc('shop').set({ name, phone: $('shPhone').value.trim(), address: $('shAddress').value.trim(), footer: $('shFooter').value.trim() }, { merge: true }); toast('✅ تم الحفظ', 'ok'); }
  catch (e) { onErr(e); }
  setBusy(btn, false);
}
async function changePassword() {
  const o = $('pwOld').value, n = $('pwNew').value, n2 = $('pwNew2').value;
  if (!o) { toast('⚠️ اكتب الباسورد الحالي'); return; }
  if (n.length < 6) { toast('⚠️ الباسورد الجديد ٦ حروف على الأقل'); return; }
  if (n !== n2) { toast('⚠️ الباسورد الجديد مش متطابق'); return; }
  const btn = $('pwSave'); setBusy(btn, true);
  try {
    await auth.currentUser.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(ME.email, o));
    await auth.currentUser.updatePassword(n);
    ['pwOld', 'pwNew', 'pwNew2'].forEach(i => $(i).value = '');
    toast('✅ تم تغيير الباسورد', 'ok');
  } catch (e) { toast('⚠️ ' + (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(e.code) ? 'الباسورد الحالي غلط' : authErr(e)), 'err'); }
  setBusy(btn, false);
}
async function downloadBackup() {
  const btn = $('bkBtn'); setBusy(btn, true, 'جاري التجهيز...');
  try {
    const cols = ['customers', 'services', 'barbers', 'invoices', 'appointments', 'barberTx', 'expenses', 'settings', 'meta'];
    const out = { exportedAt: new Date().toISOString(), project: firebaseConfig.projectId };
    for (const c of cols) out[c] = snapList(await fs.collection(c).get());
    downloadFile(`backup_${D.shop.name}_${TODAY}.json`, JSON.stringify(out, null, 1), 'application/json');
    toast('✅ تم تنزيل النسخة الاحتياطية', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}
async function commitOps(ops, onProgress) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = fs.batch();
    ops.slice(i, i + 400).forEach(([col, id, data, merge]) => merge ? b.set(fs.collection(col).doc(id), data, { merge: true }) : b.set(fs.collection(col).doc(id), data));
    await b.commit();
    if (onProgress) onProgress(Math.min(i + 400, ops.length), ops.length);
  }
}
async function recalcCustomers() {
  if (!confirm('هيتم إعادة حساب عدد الزيارات والإنفاق وآخر زيارة لكل العملاء من الفواتير. نكمّل؟')) return;
  const btn = $('recalcBtn'); setBusy(btn, true, 'جاري الحساب...');
  try {
    const all = snapList(await fs.collection('invoices').get());
    const st = {};
    all.forEach(i => { if (!i.customerId) return; const s = st[i.customerId] = st[i.customerId] || { visits: 0, totalSpent: 0, lastVisit: null }; s.visits++; s.totalSpent += +i.total || 0; if (!s.lastVisit || i.date > s.lastVisit) s.lastVisit = i.date; });
    const ops = D.customers.map(c => ['customers', c.id, { visits: (st[c.id] || {}).visits || 0, totalSpent: round2((st[c.id] || {}).totalSpent || 0), lastVisit: (st[c.id] || {}).lastVisit || null }, true]);
    await commitOps(ops);
    toast(`✅ تم تحديث ${ops.length} عميل`, 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}

// ===================== MIGRATION (من salon/data القديم) =====================
let migChecked = false;
const MIG = { old: null };
async function checkMigration() {
  if (migChecked) return; migChecked = true;
  try {
    const snap = await fs.collection('salon').doc('data').get({ source: 'server' });
    if (!snap.exists || !snap.data()) {
      await ensureDefaults();
      await fs.collection('meta').doc('migration').set({ done: true, skipped: true, at: new Date().toISOString(), by: ME.uid });
      return;
    }
    MIG.old = snap.data();
    const o = MIG.old;
    $('migCounts').innerHTML = [['👥 عملاء', o.customers], ['🧾 فواتير', o.invoices], ['💈 خدمات', o.services], ['✂️ حلاقين', o.barbers], ['📅 مواعيد', o.appointments], ['💵 معاملات الحلاقين', o.barberTx]]
      .map(([l, a]) => `<div><span>${l}</span><b>${(a || []).length}</b></div>`).join('');
    openModal('migModal');
  } catch (e) { migChecked = false; onErr(e); }
}
async function ensureDefaults() {
  const ops = [];
  const sv = await fs.collection('services').limit(1).get();
  if (sv.empty) [['قص شعر', 80, 30], ['حلاقة لحية', 60, 20], ['قص وحلاقة', 130, 45], ['صبغة شعر', 200, 60], ['تسريح وتشكيل', 100, 40]]
    .forEach(([name, price, duration], i) => ops.push(['services', fs.collection('services').doc().id, { name, price, duration, order: i + 1, active: true, deleted: false, createdAt: new Date().toISOString() }]));
  const sh = await fs.collection('settings').doc('shop').get();
  if (!sh.exists) ops.push(['settings', 'shop', { ...DEFAULT_SHOP }]);
  if (ops.length) await commitOps(ops);
}
async function runMigration() {
  const o = MIG.old; if (!o) return;
  const btn = $('migBtn'); setBusy(btn, true, 'جاري الترحيل...');
  const prog = (a, b) => $('migProgress').textContent = `تم ${a} من ${b} عملية...`;
  try {
    const oid = x => 'old_' + x, now = new Date().toISOString(), ops = [];
    const S = {}, B = {}, C = {};
    (o.services || []).forEach((s, i) => { S[s.id] = s; ops.push(['services', oid(s.id), { name: String(s.name || ''), price: +s.price || 0, duration: +s.duration || 0, order: i + 1, active: true, deleted: false, legacyId: s.id, createdAt: now }]); });
    (o.barbers || []).forEach(b => { B[b.id] = b; ops.push(['barbers', oid(b.id), { name: String(b.name || ''), phone: String(b.phone || ''), salary: +b.salary || 0, commission: 0, target: +b.target || 0, active: true, deleted: false, legacyId: b.id, createdAt: now }]); });
    (o.customers || []).forEach(c => { C[c.id] = c; });
    const stats = {}; let maxNo = 0;
    (o.invoices || []).forEach(inv => {
      const date = inv.createdAt ? localDate(inv.createdAt) : String(inv.date || '');
      const c = C[inv.customerId], b = B[inv.barberId];
      const items = (inv.serviceIds || []).map(sid => S[sid] ? { serviceId: oid(sid), name: String(S[sid].name), price: +S[sid].price || 0 } : { serviceId: null, name: 'خدمة محذوفة', price: 0 });
      const total = +inv.total || 0;
      maxNo = Math.max(maxNo, +inv.id || 0);
      if (c) { const s = stats[c.id] = stats[c.id] || { visits: 0, totalSpent: 0, lastVisit: null }; s.visits++; s.totalSpent += total; if (!s.lastVisit || date > s.lastVisit) s.lastVisit = date; }
      ops.push(['invoices', oid(inv.id), {
        number: +inv.id || 0, legacyId: inv.id,
        customerId: c ? oid(c.id) : null, customerName: c ? String(c.name) : (inv.customerId ? 'عميل محذوف' : 'عميل نقدي'), customerPhone: c ? String(c.phone || '') : '',
        barberId: b ? oid(b.id) : null, barberName: b ? String(b.name) : '',
        items, subtotal: total, discount: 0, total, payMethod: 'cash', notes: String(inv.notes || ''),
        date, createdAt: inv.createdAt || (date + 'T12:00:00'), createdBy: null, createdByName: '', migrated: true
      }]);
    });
    (o.customers || []).forEach(c => {
      const s = stats[c.id] || { visits: 0, totalSpent: 0, lastVisit: null };
      ops.push(['customers', oid(c.id), { name: String(c.name || ''), phone: digits(c.phone), notes: String(c.notes || ''), createdAt: c.createdAt || now, active: true, deleted: false, visits: s.visits, totalSpent: round2(s.totalSpent), lastVisit: s.lastVisit, legacyId: c.id }]);
    });
    (o.appointments || []).forEach(a => {
      const c = C[a.customerId], b = B[a.barberId], s = S[a.serviceId];
      ops.push(['appointments', oid(a.id), { customerId: c ? oid(c.id) : null, customerName: c ? String(c.name) : '—', customerPhone: c ? String(c.phone || '') : '', barberId: b ? oid(b.id) : null, barberName: b ? String(b.name) : '', serviceId: s ? oid(s.id) : null, serviceName: s ? String(s.name) : '', date: String(a.date || ''), time: String(a.time || ''), notes: String(a.notes || ''), status: a.status || 'pending', createdAt: now, migrated: true }]);
    });
    (o.barberTx || []).forEach(t => {
      const b = B[t.barberId];
      ops.push(['barberTx', oid(t.id), { barberId: b ? oid(b.id) : null, barberName: b ? String(b.name) : '', type: t.type, amount: +t.amount || 0, note: String(t.note || ''), date: t.createdAt ? localDate(t.createdAt) : String(t.date || ''), createdAt: t.createdAt || now, migrated: true }]);
    });
    const cnt = await fs.collection('meta').doc('counters').get();
    ops.push(['meta', 'counters', { invoiceNo: Math.max(maxNo, (cnt.exists && +cnt.data().invoiceNo) || 0) }, true]);
    const sh = await fs.collection('settings').doc('shop').get();
    if (!sh.exists) ops.push(['settings', 'shop', { ...DEFAULT_SHOP }]);
    if (!(o.services || []).length) { const sv = await fs.collection('services').limit(1).get(); if (sv.empty) await ensureDefaults(); }
    await commitOps(ops, prog);
    await fs.collection('meta').doc('migration').set({
      done: true, at: new Date().toISOString(), by: ME.uid, source: 'salon/data',
      counts: { customers: (o.customers || []).length, invoices: (o.invoices || []).length, services: (o.services || []).length, barbers: (o.barbers || []).length, appointments: (o.appointments || []).length, barberTx: (o.barberTx || []).length }
    });
    closeModal('migModal');
    toast('🎉 تم ترحيل كل البيانات بنجاح', 'ok');
  } catch (e) { onErr(e); $('migProgress').textContent = 'حصل خطأ — تقدر تجرّب تاني (مفيش حاجة هتتكرر)'; }
  setBusy(btn, false);
}
