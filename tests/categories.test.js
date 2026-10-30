const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');

const UID = 'u3';
const expDoc = (n) => ({ amount: 10 + n, category: 'food', date: '2026-01-02', note: `n${n}`, createdAt: n });
const legacyExpenses = (n) => Array.from({ length: n }, (_, i) => ({ id: `old-${i}`, ...expDoc(i) }));
const countExpenseDocs = () => [...db._store.keys()].filter((k) => k.includes('/expenses/')).length;

function reset() {
  db.failWrites = null;
  db.failReads = null;
  db.hang = false;
  db._store.clear();
  DataLayer.clearUserData(); // also creates the mock storage and empties it
}

describe('B19: category matching is exact', () => {
  beforeEach(async () => {
    reset();
    await DataLayer.initUser(UID);
  });

  test('ids, names and known legacy spellings map to the built-in categories', () => {
    assert.equal(DataLayer.normalizeCategoryKey('food'), 'food');
    assert.equal(DataLayer.normalizeCategoryKey('FOOD'), 'food');
    assert.equal(DataLayer.normalizeCategoryKey('Food & Dining'), 'food');
    assert.equal(DataLayer.normalizeCategoryKey('Dining'), 'food');
    assert.equal(DataLayer.normalizeCategoryKey('Education & Textbooks'), 'textbooks');
    assert.equal(DataLayer.normalizeCategoryKey('Textbooks & Coursework'), 'textbooks');
    assert.equal(DataLayer.normalizeCategoryKey('metro'), 'transport');
  });

  test('a name that merely contains a built-in word is not folded into it', async () => {
    const fast = await DataLayer.addCustomCategory({ name: 'Fast Food', budgetCap: 400 });
    const trainer = await DataLayer.addCustomCategory({ name: 'Personal Trainer', budgetCap: 400 });
    assert.equal(DataLayer.normalizeCategoryKey(fast.id), fast.id);
    assert.equal(DataLayer.normalizeCategoryKey('Fast Food'), fast.id);
    assert.equal(DataLayer.normalizeCategoryKey('Personal Trainer'), trainer.id);
    assert.equal(DataLayer.normalizeCategoryKey('fast food court'), 'fast food court');
    assert.equal(DataLayer.normalizeCategoryKey('savings account'), 'savings account');
    assert.equal(DataLayer.normalizeCategoryKey('emergency cab'), 'emergency cab');
    assert.equal(DataLayer.normalizeCategoryKey('entertainment news'), 'entertainment news');
  });

  test('an empty or missing key is uncategorized, not Food', () => {
    assert.equal(DataLayer.normalizeCategoryKey(''), 'uncategorized');
    assert.equal(DataLayer.normalizeCategoryKey(null), 'uncategorized');
    assert.equal(DataLayer.normalizeCategoryKey(undefined), 'uncategorized');
  });

  test('an unknown stored category survives a load unchanged', async () => {
    db._store.set(`users/${UID}/expenses/odd`, { ...expDoc(1), category: 'mystery' });
    db._store.set(`users/${UID}/expenses/blank`, { ...expDoc(2), category: '' });
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    const byId = Object.fromEntries(DataLayer.getExpenses().map((e) => [e.id, e.category]));
    assert.equal(byId.odd, 'mystery');
    assert.equal(byId.blank, 'uncategorized');
  });

  test('new expenses must use a real category', async () => {
    await assert.rejects(() => DataLayer.addExpense({ amount: 5, category: 'mystery' }), /valid category/);
    await assert.rejects(() => DataLayer.addExpense({ amount: 5, category: '' }), /valid category/);
  });

  test('the Textbooks category has one name', () => {
    assert.equal(DataLayer.getActiveCategories().textbooks.name, 'Textbooks & Coursework');
  });
});

