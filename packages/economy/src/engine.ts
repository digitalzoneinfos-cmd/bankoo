// Bankoo economy engine — double-entry, append-only, idempotent.
// All balance changes go through postTransaction(); the UI never writes balances.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { SCHEMA_SQL } from './schema.ts';
import { localParts, isoWeekKey } from './time.ts';

export type Role = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export interface Actor { userId: string | null; role: Role | 'SYSTEM'; tenantId: string | null }
export interface Line { accountId: string; amount: number }

export class EconomyError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export const SYSTEM: Actor = { userId: null, role: 'SYSTEM', tenantId: null };

export class Economy {
  db: DatabaseSync;
  now: () => Date;

  constructor(opts: { file?: string; now?: () => Date } = {}) {
    this.db = new DatabaseSync(opts.file ?? ':memory:');
    this.db.exec(SCHEMA_SQL);
    this.now = opts.now ?? (() => new Date());
  }

  // ---------- tenancy & access ----------
  createSchool(id: string, name: string) {
    this.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run(id, name);
    this.db.prepare('INSERT INTO school_settings(tenant_id) VALUES (?)').run(id);
    for (const kind of ['SCHOOL_TREASURY', 'SCHOOL_UTILITIES', 'SCHOOL_SHOP', 'FRAUD_SIM']) {
      this.db.prepare('INSERT INTO accounts(id,tenant_id,owner_user_id,kind,allow_negative) VALUES (?,?,NULL,?,1)')
        .run(`${id}:${kind}`, id, kind);
    }
  }

  createUser(tenantId: string | null, id: string, role: Role, name: string) {
    this.db.prepare('INSERT INTO users(id,tenant_id,role,display_name) VALUES (?,?,?,?)').run(id, tenantId, role, name);
    if (role === 'STUDENT') {
      if (!tenantId) throw new EconomyError('NO_TENANT', 'student must belong to a school');
      for (const kind of ['STUDENT_WALLET', 'STUDENT_SAVINGS']) {
        this.db.prepare('INSERT INTO accounts(id,tenant_id,owner_user_id,kind) VALUES (?,?,?,?)')
          .run(`${id}:${kind}`, tenantId, id, kind);
      }
    }
  }

  actor(userId: string): Actor {
    const u = this.db.prepare('SELECT id, role, tenant_id FROM users WHERE id=?').get(userId) as any;
    if (!u) throw new EconomyError('NO_USER', 'unknown user');
    return { userId: u.id, role: u.role, tenantId: u.tenant_id };
  }

  /** Server-side guard: never rely on hidden UI. Throws on any cross-tenant or cross-student access. */
  authorize(actor: Actor, tenantId: string, studentId?: string, need: 'read' | 'manage' = 'read') {
    if (actor.role === 'SYSTEM' || actor.role === 'SUPER_ADMIN') return;
    if (actor.tenantId !== tenantId) throw new EconomyError('FORBIDDEN', 'cross-tenant access denied');
    if (actor.role === 'STUDENT') {
      if (need === 'manage' || (studentId && studentId !== actor.userId))
        throw new EconomyError('FORBIDDEN', 'students can only access their own data');
    }
    if (actor.role === 'PARENT' && need === 'manage') throw new EconomyError('FORBIDDEN', 'parents are read-only');
    if (studentId) {
      const s = this.db.prepare('SELECT tenant_id FROM users WHERE id=? AND role=\'STUDENT\'').get(studentId) as any;
      if (!s || s.tenant_id !== tenantId) throw new EconomyError('FORBIDDEN', 'student not in this school');
    }
  }

  settings(tenantId: string) {
    return this.db.prepare('SELECT * FROM school_settings WHERE tenant_id=?').get(tenantId) as any;
  }

