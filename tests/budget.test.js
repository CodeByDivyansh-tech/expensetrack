const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeAllocation } = require('../budget-calculator.js');

describe('Budget Allocation Calculator - computeAllocation()', () => {

  test('Case 1: Under budget - budget 10,000 / categories 9,000 -> 90%, ₹1,000 remaining', () => {
    const result = computeAllocation(10000, {
      food: 4000,
      groceries: 3000,
      transport: 2000,
    });

    assert.equal(result.monthlyBudget, 10000);
    assert.equal(result.totalAllocated, 9000);
    assert.equal(result.allocatedPercent, 90);
    assert.equal(result.visualBarWidthPercent, 90);
    assert.equal(result.buffer, 1000);
    assert.equal(result.remaining, 1000);
    assert.equal(result.overAmount, 0);
    assert.equal(result.isOverBudget, false);
    assert.match(result.statusText, /1,000 remaining/);
    assert.match(result.percentLabel, /90% assigned/);
  });

  test('Case 2: Exactly on budget - budget 10,000 / categories 10,000 -> 100%, ₹0 remaining', () => {
    const result = computeAllocation(10000, {
      food: 5000,
      groceries: 3000,
      transport: 2000,
    });

    assert.equal(result.monthlyBudget, 10000);
    assert.equal(result.totalAllocated, 10000);
    assert.equal(result.allocatedPercent, 100);
    assert.equal(result.visualBarWidthPercent, 100);
    assert.equal(result.buffer, 0);
    assert.equal(result.remaining, 0);
    assert.equal(result.overAmount, 0);
    assert.equal(result.isOverBudget, false);
    assert.match(result.statusText, /0 remaining/);
    assert.match(result.percentLabel, /100% assigned/);
  });

  test('Case 3: Over budget - budget 10,000 / categories 11,000 -> 110%, ₹1,000 over budget', () => {
    const result = computeAllocation(10000, {
      food: 5000,
      groceries: 3500,
      transport: 2500,
    });

    assert.equal(result.monthlyBudget, 10000);
    assert.equal(result.totalAllocated, 11000);
    assert.equal(result.allocatedPercent, 110);
    // Visual bar width must be capped at 100%
    assert.equal(result.visualBarWidthPercent, 100);
    assert.equal(result.buffer, -1000);
    assert.equal(result.remaining, 0);
    assert.equal(result.overAmount, 1000);
    assert.equal(result.isOverBudget, true);
    assert.match(result.statusText, /1,000 over budget/);
    assert.match(result.percentLabel, /110% allocated/);
  });

  test('Edge Case: budget = 0 or unset (no NaN, no divide-by-zero)', () => {
    const resultZero = computeAllocation(0, { food: 2000 });
    assert.equal(resultZero.monthlyBudget, 0);
    assert.equal(resultZero.totalAllocated, 2000);
    assert.equal(isNaN(resultZero.allocatedPercent), false);
    assert.equal(resultZero.isOverBudget, true);
    assert.equal(resultZero.visualBarWidthPercent, 100);

    const resultNull = computeAllocation(null, { food: 2000 });
    assert.equal(resultNull.monthlyBudget, 0);
    assert.equal(isNaN(resultNull.allocatedPercent), false);

    const resultUndefined = computeAllocation(undefined, {});
    assert.equal(resultUndefined.monthlyBudget, 0);
    assert.equal(resultUndefined.totalAllocated, 0);
    assert.equal(resultUndefined.allocatedPercent, 0);
    assert.equal(resultUndefined.isOverBudget, false);
  });

  test('Edge Case: empty categories object or null categories', () => {
    const resultEmpty = computeAllocation(12000, {});
    assert.equal(resultEmpty.totalAllocated, 0);
    assert.equal(resultEmpty.buffer, 12000);
    assert.equal(resultEmpty.allocatedPercent, 0);
    assert.equal(resultEmpty.isOverBudget, false);

    const resultNullCat = computeAllocation(12000, null);
    assert.equal(resultNullCat.totalAllocated, 0);
    assert.equal(resultNullCat.buffer, 12000);
  });

  test('Edge Case: decimals and fractional currency', () => {
    const resultDecimal = computeAllocation(10000.50, {
      food: 3333.33,
      groceries: 3333.33,
      transport: 3333.34,
    });

    assert.equal(resultDecimal.monthlyBudget, 10000.50);
    assert.equal(resultDecimal.totalAllocated, 10000);
    assert.equal(resultDecimal.buffer, 0.50);
    assert.equal(resultDecimal.isOverBudget, false);
    assert.equal(resultDecimal.allocatedPercent, 100);
  });

  test('Edge Case: string number inputs and invalid values', () => {
    const resultStrings = computeAllocation('15000', {
      food: '5000',
      groceries: '4000',
      invalid: 'not-a-number',
      negative: -500,
    });

    assert.equal(resultStrings.monthlyBudget, 15000);
    assert.equal(resultStrings.totalAllocated, 9000);
    assert.equal(resultStrings.buffer, 6000);
    assert.equal(resultStrings.allocatedPercent, 60);
    assert.equal(resultStrings.isOverBudget, false);
  });
});
