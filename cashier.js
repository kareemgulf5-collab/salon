/* =========================================================
   cashier.js — نقطة البيع
   ========================================================= */
const S = { customers: [], services: [], barbers: [], todayInv: [], appts: [], shop: { ...DEFAULT_SHOP } };
const sel = { cust: null, walkin: false, barberId: null, items: [], discount: 0, discType: 'amount', pay: 'cash', apptId: null };
let curDay = localDate(), unsubDay = [], busy = false, migrated = false, currentReceipt = null;
const dd = { list: [], idx: 0 };
let autoPrint = false;
try { autoPrint = localStorage.getItem('autoPrint') === '1'; } catch (e) {}

const onErr = e => { console.error(e); toast('⚠️ ' + fsErr(e), 'err'); };
const getSvc = id => S.services.find(s => s.id === id);
const getBar = id => S.barbers.find(b => b.id === id);
const getCust = id => S.customers.find(c => c.id === id);

// ===== INIT =====
requireAuth(['owner', 'cashier'], me => {
  $('meName').textContent = me.name || me.email;
  $('meRole').textContent = ROLE[me.role] || '';
  if (me.role === 'owner') $('dashBtn').classList.remove('hidden');
  $('autoPrint').checked = autoPrint;

  fs.collection('meta').doc('migration').onSnapshot(s => {
    migrated = s.exists;
    $('blockMsg').classList.toggle('hidden', migrated);
    updateSummary();
  }, onErr);

  fs.collection('settings').doc('shop').onSnapshot(s => {
    S.shop = { ...DEFAULT_SHOP, ...(s.data() || {}) };
    $('shopName').textContent = S.shop.name;
    document.title = 'الكاشير — ' + S.shop.name;
  }, onErr);

  fs.collection('customers').onSnapshot(s => {
    S.customers = snapList(s).filter(c => !c.deleted);
    if (sel.cust) { const c = getCust(sel.cust.id); if (c) sel.cust = c; }
    if (document.activeElement === $('custSearch') && $('custSearch').value.trim()) onCustSearch();
    renderCustBadge(); updateSummary();
  }, onErr);

  fs.collection('services').onSnapshot(s => {
    S.services = snapList(s).filter(x => !x.deleted && x.active !== false).sort(svcSort);
    sel.items = sel.items.filter(id => getSvc(id));
    renderServices(); updateSummary();
  }, onErr);

  fs.collection('barbers').onSnapshot(s => {
    S.barbers = snapList(s).filter(x => !x.deleted && x.active !== false).sort(byName);
    if (sel.barberId && !getBar(sel.barberId)) sel.barberId = null;
    renderBarbers(); updateSummary();
  }, onErr);

  subscribeDay();
  setInterval(() => { const d = localDate(); if (d !== curDay) { curDay = d; subscribeDay(); } }, 30000);
  tick(); setInterval(tick, 1000);
  renderCustBadge(); updateSummary();
  hideLoader();
});

function subscribeDay() {
  unsubDay.forEach(u => u()); unsubDay = [];
  unsubDay.push(fs.collection('invoices').where('date', '==', curDay).onSnapshot(s => {
    S.todayInv = snapList(s).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    renderToday();
  }, onErr));
  unsubDay.push(fs.collection('appointments').where('date', '==', curDay).onSnapshot(s => {
    S.appts = snapList(s).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    if (sel.apptId && !S.appts.some(a => a.id === sel.apptId && a.status === 'pending')) sel.apptId = null;
    renderAppts(); updateSummary();
  }, onErr));
}

