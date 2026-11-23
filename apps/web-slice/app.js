// BANKOO — child vertical slice (demo mode).
// The DemoServer below mirrors packages/economy (double-entry, append-only, idempotent, never negative).
// In production every call here becomes an authenticated API request; the browser never owns balances.
{
const $ = s => document.querySelector(s);
const app = $('#app'), nav = $('#nav'), listenBtn = $('#listen');
const A = p => `assets/${p}.webp`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const bankSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 2 7v2h20V7zM4 11h3v7H4zm6.5 0h3v7h-3zM17 11h3v7h-3zM2 20h20v2H2z"/></svg>';
const coin = `<span class="coin">${bankSvg}</span>`;
const logo = `<div class="logo"><svg viewBox="0 0 48 48"><path d="M24 4 4 14v4h40v-4z" fill="#fff"/><path d="M8 20h6v14H8zm13 0h6v14h-6zm13 0h6v14h-6z" fill="#fff"/><path d="M4 38c10 6 30 6 40 0" stroke="#FFC83D" stroke-width="4" fill="none" stroke-linecap="round"/></svg><div><b>بنكوو</b><small>BANKOO</small></div></div>`;

// ================= Demo server =================
const KEY = 'bankoo-demo-v1';
const fresh = () => ({ profile: null, tx: [], invoices: [], orders: [], stock: Object.fromEntries(BK.products.map(p => [p.id, p.stock])),
  progress: {}, claims: {}, goal: null, fraud: [], week: 0, cart: {}, inbox: { fraudSeen: false, fraudDone: false }, certs: [] });
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* demo still works in memory */ } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
const bal = acct => S.tx.reduce((s, t) => s + t.lines.reduce((x, l) => x + (l.a === acct ? l.v : 0), 0), 0);
const wallet = () => bal('W'), safeBal = () => bal('SV');
const uid = () => Math.random().toString(36).slice(2, 10);

function post(key, type, memo, lines) {
  const ex = S.tx.find(t => t.key === key);
  if (ex) return { tx: ex, replayed: true };                         // idempotent replay: no money moves
  if (lines.reduce((s, l) => s + l.v, 0) !== 0) throw Error('UNBALANCED');
  for (const l of lines) if ((l.a === 'W' || l.a === 'SV') && bal(l.a) + l.v < 0) { const e = Error('INSUFFICIENT'); e.code = 'INSUFFICIENT'; throw e; }
  const tx = { id: uid(), key, type, memo, lines, at: new Date().toISOString() };
  S.tx.push(tx); save(); return { tx, replayed: false };
}
function reward(activity, amount, memo) {
  if (S.claims[activity]) return 0;                                  // retry is free, reward is once
  const d = today(), used = Object.values(S.claims).filter(c => c.day === d).reduce((s, c) => s + c.amt, 0);
  const grant = Math.min(amount, Math.max(0, 20 - used));
  if (!grant) return 0;
  post(`reward:${activity}`, 'REWARD', memo, [{ a: 'T', v: -grant }, { a: 'W', v: grant }]);
  S.claims[activity] = { amt: grant, day: d }; save(); return grant;
}
function runSaturday() {
  S.week++; save();
  const r = post(`salary:W${S.week}`, 'SALARY', `الراتب الأسبوعي — الأسبوع ${S.week}`, [{ a: 'T', v: -10 }, { a: 'W', v: 10 }]);
  return !r.replayed;
}
function runSunday() {
  const wk = Math.max(S.week, 1);
  let inv = S.invoices.find(i => i.week === wk);
  if (!inv) { inv = { id: uid(), week: wk, amount: 4, lines: [['الماء', 1, 'bill-water'], ['الكهرباء', 2, 'bill-power'], ['الإنترنت', 1, 'bill-net']], status: 'PENDING', at: new Date().toISOString() }; S.invoices.push(inv); save(); }
  return payInvoice(inv.id);
}
function payInvoice(id) {
  const inv = S.invoices.find(i => i.id === id);
  if (inv.status === 'PAID') return inv;
  if (wallet() < inv.amount) return inv;                             // stays PENDING, never negative, never shamed
  post(`invoice:${inv.id}`, 'BILL_PAYMENT', `فاتورة الماء والكهرباء والإنترنت — الأسبوع ${inv.week}`, [{ a: 'W', v: -inv.amount }, { a: 'U', v: inv.amount }]);
  inv.status = 'PAID'; inv.paidAt = new Date().toISOString(); save(); return inv;
}
function checkout(items, method, key) {
  const prior = S.orders.find(o => o.key === key);
  if (prior) return prior;
  let total = 0;
  for (const it of items) {
    const p = BK.products.find(x => x.id === it.id);
    if (S.stock[it.id] < it.qty) { const e = Error(`نفدت الكمية: ${p.name}`); e.code = 'STOCK'; throw e; }
    total += p.price * it.qty;
  }
  if (wallet() < total) { const e = Error('INSUFFICIENT'); e.code = 'INSUFFICIENT'; e.need = total - wallet(); throw e; }
  post(`order:${key}`, 'PURCHASE', 'شراء من دكان بنكوو', [{ a: 'W', v: -total }, { a: 'SH', v: total }]);
  for (const it of items) S.stock[it.id] -= it.qty;
  const needsApproval = items.some(it => BK.products.find(x => x.id === it.id).approval);
  const o = { id: 'R-' + (1000 + S.orders.length + 1), key, items, total, method, status: needsApproval ? 'بانتظار موافقة المعلم' : 'مدفوع', at: new Date().toISOString() };
  S.orders.push(o); save(); return o;
}
const stars = () => Object.values(S.progress).filter(p => p.mastered).length + (S.claims['mission:shop-tidy'] ? 1 : 0) + (S.claims['fraud:fake-prize-50'] ? 1 : 0);
const badgeOn = r => ({ zone1: ['z1-money', 'z1-bankooz', 'z1-earn', 'z1-needs'].every(l => S.progress[l]?.mastered), goal: !!S.goal,
  order: S.orders.length > 0, bill: S.invoices.some(i => i.status === 'PAID'), fraud: S.inbox.fraudDone, mission: !!S.claims['mission:shop-tidy'] }[r]);

// ================= UI helpers =================
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), 2600); }
function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, '')); u.lang = 'ar-SA'; u.rate = .92;
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('ar')); if (v) u.voice = v; else toast('لا يوجد صوت عربي في هذا الجهاز بعد');
    speechSynthesis.speak(u);
  } catch (e) { toast('الاستماع غير متاح هنا'); }
}
let speakText = '';
listenBtn.onclick = () => speak(speakText);
function burst(n = 40) {
  if (reduced) return;
  const b = document.createElement('div'); b.className = 'burst';
  const cols = ['#FFC83D', '#F28C28', '#35B879', '#1854D6', '#fff'];
  b.innerHTML = Array.from({ length: n }, () => `<i style="left:${Math.random() * 100}%;top:-20px;background:${cols[Math.floor(Math.random() * 5)]};animation-delay:${Math.random() * .4}s"></i>`).join('');
  document.body.append(b); setTimeout(() => b.remove(), 2000);
}
function countUp(el, from, to) {
  if (reduced || from === to) { el.textContent = to; return; }
  const t0 = performance.now(), d = 700;
  const step = t => { const k = Math.min(1, (t - t0) / d); el.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="pop">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
  document.body.append(m); return m;
}
function printDoc() { try { window.print(); } catch (e) { } toast('إذا لم تظهر نافذة الطباعة، افتح بنكوو في متصفح مستقل ثم اطبع'); }

const icons = {
  home: '<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  map: '<path d="M4 5l5-2 6 2 5-2v16l-5 2-6-2-5 2z"/><path d="M9 3v16M15 5v16"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h5M6 6l9-3 2 3"/>',
  shop: '<path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
};
const tabs = [['home', 'الرئيسية'], ['map', 'التعلم'], ['wallet', 'المحفظة'], ['shop', 'الدكان'], ['me', 'ملفي']];
function drawNav(cur) {
  nav.hidden = false;
  nav.innerHTML = tabs.map(([k, l]) => `<button data-go="${k}" ${k === cur ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${icons[k]}</svg>${l}</button>`).join('');
}

// ================= Router =================
let view = { name: 'landing' }, lastWallet = 0;
function go(name, arg) {
  view = { name, arg };
  if (['home', 'map', 'wallet', 'shop', 'me'].includes(name)) { try { history.replaceState(null, '', '#' + name); } catch (e) { } }
  render(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go, g.dataset.arg); }
});
function render() {
  const P = S.profile, V = view.name;
  if (!P && !['landing', 'onb1', 'onb2', 'onb3'].includes(V)) { view = { name: 'landing' }; return render(); }
  const tabbed = { home: 'home', map: 'map', wallet: 'wallet', shop: 'shop', me: 'me', product: 'shop', cart: 'shop', receipt: 'shop', inbox: 'home', mission: 'home', invoice: 'wallet', statement: 'wallet' }[V];
  if (tabbed) drawNav(tabbed); else nav.hidden = true;
  listenBtn.hidden = false;
  app.innerHTML = (screens[V] || screens.home)(view.arg);
  bind[V]?.(view.arg);
  const w = document.querySelector('[data-balance]');
  if (w) { countUp(w, lastWallet, wallet()); }
  lastWallet = wallet();
}

// ================= Screens =================
const screens = {}, bind = {};
const header = () => {
  const P = S.profile, unread = S.inbox.fraudSeen ? 0 : (S.progress['z1-money']?.mastered ? 1 : 0);
  return `<div class="top"><button class="chip" data-go="me"><img class="avatar-sm" src="${A('av-' + P.avatar)}" alt="">${esc(P.name)}</button>${logo}
  <div class="row" style="flex:0 0 auto;gap:6px"><button class="chip" data-go="inbox" aria-label="الرسائل">✉${unread ? `<b style="color:var(--red)">${unread}</b>` : ''}</button><span class="chip">★ ${stars()}</span></div></div>`;
};

