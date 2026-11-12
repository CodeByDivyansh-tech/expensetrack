const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');

const UID = 'u-start';
const path = (...p) => `users/${UID}${p.length ? '/' + p.join('/') : ''}`;
const today = () => DataLayer.localDateString();

function reset() {
  db.failWrites = null; db.failReads = null; db.denyPaths = []; db.cache = 'warm';
  db._store.clear();
  DataLayer.clearUserData();
  try { localStorage.clear(); } catch (e) { /* no localStorage in Node */ }
}
function seedAccount({ expenses = 2, handled = true } = {}) {
  db._store.set(path(), { budget: { overallCap: 9000, categories: {} }, settings: {}, customCategories: {}, ...(handled ? { legacyImportHandled: true } : {}), updatedAt: 1 });
  for (let i = 0; i < expenses; i++) db._store.set(path('expenses', 'e' + i), { id: 'e' + i, amount: 10 + i, category: 'food', date: today(), note: 'n', createdAt: i });
  db._store.set(path('income', 'i1'), { id: 'i1', amount: 500, source: 'gift', date: today(), createdAt: 1 });
}
async function open() { db.serverReads = 0; db.cacheReads = 0; await DataLayer.initUser(UID); }

describe('opening the app: the saved copy on the device is shown first', () => {
  beforeEach(reset);

  test('a returning visitor is loaded from the device cache with no server reads before first paint', async () => {
    seedAccount();
    await open();
    assert.equal(db.serverReads, 0);
    assert.equal(db.cacheReads, 5);
    assert.equal(DataLayer.wasLoadedFromCache(), true);
    assert.equal(DataLayer.getExpenses().length, 2);
    assert.equal(DataLayer.getBudget().overallCap, 9000);
    assert.equal(DataLayer.getIncome().length, 1);
    assert.equal(DataLayer.getLoadError(), null);
  });

  test('changes made elsewhere still arrive through the live listeners', async () => {
    seedAccount();
    await open();
    let notified = 0;
    DataLayer.onDataChanged(() => { notified++; });
    await db.collection('users').doc(UID).collection('expenses').doc('remote').set({ id: 'remote', amount: 77, category: 'food', date: today(), note: 'phone', createdAt: 9 });
    assert.equal(DataLayer.getExpenses().length, 3);
    assert.ok(notified >= 1);
  });

  test('a device that has never synced asks the server', async () => {
    seedAccount();
    db.cache = 'cold';
    await open();
    assert.equal(DataLayer.wasLoadedFromCache(), false);
    assert.ok(db.serverReads >= 5);
    assert.equal(DataLayer.getExpenses().length, 2);
  });

  test('a brand-new account asks the server and gets its document created', async () => {
    await open();
    assert.equal(DataLayer.wasLoadedFromCache(), false);
    assert.ok(db._store.has(path()));
  });

  test('an account with no expenses and no import answer is not trusted from the cache', async () => {
    seedAccount({ expenses: 0, handled: false });
    await open();
    assert.equal(DataLayer.wasLoadedFromCache(), false);
    assert.ok(db.serverReads >= 4);
  });

  test('an account with no expenses that already answered the import question loads from the cache', async () => {
    seedAccount({ expenses: 0, handled: true });
    await open();
    assert.equal(DataLayer.wasLoadedFromCache(), true);
    assert.equal(db.serverReads, 0);
  });

  test('an older account without the import flag but with expenses loads from the cache', async () => {
    seedAccount({ expenses: 3, handled: false });
    await open();
    assert.equal(DataLayer.wasLoadedFromCache(), true);
    assert.equal(DataLayer.getExpenses().length, 3);
  });

  test('money received missing from the cache does not block the rest', async () => {
    seedAccount();
    db._store.delete(path('income', 'i1'));
    await open();
    assert.equal(DataLayer.getExpenses().length, 2);
    assert.deepEqual(DataLayer.getIncome(), []);
    assert.equal(DataLayer.getIncomeError(), null);
  });

  test('an old expense without a saved time reads the same every time', async () => {
    seedAccount({ expenses: 0 });
    db._store.set(path('expenses', 'old'), { amount: 40, category: 'food', date: '2026-01-15', note: 'old' });
    await open();
    const first = DataLayer.getExpenses()[0].createdAt;
    await new Promise((r) => setTimeout(r, 5));
    await db.collection('users').doc(UID).collection('expenses').doc('old').set({}, { merge: true });
    assert.equal(DataLayer.getExpenses()[0].createdAt, first);
    assert.equal(first, new Date(2026, 0, 15).getTime());
  });

  test('signing in as someone else never shows the previous cached data', async () => {
    seedAccount();
    await open();
    DataLayer.clearUserData();
    db.serverReads = 0;
    await DataLayer.initUser('someone-else');
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.equal(DataLayer.wasLoadedFromCache(), false);
  });
});
