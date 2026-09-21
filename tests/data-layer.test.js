const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const DataLayer = require('../data-layer.js');

describe('Data Access Layer - Categories & Expenses', () => {

  beforeEach(() => {
    // Reset in-memory mock storage
    if (globalThis._mockStorage) {
      globalThis._mockStorage.clear();
    }
  });

  test('Default categories initialized (Food, Groceries, Transport, Textbooks, Entertainment, Personal, Emergency)', () => {
    const cats = DataLayer.getActiveCategories();
    assert.equal(Object.keys(cats).length, 7);
    assert.ok(cats.food);
    assert.ok(cats.groceries);
    assert.ok(cats.transport);
    assert.ok(cats.textbooks);
    assert.ok(cats.entertainment);
    assert.ok(cats.personal);
    assert.ok(cats.emergency);
  });

  test('Add custom category creates stable ID and updates budget', () => {
    const gym = DataLayer.addCustomCategory({
      name: 'Gym & Fitness',
      budgetCap: 1500,
      icon: 'fitness_center',
      color: '#4f46e5',
    });

    assert.ok(gym.id.startsWith('custom_'));
    assert.equal(gym.name, 'Gym & Fitness');
    assert.equal(gym.defaultCap, 1500);
    assert.equal(gym.isArchived, false);

    const active = DataLayer.getActiveCategories();
    assert.equal(Object.keys(active).length, 8);
    assert.ok(active[gym.id]);

    const budget = DataLayer.getBudget();
    assert.equal(budget.categories[gym.id], 1500);
  });

  test('Validation: Rejects empty name, duplicate names, negative budget', () => {
    // Empty name
    assert.throws(() => {
      DataLayer.addCustomCategory({ name: '   ', budgetCap: 500 });
    }, /cannot be empty/);

    // Duplicate name (existing default)
    assert.throws(() => {
      DataLayer.addCustomCategory({ name: 'food & dining', budgetCap: 500 });
    }, /already exists/);

    // Add first custom
    DataLayer.addCustomCategory({ name: 'Laundry', budgetCap: 400 });

    // Duplicate name (existing custom, case-insensitive)
    assert.throws(() => {
      DataLayer.addCustomCategory({ name: 'laundry', budgetCap: 600 });
    }, /already exists/);

    // Negative budget
    assert.throws(() => {
      DataLayer.addCustomCategory({ name: 'Books', budgetCap: -100 });
    }, /non-negative/);
  });

  test('Update custom category retains stable ID', () => {
    const cat = DataLayer.addCustomCategory({ name: 'Recharge', budgetCap: 300 });
    const originalId = cat.id;

    const updated = DataLayer.updateCustomCategory(originalId, {
      name: 'Phone & WiFi Recharge',
      budgetCap: 500,
    });

    assert.equal(updated.id, originalId);
    assert.equal(updated.name, 'Phone & WiFi Recharge');
    assert.equal(updated.defaultCap, 500);

    const active = DataLayer.getActiveCategories();
    assert.equal(active[originalId].name, 'Phone & WiFi Recharge');
    assert.equal(active[originalId].defaultCap, 500);

    const budget = DataLayer.getBudget();
    assert.equal(budget.categories[originalId], 500);
  });

  test('Delete custom category with 0 expenses -> hard deletes', () => {
    const cat = DataLayer.addCustomCategory({ name: 'Swimming', budgetCap: 1000 });
    assert.ok(DataLayer.getActiveCategories()[cat.id]);

    const result = DataLayer.deleteCategory(cat.id);
    assert.equal(result.action, 'deleted');
    assert.equal(DataLayer.getActiveCategories()[cat.id], undefined);
    assert.equal(DataLayer.getAllCategories(true)[cat.id], undefined);
  });

  test('Delete custom category with expenses -> ARCHIVES category, NEVER deletes expenses', () => {
    const cat = DataLayer.addCustomCategory({ name: 'Dance Class', budgetCap: 1200 });

    // Log an expense in this category
    const exp = DataLayer.addExpense({
      amount: 600,
      category: cat.id,
      note: 'Monthly dance fee',
    });

    assert.equal(exp.category, cat.id);
    assert.equal(DataLayer.getExpenses().length, 1);

    // Attempt delete
    const result = DataLayer.deleteCategory(cat.id);
    assert.equal(result.action, 'archived');

    // Expense MUST STILL EXIST
    const expenses = DataLayer.getExpenses();
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].id, exp.id);
    assert.equal(expenses[0].amount, 600);

    // Category is excluded from active categories (Quick Log / new budgets)
    assert.equal(DataLayer.getActiveCategories()[cat.id], undefined);

    // But retained in all categories for historical expense & analytics resolution
    const all = DataLayer.getAllCategories(true);
    assert.ok(all[cat.id]);
    assert.equal(all[cat.id].isArchived, true);
    assert.equal(all[cat.id].name, 'Dance Class');
  });

  test('Renaming category does not orphan existing expenses', () => {
    const cat = DataLayer.addCustomCategory({ name: 'Tuck Shop', budgetCap: 800 });

    const exp = DataLayer.addExpense({
      amount: 150,
      category: cat.id,
      note: 'Midnight snack',
    });

    // Rename
    DataLayer.updateCustomCategory(cat.id, {
      name: 'Night Canteen & Tuck',
      budgetCap: 900,
    });

    // Existing expense still references cat.id
    const retrievedExp = DataLayer.getExpenses()[0];
    assert.equal(retrievedExp.category, cat.id);

    // Category resolution returns new name
    const all = DataLayer.getAllCategories(true);
    assert.equal(all[retrievedExp.category].name, 'Night Canteen & Tuck');
  });
});