screens.landing = () => {
  speakText = 'مرحبًا بك في عالم بنكوو! هنا تتعلم كيف تربح بانكوز، وتدخرها، وتتسوق بذكاء، وتحمي أموالك!';
  return `<div class="top" style="justify-content:center">${logo}</div>
  <section class="hero" style="grid-template-columns:1fr 42%">
    <div class="in"><div class="bubble"><h1>مرحبًا بك في <em>عالم بنكوو!</em></h1></div>
    <div class="sub">هنا تتعلم كيف تربح بانكوز، وتدّخرها، وتتسوّق بذكاء، وتحمي أموالك!</div></div>
    <img class="mascot enter" src="${A('squirrel-welcome')}" alt="بنكوو السنجاب يرحّب بك">
  </section>
  <h2 class="center" style="color:#fff;text-shadow:0 2px 0 #0b2e74;margin:14px 0 4px">ماذا سنتعلّم؟</h2>
  <section class="grid2 stagger">
    <div class="feat"><div>أربح بانكوز<small>أنجز مهامًا مفيدة وتعلّم كيف يُكتسب المال.</small></div><img src="${A('ic-coins')}" alt=""></div>
    <div class="feat"><div>أوفّر للمستقبل<small>تعلّم الادخار لتحقيق أهدافك.</small></div><img src="${A('ic-safe')}" alt=""></div>
    <div class="feat"><div>أتسوّق بذكاء<small>قارن الأسعار وحدّد احتياجاتك.</small></div><img src="${A('ic-basket')}" alt=""></div>
    <div class="feat"><div>أدفع بأمان<small>تعرّف على الدفع الإلكتروني وتجنّب الاحتيال.</small></div><img src="${A('ic-wallet')}" alt=""></div>
  </section>
  <section class="card"><div class="center"><span class="tag">كيف يعمل بنكوو؟</span></div>
    <div class="journey" style="margin-top:12px"><div><img src="${A('ic-book')}" alt="">أتعلّم</div><i>➜</i><div><img src="${A('ic-task')}" alt="">أنجز مهمة</div><i>➜</i><div><img src="${A('ic-coins')}" alt="">أربح بانكوز</div><i>➜</i><div><img src="${A('ic-safebag')}" alt="">أدّخر أو أتسوّق</div><i>➜</i><div><img src="${A('ic-idea')}" alt="">مهارة جديدة</div></div>
  </section>
  <section class="card" style="display:flex;gap:12px;align-items:center"><img src="${A('sq-safety')}" alt="" style="width:84px">
    <p style="margin:0;font-weight:700">في بنكوو، الخطأ فرصة للتعلّم. ستجرّب اتخاذ قرارات مالية في عالم افتراضي آمن، قبل أن تتعامل مع المال في الحياة الحقيقية.</p></section>
  <button class="btn" data-go="${S.profile ? 'home' : 'onb1'}"><span class="play"></span>${S.profile ? 'أكمل مغامرتي' : 'هيا نبدأ المغامرة!'}</button>
  <div style="height:12px"></div>
  <button class="btn ghost" id="teacher">أنا معلم / مسؤول مدرسة</button>
  <p class="center muted" style="margin-top:14px;background:#fffc;border-radius:999px;padding:6px">تطبيق تعليمي ممتع يساعد الأطفال على تعلّم إدارة المال بذكاء. بانكوز عملة تدريب افتراضية، وليست مالًا حقيقيًا.</p>`;
};
bind.landing = () => {
  $('#teacher').onclick = () => modal(`<h2>منصة المعلم والمدرسة</h2>
    <p>من منصة المعلم ستدير الأقسام، وتفتح محطات الخريطة، وتضيف منتجات دكان القسم، وتراجع المعاملات وتطبع الشهادات.</p>
    <p class="hint">هذه النسخة هي الشريحة الأولى (تجربة الطفل). منصة المعلم هي المرحلة 5 في خطة التنفيذ، ولم تُبنَ بعد.</p>
    <button class="btn small" data-close>حسنًا</button>`);
};

// ---- onboarding
let draft = { name: '', age: 8, level: null, avatar: 'boy-brown', shirt: BK.shirts[0] };
const levelOf = a => a <= 8 ? 0 : a <= 12 ? 1 : 2;
const levels = ['مبتدئ', 'مستكشف', 'متقدّم'];
screens.onb1 = () => {
  speakText = 'أهلًا يا صديقي! أنا بنكوو، وسأرافقك في مغامرتك المالية. ما اسمك؟';
  const lv = draft.level ?? levelOf(draft.age);
  return `<div class="top" style="justify-content:center">${logo}</div>
  <div class="steps"><i class="on"></i><i></i><i></i><span class="chip" style="margin-inline-start:8px">خطوة 1 من 3</span></div>
  <section class="hero"><img class="mascot enter" src="${A('squirrel-point')}" alt="بنكوو">
    <div class="in"><div class="bubble"><h1 style="font-size:26px">أهلًا يا صديقي!<br><em>أنا بنكوو</em></h1><p>سأرافقك في مغامرتك المالية.</p></div><div class="sub">ما اسمك؟</div></div></section>
  <section class="card"><h3>ما اسمك الذي تحب أن نناديك به؟</h3><div style="height:8px"></div>
    <label class="field"><input id="nm" maxlength="20" autocomplete="off" placeholder="مثلًا: أمير" value="${esc(draft.name)}" aria-label="اسمك أو لقبك"></label>
    <p class="muted" style="margin:8px 4px 0">اسمك الأول أو لقبك فقط. لا نحتاج اسمك الكامل ولا بريدك.</p></section>
  <section class="card"><div class="center"><span class="tag">كم عمرك يا بطل؟</span></div><div style="height:10px"></div>
    <div class="ages">${Array.from({ length: 11 }, (_, i) => i + 6).map(a => `<button data-age="${a}" aria-pressed="${a === draft.age}">${a}</button>`).join('')}</div>
    <p class="muted center">سنستخدم عمرك لنختار لك مستوى مناسبًا. يمكن لمعلّمك تعديله.</p>
    <div class="levels">${levels.map((l, i) => `<button data-lv="${i}" aria-pressed="${i === lv}">${'★'.repeat(i + 1)}<br>${l}</button>`).join('')}</div></section>
  <div class="row"><button class="btn" id="next1"><span class="play"></span>التالي</button><button class="btn ghost" data-go="landing" style="flex:.6">رجوع</button></div>
  <p class="center muted">نستخدم اسمك داخل عالم بنكوو فقط.</p>`;
};
bind.onb1 = () => {
  const nm = $('#nm'); nm.oninput = () => draft.name = nm.value;
  app.querySelectorAll('[data-age]').forEach(b => b.onclick = () => { draft.age = +b.dataset.age; draft.level = null; render(); });
  app.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { draft.level = +b.dataset.lv; render(); });
  $('#next1').onclick = () => {
    const n = draft.name.trim();
    if (!/^[\p{L}\s]{2,20}$/u.test(n)) { nm.focus(); toast('اكتب اسمك بالحروف (حرفان على الأقل)'); return; }
    draft.name = n; go('onb2');
  };
};
screens.onb2 = () => {
  speakText = 'اختر شخصيتك المفضلة! يمكنك تغييرها لاحقًا.';
  return `<div class="top" style="justify-content:center">${logo}</div>
  <div class="steps"><i></i><i class="on"></i><i></i><span class="chip" style="margin-inline-start:8px">خطوة 2 من 3</span></div>
  <section class="hero" style="min-height:180px"><img class="mascot" src="${A('sq-explain')}" alt="" style="max-height:190px;object-fit:contain">
    <div><div class="bubble"><h1 style="font-size:26px">اختر شخصيتك <em>المفضّلة!</em></h1></div><div class="sub">يمكنك تغييرها لاحقًا</div></div></section>
  <section class="card"><div class="avatars">${BK.avatars.map(a => `<button data-av="${a}" aria-pressed="${a === draft.avatar}" aria-label="شخصية"><img src="${A('av-' + a)}" alt=""></button>`).join('')}</div></section>
  <section class="card"><div class="row" style="align-items:center">
    <div class="avatar-frame" style="--shirt:${draft.shirt};flex:0 0 110px;height:110px"><img src="${A('av-' + draft.avatar)}" alt="شخصيتك"></div>
    <div><span class="tag">خصّص شخصيتك</span><p class="muted" style="margin:8px 0">لون إطارك وقميصك:</p>
    <div class="swatches">${BK.shirts.map(c => `<button data-sh="${c}" style="background:${c}" aria-label="لون" aria-pressed="${c === draft.shirt}"></button>`).join('')}</div>
    <p class="muted" style="margin:8px 0 0">نظارات وسماعات وحقائب تجدها لاحقًا في دكان بنكوو.</p></div></div></section>
  <p class="muted center">لا نطلب صورتك الحقيقية أبدًا.</p>
  ${S.profile ? `<div class="row"><button class="btn" id="saveav"><span class="play"></span>حفظ شخصيتي</button><button class="btn ghost" data-go="me" style="flex:.6">رجوع</button></div>`
    : `<div class="row"><button class="btn" data-go="onb3"><span class="play"></span>ابدأ مغامرتي</button><button class="btn ghost" data-go="onb1" style="flex:.6">رجوع</button></div>`}`;
};
bind.onb2 = () => {
  $('#saveav') && ($('#saveav').onclick = () => { S.profile.avatar = draft.avatar; S.profile.shirt = draft.shirt; save(); go('me'); toast('حُفظت شخصيتك'); });
  app.querySelectorAll('[data-av]').forEach(b => b.onclick = () => { draft.avatar = b.dataset.av; render(); });
  app.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { draft.shirt = b.dataset.sh; render(); });
};
screens.onb3 = () => {
  speakText = 'هذه بانكوز! عملتنا الخاصة في عالم بنكوو. ستجمعها عندما تتعلم وتنجز مهامًا مفيدة. محفظتك فارغة الآن، لكن أمامك فرص كثيرة لتربح أول بانكوز!';
  return `<div class="top" style="justify-content:center">${logo}</div>
  <div class="steps"><i></i><i></i><i class="on"></i><span class="chip" style="margin-inline-start:8px">خطوة 3 من 3</span></div>
  <section class="hero"><img class="mascot enter" src="${A('sq-pay')}" alt="">
    <div><div class="bubble"><h1 style="font-size:26px">هذه <em>بانكوز!</em></h1><p>عملتنا الخاصة في عالم بنكوو. ستجمعها عندما تتعلّم وتنجز مهامًا مفيدة.</p></div></div></section>
  <section class="card center"><img src="${A('coin')}" alt="قطعة بانكوز" class="float" style="width:150px;margin:auto"></section>
  <section class="card"><div class="balance"><img src="${A('ic-wallet')}" alt="" style="width:90px"><div><h3>رصيدي</h3><span class="num">0</span> <b>بانكوز</b></div></div>
    <p style="margin:8px 0 0;font-weight:700">محفظتك فارغة الآن، لكن أمامك فرص كثيرة لتربح أول بانكوز!</p></section>
  <section class="card demo"><h3>هل أنت في مدرسة؟</h3>
    <p class="muted" style="margin:4px 0 8px">يربطك معلّمك بقسمك برمز صف وطريقة دخول يشرف عليها. أنت الآن في <b>النمط التجريبي الآمن</b>: لا مدرسة، ولا بيانات أطفال آخرين.</p>
    <div class="row"><label class="field" style="padding:0 12px"><input id="cls" placeholder="رمز القسم" style="font-size:18px" aria-label="رمز القسم"></label><button class="btn ghost small" id="join" style="flex:0 0 auto">ربط</button></div></section>
  <button class="btn green" id="go"><span class="play"></span>لنربح أول بانكوز!</button>`;
};
bind.onb3 = () => {
  $('#join').onclick = () => toast('ربط القسم يحتاج رمزًا من منصة المعلم — غير متاح في النمط التجريبي');
  $('#go').onclick = () => {
    S.profile = { name: draft.name, age: draft.age, level: draft.level ?? levelOf(draft.age), avatar: draft.avatar, shirt: draft.shirt, demo: true, since: new Date().toISOString() };
    save(); burst(30); go('home');
  };
};

