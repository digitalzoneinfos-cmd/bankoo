// Acceptance tests mapped 1:1 to §27 of the master spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Economy, EconomyError, SYSTEM } from '../src/engine.ts';
import { localParts, isoWeekKey, nextRun } from '../src/time.ts';
import { FRAUD_SCENARIOS } from '../src/fraud-scenarios.ts';

// Sat 28 Nov 2026 09:00 Algiers = 08:00 UTC ; Sun 29 Nov 09:00 Algiers
const SAT = new Date('2026-11-28T08:00:00Z');
const SUN = new Date('2026-11-29T08:00:00Z');
const MON = new Date('2026-11-30T08:00:00Z');

function world(at = MON) {
  let now = at;
  const e = new Economy({ now: () => now });
  e.createSchool('s1', 'مدرسة الأمل'); e.createSchool('s2', 'مدرسة النجاح');
  e.createUser('s1', 'amir', 'STUDENT', 'أمير');
  e.createUser('s1', 'lina', 'STUDENT', 'لينة');
  e.createUser('s2', 'yanis', 'STUDENT', 'يانيس');
  e.createUser('s1', 't1', 'TEACHER', 'الأستاذة سعاد');
  e.createUser('s2', 't2', 'TEACHER', 'الأستاذ كريم');
  return { e, setNow: (d: Date) => { now = d; } };
}
const err = (code: string) => (x: unknown) => x instanceof EconomyError && x.code === code;

test('1. every wallet starts at zero', () => {
  const { e } = world();
  assert.equal(e.wallet('amir'), 0);
  assert.equal(e.savings('amir'), 0);
});

test('2. weekly salary is paid exactly once per week, even if the scheduler reruns', () => {
  const { e } = world(SAT);
  const r1 = e.runWeekly('s1', SAT);
  e.runWeekly('s1', SAT); e.runWeekly('s1', new Date(SAT.getTime() + 3 * 3600_000)); // restart / retry
  assert.equal(r1.salaries, 2);
  assert.equal(e.wallet('amir'), 10);
  assert.equal(e.runWeekly('s1', MON).salaries, 0, 'no salary on Monday');
});

test('2b. salary does not run before the configured hour or on a school holiday', () => {
  const { e } = world(SAT);
  assert.equal(e.runWeekly('s1', new Date('2026-11-28T05:00:00Z')).salaries, 0); // 06:00 local
  e.db.prepare('INSERT INTO school_holidays VALUES (?,?)').run('s1', '2026-11-28');
  assert.equal(e.runWeekly('s1', SAT).salaries, 0);
});

test('3. Sunday bill deducts 4 in total when funds are sufficient, with one invoice', () => {
  const { e } = world(SAT);
  e.runWeekly('s1', SAT);
  const r = e.runWeekly('s1', SUN); e.runWeekly('s1', SUN);
  assert.equal(r.billsPaid, 2);
  assert.equal(e.wallet('amir'), 6);
  const inv = e.invoices(e.actor('amir'), 's1', 'amir');
  assert.equal(inv.length, 1); assert.equal(inv[0].status, 'PAID'); assert.equal(inv[0].amount, 4);
});

test('4. balance never goes negative: unaffordable bill becomes PENDING, then is paid later', () => {
  const { e } = world(SUN);
  e.runWeekly('s1', SUN); // no salary this week (started on Sunday)
  assert.equal(e.wallet('amir'), 0);
  const [inv] = e.invoices(e.actor('amir'), 's1', 'amir');
  assert.equal(inv.status, 'PENDING');
  assert.deepEqual(e.payInvoice(e.actor('amir'), 's1', 'amir', inv.id), { status: 'PENDING', shortBy: 4 });
  e.grantReward(e.actor('amir'), 's1', 'amir', 'lesson:z1-l1', 3, 'درس');
  e.grantReward(e.actor('amir'), 's1', 'amir', 'mission:shop-tidy', 2, 'مهمة');
  assert.equal(e.payInvoice(e.actor('amir'), 's1', 'amir', inv.id).status, 'PAID');
  assert.equal(e.wallet('amir'), 1);
  assert.throws(() => e.postTransaction({ tenantId: 's1', key: 'x', type: 'TEST', memo: 'x',
    lines: [{ accountId: 'amir:STUDENT_WALLET', amount: -5 }, { accountId: 's1:SCHOOL_SHOP', amount: 5 }] }), err('INSUFFICIENT_FUNDS'));
});

