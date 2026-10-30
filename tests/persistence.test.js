const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

// Wire the data layer to an in-memory Firestore before it is loaded.
const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');

const UID = 'u1';
const denied = () => new Error('Missing or insufficient permissions.');
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setOnline(online) {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true, writable: true });
}

describe('B4: writes are awaited, failures reject and roll back', () => {
  beforeEach(async () => {
    setOnline(true);
    db.failWrites = null;
    db.hang = false;
    db._store.clear();
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
  });

  after(() => {
    DataLayer.clearUserData();
    if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
  });

  test('addExpense persists to Firestore and resolves with the expense', async () => {
    const exp = await DataLayer.addExpense({ amount: 120, category: 'food', note: 'Lunch' });
    assert.equal(exp.amount, 120);
    assert.ok(db._store.has(`users/${UID}/expenses/${exp.id}`));
  });

  test('addExpense rejects and leaves no expense behind when the write fails', async () => {
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.addExpense({ amount: 50, category: 'food' }), /insufficient permissions/);
    assert.equal(DataLayer.getExpenses().length, 0);
  });

  test('updateExpense rolls back to the previous values when the write fails', async () => {
    const exp = await DataLayer.addExpense({ amount: 100, category: 'food', note: 'Before' });
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.updateExpense(exp.id, { amount: 999, category: 'groceries', note: 'After' }));
    const kept = DataLayer.getExpenses().find((e) => e.id === exp.id);
    assert.equal(kept.amount, 100);
    assert.equal(kept.category, 'food');
    assert.equal(kept.note, 'Before');
  });

  test('deleteExpense keeps the expense when the write fails', async () => {
    const exp = await DataLayer.addExpense({ amount: 100, category: 'food' });
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.deleteExpense(exp.id));
    assert.equal(DataLayer.getExpenses().length, 1);
  });

  test('deleteExpense removes the Firestore document on success', async () => {
    const exp = await DataLayer.addExpense({ amount: 100, category: 'food' });
    await DataLayer.deleteExpense(exp.id);
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.equal(db._store.has(`users/${UID}/expenses/${exp.id}`), false);
  });

  test('saveBudget rolls back when the write fails', async () => {
    const before = DataLayer.getBudget().overallCap;
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.saveBudget({ overallCap: 20000, categories: {} }));
    assert.equal(DataLayer.getBudget().overallCap, before);
  });

  test('saveSettings rolls back when the write fails', async () => {
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.saveSettings({ notify80: true }));
    assert.equal(DataLayer.getSettings().notify80, false);
  });

  test('addCustomCategory rolls back category and budget when the write fails', async () => {
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.addCustomCategory({ name: 'Gym', budgetCap: 800 }));
    assert.equal(Object.keys(DataLayer.getCustomCategories()).length, 0);
    assert.equal(Object.keys(DataLayer.getBudget().categories).length, 7);
  });

  test('addCustomCategory saves the category and its cap in one write', async () => {
    const cat = await DataLayer.addCustomCategory({ name: 'Gym', budgetCap: 800 });
    const doc = db._store.get(`users/${UID}`);
    assert.equal(doc.customCategories[cat.id].name, 'Gym');
    assert.equal(doc.budget.categories[cat.id], 800);
  });

  test('a hard-deleted custom category is really removed from Firestore (no resurrection)', async () => {
    const cat = await DataLayer.addCustomCategory({ name: 'Swim', budgetCap: 300 });
    await DataLayer.deleteCategory(cat.id);
    const doc = db._store.get(`users/${UID}`);
    assert.equal(doc.customCategories[cat.id], undefined);
    assert.equal(doc.budget.categories[cat.id], undefined);
  });

  test('clearAllExpenses keeps local data when the delete fails', async () => {
    await DataLayer.addExpense({ amount: 10, category: 'food' });
    db.failWrites = denied();
    await assert.rejects(() => DataLayer.clearAllExpenses());
    assert.equal(DataLayer.getExpenses().length, 1);
  });

  test('clearAllExpenses empties Firestore and local state on success', async () => {
    await DataLayer.addExpense({ amount: 10, category: 'food' });
    await DataLayer.addExpense({ amount: 20, category: 'food' });
    await DataLayer.clearAllExpenses();
    assert.equal(DataLayer.getExpenses().length, 0);
    const left = [...db._store.keys()].filter((k) => k.includes('/expenses/'));
    assert.equal(left.length, 0);
  });

  test('offline: the write is queued instead of hanging the UI', async () => {
    setOnline(false);
    db.hang = true;
    const result = await Promise.race([
      DataLayer.addExpense({ amount: 30, category: 'food' }),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 500)),
    ]);
    assert.notEqual(result, 'HUNG');
    assert.equal(DataLayer.getExpenses().length, 1);
  });

  test('offline: a queued write that later fails is reported to onWriteError listeners', async () => {
    setOnline(false);
    db.failWrites = denied();
    const seen = [];
    const off = DataLayer.onWriteError((err) => seen.push(err.message));
    await DataLayer.addExpense({ amount: 30, category: 'food' });
    await new Promise((r) => setTimeout(r, 20));
    off();
    assert.equal(seen.length, 1);
    assert.match(seen[0], /insufficient permissions/);
  });
});

describe('B3: category appearance is validated', () => {
  beforeEach(async () => {
    setOnline(true);
    db.failWrites = null;
    db._store.clear();
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
  });

  test('rejects an icon that is not in the allowed list', async () => {
    await assert.rejects(() => DataLayer.addCustomCategory({ name: 'Bad', budgetCap: 100, icon: '"><img src=x onerror=alert(1)>' }), /icon/i);
  });

  test('rejects a colour that is not a 6-digit hex value', async () => {
    await assert.rejects(() => DataLayer.addCustomCategory({ name: 'Bad', budgetCap: 100, color: 'red;background:url(x)' }), /colou?r/i);
  });

  test('safeIcon / safeColor fall back for tampered stored values', () => {
    assert.equal(DataLayer.safeIcon('<script>'), 'category');
    assert.equal(DataLayer.safeIcon('fitness_center'), 'fitness_center');
    assert.equal(DataLayer.safeColor('javascript:1'), '#006948');
    assert.equal(DataLayer.safeColor('#4F46E5'), '#4F46E5');
  });
});