// ---- home
const playable = ['z1-money', 'z1-bankooz', 'z1-earn', 'z1-needs', 'z2-bag'];
const nextLesson = () => playable.find(l => !S.progress[l]?.mastered);
screens.home = () => {
  const P = S.profile, w = wallet(), nl = nextLesson(), pend = S.invoices.find(i => i.status === 'PENDING');
  const g = S.goal, gp = g ? Math.min(100, Math.round(safeBal() / g.target * 100)) : 0;
  const mDone = !!S.claims['mission:shop-tidy'];
  const fraudReady = S.progress['z1-money']?.mastered && !S.inbox.fraudDone;
  speakText = `مرحبًا يا ${P.name}! رصيدك ${w} بانكوز.`;
  return `${header()}
  <section class="hero" style="min-height:190px"><img class="mascot enter" src="${A('squirrel-welcome')}" alt="" style="max-height:220px;object-fit:contain">
    <div class="bubble in"><h1 style="font-size:28px">مرحبًا يا <em>${esc(P.name)}!</em></h1><p>${w === 0 && !S.tx.length ? 'لنربح أول بانكوز اليوم' : pend ? 'لديك فاتورة تنتظر. لنخطط معًا!' : 'أنت تتقدّم بشكل رائع!'}</p></div></section>
  <section class="stagger">
  <div class="card"><div class="balance"><img src="${A('ic-walletcoins')}" alt="" style="width:34%"><div style="flex:1;text-align:center"><h2>رصيدي</h2>
    <div><span class="num" data-balance>${lastWallet}</span> <b style="font-size:22px">بانكوز</b></div>
    <p class="muted" style="margin:0">${w === 0 ? 'ابدأ بجمع بانكوز من خلال التعلّم والمهام' : `في خزنتك أيضًا ${safeBal()} بانكوز مدّخرة`}</p></div></div>
    <div class="row" style="margin-top:10px"><button class="btn ghost small" id="how">كيف أربح؟</button><button class="btn ghost small" data-go="wallet">سجل العمليات</button></div></div>
  ${fraudReady ? `<button class="mail" data-go="inbox"><span class="dot"></span><img src="${A('ic-task')}" alt="" style="width:44px"><div><b>رسالة جديدة في صندوقك</b><div class="muted">${S.inbox.fraudSeen ? 'أكمل التدريب على الرسالة' : 'من: جوائز بنكوو الكبرى'}</div></div></button>` : ''}
  ${pend ? `<div class="card" style="border-color:#ffd88a"><div class="row"><div><span class="tag o">فاتورة بانتظار السداد</span><p style="margin:8px 0 0;font-weight:700">فاتورة الماء والكهرباء والإنترنت: ${pend.amount} بانكوز. رصيدك الآن ${w}. لا بأس، أنجز مهمة أو درسًا ثم ادفعها.</p></div><img src="${A('bill-power')}" alt="" style="flex:0 0 50px;width:50px"></div>
    <button class="btn small" data-go="invoice" data-arg="${pend.id}" style="margin-top:10px;width:100%">عرض الفاتورة</button></div>` : ''}
  <div class="card" style="background:linear-gradient(90deg,#fff8ec,#fff)"><div class="row" style="align-items:stretch">
    <div style="flex:1.2"><span class="tag o">مهمة اليوم</span><h3 style="margin:10px 0">ساعد صاحب الدكان في ترتيب السلع</h3>
    ${mDone ? '<p class="plus" style="font-weight:800">أنجزتها اليوم. أحسنت!</p>' : `<div class="row"><span class="chip">+2 ${coin}</span><button class="btn small" data-go="mission"><span class="play" style="width:26px;height:26px"></span>ابدأ</button></div>`}</div>
    <img src="${A('shopkeeper')}" alt="صاحب الدكان" style="flex:1;max-width:44%;border-radius:18px;object-fit:cover"></div></div>
  <div class="card"><div class="row"><div style="flex:1.4"><span class="tag">هدفي في الادخار</span>
    ${g ? `<h3 style="margin:8px 0">${esc(g.title)}</h3><div class="bar"><i style="width:${gp}%"></i></div><p class="muted" style="margin:6px 0 0">${safeBal()} من ${g.target} بانكوز في الخزنة</p>`
       : `<p style="margin:8px 0 0;font-weight:700">ستختار هدفك في درس «هدف الادخار» في غابة الادخار.</p>`}</div>
    <img src="${A(g ? 'p-' + g.id : 'ic-safe')}" alt="" style="flex:0 0 80px;width:80px"></div></div>
  <div class="card"><div class="row"><div style="flex:1.4"><span class="tag">أكمل مغامرتي</span>
    <p class="muted" style="margin:8px 0 0">${nl ? 'الدرس التالي:' : 'أنهيت كل الدروس المتاحة!'}</p><h3>${nl ? BK.lessons[nl].title : 'محطات جديدة قريبًا'}</h3></div><img src="${A('ic-idea')}" alt="" style="flex:0 0 86px;width:86px"></div>
    <button class="btn ghost small" data-go="map" style="width:100%;margin-top:10px">اذهب إلى خريطة التعلّم</button></div>
  </section>`;
};
bind.home = () => {
  $('#how').onclick = () => modal(`<h2>كيف أربح بانكوز؟</h2><ul style="font-weight:700;line-height:2">
    <li>إتمام درس جديد: 3 بانكوز (مرة واحدة لكل درس)</li><li>مهمة الدكان: 2 بانكوز</li><li>الراتب الأسبوعي يوم السبت: 10 بانكوز</li><li>اكتشاف رسالة احتيال: 1 بانكوز</li></ul>
    <p class="hint">يمكنك إعادة أي درس متى شئت لتتدرّب، لكن المكافأة تُمنح مرة واحدة.</p><button class="btn small" data-close>فهمت</button>`);
};

