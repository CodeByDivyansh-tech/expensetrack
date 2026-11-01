const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');
const BC = require('../budget-calculator.js');

const UID = 'u-income';
const path = (...p) => `users/${UID}/${p.join('/')}`;
const incomeDocs = () => [...db._store.keys()].filter((k) => k.startsWith(path('income') + '/'));
const today = () => DataLayer.localDateString();

async function fresh() {
  db.failWrites = null;
  db.failReads = null;
  db.denyPaths = [];
  db._store.clear();
  DataLayer.clearUserData();
  await DataLayer.initUser(UID);
}

describe('money received: data layer', () => {
  beforeEach(fresh);

  test('adds an entry with every field, saved to users/{uid}/income', async () => {
    const saved = await DataLayer.addIncome({ amount: '5000', source: 'parents', from: ' Papa ', date: today(), note: 'November allowance', paymentMethod: 'UPI' });
    assert.equal(saved.amount, 5000);
    assert.equal(saved.from, 'Papa');
    assert.match(saved.id, /^inc-/);
    assert.deepEqual(incomeDocs(), [path('income', saved.id)]);
    const stored = db._store.get(path('income', saved.id));
    assert.deepEqual(Object.keys(stored).sort(), ['amount', 'createdAt', 'date', 'from', 'id', 'note', 'paymentMethod', 'source']);
    assert.equal(DataLayer.getIncome().length, 1);
  });

  test('keeps decimals to the paisa and leaves out empty optional fields', async () => {
    const saved = await DataLayer.addIncome({ amount: '1234.567', source: 'scholarship', date: today(), from: '  ', note: '' });
    assert.equal(saved.amount, 1234.57);
    assert.equal('from' in saved, false);
    assert.equal('note' in saved, false);
    assert.equal('paymentMethod' in saved, false);
  });

  test('rejects bad input with plain messages', async () => {
    const bad = [
      [{ amount: '0', source: 'parents' }, /greater than/],
      [{ amount: '-5', source: 'parents' }, /greater than/],
      [{ amount: '1000001', source: 'parents' }, /at most/],
      [{ amount: '10', source: 'lottery' }, /where the money came from/],
      [{ amount: '10', source: 'gift', date: '2999-01-01' }, /future/],
      [{ amount: '10', source: 'gift', date: '1999-12-31' }, /before 2000/],
      [{ amount: '10', source: 'gift', date: '2026-02-30' }, /valid date/],
      [{ amount: '10', source: 'gift', from: 'x'.repeat(41) }, /40 characters/],
      [{ amount: '10', source: 'gift', note: 'x'.repeat(101) }, /100 characters/],
      [{ amount: '10', source: 'gift', paymentMethod: 'Bitcoin' }, /from the list/],
    ];
    for (const [input, msg] of bad) {
      await assert.rejects(DataLayer.addIncome(input), msg, JSON.stringify(input));
    }
    assert.equal(incomeDocs().length, 0);
  });

  test('updates an entry, removing optional fields left empty', async () => {
    const a = await DataLayer.addIncome({ amount: 500, source: 'gift', from: 'Rahul', note: 'Birthday', date: today() });
    const b = await DataLayer.updateIncome(a.id, { amount: 750, source: 'gift', from: '', note: 'Birthday', date: today() });
    assert.equal(b.amount, 750);
    assert.equal('from' in b, false);
    assert.equal(b.createdAt, a.createdAt);
    assert.ok(b.updatedAt);
    assert.equal(db._store.get(path('income', a.id)).from, undefined);
    await assert.rejects(DataLayer.updateIncome('nope', { amount: 1, source: 'gift' }), /no longer exists/);
  });

  test('deletes and restores (Undo) with the same id', async () => {
    const a = await DataLayer.addIncome({ amount: 300, source: 'refund', date: today() });
    await DataLayer.deleteIncome(a.id);
    assert.equal(incomeDocs().length, 0);
    await DataLayer.restoreIncome(a);
    assert.deepEqual(incomeDocs(), [path('income', a.id)]);
    assert.equal(DataLayer.getIncome()[0].id, a.id);
  });

  test('a failed save is rolled back and reported', async () => {
    db.failWrites = Object.assign(new Error('unavailable'), { code: 'unavailable' });
    await assert.rejects(DataLayer.addIncome({ amount: 100, source: 'job', date: today() }));
    assert.equal(DataLayer.getIncome().length, 0);
  });

  test('lists newest first', async () => {
    await DataLayer.addIncome({ amount: 1, source: 'other', date: '2026-01-05' });
    await DataLayer.addIncome({ amount: 2, source: 'other', date: '2026-03-01' });
    await DataLayer.addIncome({ amount: 3, source: 'other', date: '2026-02-10' });
    assert.deepEqual(DataLayer.getIncome().map((x) => x.amount), [2, 3, 1]);
  });

  test('loads saved entries on sign-in, and old or odd documents still load', async () => {
    db._store.set(path('income', 'a'), { amount: 2000, source: 'parents', date: '2026-10-01', createdAt: 1 });
    db._store.set(path('income', 'b'), { amount: '50', source: 'something-new', date: '2026-10-02', createdAt: 2 });
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    const list = DataLayer.getIncome();
    assert.equal(list.length, 2);
    assert.equal(list.find((x) => x.id === 'b').source, 'other');
    assert.equal(list.find((x) => x.id === 'b').amount, 50);
  });

  test('if money received is refused (older security rules), expenses still load and the problem is reported', async () => {
    db._store.set(path('expenses', 'e1'), { id: 'e1', amount: 99, category: 'food', date: today(), note: 'lunch', createdAt: 1 });
    db.denyPaths = [/\/income(\/|$)/];
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getExpenses().length, 1);
    assert.equal(DataLayer.getLoadError(), null);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(DataLayer.getIncomeError().code, 'permission-denied');
    await assert.rejects(DataLayer.addIncome({ amount: 10, source: 'gift', date: today() }));
    assert.equal(DataLayer.getIncome().length, 0);
  });

  test('deleting the account also deletes money received', async () => {
    await DataLayer.addIncome({ amount: 10, source: 'gift', date: today() });
    await DataLayer.deleteAllUserData();
    assert.equal(incomeDocs().length, 0);
  });

  test('sign-out clears money received from memory', async () => {
    await DataLayer.addIncome({ amount: 10, source: 'gift', date: today() });
    DataLayer.clearUserData();
    assert.equal(DataLayer.getIncome().length, 0);
  });

  test('every source has a name and an icon the app can show', () => {
    const ids = DataLayer.INCOME_SOURCES.map((s) => s.id);
    assert.deepEqual(ids, ['parents', 'scholarship', 'job', 'gift', 'refund', 'other']);
    DataLayer.INCOME_SOURCES.forEach((s) => { assert.ok(s.name); assert.ok(s.icon); });
    assert.equal(DataLayer.incomeSource('unknown').id, 'other');
  });
});

