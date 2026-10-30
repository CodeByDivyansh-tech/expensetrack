const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');

const UID = 'u4';
const docPath = (id) => `users/${UID}/expenses/${id}`;

describe('payment method', () => {
  beforeEach(async () => {
    db.failWrites = null;
    db._store.clear();
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
  });

  test('the list of methods', () => {
    assert.deepEqual(DataLayer.PAYMENT_METHODS, ['UPI', 'Cash', 'Card', 'Wallet', 'Other']);
  });

  test('is saved with the expense and loaded back', async () => {
    const e = await DataLayer.addExpense({ amount: 50, category: 'food', paymentMethod: 'UPI' });
    assert.equal(db._store.get(docPath(e.id)).paymentMethod, 'UPI');
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getExpenses()[0].paymentMethod, 'UPI');
  });

  test('is optional: an expense without one has no such field (older data)', async () => {
    const e = await DataLayer.addExpense({ amount: 50, category: 'food' });
    assert.equal('paymentMethod' in db._store.get(docPath(e.id)), false);
    assert.equal(DataLayer.getExpenses()[0].paymentMethod, undefined);
  });

  test('an unknown method is rejected', async () => {
    await assert.rejects(() => DataLayer.addExpense({ amount: 5, category: 'food', paymentMethod: 'Cheque' }), /payment method/);
  });

  test('an update can set, keep and clear it', async () => {
    const e = await DataLayer.addExpense({ amount: 50, category: 'food' });
    await DataLayer.updateExpense(e.id, { amount: 50, category: 'food', paymentMethod: 'Card' });
    assert.equal(db._store.get(docPath(e.id)).paymentMethod, 'Card');
    await DataLayer.updateExpense(e.id, { amount: 60, category: 'food' }); // not mentioned: kept
    assert.equal(db._store.get(docPath(e.id)).paymentMethod, 'Card');
    await DataLayer.updateExpense(e.id, { amount: 60, category: 'food', paymentMethod: '' }); // cleared
    assert.equal('paymentMethod' in db._store.get(docPath(e.id)), false);
    assert.equal(db._store.get(docPath(e.id)).amount, 60);
  });

  test('an expense keeps its payment method through delete and undo', async () => {
    const e = await DataLayer.addExpense({ amount: 50, category: 'food', paymentMethod: 'Wallet' });
    await DataLayer.deleteExpense(e.id);
    await DataLayer.restoreExpense(e);
    assert.equal(db._store.get(docPath(e.id)).paymentMethod, 'Wallet');
  });
});

describe('bulk add (CSV import)', () => {
  beforeEach(async () => {
    db.failWrites = null;
    db._store.clear();
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
  });

  const row = (i, extra = {}) => ({ amount: 10 + i, category: 'food', date: '2026-01-02', note: `n${i}`, ...extra });

  test('adds all rows, with ids, and keeps payment method', async () => {
    const docs = await DataLayer.addExpensesBulk([row(1, { paymentMethod: 'UPI' }), row(2)]);
    assert.equal(docs.length, 2);
    assert.equal(new Set(docs.map((d) => d.id)).size, 2);
    assert.equal(DataLayer.getExpenses().length, 2);
    assert.equal(db._store.get(docPath(docs[0].id)).paymentMethod, 'UPI');
  });

  test('1,200 rows are written in chunks', async () => {
    await DataLayer.addExpensesBulk(Array.from({ length: 1200 }, (_, i) => row(i)));
    assert.equal([...db._store.keys()].filter((k) => k.includes('/expenses/')).length, 1200);
  });

  test('one bad row means nothing is saved', async () => {
    await assert.rejects(() => DataLayer.addExpensesBulk([row(1), row(2, { amount: -4 })]), /Row 2/);
    await assert.rejects(() => DataLayer.addExpensesBulk([row(1), row(2, { category: 'nope' })]), /Row 2: unknown category/);
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.equal([...db._store.keys()].filter((k) => k.includes('/expenses/')).length, 0);
  });

  test('a failed write leaves the list as it was', async () => {
    db.failWrites = new Error('Missing or insufficient permissions.');
    await assert.rejects(() => DataLayer.addExpensesBulk([row(1)]), /insufficient permissions/);
    assert.equal(DataLayer.getExpenses().length, 0);
  });
});