test('5+6+7. purchase charges once, decrements stock once, resubmission is a no-op', () => {
  const { e } = world();
  e.addProduct(e.actor('t1'), 's1', { id: 'bag', name: 'حقيبة', price: 8, stock: 3 });
  e.adjust(e.actor('t1'), 's1', 'amir', 10, 'مكافأة نشاط صفي', 'req-1');
  const a = e.checkout(e.actor('amir'), 's1', 'amir', [{ productId: 'bag', qty: 1 }], 'BANKOO_CARD', 'cart-77');
  const b = e.checkout(e.actor('amir'), 's1', 'amir', [{ productId: 'bag', qty: 1 }], 'BANKOO_CARD', 'cart-77'); // double tap
  assert.equal(a.orderId, b.orderId); assert.equal(b.replayed, true);
  assert.equal(e.wallet('amir'), 2);
  assert.equal(e.stock('bag'), 2);
});

test('5b. insufficient funds or stock rolls back everything', () => {
  const { e } = world();
  e.addProduct(e.actor('t1'), 's1', { id: 'pen', name: 'قلم', price: 2, stock: 1 });
  e.adjust(e.actor('t1'), 's1', 'amir', 6, 'نشاط', 'r');
  assert.throws(() => e.checkout(e.actor('amir'), 's1', 'amir', [{ productId: 'pen', qty: 2 }], 'CASH_BANKOOZ', 'k1'), err('OUT_OF_STOCK'));
  assert.equal(e.wallet('amir'), 6); assert.equal(e.stock('pen'), 1);
  e.addProduct(e.actor('t1'), 's1', { id: 'game', name: 'لعبة', price: 8, stock: 5 });
  assert.throws(() => e.checkout(e.actor('amir'), 's1', 'amir', [{ productId: 'game', qty: 1 }], 'CASH_BANKOOZ', 'k2'), /2 بانكوز/);
});

test('8. lesson progress is saved and never moves backwards', () => {
  const { e } = world();
  const me = e.actor('amir');
  e.saveProgress(me, 's1', 'amir', 'z2-bag', 3);
  e.saveProgress(me, 's1', 'amir', 'z2-bag', 1); // reopened an earlier scene
  const p = e.progress(me, 's1', 'amir', 'z2-bag');
  assert.equal(p.scene_index, 3); assert.equal(p.attempts, 2);
});

test('9. a student cannot read or spend from another student account', () => {
  const { e } = world();
  assert.throws(() => e.history(e.actor('amir'), 's1', 'lina'), err('FORBIDDEN'));
  assert.throws(() => e.moveToSavings(e.actor('amir'), 's1', 'lina', 1, 'x'), err('FORBIDDEN'));
  assert.throws(() => e.adjust(e.actor('amir'), 's1', 'amir', 50, 'أنا غني', 'hack'), err('FORBIDDEN'));
});

test('10. a teacher cannot touch another school, even with crafted ids', () => {
  const { e } = world();
  assert.throws(() => e.history(e.actor('t1'), 's2', 'yanis'), err('FORBIDDEN'));
  assert.throws(() => e.history(e.actor('t1'), 's1', 'yanis'), err('FORBIDDEN'));
  assert.throws(() => e.adjust(e.actor('t1'), 's1', 'yanis', 5, 'test', 'k'), err('FORBIDDEN'));
  assert.throws(() => e.postTransaction({ tenantId: 's1', key: 'k', type: 'T', memo: 'm',
    lines: [{ accountId: 's1:SCHOOL_TREASURY', amount: -1 }, { accountId: 'yanis:STUDENT_WALLET', amount: 1 }] }), err('FORBIDDEN'));
});