describe('money received: monthly summary', () => {
  const income = [
    { amount: 5000, source: 'parents', date: '2026-11-01' },
    { amount: 1500.5, source: 'job', date: '2026-11-20' },
    { amount: 200, source: 'gift', date: '2026-10-31' },
    { amount: 300, source: 'parents', date: '2026-11-30' },
  ];
  const expenses = [
    { amount: 1200.25, date: '2026-11-02' },
    { amount: 80, date: '2026-10-15' },
  ];

  test('received, spent and what is left in a calendar month', () => {
    const s = BC.incomeSummary(income, expenses, 2026, 10, 1);
    assert.equal(s.received, 6800.5);
    assert.equal(s.spent, 1200.25);
    assert.equal(s.balance, 5600.25);
    assert.deepEqual(s.bySource, { parents: 5300, job: 1500.5 });
    assert.equal(s.count, 3);
  });

  test('follows the budget month start day', () => {
    // Budget month starting on the 31st is clamped to 28: 28 Oct to 27 Nov
    const s = BC.incomeSummary(income, expenses, 2026, 9, 28);
    assert.equal(s.start, '2026-10-28');
    assert.equal(s.received, 200 + 5000 + 1500.5);
  });

  test('can go below zero when more is spent than received', () => {
    const s = BC.incomeSummary([{ amount: 100, source: 'gift', date: '2026-11-03' }], [{ amount: 250, date: '2026-11-04' }], 2026, 10, 1);
    assert.equal(s.balance, -150);
  });

  test('copes with nothing at all', () => {
    const s = BC.incomeSummary([], [], 2026, 10, 1);
    assert.deepEqual([s.received, s.spent, s.balance, s.count], [0, 0, 0, 0]);
  });
});