// ---- map
const nodeState = n => {
  if (!n.lesson) return 'soon';
  if (S.progress[n.lesson]?.mastered) return 'done';
  const i = playable.indexOf(n.lesson);
  return i === 0 || S.progress[playable[i - 1]]?.mastered ? 'open' : 'locked';
};
screens.map = () => {
  speakText = 'هذه خريطة عالم بنكوو. اضغط على المحطة البرتقالية لتبدأ درسك.';
  const lockSvg = '<svg viewBox="0 0 24 24" width="60%" fill="#fff"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
  return `${header()}
  <h1 style="color:#fff;text-shadow:0 2px 0 #0b2e74;font-size:30px;margin:6px 0 10px">خريطة التعلّم</h1>
  <p class="muted center" style="background:#fffc;border-radius:12px;padding:4px;margin:0 0 8px">اسحب الخريطة لتستكشف المناطق الست</p><div class="mapwrap" id="mw"><div class="map"><img src="${A('map')}" alt="خريطة عالم بنكوو: ست مناطق و24 محطة">
    ${BK.nodes.map(n => { const st = nodeState(n); const cls = st === 'soon' ? 'locked' : st;
      return `<button class="node ${cls}" style="right:${100 - n.x}%;top:${n.y}%" data-node="${n.n}" aria-label="${n.n}. ${n.title} — ${{ done: 'مكتمل', open: 'مفتوح', locked: 'مقفل', soon: 'قريبًا' }[st]}"><span class="st">${st === 'done' ? '✓' : st === 'open' ? '▶' : lockSvg}</span></button>`; }).join('')}
  </div></div>
  <div class="card legend"><span><i style="background:var(--orange)"></i>محطتك التالية</span><span><i style="background:var(--green)"></i>مكتملة</span><span><i style="background:#7b88a6"></i>مقفلة / قيد الإعداد</span></div>
  <div class="card"><h3>المناطق</h3>${BK.zones.map(z => { const ns = BK.nodes.filter(n => n.zone === z.id), d = ns.filter(n => nodeState(n) === 'done').length;
    return `<div style="margin:10px 0"><div class="row" style="justify-content:space-between"><b>${z.id}. ${z.title}</b><span class="muted" style="flex:0 0 auto">${d} / ${ns.length}</span></div><div class="bar" style="height:10px"><i style="width:${d / ns.length * 100}%"></i></div></div>`; }).join('')}
    <p class="muted">في هذه النسخة: المنطقة الأولى كاملة + درس «هدف الادخار». باقي المحطات قيد إعداد المحتوى.</p></div>`;
};
bind.map = () => {
  const cur = app.querySelector('.node.open'), mw = $('#mw');
  if (cur && mw) requestAnimationFrame(() => { const r = cur.getBoundingClientRect(), w = mw.getBoundingClientRect(); mw.scrollBy({ left: r.left - w.left - w.width / 2 + r.width / 2, top: r.top - w.top - w.height / 2, behavior: reduced ? 'auto' : 'smooth' }); });
  app.querySelectorAll('[data-node]').forEach(b => b.onclick = () => {
  const n = BK.nodes.find(x => x.n === +b.dataset.node), st = nodeState(n);
  if (st === 'soon') return toast(`«${n.title}» قيد الإعداد — قريبًا!`);
  if (st === 'locked') return toast('أكمل المحطة السابقة لتفتح هذه المحطة');
  go('lesson', n.lesson);
}); };

// ---- lesson engine
let L = null;
function startLesson(id) {
  const def = BK.lessons[id], age = S.profile.age;
  const scenes = def.scenes.filter(s => (!s.minAge || age >= s.minAge) && (!s.maxAge || age <= s.maxAge));
  const pr = S.progress[id] || { scene: 0, mastered: false, attempts: 0 };
  L = { id, def, scenes, i: pr.mastered ? 0 : Math.min(pr.scene, scenes.length - 1), done: false, wrongs: 0, pose: null, picked: {}, sel: null, count: 0, mistakes: 0 };
  pr.attempts = (pr.attempts || 0) + 1; S.progress[id] = pr; save();
}
screens.lesson = id => {
  if (!L || L.id !== id) startLesson(id);
  const sc = L.scenes[L.i], name = esc(S.profile.name);
  const text = (sc.text || sc.q || '').replace('{name}', name);
  speakText = text + (sc.opts ? ' ' + sc.opts.map(o => o.label).join('، ') : '');
  const pose = L.pose || sc.pose || 'explain';
  let body = '';
  if (sc.t === 'talk') { L.done = true; body = sc.img ? `<div class="card center pop"><img src="${sc.img}" alt="" style="max-height:150px;margin:auto"></div>` : ''; }
  if (sc.t === 'choose') body = `<div class="opts">${sc.opts.map((o, k) => `<button class="opt ${L.picked[k] || ''}" data-opt="${k}">${o.img ? `<img src="${o.img}" alt="">` : ''}${esc(o.label)}</button>`).join('')}</div>`;
  if (sc.t === 'sort') {
    const left = sc.items.map((it, k) => ({ ...it, k })).filter(it => !L.picked[it.k]);
    if (!left.length) L.done = true;
    body = `<div class="pile">${left.map(it => `<button data-item="${it.k}" class="${L.sel === it.k ? 'sel' : ''}">${it.img ? `<img src="${it.img}" alt="">` : ''}${esc(it.label)}</button>`).join('') || '<b class="plus">أحسنت! رتّبت كل شيء.</b>'}</div>
      <div class="bins">${sc.bins.map((bn, bi) => `<button class="bin" data-bin="${bi}"><h3>${bn}</h3><div class="got">${sc.items.map((it, k) => L.picked[k] && it.bin === bi ? (it.img ? `<img src="${it.img}" alt="${esc(it.label)}">` : `<span class="chip" style="font-size:13px">${esc(it.label)}</span>`) : '').join('')}</div></button>`).join('')}</div>`;
  }
  if (sc.t === 'count') {
    const n = sc.mode === 'gap' ? sc.have : sc.target;
    if (L.count >= n) L.done = true;
    body = `<div class="card"><div class="coins">${Array.from({ length: n }, (_, k) => `<button class="coin ${k < L.count ? 'gone' : ''}" data-coin="${k}" aria-label="قطعة">${bankSvg}</button>`).join('')}</div>
      <div class="counter"><div><b>في الخزنة</b><div class="num">${L.count}</div></div><img class="safe" src="${A('ic-safe')}" alt="الخزنة"><div><b>${sc.mode === 'gap' ? 'ثمن الحقيبة' : 'المطلوب'}</b><div class="num">${sc.target}</div></div></div>
      ${sc.mode === 'gap' && L.done ? `<div class="bar" style="margin-top:8px"><i style="width:${sc.have / sc.target * 100}%"></i></div><p class="center" style="font-weight:800;margin:8px 0 0">المحفظة: ${sc.have} — ثمن الحقيبة: ${sc.target} — المتبقي للوصول إلى الهدف: <span style="color:var(--orange)">${sc.target - sc.have}</span></p>` : ''}</div>`;
  }
  if (sc.t === 'goal') {
    L.done = !!L.goalPicked;
    body = `<div class="prods">${['bag', 'game', 'colors'].map(id => { const p = BK.products.find(x => x.id === id);
      return `<button class="prod ${L.goalPicked === id ? 'opt pick' : ''}" data-goal="${id}"><img src="${A('p-' + id)}" alt="">${p.name}<span class="price">${p.price} ${coin}</span></button>`; }).join('')}</div>`;
  }
  if (sc.t === 'summary') { L.done = true; body = `<div class="card pop"><h3>ماذا تعلّمنا؟</h3><ul style="font-weight:700;line-height:1.9;margin:6px 0 0">${sc.points.map(p => `<li>${p}</li>`).join('')}</ul></div>`; }
  const hint = L.hintText ? `<div class="hint pop">${L.hintText}</div>` : '';
  const last = L.i === L.scenes.length - 1;
  return `<div class="player">
    <div class="ptop"><button class="x" data-go="map" aria-label="خروج">✕</button><div class="bar"><i style="width:${(L.i + (L.done ? 1 : 0)) / L.scenes.length * 100}%"></i></div><span class="chip">${L.i + 1}/${L.scenes.length}</span></div>
    <h2 style="color:#fff;text-shadow:0 2px 0 #0b2e74">${L.def.title}</h2>
    <div class="stage"><img class="pose ${L.pose ? 'pop' : 'in'}" src="${A('sq-' + pose)}" alt="بنكوو"><div class="say in">${text}</div></div>
    ${body}${hint}
    <div class="footer"><button class="btn ${last ? 'green' : ''}" id="nx" ${L.done ? '' : 'disabled'}><span class="play"></span>${last ? 'أنهيت الدرس!' : 'التالي'}</button>
    ${L.i > 0 ? '<button class="btn ghost small" id="pv" style="width:100%">المشهد السابق</button>' : ''}</div></div>`;
};
function wrongAnswer(sc) {
  L.wrongs++; L.mistakes++; L.pose = 'wrong';
  L.hintText = L.wrongs === 1 ? `تلميح: ${sc.hint}` : sc.wrong;
}
bind.lesson = () => {
  const sc = L.scenes[L.i];
  app.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
    if (L.done) return;
    const k = +b.dataset.opt, o = sc.opts[k];
    if (o.ok) { L.picked[k] = 'ok'; L.done = true; L.pose = 'correct'; L.hintText = L.wrongs ? 'صحيح! لاحظ كيف فكّرنا معًا خطوة بخطوة.' : ''; burst(18); }
    else { L.picked[k] = 'no'; wrongAnswer(sc); }
    render();
  });
  app.querySelectorAll('[data-item]').forEach(b => b.onclick = () => { L.sel = +b.dataset.item; L.hintText = 'الآن اضغط على الصندوق المناسب.'; render(); });
  app.querySelectorAll('[data-bin]').forEach(b => b.onclick = () => {
    if (L.sel == null) { L.hintText = 'اختر شيئًا من الأعلى أولًا.'; return render(); }
    if (sc.items[L.sel].bin === +b.dataset.bin) { L.picked[L.sel] = 1; L.sel = null; L.pose = 'correct'; L.hintText = ''; }
    else wrongAnswer(sc);
    render();
  });
  app.querySelectorAll('[data-coin]').forEach(b => b.onclick = () => { if (+b.dataset.coin === L.count) { L.count++; render(); } });
  app.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => {
    const p = BK.products.find(x => x.id === b.dataset.goal);
    L.goalPicked = p.id; S.goal = { id: p.id, title: p.name, target: p.price, at: new Date().toISOString() }; save(); L.pose = 'save'; render();
  });
  $('#pv') && ($('#pv').onclick = () => { L.i--; resetScene(); render(); });
  $('#nx').onclick = () => {
    if (L.i < L.scenes.length - 1) { L.i++; S.progress[L.id].scene = Math.max(S.progress[L.id].scene || 0, L.i); save(); resetScene(); render(); }
    else finishLesson();
  };
};
function resetScene() { Object.assign(L, { done: false, wrongs: 0, pose: null, picked: {}, sel: null, count: 0, hintText: '', goalPicked: L.goalPicked }); }
function finishLesson() {
  const pr = S.progress[L.id], first = !pr.mastered;
  const unlockedBefore = BK.nodes.filter(n => nodeState(n) === 'open').length;
  pr.mastered = true; pr.scene = 0; save();
  const got = reward('lesson:' + L.id, L.def.reward, `إتمام درس: ${L.def.title}`);
  if (first) S.certs.push({ lesson: L.id, title: L.def.title, at: new Date().toISOString() });
  save(); burst(60);
  const zone1 = first && badgeOn('zone1') && L.id === 'z1-needs';
  const m = modal(`<div class="center"><img src="${A(got ? 'sq-celebrate' : 'sq-achieve')}" alt="" style="width:150px;margin:auto">
    <h2>${first ? 'أحسنت! أكملت الدرس' : 'تدريب ممتاز!'}</h2>
    ${got ? `<p class="num" style="font-size:40px;color:var(--orange)">+${got} ${coin}</p><p style="font-weight:700">أُضيفت إلى محفظتك. ونلت نجمة تعلّم ★</p>`
          : `<p style="font-weight:700">${first ? 'وصلت لحد مكافآت اليوم، لكن تعلّمك محفوظ ★' : 'المكافأة تُمنح مرة واحدة لكل درس، والتدريب دائمًا مفيد.'}</p>`}
    ${zone1 ? '<p class="hint">نلت شارة «مستكشف المال» وفُتحت غابة الادخار!</p>' : ''}
    <button class="btn" data-close id="back"><span class="play"></span>العودة إلى الخريطة</button></div>`);
  m.querySelector('#back').onclick = () => { m.remove(); L = null; go('map'); if (BK.nodes.filter(n => nodeState(n) === 'open').length > unlockedBefore || zone1) toast('فُتحت محطة جديدة على الخريطة!'); };
}