describe('B14: data left in the browser is never imported silently', () => {
  beforeEach(reset);

  test('it is offered, not written, when the account has no expenses', async () => {
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(3)));
    await DataLayer.initUser(UID);
    assert.equal(countExpenseDocs(), 0);
    assert.deepEqual(DataLayer.getPendingLegacyImport(), { expenseCount: 3, hasBudget: false, customCategoryCount: 0 });
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.ok(globalThis._mockStorage.getItem('expensetrack_expenses'));
  });

  test('importing copies it to the account and removes it from the browser', async () => {
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(3)));
    globalThis._mockStorage.setItem('expensetrack_budget', JSON.stringify({ overallCap: 15000, categories: {} }));
    await DataLayer.initUser(UID);
    const result = await DataLayer.importLegacyData();
    assert.equal(result.imported, 3);
    assert.equal(countExpenseDocs(), 3);
    assert.equal(db._store.get(`users/${UID}`).budget.overallCap, 15000);
    assert.equal(db._store.get(`users/${UID}`).legacyImportHandled, true);
    assert.equal(DataLayer.getExpenses().length, 3);
    assert.equal(DataLayer.getPendingLegacyImport(), null);
    assert.equal(globalThis._mockStorage.getItem('expensetrack_expenses'), null);
  });

  test('importing 600 expenses works (chunked batches)', async () => {
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(600)));
    await DataLayer.initUser(UID);
    await DataLayer.importLegacyData();
    assert.equal(countExpenseDocs(), 600);
  });

  test('"ask me later" keeps asking; a second account never sees it after discard', async () => {
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(2)));
    await DataLayer.initUser(UID);
    DataLayer.clearUserData();
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(2)));
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getPendingLegacyImport().expenseCount, 2);
    await DataLayer.discardLegacyData();
    assert.equal(DataLayer.getPendingLegacyImport(), null);
    assert.equal(globalThis._mockStorage.getItem('expensetrack_expenses'), null);
    assert.equal(countExpenseDocs(), 0);
    await DataLayer.initUser('someone-else');
    assert.equal(DataLayer.getPendingLegacyImport(), null);
  });

  test('once answered, old keys that reappear are not offered again', async () => {
    await DataLayer.initUser(UID);
    await DataLayer.discardLegacyData();
    DataLayer.clearUserData();
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(2)));
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getPendingLegacyImport(), null);
  });

  test('an account that already has expenses is not offered an import', async () => {
    db._store.set(`users/${UID}/expenses/e1`, expDoc(1));
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacyExpenses(2)));
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getPendingLegacyImport(), null);
    assert.equal(DataLayer.getExpenses().length, 1);
  });
});

describe('B16: a failed first read still attaches live listeners', () => {
  beforeEach(reset);

  test('initUser resolves and data arrives once the connection works', async () => {
    db.failReads = new Error('unavailable');
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.equal(DataLayer.getBudget().overallCap, 12000);

    db.failReads = null;
    let changes = 0;
    DataLayer.onDataChanged(() => { changes++; });
    await db.collection('users').doc(UID).collection('expenses').doc('late').set(expDoc(7));
    assert.ok(changes > 0, 'listener should have fired');
    assert.equal(DataLayer.getExpenses().length, 1);
    assert.equal(DataLayer.getExpenses()[0].id, 'late');
  });
});

describe('Undo support', () => {
  beforeEach(async () => {
    reset();
    await DataLayer.initUser(UID);
  });

  test('restoreExpense brings a deleted expense back with its id', async () => {
    const exp = await DataLayer.addExpense({ amount: 42.5, category: 'food', note: 'Lunch' });
    await DataLayer.deleteExpense(exp.id);
    assert.equal(DataLayer.getExpenses().length, 0);
    await DataLayer.restoreExpense(exp);
    const back = DataLayer.getExpenses();
    assert.equal(back.length, 1);
    assert.equal(back[0].id, exp.id);
    assert.equal(back[0].amount, 42.5);
    assert.ok(db._store.has(`users/${UID}/expenses/${exp.id}`));
  });
});
