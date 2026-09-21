const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const DataLayer = require('../data-layer.js');
const { computeAllocation } = require('../budget-calculator.js');

describe('Phase A Integration Flow Verification', () => {

  beforeEach(() => {
    if (globalThis._mockStorage) {
      globalThis._mockStorage.clear();
    }
  });

  test('Requirement 1: computeAllocation handles user scenarios accurately', () => {
    // 10,000 / 9,000 -> 90%, 1,000 remain
    const r1 = computeAllocation(10000, { c1: 9000 });
    assert.equal(r1.allocatedPercent, 90);
    assert.equal(r1.remaining, 1000);
    assert.equal(r1.isOverBudget, false);

    // 10,000 / 10,000 -> 100%, 0 remain
    const r2 = computeAllocation(10000, { c1: 10000 });
    assert.equal(r2.allocatedPercent, 100);
    assert.equal(r2.remaining, 0);
    assert.equal(r2.isOverBudget, false);

    // 10,000 / 11,000 -> 110%, 1,000 over budget
    const r3 = computeAllocation(10000, { c1: 11000 });
    assert.equal(r3.allocatedPercent, 110);
    assert.equal(r3.visualBarWidthPercent, 100); // Progress bar capped at 100%
    assert.equal(r3.overAmount, 1000);
    assert.equal(r3.isOverBudget, true);
    assert.match(r3.statusText, /1,000 over budget/);
  });

  test('Requirement 4: 7 default categories preserved, custom categories addable, editable, archivable', () => {
    const defaults = DataLayer.getActiveCategories();
    assert.equal(Object.keys(defaults).length, 7);

    // 1. Add custom category
    const cat = DataLayer.addCustomCategory({
      name: 'College Fest',
      budgetCap: 2500,
      icon: 'celebration',
      color: '#c026d3',
    });
    assert.ok(cat.id.startsWith('custom_'));
    assert.equal(cat.isDefault, false);
    assert.equal(cat.isArchived, false);

    // Verify active count is now 8
    assert.equal(Object.keys(DataLayer.getActiveCategories()).length, 8);

    // 2. Edit custom category (name + budget)
    const updated = DataLayer.updateCustomCategory(cat.id, {
      name: 'Campus Fest & Culturals',
      budgetCap: 3000,
    });
    assert.equal(updated.name, 'Campus Fest & Culturals');
    assert.equal(updated.defaultCap, 3000);

    // 3. Log expense in custom category
    const exp = DataLayer.addExpense({
      amount: 500,
      category: cat.id,
      note: 'Fest merchandise',
    });
    assert.equal(exp.category, cat.id);

    // 4. Archive category (attempting delete when expenses exist)
    const delResult = DataLayer.deleteCategory(cat.id);
    assert.equal(delResult.action, 'archived');

    // Category no longer in active categories
    assert.equal(DataLayer.getActiveCategories()[cat.id], undefined);
    // But remains in all categories with isArchived = true
    assert.equal(DataLayer.getAllCategories(true)[cat.id].isArchived, true);

    // CRITICAL: Expense MUST NOT BE DELETED
    const exps = DataLayer.getExpenses();
    assert.equal(exps.length, 1);
    assert.equal(exps[0].id, exp.id);
    assert.equal(exps[0].amount, 500);
  });

  test('Requirement 5: Data access layer handles budget and settings without direct localStorage', () => {
    // Initial default budget
    const budget = DataLayer.getBudget();
    assert.equal(budget.overallCap, 12000);

    // Update overall cap (never auto-changed)
    budget.overallCap = 15000;
    DataLayer.saveBudget(budget);

    const reloaded = DataLayer.getBudget();
    assert.equal(reloaded.overallCap, 15000);

    // Settings
    const settings = DataLayer.getSettings();
    assert.equal(settings.notify80, false);
    settings.notify80 = true;
    DataLayer.saveSettings(settings);

    const reloadedSettings = DataLayer.getSettings();
    assert.equal(reloadedSettings.notify80, true);
  });
});
