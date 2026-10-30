const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');
const BC = require('../budget-calculator.js');

const UID = 'u2';

describe('B5: amounts keep their paise', () => {
  test('roundMoney avoids float noise', () => {
    assert.equal(BC.roundMoney(0.1 + 0.2), 0.3);
    assert.equal(BC.roundMoney('abc'), 0);
  });

  test('formatINR shows paise only when there are some, with Indian grouping', () => {
    assert.equal(BC.formatINR(49.5), '49.50');
    assert.equal(BC.formatINR(50), '50');
    assert.equal(BC.formatINR(50.004), '50');
    assert.equal(BC.formatINR(123456), '1,23,456');
    assert.equal(BC.formatINR(1234567.25), '12,34,567.25');
    assert.equal(BC.formatINR(null), '0');
  });
});

describe('B6: one rule for the monthly cap', () => {
  test('accepts whole rupees from 500 to 10,00,000', () => {
    assert.deepEqual(BC.validateOverallCap('12000'), { valid: true, value: 12000 });
    assert.equal(BC.validateOverallCap(500).valid, true);
    assert.equal(BC.validateOverallCap(1000000).valid, true);
  });

  test('rejects zero, blanks, decimals, text and out-of-range values with a message', () => {
    for (const bad of [0, '', null, undefined, 499, 1000001, 12.5, 'abc', -5]) {
      const r = BC.validateOverallCap(bad);
      assert.equal(r.valid, false, `expected ${bad} to be rejected`);
      assert.ok(r.error.length > 0);
    }
  });

  describe('data layer', () => {
    beforeEach(async () => {
      db.failWrites = null;
      db._store.clear();
      DataLayer.clearUserData();
      await DataLayer.initUser(UID);
    });

    test('saveBudget rejects an invalid cap instead of silently storing 12,000', async () => {
      await assert.rejects(() => DataLayer.saveBudget({ overallCap: 0, categories: {} }), /between|Enter/);
      await assert.rejects(() => DataLayer.saveBudget({ overallCap: 12.5, categories: {} }), /whole rupees/);
      assert.equal(DataLayer.getBudget().overallCap, 12000);
    });

    test('saveBudget stores a valid new cap', async () => {
      await DataLayer.saveBudget({ overallCap: 20000, categories: {} });
      assert.equal(DataLayer.getBudget().overallCap, 20000);
      assert.equal(db._store.get(`users/${UID}`).budget.overallCap, 20000);
    });

    test('saving category caps does not re-validate an unchanged cap', async () => {
      const budget = DataLayer.getBudget();
      budget.categories.food = 3000;
      await DataLayer.saveBudget(budget);
      assert.equal(DataLayer.getBudget().categories.food, 3000);
    });
  });
});

describe('B7: archived categories do not count as allocated', () => {
  const caps = { food: 3500, groceries: 2000, transport: 1000, textbooks: 1200, entertainment: 1500, personal: 600, emergency: 1200, custom_old: 2000 };
  const active = ['food', 'groceries', 'transport', 'textbooks', 'entertainment', 'personal', 'emergency'];

  test('caps of categories that are not active are left out', () => {
    assert.equal(BC.computeAllocation(12000, caps, active).totalAllocated, 11000);
    assert.equal(BC.computeAllocation(12000, caps).totalAllocated, 13000);
  });

  test('an archived custom category drops out of the active list the app passes in', async () => {
    db._store.clear();
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    const cat = await DataLayer.addCustomCategory({ name: 'Hobby', budgetCap: 2000 });
    await DataLayer.addExpense({ amount: 10, category: cat.id });
    await DataLayer.deleteCategory(cat.id);
    const ids = Object.keys(DataLayer.getActiveCategories());
    const alloc = BC.computeAllocation(12000, DataLayer.getBudget().categories, ids);
    assert.equal(alloc.totalAllocated, 11000);
  });
});