// ---- mission
let M = null;
screens.mission = () => {
  if (!M) M = { step: 0, order: [], pick: null, wrongs: 0, done: false };
  const items = BK.mission.items, sorted = [...items].sort((a, b) => a.price - b.price);
  speakText = M.step === 0 ? 'رتّب السلع على الرف من الأرخص إلى الأغلى.' : 'زبون اشترى دفترًا وأقلامًا. كم يدفع؟';
  return `<div class="player"><div class="ptop"><button class="x" data-go="home" aria-label="خروج">✕</button><div class="bar"><i style="width:${(M.step + (M.done ? 1 : 0)) * 50}%"></i></div></div>
  <h2 style="color:#fff;text-shadow:0 2px 0 #0b2e74">مهمة: ${BK.mission.title}</h2>
  <div class="stage"><img class="pose" src="${A(M.done ? 'sq-celebrate' : 'ch-shopkeeper')}" alt="صاحب الدكان" style="max-height:200px;object-fit:contain">
   <div class="say">${M.done ? 'شكرًا يا بطل! الدكان صار مرتّبًا، والحساب صحيح.' : M.step === 0 ? 'أهلًا! ساعدني في ترتيب الرف: ضع السلع من <b>الأرخص</b> إلى <b>الأغلى</b>.' : 'زبون اشترى <b>دفترًا</b> و<b>أقلامًا</b>. كم بانكوز يدفع؟'}</div></div>
  ${M.step === 0 ? `<div class="card"><b>الرف:</b><div class="pile" style="min-height:90px;margin-top:6px">${M.order.map(id => { const it = items.find(x => x.id === id); return `<span class="chip"><img src="${A('p-' + id)}" alt="" style="height:40px">${it.label} ${it.price}</span>`; }).join('') || '<span class="muted">الرف فارغ</span>'}</div></div>
    <div class="pile">${items.filter(it => !M.order.includes(it.id)).map(it => `<button data-put="${it.id}"><img src="${A('p-' + it.id)}" alt="">${it.label}<span class="price" style="color:var(--orange)">${it.price} بانكوز</span></button>`).join('')}</div>` : ''}
  ${M.step === 1 ? `<div class="opts">${[6, 7, 9].map(v => `<button class="opt ${M.pick === v ? (v === 7 ? 'ok' : 'no') : ''}" data-sum="${v}">${v} بانكوز</button>`).join('')}</div>` : ''}
  ${M.hint ? `<div class="hint">${M.hint}</div>` : ''}
  <div class="footer">${M.done ? `<button class="btn green" id="claim"><span class="play"></span>استلم مكافأتك</button>` : M.step === 0 && M.order.length === 3 ? '<button class="btn" id="m2"><span class="play"></span>التالي</button>' : ''}</div></div>`;
};
bind.mission = () => {
  const sorted = [...BK.mission.items].sort((a, b) => a.price - b.price);
  app.querySelectorAll('[data-put]').forEach(b => b.onclick = () => {
    const want = sorted[M.order.length].id;
    if (b.dataset.put === want) { M.order.push(want); M.hint = ''; } else { M.wrongs++; M.hint = M.wrongs > 1 ? `ابحث عن أصغر رقم بين السلع الباقية: هو ${sorted[M.order.length].price}.` : 'تلميح: قارن الأسعار، أيّها أصغر؟'; }
    render();
  });
  app.querySelectorAll('[data-sum]').forEach(b => b.onclick = () => {
    M.pick = +b.dataset.sum;
    if (M.pick === 7) { M.done = true; M.hint = 'الدفتر 4 + الأقلام 3 = 7 بانكوز.'; burst(24); }
    else M.hint = 'تلميح: الدفتر 4 بانكوز، والأقلام 3. اجمعهما: 4 + 3.';
    render();
  });
  $('#m2') && ($('#m2').onclick = () => { M.step = 1; M.hint = ''; render(); });
  $('#claim') && ($('#claim').onclick = () => {
    const got = reward('mission:shop-tidy', BK.mission.reward, 'مهمة: ترتيب الدكان');
    M = null; go('home'); toast(got ? `+${got} بانكوز! سُجّلت المهمة ضمن إنجازاتك` : 'أنجزت المهمة مرة أخرى للتدريب — المكافأة تُمنح مرة واحدة');
  });
};