  // ---------- ledger core ----------
  balance(accountId: string): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(amount),0) b FROM ledger_entries WHERE account_id=?').get(accountId) as any;
    return Number(r.b);
  }
  wallet(studentId: string) { return this.balance(`${studentId}:STUDENT_WALLET`); }
  savings(studentId: string) { return this.balance(`${studentId}:STUDENT_SAVINGS`); }

  history(actor: Actor, tenantId: string, studentId: string) {
    this.authorize(actor, tenantId, studentId);
    return this.db.prepare(`
      SELECT t.id, t.type, t.memo, t.created_at, e.amount, a.kind
      FROM ledger_entries e JOIN ledger_transactions t ON t.id=e.tx_id JOIN accounts a ON a.id=e.account_id
      WHERE a.owner_user_id=? AND t.tenant_id=? ORDER BY e.id`).all(studentId, tenantId) as any[];
  }

  private inTx<T>(fn: () => T): T {
    // BEGIN IMMEDIATE takes the write lock up-front (PostgreSQL equivalent: SELECT ... FOR UPDATE on the accounts).
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  /**
   * Post a balanced transaction. Idempotent on (tenant, key): replaying the same key returns the
   * original transaction id and moves no money; replaying with a different payload is rejected.
   */
  postTransaction(p: {
    tenantId: string; key: string; type: string; memo: string; lines: Line[];
    actor?: Actor; reason?: string; reversesTxId?: string;
  }, nested = false): { txId: string; replayed: boolean } {
    const run = () => {
      const lines = p.lines.filter(l => l.amount !== 0);
      if (lines.length < 2) throw new EconomyError('UNBALANCED', 'need at least two lines');
      if (lines.some(l => !Number.isInteger(l.amount))) throw new EconomyError('NOT_INTEGER', 'Bankooz are whole units');
      if (lines.reduce((s, l) => s + l.amount, 0) !== 0) throw new EconomyError('UNBALANCED', 'entries must sum to zero');
      const hash = createHash('sha256').update(JSON.stringify([p.type, lines])).digest('hex');

      const existing = this.db.prepare('SELECT id, payload_hash FROM ledger_transactions WHERE tenant_id=? AND idempotency_key=?')
        .get(p.tenantId, p.key) as any;
      if (existing) {
        if (existing.payload_hash !== hash) throw new EconomyError('IDEMPOTENCY_CONFLICT', 'key reused with different payload');
        return { txId: existing.id as string, replayed: true };
      }
      for (const l of lines) {
        const a = this.db.prepare('SELECT tenant_id, allow_negative FROM accounts WHERE id=?').get(l.accountId) as any;
        if (!a) throw new EconomyError('NO_ACCOUNT', l.accountId);
        if (a.tenant_id !== p.tenantId) throw new EconomyError('FORBIDDEN', 'account belongs to another school');
        if (!a.allow_negative && this.balance(l.accountId) + l.amount < 0)
          throw new EconomyError('INSUFFICIENT_FUNDS', 'balance cannot go below zero');
      }
      const txId = randomUUID();
      this.db.prepare(`INSERT INTO ledger_transactions(id,tenant_id,idempotency_key,type,memo,actor_user_id,reason,reverses_tx_id,payload_hash,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(txId, p.tenantId, p.key, p.type, p.memo, p.actor?.userId ?? null,
        p.reason ?? null, p.reversesTxId ?? null, hash, this.now().toISOString());
      const ins = this.db.prepare('INSERT INTO ledger_entries(tx_id,account_id,amount) VALUES (?,?,?)');
      for (const l of lines) ins.run(txId, l.accountId, l.amount);
      return { txId, replayed: false };
    };
    return nested ? run() : this.inTx(run);
  }

  private audit(tenantId: string | null, actor: Actor, action: string, target: string, reason?: string) {
    this.db.prepare('INSERT INTO audit_log(tenant_id,actor_user_id,action,target,reason,at) VALUES (?,?,?,?,?,?)')
      .run(tenantId, actor.userId, action, target, reason ?? null, this.now().toISOString());
  }

  // ---------- rewards (lessons, missions) ----------
  /** One reward per (student, activity), capped per local day. Retrying the activity is always allowed, but pays nothing again. */
  grantReward(actor: Actor, tenantId: string, studentId: string, activityKey: string, amount: number, memo: string) {
    this.authorize(actor, tenantId, studentId, actor.role === 'STUDENT' ? 'read' : 'manage');
    if (amount <= 0) throw new EconomyError('BAD_AMOUNT', 'reward must be positive');
    return this.inTx(() => {
      const prior = this.db.prepare('SELECT tx_id FROM reward_claims WHERE tenant_id=? AND student_id=? AND activity_key=?')
        .get(tenantId, studentId, activityKey) as any;
      if (prior) return { txId: prior.tx_id as string, granted: 0, reason: 'ALREADY_REWARDED' };
      const day = localParts(this.now()).date;
      const s = this.settings(tenantId);
      const today = this.db.prepare('SELECT COALESCE(SUM(amount),0) t FROM reward_claims WHERE tenant_id=? AND student_id=? AND local_day=?')
        .get(tenantId, studentId, day) as any;
      const grant = Math.min(amount, Math.max(0, s.reward_cap_per_day - Number(today.t)));
      if (grant === 0) return { txId: null, granted: 0, reason: 'DAILY_CAP' };
      const { txId } = this.postTransaction({
        tenantId, key: `reward:${studentId}:${activityKey}`, type: 'REWARD', memo, actor,
        lines: [{ accountId: `${tenantId}:SCHOOL_TREASURY`, amount: -grant }, { accountId: `${studentId}:STUDENT_WALLET`, amount: grant }],
      }, true);
      this.db.prepare('INSERT INTO reward_claims VALUES (?,?,?,?,?,?)').run(tenantId, studentId, activityKey, txId, day, grant);
      return { txId, granted: grant, reason: 'OK' };
    });
  }

  saveProgress(actor: Actor, tenantId: string, studentId: string, lessonId: string, sceneIndex: number, mastered = false) {
    this.authorize(actor, tenantId, studentId);
    this.db.prepare(`INSERT INTO lesson_progress(tenant_id,student_id,lesson_id,scene_index,attempts,mastered,updated_at)
      VALUES (?,?,?,?,1,?,?)
      ON CONFLICT(tenant_id,student_id,lesson_id) DO UPDATE SET
        scene_index=MAX(scene_index, excluded.scene_index), attempts=attempts+1,
        mastered=MAX(mastered, excluded.mastered), updated_at=excluded.updated_at`)
      .run(tenantId, studentId, lessonId, sceneIndex, mastered ? 1 : 0, this.now().toISOString());
  }
  progress(actor: Actor, tenantId: string, studentId: string, lessonId: string) {
    this.authorize(actor, tenantId, studentId);
    return this.db.prepare('SELECT * FROM lesson_progress WHERE tenant_id=? AND student_id=? AND lesson_id=?')
      .get(tenantId, studentId, lessonId) as any;
  }

  // ---------- savings ----------
  moveToSavings(actor: Actor, tenantId: string, studentId: string, amount: number, requestKey: string) {
    this.authorize(actor, tenantId, studentId);
    const dir = amount > 0;
    return this.postTransaction({
      tenantId, key: `savings:${studentId}:${requestKey}`, type: 'SAVINGS_MOVE', actor,
      memo: dir ? 'ادخار في الحصالة' : 'سحب من الحصالة',
      lines: [{ accountId: `${studentId}:STUDENT_WALLET`, amount: -amount }, { accountId: `${studentId}:STUDENT_SAVINGS`, amount }],
    });
  }

  // ---------- weekly salary & bills (scheduler) ----------
  /** Called by the scheduler for every student. Safe to call any number of times per week. */
  runWeekly(tenantId: string, at: Date = this.now()) {
    const s = this.settings(tenantId);
    const lp = localParts(at);
    const week = isoWeekKey(at);
    const holiday = this.db.prepare('SELECT 1 FROM school_holidays WHERE tenant_id=? AND day=?').get(tenantId, lp.date);
    const out = { salaries: 0, billsIssued: 0, billsPaid: 0, billsPending: 0 };
    if (holiday || lp.hour < s.run_hour) return out;
    const students = this.db.prepare('SELECT id FROM users WHERE tenant_id=? AND role=\'STUDENT\'').all(tenantId) as any[];
    for (const { id } of students) {
      if (s.salary_enabled && lp.weekday === s.salary_weekday) {
        const r = this.postTransaction({
          tenantId, key: `salary:${id}:${week}`, type: 'SALARY', memo: `الراتب الأسبوعي ${week}`, actor: SYSTEM,
          lines: [{ accountId: `${tenantId}:SCHOOL_TREASURY`, amount: -s.salary_amount }, { accountId: `${id}:STUDENT_WALLET`, amount: s.salary_amount }],
        });
        if (!r.replayed) out.salaries++;
      }
      if (s.bills_enabled && lp.weekday === s.bill_weekday) {
        const r = this.issueAndTryPayBill(tenantId, id, week, s.bill_amount);
        if (r.issued) out.billsIssued++;
        if (r.status === 'PAID' && r.paidNow) out.billsPaid++;
        if (r.status === 'PENDING') out.billsPending++;
      }
    }
    return out;
  }

  private issueAndTryPayBill(tenantId: string, studentId: string, week: string, amount: number) {
    return this.inTx(() => {
      let inv = this.db.prepare('SELECT * FROM invoices WHERE tenant_id=? AND student_id=? AND kind=\'UTILITIES\' AND period_key=?')
        .get(tenantId, studentId, week) as any;
      let issued = false;
      if (!inv) {
        const id = randomUUID();
        this.db.prepare('INSERT INTO invoices(id,tenant_id,student_id,period_key,amount,status,created_at) VALUES (?,?,?,?,?,\'PENDING\',?)')
          .run(id, tenantId, studentId, week, amount, this.now().toISOString());
        inv = { id, status: 'PENDING', amount };
        issued = true;
      }
      if (inv.status === 'PAID') return { issued, status: 'PAID', paidNow: false, invoiceId: inv.id };
      if (this.wallet(studentId) < inv.amount) return { issued, status: 'PENDING', paidNow: false, invoiceId: inv.id };
      this.payInvoiceInner(tenantId, studentId, inv.id, inv.amount);
      return { issued, status: 'PAID', paidNow: true, invoiceId: inv.id };
    });
  }

  private payInvoiceInner(tenantId: string, studentId: string, invoiceId: string, amount: number) {
    const { txId } = this.postTransaction({
      tenantId, key: `invoice:${invoiceId}`, type: 'BILL_PAYMENT', memo: 'فاتورة الماء والكهرباء والإنترنت', actor: SYSTEM,
      lines: [{ accountId: `${studentId}:STUDENT_WALLET`, amount: -amount }, { accountId: `${tenantId}:SCHOOL_UTILITIES`, amount }],
    }, true);
    // invoices are mutable business documents (not ledger rows): status flips once.
    this.db.prepare('UPDATE invoices SET status=\'PAID\', paid_tx_id=? WHERE id=? AND status=\'PENDING\'').run(txId, invoiceId);
    return txId;
  }

  /** Child pays a pending bill later (after earning). */
  payInvoice(actor: Actor, tenantId: string, studentId: string, invoiceId: string) {
    this.authorize(actor, tenantId, studentId);
    return this.inTx(() => {
      const inv = this.db.prepare('SELECT * FROM invoices WHERE id=? AND tenant_id=? AND student_id=?').get(invoiceId, tenantId, studentId) as any;
      if (!inv) throw new EconomyError('NOT_FOUND', 'invoice');
      if (inv.status === 'PAID') return { status: 'PAID', txId: inv.paid_tx_id };
      if (this.wallet(studentId) < inv.amount) {
        return { status: 'PENDING', shortBy: inv.amount - this.wallet(studentId) };
      }
      return { status: 'PAID', txId: this.payInvoiceInner(tenantId, studentId, inv.id, inv.amount) };
    });
  }

  invoices(actor: Actor, tenantId: string, studentId: string) {
    this.authorize(actor, tenantId, studentId);
    return this.db.prepare('SELECT * FROM invoices WHERE tenant_id=? AND student_id=? ORDER BY created_at').all(tenantId, studentId) as any[];
  }

  // ---------- shop ----------
  addProduct(actor: Actor, tenantId: string, p: { id: string; name: string; price: number; stock: number; needsApproval?: boolean }) {
    this.authorize(actor, tenantId, undefined, 'manage');
    this.db.prepare('INSERT INTO products(id,tenant_id,name,price,stock,needs_approval) VALUES (?,?,?,?,?,?)')
      .run(p.id, tenantId, p.name, p.price, p.stock, p.needsApproval ? 1 : 0);
    this.audit(tenantId, actor, 'PRODUCT_CREATE', p.id);
  }
  stock(productId: string) { return Number((this.db.prepare('SELECT stock FROM products WHERE id=?').get(productId) as any).stock); }

  /** Checkout: price is read server-side, stock and wallet change in the same DB transaction, one charge per idempotency key. */
  checkout(actor: Actor, tenantId: string, studentId: string, items: { productId: string; qty: number }[],
    method: 'BANKOO_CARD' | 'VIRTUAL_PHONE' | 'INTERNAL_QR' | 'CASH_BANKOOZ', idempotencyKey: string) {
    this.authorize(actor, tenantId, studentId);
    return this.inTx(() => {
      const prior = this.db.prepare('SELECT * FROM orders WHERE tenant_id=? AND idempotency_key=?').get(tenantId, `order:${studentId}:${idempotencyKey}`) as any;
      if (prior) return { orderId: prior.id as string, total: prior.total as number, replayed: true, status: prior.status as string };
      let total = 0; let needsApproval = false;
      const priced = items.map(i => {
        const p = this.db.prepare('SELECT * FROM products WHERE id=? AND tenant_id=? AND visible=1').get(i.productId, tenantId) as any;
        if (!p) throw new EconomyError('NOT_FOUND', `product ${i.productId}`);
        if (!Number.isInteger(i.qty) || i.qty <= 0) throw new EconomyError('BAD_QTY', 'quantity');
        if (p.stock < i.qty) throw new EconomyError('OUT_OF_STOCK', p.name);
        total += p.price * i.qty; needsApproval ||= !!p.needs_approval;
        return { ...i, price: p.price as number };
      });
      const have = this.wallet(studentId);
      if (have < total) throw new EconomyError('INSUFFICIENT_FUNDS', `تحتاج إلى ${total - have} بانكوز إضافية`);
      const orderId = randomUUID();
      const { txId } = this.postTransaction({
        tenantId, key: `order:${studentId}:${idempotencyKey}`, type: 'PURCHASE', memo: 'شراء من دكان بنكوو', actor,
        lines: [{ accountId: `${studentId}:STUDENT_WALLET`, amount: -total }, { accountId: `${tenantId}:SCHOOL_SHOP`, amount: total }],
      }, true);
      for (const i of priced) {
        const r = this.db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(i.qty, i.productId, i.qty);
        if (Number(r.changes) !== 1) throw new EconomyError('OUT_OF_STOCK', i.productId); // rolls back the charge too
      }
      this.db.prepare('INSERT INTO orders(id,tenant_id,student_id,idempotency_key,total,status,payment_method,tx_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(orderId, tenantId, studentId, `order:${studentId}:${idempotencyKey}`, total, needsApproval ? 'AWAITING_APPROVAL' : 'PAID', method, txId, this.now().toISOString());
      const oi = this.db.prepare('INSERT INTO order_items VALUES (?,?,?,?)');
      for (const i of priced) oi.run(orderId, i.productId, i.qty, i.price);
      return { orderId, total, replayed: false, status: needsApproval ? 'AWAITING_APPROVAL' : 'PAID' };
    });
  }

  // ---------- fraud simulation ----------
  /** Unsafe choice → small virtual loss (only if affordable). Safe choice → learning reward (once). */
  fraudChoice(actor: Actor, tenantId: string, studentId: string, scenarioId: string, choice: string, safe: boolean) {
    this.authorize(actor, tenantId, studentId);
    const s = this.settings(tenantId);
    if (!s.fraud_sim_enabled) throw new EconomyError('DISABLED', 'fraud simulation disabled by school');
    const attemptId = randomUUID();
    let lossTx: string | null = null; let lost = 0;
    if (!safe) {
      lost = Math.min(s.fraud_max_loss, this.wallet(studentId));
      if (lost > 0) {
        lossTx = this.postTransaction({
          tenantId, key: `fraud-loss:${attemptId}`, type: 'FRAUD_LOSS', actor, memo: 'خسارة تدريبية في محاكاة الاحتيال',
          lines: [{ accountId: `${studentId}:STUDENT_WALLET`, amount: -lost }, { accountId: `${tenantId}:FRAUD_SIM`, amount: lost }],
        }).txId;
      }
    }
    this.db.prepare('INSERT INTO fraud_attempts(id,tenant_id,student_id,scenario_id,choice,safe,loss_tx_id,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(attemptId, tenantId, studentId, scenarioId, choice, safe ? 1 : 0, lossTx, this.now().toISOString());
    const reward = safe ? this.grantReward(actor, tenantId, studentId, `fraud:${scenarioId}`, 1, 'اكتشفت رسالة احتيال') : null;
    return { attemptId, lost, reward };
  }

  /** After the child spots the red flags, the simulated loss is refunded exactly once (compensating entry, not deletion). */
  fraudRecover(actor: Actor, tenantId: string, studentId: string, attemptId: string) {
    this.authorize(actor, tenantId, studentId);
    const a = this.db.prepare('SELECT * FROM fraud_attempts WHERE id=? AND tenant_id=? AND student_id=?').get(attemptId, tenantId, studentId) as any;
    if (!a) throw new EconomyError('NOT_FOUND', 'attempt');
    if (!a.loss_tx_id) return { refunded: 0 };
    const amt = -Number((this.db.prepare('SELECT amount FROM ledger_entries WHERE tx_id=? AND account_id=?').get(a.loss_tx_id, `${studentId}:STUDENT_WALLET`) as any).amount);
    const r = this.postTransaction({
      tenantId, key: `fraud-recover:${attemptId}`, type: 'FRAUD_RECOVERY', actor, reversesTxId: a.loss_tx_id, memo: 'استرجاع بعد اكتشاف علامات الخداع',
      lines: [{ accountId: `${tenantId}:FRAUD_SIM`, amount: -amt }, { accountId: `${studentId}:STUDENT_WALLET`, amount: amt }],
    });
    return { refunded: r.replayed ? 0 : amt };
  }

  // ---------- teacher manual adjustment ----------
  adjust(actor: Actor, tenantId: string, studentId: string, amount: number, reason: string, requestKey: string) {
    this.authorize(actor, tenantId, studentId, 'manage');
    if (!['TEACHER', 'SCHOOL_ADMIN'].includes(actor.role)) throw new EconomyError('FORBIDDEN', 'role');
    if (!reason || reason.trim().length < 3) throw new EconomyError('REASON_REQUIRED', 'manual adjustments need a reason');
    const r = this.postTransaction({
      tenantId, key: `adjust:${requestKey}`, type: 'ADJUSTMENT', actor, reason, memo: `تعديل من المعلم: ${reason}`,
      lines: [{ accountId: `${tenantId}:SCHOOL_TREASURY`, amount: -amount }, { accountId: `${studentId}:STUDENT_WALLET`, amount }],
    });
    this.audit(tenantId, actor, 'WALLET_ADJUST', studentId, reason);
    return r;
  }
}