test('11. retrying a lesson is free but pays its reward only once; daily cap holds', () => {
  const { e } = world();
  const me = e.actor('amir');
  for (let i = 0; i < 5; i++) e.grantReward(me, 's1', 'amir', 'lesson:z1-l1', 3, 'إتمام درس');
  assert.equal(e.wallet('amir'), 3);
  for (let i = 0; i < 10; i++) e.grantReward(me, 's1', 'amir', `mission:m${i}`, 3, 'مهمة');
  assert.equal(e.wallet('amir'), 20, 'capped at reward_cap_per_day');
});

test('12. fraud simulation: virtual-only, bounded loss, refundable once, no external links', () => {
  const { e } = world();
  const me = e.actor('amir');
  e.adjust(e.actor('t1'), 's1', 'amir', 2, 'نشاط', 'r');
  const r = e.fraudChoice(me, 's1', 'amir', 'fake-prize-50', 'open-link', false);
  assert.equal(r.lost, 2, 'loss never exceeds balance');
  assert.equal(e.wallet('amir'), 0);
  assert.equal(e.fraudRecover(me, 's1', 'amir', r.attemptId).refunded, 2);
  assert.equal(e.fraudRecover(me, 's1', 'amir', r.attemptId).refunded, 0);
  assert.equal(e.wallet('amir'), 2);
  for (const s of FRAUD_SCENARIOS) {
    const text = JSON.stringify(s);
    assert.doesNotMatch(text, /https?:\/\/|www\.|\.com|\.dz/i, `${s.id} must not contain real URLs`);
    assert.ok(s.choices.some(c => c.safe) && s.redFlags.length >= 2);
  }
});

test('ledger is append-only and every transaction balances to zero', () => {
  const { e } = world(SAT);
  e.runWeekly('s1', SAT);
  assert.throws(() => e.db.exec('UPDATE ledger_entries SET amount=999'), /append-only/);
  assert.throws(() => e.db.exec('DELETE FROM ledger_transactions'), /append-only/);
  const bad = e.db.prepare('SELECT tx_id, SUM(amount) s FROM ledger_entries GROUP BY tx_id HAVING s<>0').all();
  assert.equal(bad.length, 0);
  assert.throws(() => e.postTransaction({ tenantId: 's1', key: 'salary:amir:W2026-11-28', type: 'SALARY', memo: 'x',
    lines: [{ accountId: 's1:SCHOOL_TREASURY', amount: -99 }, { accountId: 'amir:STUDENT_WALLET', amount: 99 }] }), err('IDEMPOTENCY_CONFLICT'));
});

test('manual adjustments require a reason and are audited', () => {
  const { e } = world();
  assert.throws(() => e.adjust(e.actor('t1'), 's1', 'amir', 5, '', 'k'), err('REASON_REQUIRED'));
  e.adjust(e.actor('t1'), 's1', 'amir', 5, 'مشاركة في النشاط', 'k2');
  const log = e.db.prepare('SELECT * FROM audit_log WHERE action=\'WALLET_ADJUST\'').all() as any[];
  assert.equal(log.length, 1); assert.equal(log[0].actor_user_id, 't1'); assert.equal(log[0].reason, 'مشاركة في النشاط');
});

test('Africa/Algiers calendar: Saturday week key shared by salary and Sunday bill', () => {
  assert.equal(localParts(SAT).weekday, 6);
  assert.equal(localParts(new Date('2026-11-28T23:30:00Z')).weekday, 0, '00:30 Sunday in Algiers');
  assert.equal(isoWeekKey(SAT), isoWeekKey(SUN));
  assert.notEqual(isoWeekKey(SUN), isoWeekKey(new Date('2026-12-05T08:00:00Z')));
  assert.equal(nextRun(MON, 6, 8), '2026-12-05 08:00 (Africa/Algiers)');
});