function tick() { $('clock').textContent = new Date().toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' }); }

// ===== CUSTOMER SEARCH =====
function onCustSearch() {
  const raw = $('custSearch').value;
  $('custClear').classList.toggle('visible', raw.length > 0);
  if (sel.cust && raw !== sel.cust.name) { sel.cust = null; renderCustBadge(); updateSummary(); }
  const q = norm(raw), qd = digits(raw);
  if (!q) { closeDD(); return; }
  dd.list = S.customers.filter(c => norm(c.name).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)))
    .sort((a, b) => {
      const as = norm(a.name).startsWith(q) ? 0 : 1, bs = norm(b.name).startsWith(q) ? 0 : 1;
      return as - bs || (b.visits || 0) - (a.visits || 0);
    }).slice(0, 30);
  dd.idx = 0; renderDD();
}
function renderDD() {
  const box = $('custDD');
  const q = $('custSearch').value.trim();
  box.innerHTML = dd.list.length
    ? dd.list.map((c, i) => `<div class="dd-opt ${i === dd.idx ? 'active' : ''}" onmousedown="event.preventDefault();pickCustomer('${c.id}')">
        <div><div class="dd-name">${esc(c.name)}</div><div class="dd-sub">${c.visits || 0} زيارة${c.lastVisit ? ' • آخر مرة ' + fmtDate(c.lastVisit) : ''}</div></div>
        <span class="dd-phone">${esc(c.phone || '')}</span></div>`).join('')
    : `<div class="dd-empty">🔍 مفيش عميل بالاسم أو الرقم ده<button class="btn btn-sm" onmousedown="event.preventDefault();openNewCust()">+ إضافة "${esc(q)}" كعميل جديد</button></div>`;
  box.classList.add('open');
  const a = box.querySelector('.dd-opt.active'); if (a) a.scrollIntoView({ block: 'nearest' });
}
function closeDD() { $('custDD').classList.remove('open'); }
function custKey(e) {
  const open = $('custDD').classList.contains('open');
  if (e.key === 'ArrowDown' && open && dd.list.length) { e.preventDefault(); dd.idx = (dd.idx + 1) % dd.list.length; renderDD(); }
  else if (e.key === 'ArrowUp' && open && dd.list.length) { e.preventDefault(); dd.idx = (dd.idx - 1 + dd.list.length) % dd.list.length; renderDD(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (open && dd.list[dd.idx]) pickCustomer(dd.list[dd.idx].id); else if (open && $('custSearch').value.trim()) openNewCust(); }
  else if (e.key === 'Escape') closeDD();
}
document.addEventListener('mousedown', e => { if (!e.target.closest('.search-wrap') && !e.target.closest('#custDD')) closeDD(); });

function pickCustomer(id) {
  const c = getCust(id); if (!c) return;
  sel.cust = c; sel.walkin = false;
  $('custSearch').value = c.name; $('custClear').classList.add('visible');
  closeDD(); renderCustBadge(); updateSummary();
}
function setWalkin() {
  sel.cust = null; sel.walkin = true;
  $('custSearch').value = ''; $('custClear').classList.remove('visible');
  closeDD(); renderCustBadge(); updateSummary();
}
function clearCust() {
  sel.cust = null; sel.walkin = false;
  $('custSearch').value = ''; $('custClear').classList.remove('visible');
  closeDD(); renderCustBadge(); updateSummary();
}
function renderCustBadge() {
  const b = $('custBadge');
  if (sel.cust) {
    const c = sel.cust;
    b.innerHTML = `<div><h4>${esc(c.name)}</h4><p><span class="ltr">${esc(c.phone || 'بدون رقم')}</span> • ${c.visits || 0} زيارة • إجمالي ${money(c.totalSpent || 0)}${c.lastVisit ? ' • آخر مرة ' + fmtDate(c.lastVisit) : ''}</p>${c.notes ? `<div class="note">📝 ${esc(c.notes)}</div>` : ''}</div><button class="x-btn" onclick="clearCust()">✕</button>`;
    b.classList.remove('hidden');
  } else if (sel.walkin) {
    b.innerHTML = `<div><h4>🚶 عميل نقدي</h4><p>فاتورة من غير تسجيل بيانات عميل</p></div><button class="x-btn" onclick="clearCust()">✕</button>`;
    b.classList.remove('hidden');
  } else b.classList.add('hidden');
}

// ===== NEW CUSTOMER =====
function openNewCust() {
  closeDD();
  const q = $('custSearch').value.trim();
  const isNum = q && digits(q).length >= 3 && digits(q).length === q.replace(/\s/g, '').length;
  $('ncName').value = isNum ? '' : q;
  $('ncPhone').value = isNum ? digits(q) : '';
  $('ncNotes').value = '';
  openModal('newCustModal');
}
async function saveNewCust() {
  const name = $('ncName').value.trim(), phone = digits($('ncPhone').value), notes = $('ncNotes').value.trim();
  if (!name) { toast('⚠️ اكتب اسم العميل'); $('ncName').focus(); return; }
  if (phone) {
    const ex = S.customers.find(c => digits(c.phone) === phone);
    if (ex) {
      if (confirm(`الرقم ده متسجل باسم "${ex.name}". تختاره بدل ما تعمل عميل جديد؟`)) { closeModal('newCustModal'); pickCustomer(ex.id); }
      return;
    }
    if (!validPhone(phone) && !confirm('الرقم شكله مش رقم موبايل مصري (١١ رقم يبدأ بـ 01). تحفظه كده؟')) return;
  }
  const ref = fs.collection('customers').doc();
  const data = { name, phone, notes, visits: 0, totalSpent: 0, lastVisit: null, active: true, deleted: false, createdAt: new Date().toISOString(), createdBy: ME.uid };
  ref.set(data).catch(onErr);   // بيتحفظ محلياً فوراً ويتزامن لما النت يرجع
  closeModal('newCustModal');
  sel.cust = { id: ref.id, ...data }; sel.walkin = false;
  $('custSearch').value = name; $('custClear').classList.add('visible');
  renderCustBadge(); updateSummary();
  toast('✅ تم إضافة العميل', 'ok');
}

// ===== BARBERS =====
function renderBarbers() {
  const el = $('barberChips');
  if (!S.barbers.length) { el.innerHTML = '<span class="sub">مفيش حلاقين متسجلين — المالك يقدر يضيفهم من لوحة التحكم</span>'; return; }
  el.innerHTML = S.barbers.map(b => `<button class="b-chip ${sel.barberId === b.id ? 'active' : ''}" onclick="pickBarber('${b.id}')">✂️ ${esc(b.name)}</button>`).join('');
}
function pickBarber(id) { sel.barberId = sel.barberId === id ? null : id; renderBarbers(); updateSummary(); }

// ===== SERVICES =====
function renderServices() {
  const q = norm($('svcFilter').value);
  const list = q ? S.services.filter(s => norm(s.name).includes(q)) : S.services;
  $('svcGrid').innerHTML = list.length ? list.map(s => `
    <button class="svc-tile ${sel.items.includes(s.id) ? 'active' : ''}" onclick="toggleSvc('${s.id}')">
      <div class="ck">✓</div>
      <div class="svc-name">${esc(s.name)}</div>
      <div class="svc-price">${money(s.price)}</div>
      ${s.duration ? `<div class="svc-dur">⏱ ${esc(s.duration)} دقيقة</div>` : ''}
    </button>`).join('')
    : `<div class="empty" style="grid-column:1/-1"><div class="ei">💈</div><p>${q ? 'مفيش خدمة بالاسم ده' : 'مفيش خدمات — المالك يضيفها من لوحة التحكم'}</p></div>`;
}
function toggleSvc(id) {
  sel.items = sel.items.includes(id) ? sel.items.filter(x => x !== id) : [...sel.items, id];
  renderServices(); updateSummary();
}

// ===== SUMMARY =====
function setDiscType(t) { sel.discType = t; document.querySelectorAll('#discSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === t)); updateSummary(); }
function setPay(p) { sel.pay = p; document.querySelectorAll('#paySeg button').forEach(b => b.classList.toggle('active', b.dataset.v === p)); updateSummary(); }
function setAutoPrint(v) { autoPrint = v; try { localStorage.setItem('autoPrint', v ? '1' : '0'); } catch (e) {} }

function calc() {
  const items = sel.items.map(getSvc).filter(Boolean);
  const subtotal = round2(sum(items, s => s.price));
  let d = Math.max(+sel.discount || 0, 0);
  if (sel.discType === 'pct') d = subtotal * Math.min(d, 100) / 100;
  d = round2(Math.min(d, subtotal));
  return { items, subtotal, discount: d, total: round2(subtotal - d) };
}

function updateSummary() {
  const c = calc();
  // customer
  $('sumCust').innerHTML = sel.cust
    ? `<div class="avatar">👤</div><div><div class="t1">${esc(sel.cust.name)}</div><div class="t2"><span class="ltr">${esc(sel.cust.phone || '')}</span> • ${sel.cust.visits || 0} زيارة</div></div>`
    : sel.walkin ? `<div class="avatar">🚶</div><div><div class="t1">عميل نقدي</div><div class="t2">بدون تسجيل</div></div>`
    : `<div class="avatar">👤</div><div class="t2">لم يتم اختيار عميل</div>`;
  const b = sel.barberId ? getBar(sel.barberId) : null;
  $('sumBarber').innerHTML = b ? `<div class="avatar purple">✂️</div><div><div class="t2">الحلاق</div><div class="t1">${esc(b.name)}</div></div>`
    : `<div class="avatar purple">✂️</div><div class="t2">لم يتم اختيار حلاق</div>`;
  // appointment flag
  const ap = sel.apptId ? S.appts.find(a => a.id === sel.apptId) : null;
  $('apptFlag').classList.toggle('hidden', !ap);
  if (ap) $('apptFlag').innerHTML = `<span>📅 فاتورة لموعد ${esc(fmt12(ap.time))}</span><button class="x-btn" onclick="sel.apptId=null;renderAppts();updateSummary()">✕</button>`;
  // items
  $('sumItems').innerHTML = c.items.length
    ? c.items.map(s => `<div class="sum-item"><div class="n">${esc(s.name)}</div><div style="display:flex;align-items:center"><span class="p">${money(s.price)}</span><button class="rm" onclick="toggleSvc('${s.id}')">✕</button></div></div>`).join('')
    : `<div class="empty"><div class="ei">💈</div><p>اختار خدمة من القائمة</p></div>`;
  $('sumCount').textContent = c.items.length;
  $('sumSubtotal').textContent = money(c.subtotal);
  $('sumDiscount').textContent = c.discount ? '- ' + money(c.discount) : '—';
  $('sumTotal').textContent = money(c.total);
  // validation
  const needBarber = S.barbers.length > 0 && !sel.barberId;
  const ok = migrated && c.items.length && (sel.cust || sel.walkin) && !needBarber && !busy;
  $('payBtn').disabled = !ok;
  $('payHint').textContent = !migrated ? '⏳ في انتظار تجهيز النظام من المالك'
    : !c.items.length ? 'اختار خدمة واحدة على الأقل'
    : (!sel.cust && !sel.walkin) ? 'اختار العميل أو دوس "عميل نقدي"'
    : needBarber ? 'اختار الحلاق' : 'جاهز — Ctrl + Enter للحفظ السريع';
  $('bookBtn').disabled = !sel.cust;
}

function clearAll() {
  sel.cust = null; sel.walkin = false; sel.barberId = null; sel.items = []; sel.discount = 0; sel.apptId = null;
  $('custSearch').value = ''; $('custClear').classList.remove('visible'); closeDD();
  $('discInput').value = ''; $('noteField').value = ''; $('svcFilter').value = '';
  setDiscType('amount'); setPay('cash');
  renderCustBadge(); renderBarbers(); renderServices(); renderAppts(); updateSummary();
}

// ===== CREATE INVOICE =====
async function createInvoice() {
  if (busy || $('payBtn').disabled) return;
  const c = calc(); if (!c.items.length) return;
  busy = true; updateSummary();
  const btn = $('payBtn'); setBusy(btn, true);
  const b = sel.barberId ? getBar(sel.barberId) : null, cust = sel.cust;
  const now = new Date(), date = localDate(now);
  const inv = {
    customerId: cust ? cust.id : null, customerName: cust ? cust.name : 'عميل نقدي', customerPhone: cust ? (cust.phone || '') : '',
    barberId: b ? b.id : null, barberName: b ? b.name : '',
    items: c.items.map(s => ({ serviceId: s.id, name: s.name, price: +s.price || 0 })),
    subtotal: c.subtotal, discount: c.discount, total: c.total, payMethod: sel.pay,
    notes: $('noteField').value.trim(), date, createdAt: now.toISOString(),
    createdBy: ME.uid, createdByName: ME.name || ME.email, appointmentId: sel.apptId || null
  };
  const invRef = fs.collection('invoices').doc(), cRef = fs.collection('meta').doc('counters');
  const custRef = cust ? fs.collection('customers').doc(cust.id) : null;
  const apptRef = sel.apptId ? fs.collection('appointments').doc(sel.apptId) : null;
  try {
    await fs.runTransaction(async tx => {
      const cs = await tx.get(cRef);
      const cus = custRef ? await tx.get(custRef) : null;
      const ap = apptRef ? await tx.get(apptRef) : null;
      inv.number = ((cs.exists && +cs.data().invoiceNo) || 0) + 1;
      tx.set(cRef, { invoiceNo: inv.number }, { merge: true });
      tx.set(invRef, inv);
      if (cus && cus.exists) tx.update(custRef, { visits: FV.increment(1), totalSpent: FV.increment(inv.total), lastVisit: date });
      if (ap && ap.exists) tx.update(apptRef, { status: 'done', invoiceId: invRef.id });
    });
    inv.id = invRef.id;
    toast('✅ تم حفظ الفاتورة #' + inv.number, 'ok');
    busy = false; setBusy(btn, false);
    clearAll();
    currentReceipt = inv;
    if (autoPrint) printReceipt(inv, S.shop); else showReceipt(inv);
  } catch (e) {
    busy = false; setBusy(btn, false);
    onErr(e); updateSummary();
  }
}

// ===== TODAY INVOICES =====
function renderToday() {
  const L = S.todayInv, tot = sum(L, i => i.total);
  $('todayChip').innerHTML = `🧾 ${L.length} فاتورة • <b>${money(tot)}</b>`;
  $('todayCount').textContent = L.length;
  const byPay = {};
  L.forEach(i => { const k = i.payMethod || 'cash'; byPay[k] = (byPay[k] || 0) + (+i.total || 0); });
  $('todayPay').innerHTML = Object.entries(byPay).map(([k, v]) => `<span class="chip chip-blue">${esc(PAY[k] || k)}: ${money(v)}</span>`).join('');
  $('todayList').innerHTML = L.length ? L.slice(0, 40).map(inv => `
    <div class="inv-card">
      <div class="inv-top"><div><span class="inv-no">#${esc(inv.number ?? '')}</span><b>${esc(inv.customerName || 'عميل نقدي')}</b></div><div class="inv-amt">${money(inv.total)}</div></div>
      <div class="inv-svcs">${esc((inv.items || []).map(i => i.name).join(' • '))}${inv.barberName ? ' • ✂️ ' + esc(inv.barberName) : ''}${+inv.discount ? ' • خصم ' + money(inv.discount) : ''}</div>
      <div class="inv-bot"><span>🕐 ${fmtTime(inv.createdAt)} • ${esc(PAY[inv.payMethod] || 'كاش')}${inv.createdByName ? ' • ' + esc(inv.createdByName) : ''}</span><button class="btn btn-xs" onclick="showReceiptById('${inv.id}')">🖨️ وصل</button></div>
    </div>`).join('')
    : `<div class="empty"><div class="ei">🧾</div><p>لسه مفيش فواتير النهارده</p></div>`;
}

// ===== RECEIPT =====
function showReceipt(inv) { currentReceipt = inv; $('receiptBody').innerHTML = receiptHTML(inv, S.shop); openModal('receiptModal'); }
function showReceiptById(id) { const inv = S.todayInv.find(i => i.id === id); if (inv) showReceipt(inv); }
function printCurrent() { if (currentReceipt) printReceipt(currentReceipt, S.shop); }

// ===== APPOINTMENTS =====
function renderAppts() {
  const L = S.appts.filter(a => a.status === 'pending');
  $('apptCard').classList.toggle('hidden', !L.length);
  $('apptCount').textContent = L.length;
  $('apptStrip').innerHTML = L.map(a => `
    <div class="appt-pill ${sel.apptId === a.id ? 'active' : ''}">
      <div class="appt-time">${esc(fmt12(a.time))}</div>
      <div class="appt-body" onclick="loadAppt('${a.id}')"><b>${esc(a.customerName || '—')}</b><span>${esc(a.serviceName || '')}${a.barberName ? ' • ✂️ ' + esc(a.barberName) : ''}</span></div>
      <button class="appt-x" title="لم يحضر" onclick="noShow('${a.id}')">لم يحضر</button>
    </div>`).join('');
}
function loadAppt(id) {
  const a = S.appts.find(x => x.id === id); if (!a) return;
  clearAll();
  sel.apptId = id;
  const c = a.customerId ? getCust(a.customerId) : null;
  if (c) { sel.cust = c; $('custSearch').value = c.name; $('custClear').classList.add('visible'); } else sel.walkin = true;
  if (a.barberId && getBar(a.barberId)) sel.barberId = a.barberId;
  if (a.serviceId && getSvc(a.serviceId)) sel.items = [a.serviceId];
  renderCustBadge(); renderBarbers(); renderServices(); renderAppts(); updateSummary();
  toast('📅 تم تحميل الموعد — راجع وأكّد الفاتورة');
}
function noShow(id) {
  const a = S.appts.find(x => x.id === id);
  if (!a || !confirm(`تسجيل إن "${a.customerName}" محضرش الموعد؟`)) return;
  fs.collection('appointments').doc(id).update({ status: 'cancelled', cancelReason: 'لم يحضر', updatedAt: new Date().toISOString() }).catch(onErr);
  if (sel.apptId === id) sel.apptId = null;
}

// ===== BOOKING =====
function openBook() {
  if (!sel.cust) { toast('اختار العميل الأول'); return; }
  $('bkCust').innerHTML = `👤 <b>${esc(sel.cust.name)}</b> <span class="ltr">${esc(sel.cust.phone || '')}</span>`;
  $('bkBarber').innerHTML = '<option value="">— أي حلاق —</option>' + S.barbers.map(b => `<option value="${b.id}" ${sel.barberId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  $('bkSvc').innerHTML = '<option value="">— اختار الخدمة —</option>' + S.services.map(s => `<option value="${s.id}" ${sel.items[0] === s.id ? 'selected' : ''}>${esc(s.name)} — ${money(s.price)}</option>`).join('');
  $('bkDate').value = localDate(); $('bkTime').value = ''; $('bkNotes').value = '';
  openModal('bookModal');
}
async function saveBook() {
  const date = $('bkDate').value, time = $('bkTime').value, barberId = $('bkBarber').value || null, serviceId = $('bkSvc').value;
  if (!serviceId || !date || !time) { toast('⚠️ اختار الخدمة والتاريخ والوقت'); return; }
  if (date < localDate() && !confirm('التاريخ ده فات. تكمل؟')) return;
  const btn = $('bkSave'); setBusy(btn, true);
  try {
    if (barberId) {
      const snap = await fs.collection('appointments').where('date', '==', date).get();
      const clash = snapList(snap).find(a => a.status === 'pending' && a.time === time && a.barberId === barberId);
      if (clash && !confirm(`الحلاق عنده موعد تاني في نفس الوقت مع "${clash.customerName}". تحجز برضه؟`)) { setBusy(btn, false); return; }
    }
    const b = barberId ? getBar(barberId) : null, s = getSvc(serviceId), c = sel.cust;
    await fs.collection('appointments').add({
      customerId: c.id, customerName: c.name, customerPhone: c.phone || '',
      barberId, barberName: b ? b.name : '', serviceId, serviceName: s ? s.name : '',
      date, time, notes: $('bkNotes').value.trim(), status: 'pending',
      createdAt: new Date().toISOString(), createdBy: ME.uid
    });
    closeModal('bookModal'); toast('✅ تم حجز الموعد', 'ok');
  } catch (e) { onErr(e); }
  setBusy(btn, false);
}

// ===== KEYBOARD =====
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); createInvoice(); }
  if (e.key === 'F2') { e.preventDefault(); $('custSearch').focus(); }
});
