const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const BC = require('../budget-calculator.js');
const T = require('../expense-tools.js');

describe('category cap rule', () => {
  test('accepts whole rupees from 0 to 10,00,000', () => {
    assert.deepEqual(BC.validateCategoryCap('4200'), { valid: true, value: 4200 });
    assert.equal(BC.validateCategoryCap(0).valid, true);
    assert.equal(BC.validateCategoryCap(1000000).valid, true);
  });

  test('rejects blanks, decimals, negatives, text and huge values', () => {
    for (const bad of ['', null, undefined, -1, 12.5, 'abc', 1000001]) {
      const r = BC.validateCategoryCap(bad);
      assert.equal(r.valid, false, `expected ${bad} to be rejected`);
      assert.ok(r.error);
    }
  });
});

describe('scaling category caps with the monthly budget', () => {
  const caps = { food: 3500, groceries: 2000, custom_old: 777 };

  test('multiplies the active categories and rounds to the nearest ₹10', () => {
    const out = BC.scaleCaps(caps, 12000, 24000, ['food', 'groceries']);
    assert.equal(out.food, 7000);
    assert.equal(out.groceries, 4000);
    assert.equal(out.custom_old, 777); // not active: untouched
  });

  test('scales down too, and never goes below zero or above the limit', () => {
    assert.equal(BC.scaleCaps({ a: 3333 }, 12000, 6000, ['a']).a, 1670);
    assert.equal(BC.scaleCaps({ a: 900000 }, 1000, 100000, ['a']).a, 1000000);
  });

  test('a zero old budget changes nothing', () => {
    assert.equal(BC.scaleCaps({ a: 100 }, 0, 5000, ['a']).a, 100);
  });
});

describe('budget alerts', () => {
  const categories = { food: { name: 'Food & Dining' }, groceries: { name: 'Groceries' }, transport: { name: 'Transport' } };
  const base = { overallCap: 10000, totalSpent: 0, spendingMap: {}, caps: { food: 1000, groceries: 2000, transport: 0 }, categories };

  test('nothing below 80%', () => {
    assert.deepEqual(BC.computeAlerts({ ...base, totalSpent: 7999, spendingMap: { food: 799 } }), []);
  });

  test('warns from 80% and again from 100%, for the overall budget and each category', () => {
    const alerts = BC.computeAlerts({ ...base, totalSpent: 8000, spendingMap: { food: 800, groceries: 2500 } });
    assert.deepEqual(alerts.map((a) => [a.id, a.level, a.pct]), [['overall', 'warn', 80], ['food', 'warn', 80], ['groceries', 'over', 125]]);
    assert.equal(alerts[0].name, 'Monthly budget');
  });

  test('exactly 100% is "over"; a zero cap never alerts', () => {
    const alerts = BC.computeAlerts({ ...base, totalSpent: 100, spendingMap: { food: 1000, transport: 500 } });
    assert.deepEqual(alerts.map((a) => [a.id, a.level]), [['food', 'over']]);
  });

  test('only categories in the list are considered (archived ones are not passed in)', () => {
    const alerts = BC.computeAlerts({ ...base, spendingMap: { food: 900, gone: 9999 }, caps: { food: 1000, gone: 10 } });
    assert.deepEqual(alerts.map((a) => a.id), ['food']);
  });
});

describe('Uncategorized filter', () => {
  const cats = { food: { id: 'food', name: 'Food' } };
  const list = [{ id: 'a', category: 'food', amount: 1, date: '2026-01-01' }, { id: 'b', category: 'mystery', amount: 1, date: '2026-01-01' }];

  test('matches only expenses whose category is not a known one', () => {
    assert.deepEqual(T.filterExpenses(list, { category: 'uncategorized' }, cats).map((e) => e.id), ['b']);
    assert.deepEqual(T.filterExpenses(list, { category: 'food' }, cats).map((e) => e.id), ['a']);
  });
});