// ---- wallet
screens.wallet = () => {
  const P = S.profile, w = wallet(), sv = safeBal();
  const earned = S.tx.filter(t => ['SALARY', 'REWARD', 'ADJUSTMENT'].includes(t.type)).reduce((s, t) => s + t.lines.find(l => l.a === 'W').v, 0);
  const spent = -S.tx.filter(t => ['PURCHASE', 'BILL_PAYMENT'].includes(t.type)).reduce((s, t) => s + t.lines.find(l => l.a === 'W').v, 0);
  const rows = S.tx.slice().reverse().map(t => { const v = (t.lines.find(l => l.a === 'W') || { v: 0 }).v, sv = (t.lines.find(l => l.a === 'SV') || { v: 0 }).v;
    const amt = t.type === 'SAVINGS_MOVE' ? -sv : v;
    return `<li><div>${esc(t.memo)}<small>${new Date(t.at).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><b class="${amt >= 0 ? 'plus' : 'minus'}" style="white-space:nowrap">${amt > 0 ? '+' : ''}${amt}</b></li>`; }).join('');
  speakText = `رصيدك ${w} بانكوز، وفي خزنتك ${sv}.`;
  return `${header()}<h1 style="color:#fff;text-shadow:0 2px 0 #0b2e74;font-size:30px;margin:6px 0">محفظتي</h1>
  <div class="vcard"><img src="${A('av-' + P.avatar)}" alt=""><div style="text-align:left;font:800 22px 'Baloo Bhaijaan 2'">بنكوو<br><small style="font-size:12px;letter-spacing:.1em">BANKOO</small></div>
    <div class="chipz"></div><div class="id">BNK-TRAIN-${String(P.since).replace(/\D/g, '').slice(-4)}</div><div style="font-weight:800">${esc(P.name)}</div><span class="train">تدريبية — افتراضية</span></div>
  <p class="muted center" style="background:#fffc;border-radius:12px;padding:4px">بطاقة تدريبية داخل بنكوو فقط. ليست بطاقة بنكية ولا تحمل رقمًا مصرفيًا.</p>
  <div class="card"><div class="balance"><img src="${A('ic-wallet')}" alt="" style="width:80px"><div><h3>رصيدي</h3><span class="num" data-balance>${lastWallet}</span> <b>بانكوز</b></div></div>
    <div class="mini" style="margin-top:10px"><div>ربحت<b class="plus">${earned}</b></div><div>أنفقت<b class="minus">${spent}</b></div><div>ادّخرت<b style="color:var(--blue)">${sv}</b></div></div></div>
  <div class="card"><div class="row"><div style="flex:1.5"><span class="tag">خزنة الادخار</span><h3 style="margin:8px 0">${sv} بانكوز</h3>
    ${S.goal ? `<div class="bar"><i style="width:${Math.min(100, sv / S.goal.target * 100)}%"></i></div><p class="muted" style="margin:6px 0 0">هدفي: ${esc(S.goal.title)} (${S.goal.target}) — ${sv >= S.goal.target ? 'وصلت إلى هدفك! اسحب مدخراتك واشترِه من الدكان.' : `ينقصك ${S.goal.target - sv}`}</p>` : '<p class="muted">لا هدف بعد.</p>'}</div>
    <img src="${A('ic-safe')}" alt="" style="flex:0 0 90px;width:90px"></div>
    <div class="row" style="margin-top:10px"><button class="btn small" id="save1" ${w < 1 ? 'disabled' : ''}>ادّخر 1</button><button class="btn small" id="saveAll" ${w < 1 ? 'disabled' : ''}>ادّخر الكل</button><button class="btn ghost small" id="draw" ${sv < 1 ? 'disabled' : ''}>اسحب</button></div></div>
  <div class="card"><span class="tag o">الفواتير</span>${S.invoices.length ? S.invoices.slice().reverse().map(i => `<button class="mail" style="margin-top:8px;box-shadow:none;border:2px solid #eef2ff" data-go="invoice" data-arg="${i.id}"><img src="${A('bill-power')}" alt="" style="width:34px"><div style="flex:1"><b>فاتورة الأسبوع ${i.week}: ${i.amount} بانكوز</b><div class="${i.status === 'PAID' ? 'plus' : 'muted'}" style="font-weight:800">${i.status === 'PAID' ? 'مدفوعة' : 'بانتظار السداد'}</div></div></button>`).join('') : '<p class="muted">تصل فاتورة الماء والكهرباء والإنترنت كل يوم أحد.</p>'}</div>
  <div class="card"><div class="row" style="justify-content:space-between"><h3>سجل العمليات</h3><button class="btn ghost small" data-go="statement" style="flex:0 0 auto">كشف الحساب</button></div>
    ${rows ? `<ul class="ledger">${rows}</ul>` : '<p class="muted">لا عمليات بعد. كل بانكوز تربحها أو تصرفها ستظهر هنا.</p>'}</div>`;
};
bind.wallet = () => {
  const mv = (v, k) => { try { post(`savings:${uid()}`, 'SAVINGS_MOVE', v > 0 ? 'ادّخار في الخزنة' : 'سحب من الخزنة', [{ a: 'W', v: -v }, { a: 'SV', v }]); if (v > 0) burst(12); render(); } catch (e) { toast('الرصيد غير كافٍ'); } };
  $('#save1').onclick = () => mv(1); $('#saveAll').onclick = () => mv(wallet()); $('#draw').onclick = () => mv(-safeBal());
};
screens.invoice = id => {
  const i = S.invoices.find(x => x.id === id); if (!i) return screens.wallet();
  const w = wallet();
  speakText = `فاتورة الماء والكهرباء والإنترنت. المجموع ${i.amount} بانكوز.`;
  return `${header()}<div class="card"><div class="row"><h2>فاتورة الأسبوع ${i.week}</h2><span class="chip" style="flex:0 0 auto;color:${i.status === 'PAID' ? 'var(--green)' : 'var(--orange)'}">${i.status === 'PAID' ? 'مدفوعة' : 'بانتظار السداد'}</span></div>
    <table style="width:100%;margin-top:10px;font-weight:700">${i.lines.map(([n, v, img]) => `<tr><td style="width:44px"><img src="${A(img)}" alt="" style="height:34px"></td><td>${n}</td><td style="text-align:left">${v} بانكوز</td></tr>`).join('')}
    <tr><td></td><td><b>المجموع</b></td><td style="text-align:left"><b>${i.amount} بانكوز</b></td></tr></table>
    <div class="hint" style="margin-top:12px">الراتب يدخل المحفظة، والمصاريف تخرج منها. عندما نعرف مصاريفنا مسبقًا، نعرف كم يتبقّى معنا.</div>
    ${i.status === 'PENDING' ? (w >= i.amount ? `<button class="btn green" id="payb" style="margin-top:12px"><span class="play"></span>ادفع ${i.amount} بانكوز</button>`
      : `<p style="font-weight:700">رصيدك ${w}، والفاتورة ${i.amount}. تحتاج إلى ${i.amount - w} بانكوز. لا تقلق! أنجز مهمة أو درسًا ثم عد لتدفعها.</p><div class="row"><button class="btn small" data-go="mission">مهمة اليوم</button><button class="btn ghost small" data-go="map">درس جديد</button></div>`)
      : `<p class="disclaimer">إيصال سداد رقم ${i.id.toUpperCase()} — ${new Date(i.paidAt).toLocaleDateString('ar-DZ')}<br>وثيقة تعليمية افتراضية — ليست مستندًا مصرفيًا حقيقيًا.</p><button class="btn ghost small noprint" id="pr" style="width:100%;margin-top:8px">طباعة</button>`}
  </div><button class="btn ghost small" data-go="wallet" style="width:100%">رجوع إلى المحفظة</button>`;
};
bind.invoice = id => {
  $('#payb') && ($('#payb').onclick = () => { payInvoice(id); burst(20); toast('أحسنت! عندما نخطط لمصاريفنا، نعرف كم يتبقّى معنا.'); render(); });
  $('#pr') && ($('#pr').onclick = printDoc);
};
screens.statement = () => {
  const P = S.profile;
  return `<div class="card" style="background:#fff"><div class="row"><h2>كشف معاملات المحفظة</h2><img src="${A('coin')}" alt="" style="flex:0 0 70px;width:70px"></div>
    <p class="muted">${esc(P.name)} — النمط التجريبي — ${new Date().toLocaleDateString('ar-DZ')}</p>
    <ul class="ledger">${S.tx.map(t => { const v = (t.lines.find(l => l.a === 'W') || { v: 0 }).v; return `<li><div>${esc(t.memo)}<small>${new Date(t.at).toLocaleString('ar-DZ')}</small></div><b class="${v >= 0 ? 'plus' : 'minus'}">${v}</b></li>`; }).join('') || '<li>لا عمليات</li>'}</ul>
    <p style="font-weight:800">الرصيد: ${wallet()} — في الخزنة: ${safeBal()}</p>
    <p class="disclaimer">وثيقة تعليمية افتراضية — ليست مستندًا مصرفيًا حقيقيًا.</p></div>
    <div class="row noprint"><button class="btn small" id="pr">طباعة</button><button class="btn ghost small" data-go="wallet">رجوع</button></div>`;
};
bind.statement = () => $('#pr').onclick = printDoc;

