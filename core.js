/* =========================================================
   core.js — الإعدادات والأدوات المشتركة بين كل الصفحات
   ========================================================= */

// ===== FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyDNqPr1L_2I-PBEUbtDTxeNe9ljwmFjtBA",
  authDomain: "mostafa-ashour.firebaseapp.com",
  projectId: "mostafa-ashour",
  storageBucket: "mostafa-ashour.firebasestorage.app",
  messagingSenderId: "216558854202",
  appId: "1:216558854202:web:f743810852973ec7ebd503"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const fs = firebase.firestore();
const FV = firebase.firestore.FieldValue;
// كاش محلي: الصفحة تفتح بسرعة وتستحمل قطع النت لحظياً
try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

// ===== ثوابت =====
const PAY = { cash: 'كاش', vodafone: 'فودافون كاش', instapay: 'إنستاباي', card: 'فيزا' };
const ROLE = { owner: 'المالك', cashier: 'كاشير' };
const DEFAULT_SHOP = { name: 'مصطفي عاشور', phone: '', address: '', footer: 'شكراً لزيارتكم ✂️\nنراكم في زيارة قادمة' };
const LOCALE = 'ar-EG-u-nu-latn';

// ===== أدوات عامة =====
const $ = id => document.getElementById(id);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const pad = n => String(n).padStart(2, '0');
// تاريخ محلي (بتوقيت الجهاز) — بدل toISOString اللي كان بيرجع UTC
function localDate(d = new Date()) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(ds) { const [y, m, d] = String(ds).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function addDays(ds, n) { const d = parseDate(ds); d.setDate(d.getDate() + n); return localDate(d); }
function monthFirst(ds, n = 0) { const d = parseDate(ds); return localDate(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
function monthLast(ds, n = 0) { const d = parseDate(ds); return localDate(new Date(d.getFullYear(), d.getMonth() + n + 1, 0)); }
function fmtDate(ds, opts = { day: 'numeric', month: 'short' }) { if (!ds) return '—'; return parseDate(ds).toLocaleDateString(LOCALE, opts); }
function fmtDateLong(ds) { return fmtDate(ds, { weekday: 'long', day: 'numeric', month: 'long' }); }
function fmtMonth(ym) { return parseDate(ym + '-01').toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }); }
function fmtTime(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' }); }
function fmt12(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'م' : 'ص'; return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${ap}`; }
const round2 = n => Math.round((+n || 0) * 100) / 100;
function fmtNum(n) { return round2(n).toLocaleString('en-US'); }
function money(n) { return fmtNum(n) + ' ج'; }
function sum(arr, f) { return arr.reduce((s, x) => s + (+f(x) || 0), 0); }
function snapList(snap) { return snap.docs.map(d => ({ id: d.id, ...d.data() })); }
function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); }
function svcSort(a, b) { return ((a.order ?? 999) - (b.order ?? 999)) || byName(a, b); }
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function digits(s) { return String(s ?? '').replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/\D/g, ''); }
// توحيد الحروف العربية للبحث (أ/إ/آ = ا ، ة = ه ، ى = ي)
function norm(s) {
  return String(s ?? '').toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d))
    .replace(/\s+/g, ' ').trim();
}
function waLink(phone) { const p = digits(phone); if (!p) return ''; return 'https://wa.me/' + (p.startsWith('0') ? '2' + p : p); }
function validPhone(p) { return /^01[0125]\d{8}$/.test(digits(p)); }

// ===== Toast =====
let _toastTimer;
function toast(msg, type = '') {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { t.className = 'toast ' + type; }, 3200);
}

// ===== Modals =====
function openModal(id) {
  const m = $(id); m.classList.add('open');
  const f = m.querySelector('[autofocus],input:not([type=hidden]):not([readonly]),select,textarea');
  if (f && window.innerWidth > 700) setTimeout(() => f.focus(), 60);
}
function closeModal(id) { $(id).classList.remove('open'); }
document.addEventListener('mousedown', e => { if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); });

function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + (label || 'جاري الحفظ...'); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

// ===== Loader =====
function hideLoader() { const l = $('loader'); if (l) l.classList.add('hidden'); }
function loaderMsg(msg) { const l = $('loaderMsg'); if (l) l.innerHTML = msg; }

// ===== رسائل الأخطاء =====
function authErr(e) {
  const m = {
    'auth/invalid-credential': 'الإيميل أو الباسورد غلط',
    'auth/invalid-login-credentials': 'الإيميل أو الباسورد غلط',
    'auth/wrong-password': 'الباسورد غلط',
    'auth/user-not-found': 'الإيميل ده مش متسجل',
    'auth/invalid-email': 'الإيميل مكتوب غلط',
    'auth/missing-password': 'اكتب الباسورد',
    'auth/too-many-requests': 'محاولات كتير — استنى شوية وجرب تاني',
    'auth/network-request-failed': 'مفيش اتصال بالإنترنت',
    'auth/email-already-in-use': 'الإيميل ده مستخدم قبل كده',
    'auth/weak-password': 'الباسورد ضعيف — ٦ حروف على الأقل',
    'auth/operation-not-allowed': 'لازم تفعّل الدخول بالإيميل من Firebase Console ← Authentication ← Sign-in method ← Email/Password',
    'auth/requires-recent-login': 'سجّل خروج وادخل تاني وبعدين جرّب',
    'auth/user-disabled': 'الحساب ده موقوف'
  };
  return m[e && e.code] || (e && e.message) || 'حصل خطأ';
}
function fsErr(e) {
  if (!e) return 'حصل خطأ';
  if (e.code === 'permission-denied') return 'مفيش صلاحية للعملية دي';
  if (e.code === 'unavailable' || e.code === 'failed-precondition' && /offline/i.test(e.message)) return 'مفيش اتصال بالإنترنت';
  if (String(e.code || '').startsWith('auth/')) return authErr(e);
  return e.message || 'حصل خطأ';
}

// ===== حماية الصفحات =====
function requireAuth(roles, onReady) {
  let started = false;
  auth.onAuthStateChanged(async user => {
    if (!user) { location.replace('index.html'); return; }
    if (started) return;
    try {
      const snap = await fs.collection('staff').doc(user.uid).get();
      const st = snap.exists ? snap.data() : null;
      if (!st || st.active === false) { await auth.signOut(); location.replace('index.html?e=noaccess'); return; }
      if (roles && !roles.includes(st.role)) { location.replace(st.role === 'owner' ? 'dashboard.html' : 'cashier.html'); return; }
      started = true;
      window.ME = { uid: user.uid, email: user.email, ...st };
      await onReady(window.ME);
    } catch (e) {
      console.error(e);
      loaderMsg('⚠️ ' + esc(fsErr(e)) + '<br><br><button class="btn" onclick="location.reload()">إعادة المحاولة</button> <button class="btn btn-ghost" onclick="auth.signOut()">تسجيل خروج</button>');
    }
  });
}
async function logout() {
  if (!confirm('تسجيل الخروج؟')) return;
  await auth.signOut();
  location.replace('index.html');
}

// ===== الوصل =====
const RECEIPT_CSS = `.rc{font-family:'Cairo',sans-serif;color:#111;direction:rtl;font-size:12px;line-height:1.55}
.rc-h{text-align:center;border-bottom:2px dashed #bbb;padding-bottom:10px;margin-bottom:10px}
.rc-logo{font-size:26px}.rc-name{font-size:18px;font-weight:900}.rc-s{font-size:11px;color:#555}
.rc-meta>div{display:flex;justify-content:space-between;gap:8px;padding:1px 0}.rc-meta span{color:#555}
.rc-items{border-top:1px dashed #bbb;border-bottom:1px dashed #bbb;padding:7px 0;margin:8px 0}
.rc-row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}
.rc-total{display:flex;justify-content:space-between;font-size:17px;font-weight:900;padding:6px 0;border-top:1px solid #111;margin-top:4px}
.rc-f{text-align:center;font-size:11px;color:#555;margin-top:10px;border-top:1px dashed #bbb;padding-top:8px}
.rc-credit{font-size:9px;color:#999;margin-top:8px}`;
(function () { const s = document.createElement('style'); s.textContent = RECEIPT_CSS; document.head.appendChild(s); })();

function receiptHTML(inv, shop) {
  shop = { ...DEFAULT_SHOP, ...(shop || {}) };
  const d = inv.createdAt ? new Date(inv.createdAt) : parseDate(inv.date);
  const items = inv.items || [];
  return `<div class="rc">
  <div class="rc-h"><div class="rc-logo">✂️</div><div class="rc-name">${esc(shop.name)}</div>
    ${shop.address ? `<div class="rc-s">${esc(shop.address)}</div>` : ''}${shop.phone ? `<div class="rc-s">📞 ${esc(shop.phone)}</div>` : ''}</div>
  <div class="rc-meta">
    <div><span>فاتورة رقم</span><b>#${esc(inv.number ?? '—')}</b></div>
    <div><span>التاريخ</span><b>${d.toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })}</b></div>
    ${inv.createdAt ? `<div><span>الوقت</span><b>${fmtTime(inv.createdAt)}</b></div>` : ''}
    <div><span>العميل</span><b>${esc(inv.customerName || 'عميل نقدي')}</b></div>
    ${inv.barberName ? `<div><span>الحلاق</span><b>${esc(inv.barberName)}</b></div>` : ''}
    ${inv.createdByName ? `<div><span>الكاشير</span><b>${esc(inv.createdByName)}</b></div>` : ''}
  </div>
  <div class="rc-items">${items.map(it => `<div class="rc-row"><span>${esc(it.name)}</span><span>${money(it.price)}</span></div>`).join('')}</div>
  ${(+inv.discount > 0) ? `<div class="rc-row"><span>المجموع</span><span>${money(inv.subtotal)}</span></div><div class="rc-row"><span>خصم</span><span>- ${money(inv.discount)}</span></div>` : ''}
  <div class="rc-total"><span>الإجمالي</span><span>${money(inv.total)}</span></div>
  <div class="rc-row rc-s"><span>طريقة الدفع</span><span>${esc(PAY[inv.payMethod] || 'كاش')}</span></div>
  <div class="rc-f">${esc(shop.footer).replace(/\n/g, '<br>')}<div class="rc-credit">تم التصميم بواسطة KY Solutions<br>01554052642 / 01270685562</div></div>
</div>`;
}

// طباعة من غير popup (عن طريق iframe مخفي) — مناسبة لطابعات الكاشير 80mm
function printReceipt(inv, shop) {
  const old = $('printFrame'); if (old) old.remove();
  const f = document.createElement('iframe');
  f.id = 'printFrame';
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:80mm;height:400px;border:0;';
  document.body.appendChild(f);
  const w = f.contentWindow;
  w.document.open();
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
<style>@page{size:80mm auto;margin:3mm}body{margin:0;background:#fff}${RECEIPT_CSS}</style></head>
<body>${receiptHTML(inv, shop)}</body></html>`);
  w.document.close();
  let done = false;
  const go = () => { if (done) return; done = true; try { w.focus(); w.print(); } catch (e) { toast('⚠️ تعذرت الطباعة'); } };
  setTimeout(() => { try { w.document.fonts.ready.then(() => setTimeout(go, 150)); } catch (e) { go(); } }, 400);
  setTimeout(go, 2500);
}

// ===== تصدير =====
function downloadFile(name, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
}