describe('B8: more than 500 documents', () => {
  beforeEach(async () => {
    db.failWrites = null;
    db._store.clear();
    DataLayer.clearUserData();
  });

  test('clearAllExpenses deletes 1,200 expenses in chunks', async () => {
    for (let i = 0; i < 1200; i++) {
      db._store.set(`users/${UID}/expenses/e${i}`, { amount: 1, category: 'food', date: '2026-01-01', note: 'x', createdAt: i });
    }
    await DataLayer.initUser(UID);
    assert.equal(DataLayer.getExpenses().length, 1200);
    await DataLayer.clearAllExpenses();
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.equal([...db._store.keys()].filter((k) => k.includes('/expenses/')).length, 0);
  });

  test('the localStorage migration copies 600 legacy expenses', async () => {
    DataLayer.clearUserData(); // makes sure the mock storage exists
    const legacy = Array.from({ length: 600 }, (_, i) => ({ id: `old-${i}`, amount: 10 + i, category: 'food', date: '2026-01-02', note: 'n', createdAt: i }));
    globalThis._mockStorage.setItem('expensetrack_expenses', JSON.stringify(legacy));
    globalThis._mockStorage.setItem('expensetrack_budget', JSON.stringify({ overallCap: 15000, categories: {} }));
    await DataLayer.initUser(UID);
    await DataLayer.importLegacyData(); // the user confirmed the import
    assert.equal([...db._store.keys()].filter((k) => k.includes('/expenses/')).length, 600);
    assert.equal(db._store.get(`users/${UID}`).budget.overallCap, 15000);
    assert.equal(DataLayer.getExpenses().length, 600);
    assert.equal(globalThis._mockStorage.getItem('expensetrack_expenses'), null);
  });
});

describe('B9: analytics numbers', () => {
  test('dailyAverage divides by days elapsed in the current month', () => {
    const now = new Date(2026, 9, 10);
    assert.deepEqual(BC.dailyAverage(600, 2026, 9, now), { average: 60, days: 10, isCurrentMonth: true });
  });

  test('dailyAverage divides by the whole month for past months', () => {
    const now = new Date(2026, 9, 10);
    const r = BC.dailyAverage(600, 2026, 8, now);
    assert.equal(r.days, 30);
    assert.equal(r.average, 20);
    assert.equal(r.isCurrentMonth, false);
  });

  test('weeklyBuckets never makes a bucket longer than seven days', () => {
    const oct = BC.weeklyBuckets(2026, 9, []);
    assert.equal(oct.length, 5);
    assert.deepEqual(oct.map((b) => [b.start, b.end]), [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]]);
    assert.equal(oct[4].label, '29–31 Oct');
    assert.equal(BC.weeklyBuckets(2026, 1, []).length, 4); // February 2026
  });

  test('weeklyBuckets puts days 22-28 and 29-31 in different buckets', () => {
    const b = BC.weeklyBuckets(2026, 9, [
      { date: '2026-10-22', amount: 100 },
      { date: '2026-10-28', amount: 50.5 },
      { date: '2026-10-29', amount: 7 },
      { date: '2026-10-01', amount: 3 },
    ]);
    assert.deepEqual(b.map((x) => x.total), [3, 0, 0, 150.5, 7]);
  });
});

describe('B11: expense input limits', () => {
  beforeEach(async () => {
    db.failWrites = null;
    db._store.clear();
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
  });

  test('keeps paise exactly (B5)', async () => {
    const exp = await DataLayer.addExpense({ amount: '49.50', category: 'food' });
    assert.equal(exp.amount, 49.5);
    assert.equal(db._store.get(`users/${UID}/expenses/${exp.id}`).amount, 49.5);
  });

  test('rejects a future date', async () => {
    await assert.rejects(() => DataLayer.addExpense({ amount: 10, category: 'food', date: '2030-01-01' }), /future/);
    assert.equal(DataLayer.getExpenses().length, 0);
  });

  test('accepts today and rejects dates before 2000 or that do not exist', async () => {
    await DataLayer.addExpense({ amount: 10, category: 'food', date: DataLayer.localDateString() });
    await assert.rejects(() => DataLayer.addExpense({ amount: 10, category: 'food', date: '1999-12-31' }), /before 2000/);
    await assert.rejects(() => DataLayer.addExpense({ amount: 10, category: 'food', date: '2026-02-31' }), /valid date/);
    await assert.rejects(() => DataLayer.addExpense({ amount: 10, category: 'food', date: 'yesterday' }), /valid date/);
  });

  test('rejects amounts above 10,00,000 and notes over 100 characters', async () => {
    await assert.rejects(() => DataLayer.addExpense({ amount: 1000001, category: 'food' }), /at most/);
    await DataLayer.addExpense({ amount: 1000000, category: 'food' });
    await assert.rejects(() => DataLayer.addExpense({ amount: 5, category: 'food', note: 'x'.repeat(101) }), /100 characters/);
    await DataLayer.addExpense({ amount: 5, category: 'food', note: 'x'.repeat(100) });
  });

  test('updateExpense applies the same limits', async () => {
    const exp = await DataLayer.addExpense({ amount: 10, category: 'food' });
    await assert.rejects(() => DataLayer.updateExpense(exp.id, { amount: 10, category: 'food', date: '2030-01-01' }), /future/);
    assert.equal(DataLayer.getExpenses()[0].date, exp.date);
  });
});