// ---- shop
let shopQ = '', shopCat = 'all', payKey = null, payMethod = 'BANKOO_CARD';
const cartItems = () => Object.entries(S.cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
const cartTotal = () => cartItems().reduce((s, it) => s + BK.products.find(p => p.id === it.id).price * it.qty, 0);
screens.shop = () => {
  speakText = 'مرحبًا بك في دكان بنكوو! قارن الأسعار قبل الشراء.';
  const list = BK.products.filter(p => (shopCat === 'all' || p.cat === shopCat) && p.name.includes(shopQ));
  const n = cartItems().reduce((s, i) => s + i.qty, 0);
  return `${header()}<div class="row" style="justify-content:space-between;margin:6px 0"><h1 style="color:#fff;text-shadow:0 2px 0 #0b2e74;font-size:30px">دكان بنكوو</h1>
    <button class="chip" data-go="cart" style="flex:0 0 auto">السلة ${n ? `<b style="color:var(--orange)">${n}</b>` : ''}</button></div>
  <div class="card" style="padding:10px"><div class="row"><div><b>رصيدك</b> <span class="num" style="font-size:24px;color:var(--orange)">${wallet()}</span> ${coin}</div><img src="${A('ch-shopkeeper')}" alt="" style="flex:0 0 60px;width:60px"></div>
    <label class="search"><span aria-hidden="true">⌕</span><input id="q" value="${esc(shopQ)}" placeholder="ابحث عن منتج" aria-label="بحث"></label>
    <div class="cats">${[['all', 'الكل'], ['school', 'أدوات مدرسية'], ['play', 'ألعاب وزينة'], ['class', 'مكافآت صفية']].map(([k, l]) => `<button data-cat="${k}" aria-pressed="${k === shopCat}">${l}</button>`).join('')}</div></div>
  <div class="prods stagger">${list.map(p => `<button class="prod" data-go="product" data-arg="${p.id}"><img src="${A('p-' + p.id)}" alt="">${p.name}<span class="price">${p.price} ${coin}</span><small>${S.stock[p.id] ? `متوفر: ${S.stock[p.id]}` : 'نفدت الكمية'}</small></button>`).join('') || '<p class="muted">لا نتائج</p>'}</div>
  <p class="muted center" style="background:#fffc;border-radius:12px;padding:6px">لا قروض ولا شراء بالدين في دكان بنكوو. ولا يُدفع أي مال حقيقي.</p>
  ${S.orders.length ? `<div class="card"><h3>طلباتي</h3>${S.orders.slice().reverse().map(o => `<button class="mail" style="box-shadow:none;margin-top:6px;border:2px solid #eef2ff" data-go="receipt" data-arg="${o.id}"><b style="flex:1">${o.id}</b><span>${o.total} بانكوز</span><span class="muted">${o.status}</span></button>`).join('')}</div>` : ''}`;
};
bind.shop = () => {
  const q = $('#q'); q.oninput = () => { shopQ = q.value.trim(); const pos = q.selectionStart; render(); const nq = $('#q'); nq.focus(); nq.setSelectionRange(pos, pos); };
  app.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { shopCat = b.dataset.cat; render(); });
};
screens.product = id => {
  const p = BK.products.find(x => x.id === id), w = wallet(), short = p.price - w;
  speakText = short > 0 ? `سعر هذا المنتج ${p.price} بانكوز. رصيدك ${w}. تحتاج إلى ${short} بانكوز إضافية.` : `${p.name}، سعره ${p.price} بانكوز.`;
  return `${header()}<div class="card center pop"><img src="${A('p-' + p.id)}" alt="" style="height:170px;margin:auto"><h2>${p.name}</h2><p class="muted">${p.desc}</p>
    <div class="num" style="font-size:40px;color:var(--orange)">${p.price} ${coin}</div><p class="muted">متوفر: ${S.stock[p.id]}${p.approval ? ' — يحتاج موافقة المعلم عند التسليم' : ''}</p></div>
  ${short > 0 ? `<div class="card"><div class="stage" style="grid-template-columns:30% 1fr"><img class="pose" src="${A('sq-think')}" alt=""><div class="say">سعر هذا المنتج <b>${p.price}</b> بانكوز. رصيدك <b>${w}</b>. تحتاج إلى <b style="color:var(--orange)">${short}</b> بانكوز إضافية.</div></div>
    <div class="grid2" style="margin-top:10px"><button class="btn ghost small" data-go="wallet">ادّخر أكثر</button><button class="btn ghost small" data-go="mission">أنجز مهمة</button><button class="btn ghost small" data-go="shop" style="grid-column:1/-1">اختر منتجًا أقل سعرًا</button></div>
    ${safeBal() >= short ? `<p class="hint" style="margin-top:10px">في خزنتك ${safeBal()} بانكوز. يمكنك سحبها من المحفظة إن كان هذا هدفك.</p>` : ''}</div>`
    : `<button class="btn" id="add" ${S.stock[p.id] ? '' : 'disabled'}><span class="play"></span>أضف إلى السلة</button>`}
  <div style="height:10px"></div><button class="btn ghost small" data-go="shop" style="width:100%">رجوع إلى الدكان</button>`;
};
bind.product = id => { $('#add') && ($('#add').onclick = () => { S.cart[id] = (S.cart[id] || 0) + 1; save(); payKey = null; toast('أُضيف إلى السلة'); go('cart'); }); };
screens.cart = () => {
  const items = cartItems(), total = cartTotal(), w = wallet();
  if (!payKey) payKey = uid();                                         // one idempotency key per checkout attempt
  speakText = `المجموع ${total} بانكوز، ورصيدك ${w}.`;
  const methods = [['BANKOO_CARD', 'بطاقة بنكوو'], ['VIRTUAL_PHONE', 'الدفع عبر الهاتف'], ['INTERNAL_QR', 'رمز QR تجريبي'], ['CASH_BANKOOZ', 'نقود بانكوز']];
  return `${header()}<div class="flow"><b>اختيار المنتج</b><b>مراجعة السعر</b><span>التأكيد</span><span>الدفع</span><span>الإيصال</span></div>
  <div class="card"><h2>سلّتي</h2>${items.length ? items.map(it => { const p = BK.products.find(x => x.id === it.id);
    return `<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--line)"><img src="${A('p-' + p.id)}" alt="" style="flex:0 0 50px;width:50px"><b style="flex:2">${p.name}</b>
      <div class="row" style="flex:0 0 auto;gap:4px"><button class="x" data-q="${p.id}" data-d="-1" aria-label="إنقاص">−</button><b>${it.qty}</b><button class="x" data-q="${p.id}" data-d="1" aria-label="زيادة">+</button></div><b style="flex:0 0 auto">${p.price * it.qty}</b></div>`; }).join('')
    : '<p class="muted">سلّتك فارغة.</p>'}
    <div class="row" style="margin-top:10px;font-weight:800"><span>المجموع</span><span class="num" style="flex:0 0 auto;font-size:28px;color:var(--orange)">${total} ${coin}</span></div>
    <div class="row" style="font-weight:700"><span>رصيدك</span><span style="flex:0 0 auto">${w}</span></div>
    ${items.length ? `<div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, w / Math.max(total, 1) * 100)}%;background:${w >= total ? 'var(--green)' : 'var(--orange)'}"></i></div>` : ''}</div>
  ${items.length ? (w < total ? `<div class="hint">تحتاج إلى ${total - w} بانكوز إضافية. أزل منتجًا، أو أنجز مهمة، أو ادّخر أكثر.</div>`
    : `<div class="card"><h3>كيف تريد أن تدفع؟</h3><div class="pay" style="margin-top:8px">${methods.map(([k, l]) => `<button data-pm="${k}" aria-pressed="${k === payMethod}">${l}</button>`).join('')}</div>
      <p class="muted">كلها وسائل تدريبية داخل بنكوو. لن نطلب منك أي رمز سري حقيقي.</p></div>
      <button class="btn green" id="confirm"><span class="play"></span>تأكيد الدفع: ${total} بانكوز</button>`) : '<button class="btn" data-go="shop">تسوّق الآن</button>'}`;
};
bind.cart = () => {
  app.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const id = b.dataset.q; S.cart[id] = Math.max(0, Math.min(S.stock[id], (S.cart[id] || 0) + +b.dataset.d)); save(); payKey = null; render(); });
  app.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { payMethod = b.dataset.pm; render(); });
  $('#confirm') && ($('#confirm').onclick = () => {
    const btn = $('#confirm'); btn.disabled = true; btn.innerHTML = 'جارٍ الدفع…';
    setTimeout(() => {
      try {
        const o = checkout(cartItems(), payMethod, payKey);
        checkout(cartItems(), payMethod, payKey);                     // simulated double-tap: same key → no second charge
        S.cart = {}; payKey = null; save(); burst(40); go('receipt', o.id);
      } catch (e) { toast(e.code === 'INSUFFICIENT' ? 'الرصيد غير كافٍ' : e.message); render(); }
    }, reduced ? 0 : 900);
  });
};
screens.receipt = id => {
  const o = S.orders.find(x => x.id === id), P = S.profile;
  const mName = { BANKOO_CARD: 'بطاقة بنكوو التدريبية', VIRTUAL_PHONE: 'الهاتف الافتراضي', INTERNAL_QR: 'رمز QR تجريبي', CASH_BANKOOZ: 'نقود بانكوز' }[o.method];
  speakText = `تمّ الدفع بنجاح. دفعت ${o.total} بانكوز.`;
  return `<div class="flow noprint"><b>اختيار المنتج</b><b>مراجعة السعر</b><b>التأكيد</b><b>الدفع</b><b>الإيصال</b></div>
  <div class="stage noprint"><img class="pose pop" src="${A('sq-pay')}" alt=""><div class="say">تمّ الدفع! احتفظ بالإيصال، فهو يثبت ما اشتريت وكم دفعت.</div></div>
  <div class="receipt pop"><div class="row"><h2>إيصال شراء</h2><b style="flex:0 0 auto">${o.id}</b></div>
    <p class="muted">دكان بنكوو — ${esc(P.name)} — ${new Date(o.at).toLocaleString('ar-DZ')}</p>
    <table>${o.items.map(it => { const p = BK.products.find(x => x.id === it.id); return `<tr><td>${p.name} × ${it.qty}</td><td>${p.price * it.qty}</td></tr>`; }).join('')}
    <tr><td><b>المجموع</b></td><td><b>${o.total} بانكوز</b></td></tr><tr><td>وسيلة الدفع</td><td>${mName}</td></tr><tr><td>الحالة</td><td>${o.status}</td></tr><tr><td>الرصيد بعد الشراء</td><td>${wallet()}</td></tr></table>
    <p class="disclaimer">وثيقة تعليمية افتراضية — ليست مستندًا مصرفيًا حقيقيًا.</p></div>
  <div class="row noprint" style="margin-top:12px"><button class="btn small" id="pr">طباعة</button><button class="btn ghost small" data-go="shop">العودة إلى الدكان</button></div>`;
};
bind.receipt = () => $('#pr').onclick = printDoc;

// ---- inbox & fraud simulation
let F = null;
screens.inbox = () => {
  const ready = S.progress['z1-money']?.mastered;
  if (!F) F = { stage: S.inbox.fraudDone ? 'done' : 'list', found: {}, lost: 0 };
  const fr = BK.fraud;
  speakText = F.stage === 'msg' ? 'رسالة جديدة: ' + fr.body.map(b => b.t).join('') : 'صندوق الرسائل';
  if (F.stage === 'list' || F.stage === 'done') return `${header()}<h1 style="color:#fff;text-shadow:0 2px 0 #0b2e74;font-size:30px;margin:6px 0">صندوق الرسائل</h1>
    ${ready && !S.inbox.fraudDone ? `<button class="mail" id="openmsg"><span class="dot"></span><div style="flex:1"><b>${fr.sender}</b><div class="muted">${fr.subject}</div></div></button>` : ''}
    <div class="mail" style="margin-top:10px"><img src="${A('sq-welcome')}" alt="" style="width:48px"><div><b>بنك بنكوو</b><div class="muted">مرحبًا ${esc(S.profile.name)}! بطاقتك التدريبية جاهزة في محفظتك. لن نطلب منك رمزك السري أبدًا.</div></div></div>
    ${!ready ? '<p class="card muted">أكمل درس «ما هو المال؟» لتصلك رسائل تدريبية جديدة.</p>' : ''}
    ${S.inbox.fraudDone ? '<div class="card"><b class="plus">أكملت تدريب «الرسالة الاحتيالية». نلت شارة حارس الأمان الرقمي!</b></div>' : ''}
    <button class="btn ghost small" data-go="home" style="width:100%;margin-top:10px">رجوع</button>`;
  if (F.stage === 'msg') return `${header()}<div class="msg pop"><div class="from">من: <b>${fr.sender}</b></div><h3>${fr.subject}</h3><p style="font-size:20px;font-weight:800">${fr.body.map(b => b.t).join('')}</p>
      <span class="btn small" style="display:inline-flex;width:auto;pointer-events:none">اضغط هنا</span></div>
    <div class="stage" style="grid-template-columns:28% 1fr;margin-top:10px"><img class="pose" src="${A('sq-think')}" alt=""><div class="say">ماذا ستفعل؟ فكّر قبل أن تضغط.</div></div>
    <div class="opts" style="grid-template-columns:1fr">${fr.choices.map(c => `<button class="opt" data-ch="${c.id}">${c.label}</button>`).join('')}</div>`;
  if (F.stage === 'oops') return `<div class="stage"><img class="pose pop" src="${A('sq-warn')}" alt=""><div class="say">كانت هذه رسالة خداع! لا تقلق، نحن نتدرّب في عالم آمن. سنتعلّم كيف نكتشف مثل هذه الرسائل.</div></div>
    <div class="card center"><img src="${A('ch-fraud')}" alt="المحتال الكرتوني" style="height:140px;margin:auto">${F.lost ? `<p class="num" style="font-size:24px;color:var(--orange)">خسرت ${F.lost} بانكوز داخل هذه المحاكاة التدريبية</p>` : '<p style="font-weight:800">محفظتك كانت فارغة، فلم تخسر شيئًا هذه المرة.</p>'}
    <p style="font-weight:700">${F.lost ? 'يمكنك استرجاعها! اكتشف علامات الخداع في الرسالة.' : 'لنتعلّم كشف علامات الخداع.'}</p></div>
    <button class="btn" id="hunt"><span class="play"></span>ابحث عن علامات الخداع</button>`;
  if (F.stage === 'hunt' || F.stage === 'safe') {
    const flags = fr.body.filter(b => b.flag).length + 1, n = Object.keys(F.found).length, all = n >= flags || F.stage === 'safe';
    return `${F.stage === 'safe' ? `<div class="stage"><img class="pose pop" src="${A('sq-correct')}" alt=""><div class="say">${F.fb}</div></div>` : `<div class="stage"><img class="pose" src="${A('sq-explain')}" alt=""><div class="say">اضغط على كل جزء مشبوه في الرسالة. وجدت ${n} من ${flags}.</div></div>`}
    <div class="msg"><div class="from">من: <button class="flag ${F.found.sender || F.stage === 'safe' ? 'found' : ''}" data-flag="sender">${fr.sender}</button></div>
      <p style="font-size:19px;line-height:2">${fr.body.map((b, k) => b.flag ? `<button class="flag ${F.found[k] || F.stage === 'safe' ? 'found' : ''}" data-flag="${k}">${b.t}</button>` : `<button class="flag" data-miss>${b.t}</button>`).join('')}</p></div>
    <div class="card"><h3>علامات الخداع</h3><ul style="font-weight:700">${[['sender', fr.senderFlag], ...fr.body.map((b, k) => b.flag ? [k, b.flag] : null).filter(Boolean)].map(([k, t]) => `<li style="opacity:${F.found[k] || F.stage === 'safe' ? 1 : .25}">${t}</li>`).join('')}</ul></div>
    ${all ? `<div class="card" style="display:flex;gap:10px;align-items:center"><img src="${A('ch-police')}" alt="رجل الأمن" style="width:80px"><p style="margin:0;font-weight:700">تذكّر: لا أحد يمنحك جائزة من مسابقة لم تشارك فيها، ولا تضغط على رابط غريب. عند الشك، اسأل معلّمك أو والديك.</p></div>
      <button class="btn green" id="fin"><span class="play"></span>${F.lost ? `استرجع ${F.lost} بانكوز وأنهِ التدريب` : 'أنهِ التدريب'}</button>` : ''}`;
  }
};
bind.inbox = () => {
  const fr = BK.fraud;
  $('#openmsg') && ($('#openmsg').onclick = () => { S.inbox.fraudSeen = true; save(); F.stage = 'msg'; render(); });
  app.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => {
    const c = fr.choices.find(x => x.id === b.dataset.ch);
    S.fraud.push({ choice: c.id, safe: c.safe, at: new Date().toISOString() });
    if (c.safe) { F.stage = 'safe'; F.fb = c.fb; burst(24); }
    else { F.lost = Math.min(3, wallet()); if (F.lost) { F.lossKey = 'fraud-loss:' + uid(); post(F.lossKey, 'FRAUD_LOSS', 'خسارة تدريبية في محاكاة الاحتيال', [{ a: 'W', v: -F.lost }, { a: 'F', v: F.lost }]); } F.stage = 'oops'; }
    save(); render();
  });
  $('#hunt') && ($('#hunt').onclick = () => { F.stage = 'hunt'; render(); });
  app.querySelectorAll('[data-flag]').forEach(b => b.onclick = () => { if (F.stage === 'hunt') { F.found[b.dataset.flag] = 1; render(); } });
  app.querySelectorAll('[data-miss]').forEach(b => b.onclick = () => { if (F.stage === 'hunt') toast('هذا الجزء عادي. ابحث عمّا يستعجلك أو يغريك.'); });
  $('#fin') && ($('#fin').onclick = () => {
    let msg = 'أحسنت! أصبحت حارس الأمان الرقمي';
    if (F.lost && F.lossKey) { post('fraud-recover:' + F.lossKey, 'FRAUD_RECOVERY', 'استرجاع بعد اكتشاف علامات الخداع', [{ a: 'F', v: -F.lost }, { a: 'W', v: F.lost }]); msg = `استرجعت ${F.lost} بانكوز. أحسنت!`; }
    if (F.stage === 'safe') { const g = reward('fraud:fake-prize-50', 1, 'اكتشفت رسالة احتيال'); if (g) msg = `+${g} بانكوز لأنك اخترت التصرّف الآمن!`; }
    S.inbox.fraudDone = true; save(); F = null; burst(40); go('home'); toast(msg);
  });
};

// ---- profile
screens.me = () => {
  const P = S.profile;
  speakText = `ملفي. ${P.name}، عندك ${stars()} نجوم.`;
  const shield = c => `<svg viewBox="0 0 48 48"><path d="M24 3 6 9v13c0 12 8 20 18 23 10-3 18-11 18-23V9z" fill="${c}"/><path d="M16 24l6 6 11-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
  const cols = ['#1854D6', '#35B879', '#F28C28', '#8B5CF6', '#103B91', '#E5484D'];
  return `${header()}<div class="card center"><div class="avatar-frame" style="--shirt:${P.shirt};width:120px;height:120px;margin:auto"><img src="${A('av-' + P.avatar)}" alt=""></div>
    <h2 style="margin-top:8px">${esc(P.name)}</h2><p class="muted">العمر ${P.age} — المستوى: ${levels[P.level]} — النمط التجريبي</p>
    <div class="mini"><div>نجوم التعلّم<b>★ ${stars()}</b></div><div>دروس مكتملة<b>${Object.values(S.progress).filter(p => p.mastered).length}</b></div><div>بانكوز<b>${wallet()}</b></div></div>
    <p class="muted" style="margin:10px 0 0">النجوم تقيس ما تعلّمته، وبانكوز عملة للتدرّب على المال. لا ترتيب علني بين الأطفال.</p></div>
  <div class="card"><h3>شاراتي</h3><div class="badges" style="margin-top:8px">${BK.badges.map((b, i) => `<div class="${badgeOn(b.rule) ? '' : 'off'}">${shield(cols[i])}${b.title}</div>`).join('')}</div></div>
  <div class="card"><h3>شهاداتي</h3>${S.certs.length ? S.certs.map((c, i) => `<button class="mail" style="box-shadow:none;margin-top:6px;border:2px solid #eef2ff" data-cert="${i}"><img src="${A('sq-achieve')}" alt="" style="width:40px"><b>شهادة إتمام: ${c.title}</b></button>`).join('') : '<p class="muted">أكمل درسًا لتحصل على أول شهادة.</p>'}</div>
  <div class="card demo"><h3>أدوات العرض التجريبي</h3><p class="muted" style="margin:4px 0 8px">في النسخة الحقيقية يصرف الخادم الراتب كل سبت ويصدر الفاتورة كل أحد تلقائيًا (توقيت الجزائر)، ولا يملك متصفح الطفل هذه الصلاحية. هنا تستطيع محاكاة الأسبوع لتجربة القصة.</p>
    <div class="row"><button class="btn small" id="sat">محاكاة السبت (+10)</button><button class="btn small" id="sun">محاكاة الأحد (فاتورة 4)</button></div>
    <div class="row" style="margin-top:8px"><button class="btn ghost small" data-go="onb2">تغيير شخصيتي</button><button class="btn ghost small" id="reset">بدء من جديد</button></div></div>`;
};
bind.me = () => {
  $('#sat').onclick = () => { runSaturday(); burst(30); toast(`مبروك! وصل راتبك الأسبوعي: 10 بانكوز.`); render(); };
  $('#sun').onclick = () => { const i = runSunday(); toast(i.status === 'PAID' ? 'دُفعت فاتورة الأسبوع: 4 بانكوز' : 'وصلت فاتورة الأسبوع وهي بانتظار السداد'); render(); };
  $('#reset').onclick = () => { const m = modal(`<h2>بدء من جديد؟</h2><p>سيُمسح ملفك التجريبي ومحفظتك في هذا المتصفح.</p><div class="row"><button class="btn small" id="yes">نعم، ابدأ من جديد</button><button class="btn ghost small" data-close>إلغاء</button></div>`);
    m.querySelector('#yes').onclick = () => { S = fresh(); save(); m.remove(); lastWallet = 0; draft = { name: '', age: 8, level: null, avatar: 'boy-brown', shirt: BK.shirts[0] }; go('landing'); }; };
  app.querySelectorAll('[data-cert]').forEach(b => b.onclick = () => { const c = S.certs[+b.dataset.cert];
    const m = modal(`<div class="center" style="border:6px double var(--yellow);border-radius:18px;padding:16px;background:#fff"><img src="${A('sq-achieve')}" alt="" style="width:110px;margin:auto"><h2>شهادة إتمام درس</h2>
      <p>تشهد بنكوو أنّ <b>${esc(S.profile.name)}</b> أتمّ درس</p><h3 style="color:var(--blue)">«${c.title}»</h3><p class="muted">${new Date(c.at).toLocaleDateString('ar-DZ')}</p>
      <p class="disclaimer">شهادة تعليمية من عالم بنكوو الافتراضي</p></div><div class="row" style="margin-top:10px"><button class="btn small" id="pc">طباعة</button><button class="btn ghost small" data-close>إغلاق</button></div>`);
    m.querySelector('#pc').onclick = printDoc; });
  if (S.profile) { draft = { ...draft, name: S.profile.name, age: S.profile.age, avatar: S.profile.avatar, shirt: S.profile.shirt }; }
};
// editing avatar after onboarding: onb3 "go" keeps the wallet (profile overwrite keeps tx history)

// ---- boot
const h = location.hash.slice(1);
view = { name: S.profile ? (['home', 'map', 'wallet', 'shop', 'me'].includes(h) ? h : 'home') : 'landing' };
lastWallet = wallet();
render();
addEventListener('hashchange', () => { const k = location.hash.slice(1); if (S.profile && ['home', 'map', 'wallet', 'shop', 'me'].includes(k) && view.name !== k) go(k); });
}
