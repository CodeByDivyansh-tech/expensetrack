/**
 * ExpenseTrack - Data Access Layer (DAL)
 * Abstracts all persistence operations behind a unified interface.
 * UI components never access localStorage directly.
 */

(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof root !== 'undefined') {
    root.ExpenseTrackDataLayer = lib;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const STORAGE_KEYS = {
    EXPENSES: 'expensetrack_expenses',
    BUDGET: 'expensetrack_budget',
    SETTINGS: 'expensetrack_settings',
    CUSTOM_CATEGORIES: 'expensetrack_custom_categories',
    USER_SESSION: 'expensetrack_user_session',
  };

  const DEFAULT_CATEGORIES = {
    food: {
      id: 'food',
      name: 'Food & Dining',
      icon: 'restaurant',
      color: '#f59e0b',
      iconBgClass: 'bg-tertiary-fixed text-on-tertiary-fixed',
      badgeBgClass: 'bg-tertiary-fixed-dim text-on-tertiary-fixed',
      desc: 'Campus canteen, Swiggy / Zomato, chai & snacks',
      defaultCap: 3500,
      minCap: 500,
      maxCap: 6000,
      step: 100,
      isDefault: true,
      isArchived: false,
    },
    groceries: {
      id: 'groceries',
      name: 'Groceries',
      icon: 'local_mall',
      color: '#006948',
      iconBgClass: 'bg-surface-container text-primary',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'Hostel essentials, local mart, fruits & snacks',
      defaultCap: 2000,
      minCap: 500,
      maxCap: 4000,
      step: 100,
      isDefault: true,
      isArchived: false,
    },
    transport: {
      id: 'transport',
      name: 'Transport',
      icon: 'directions_bus',
      color: '#0284c7',
      iconBgClass: 'bg-surface-container text-primary',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'Metro, auto rickshaw, bus pass, campus commute',
      defaultCap: 1000,
      minCap: 200,
      maxCap: 3000,
      step: 50,
      isDefault: true,
      isArchived: false,
    },
    textbooks: {
      id: 'textbooks',
      name: 'Education & Textbooks',
      icon: 'menu_book',
      color: '#ba1a1a',
      iconBgClass: 'bg-error-container text-error',
      badgeBgClass: 'bg-error-container text-on-error-container',
      desc: 'Course notes, photostat / printing, semester books',
      defaultCap: 1200,
      minCap: 200,
      maxCap: 3000,
      step: 50,
      isDefault: true,
      isArchived: false,
    },
    entertainment: {
      id: 'entertainment',
      name: 'Entertainment & Social',
      icon: 'celebration',
      color: '#565e74',
      iconBgClass: 'bg-secondary-container text-on-secondary-container',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'BookMyShow, weekend outings, campus fests',
      defaultCap: 1500,
      minCap: 200,
      maxCap: 3000,
      step: 50,
      isDefault: true,
      isArchived: false,
    },
    personal: {
      id: 'personal',
      name: 'Personal & Subscriptions',
      icon: 'subscriptions',
      color: '#00855d',
      iconBgClass: 'bg-surface-container text-primary',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'Mobile recharge, Spotify, haircuts, laundry',
      defaultCap: 600,
      minCap: 100,
      maxCap: 2000,
      step: 50,
      isDefault: true,
      isArchived: false,
    },
    emergency: {
      id: 'emergency',
      name: 'Emergency Student Fund',
      icon: 'lock',
      color: '#006948',
      iconBgClass: 'bg-primary text-on-primary',
      badgeBgClass: 'bg-primary-container text-on-primary-container',
      desc: 'Medical urgent needs, emergency travel, repairs',
      defaultCap: 1200,
      minCap: 200,
      maxCap: 5000,
      step: 100,
      isDefault: true,
      isAutoSave: true,
      isArchived: false,
    },
  };

  const DEFAULT_BUDGET = {
    overallCap: 12000,
    categories: {
      food: 3500,
      groceries: 2000,
      transport: 1000,
      textbooks: 1200,
      entertainment: 1500,
      personal: 600,
      emergency: 1200,
    },
  };

  const DEFAULT_SETTINGS = {
    notify80: false,
    weeklyDigest: false,
    roommateAlert: false,
  };

  // Safe storage access helper
  function getStorageEngine() {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    // Node.js fallback in-memory store for unit tests
    if (!globalThis._mockStorage) {
      globalThis._mockStorage = {
        _data: {},
        getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; },
      };
    }
    return globalThis._mockStorage;
  }

  function readJSON(key, fallback) {
    try {
      const storage = getStorageEngine();
      const val = storage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn(`Error reading ${key} from storage:`, e);
      return fallback;
    }
  }

  function writeJSON(key, data) {
    try {
      const storage = getStorageEngine();
      storage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error(`Error writing ${key} to storage:`, e);
      return false;
    }
  }

  // --- Category Normalization Helper ---
  function normalizeCategoryKey(key) {
    if (!key) return 'food';
    const lower = String(key).trim().toLowerCase();
    if (lower === 'food' || lower === 'dining' || lower.includes('food')) return 'food';
    if (lower === 'groceries' || lower === 'grocery') return 'groceries';
    if (lower === 'transport' || lower === 'transportation' || lower === 'commute' || lower === 'travel' || lower === 'bus' || lower === 'metro') return 'transport';
    if (lower === 'textbooks' || lower === 'education' || lower === 'coursework' || lower === 'books') return 'textbooks';
    if (lower === 'entertainment' || lower === 'social' || lower.includes('entertain')) return 'entertainment';
    if (lower === 'personal' || lower === 'subscriptions' || lower.includes('person')) return 'personal';
    if (lower === 'emergency' || lower.includes('emerg') || lower.includes('saving')) return 'emergency';
    
    // Check if matches a custom category id or name
    const all = getAllCategories(true);
    if (all[key]) return key;
    const found = Object.values(all).find(c => c.name.toLowerCase() === lower);
    if (found) return found.id;

    return DEFAULT_CATEGORIES[lower] ? lower : key;
  }

  // --- Category CRUD Operations ---

  function getCustomCategories() {
    const custom = readJSON(STORAGE_KEYS.CUSTOM_CATEGORIES, {});
    return custom && typeof custom === 'object' ? custom : {};
  }

  function saveCustomCategories(categories) {
    return writeJSON(STORAGE_KEYS.CUSTOM_CATEGORIES, categories);
  }

  /**
   * Get all categories (defaults + custom).
   * @param {boolean} includeArchived - If true, includes archived custom categories.
   */
  function getAllCategories(includeArchived = false) {
    const custom = getCustomCategories();
    const result = { ...DEFAULT_CATEGORIES };

    for (const [id, cat] of Object.entries(custom)) {
      if (includeArchived || !cat.isArchived) {
        result[id] = { ...cat };
      }
    }
    return result;
  }

  /**
   * Get only active categories for UI selection (Quick Log & Budget Setup).
   */
  function getActiveCategories() {
    return getAllCategories(false);
  }

  /**
   * Validate custom category inputs.
   */
  function validateCategoryInput(name, budgetCap, excludeId = null) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return { valid: false, error: 'Category name cannot be empty.' };
    }
    if (trimmed.length > 30) {
      return { valid: false, error: 'Category name must be 30 characters or fewer.' };
    }

    const all = getAllCategories(false);
    const lowerName = trimmed.toLowerCase();
    for (const [id, cat] of Object.entries(all)) {
      if (excludeId && id === excludeId) continue;
      if (cat.name.toLowerCase() === lowerName) {
        return { valid: false, error: `A category named "${cat.name}" already exists.` };
      }
    }

    const capNum = Number(budgetCap);
    if (isNaN(capNum) || capNum < 0) {
      return { valid: false, error: 'Budget cap must be a non-negative number.' };
    }

    return { valid: true, name: trimmed, budgetCap: Math.round(capNum) };
  }

  /**
   * Add a new custom category.
   */
  function addCustomCategory({ name, budgetCap = 500, icon = 'category', color = '#006948' }) {
    const validation = validateCategoryInput(name, budgetCap);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const id = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const newCategory = {
      id,
      name: validation.name,
      icon: icon || 'category',
      color: color || '#006948',
      iconBgClass: 'bg-surface-container text-primary',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'Custom category',
      defaultCap: validation.budgetCap,
      minCap: 100,
      maxCap: 10000,
      step: 50,
      isDefault: false,
      isArchived: false,
      createdAt: Date.now(),
    };

    const custom = getCustomCategories();
    custom[id] = newCategory;
    saveCustomCategories(custom);

    // Also update budget config with the new category cap
    const budget = getBudget();
    budget.categories[id] = validation.budgetCap;
    saveBudget(budget);

    return newCategory;
  }

  /**
   * Update a custom category (name and/or budgetCap). Stable ID is retained!
   */
  function updateCustomCategory(id, { name, budgetCap, icon, color }) {
    const custom = getCustomCategories();
    if (!custom[id]) {
      throw new Error('Custom category not found or cannot edit default categories.');
    }

    const validation = validateCategoryInput(name, budgetCap, id);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    custom[id] = {
      ...custom[id],
      name: validation.name,
      defaultCap: validation.budgetCap,
      icon: icon || custom[id].icon,
      color: color || custom[id].color,
      updatedAt: Date.now(),
    };
    saveCustomCategories(custom);

    // Update category cap in budget
    const budget = getBudget();
    budget.categories[id] = validation.budgetCap;
    saveBudget(budget);

    return custom[id];
  }

  /**
   * Delete or archive category.
   * If expenses exist with this category: ARCHIVES it (isArchived: true). NEVER deletes expenses!
   * If 0 expenses: hard deletes from custom categories.
   */
  function deleteCategory(id) {
    if (DEFAULT_CATEGORIES[id]) {
      throw new Error('Default categories cannot be deleted.');
    }

    const custom = getCustomCategories();
    if (!custom[id]) {
      throw new Error('Category not found.');
    }

    const expenses = getExpenses();
    const hasExpenses = expenses.some(exp => normalizeCategoryKey(exp.category) === id || exp.category === id);

    let action = '';
    if (hasExpenses) {
      // Archive so historical expenses and analytics continue to resolve properly
      custom[id].isArchived = true;
      custom[id].archivedAt = Date.now();
      saveCustomCategories(custom);
      action = 'archived';
    } else {
      // Hard delete from custom categories
      delete custom[id];
      saveCustomCategories(custom);
      action = 'deleted';
    }

    // Clean up from active budget if deleted
    if (action === 'deleted') {
      const budget = getBudget();
      if (budget.categories[id] !== undefined) {
        delete budget.categories[id];
        saveBudget(budget);
      }
    }

    return { action, categoryId: id };
  }

  // --- Expenses CRUD Operations ---

  function getExpenses() {
    const expenses = readJSON(STORAGE_KEYS.EXPENSES, []);
    return Array.isArray(expenses) ? expenses : [];
  }

  function saveExpenses(expenses) {
    return writeJSON(STORAGE_KEYS.EXPENSES, Array.isArray(expenses) ? expenses : []);
  }

  function addExpense({ amount, category, date, note }) {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      throw new Error('Please enter an amount greater than ₹0.');
    }

    const normCat = normalizeCategoryKey(category);
    const all = getAllCategories(true);
    if (!all[normCat]) {
      throw new Error('Please select a valid category.');
    }

    const today = new Date().toISOString().split('T')[0];
    const newExp = {
      id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      amount: Math.round(num * 100) / 100,
      category: normCat,
      date: date || today,
      note: (note && String(note).trim()) || all[normCat].name,
      createdAt: Date.now(),
    };

    const expenses = getExpenses();
    expenses.unshift(newExp);
    saveExpenses(expenses);
    return newExp;
  }

  function updateExpense(id, { amount, category, date, note }) {
    const expenses = getExpenses();
    const idx = expenses.findIndex(e => e.id === id);
    if (idx === -1) {
      throw new Error('Expense not found.');
    }

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      throw new Error('Please enter an amount greater than ₹0.');
    }

    const normCat = normalizeCategoryKey(category);
    const all = getAllCategories(true);

    expenses[idx] = {
      ...expenses[idx],
      amount: Math.round(num * 100) / 100,
      category: normCat,
      date: date || expenses[idx].date,
      note: (note && String(note).trim()) || all[normCat]?.name || expenses[idx].note,
      updatedAt: Date.now(),
    };

    saveExpenses(expenses);
    return expenses[idx];
  }

  function deleteExpense(id) {
    const expenses = getExpenses();
    const filtered = expenses.filter(e => e.id !== id);
    saveExpenses(filtered);
    return true;
  }

  function clearAllExpenses() {
    saveExpenses([]);
    return true;
  }

  // --- Budget CRUD Operations ---

  function getBudget() {
    const stored = readJSON(STORAGE_KEYS.BUDGET, null);
    if (stored && typeof stored === 'object' && stored.overallCap !== undefined) {
      return {
        overallCap: Number(stored.overallCap) || DEFAULT_BUDGET.overallCap,
        categories: { ...DEFAULT_BUDGET.categories, ...(stored.categories || {}) },
      };
    }
    return {
      overallCap: DEFAULT_BUDGET.overallCap,
      categories: { ...DEFAULT_BUDGET.categories },
    };
  }

  function saveBudget(budget) {
    return writeJSON(STORAGE_KEYS.BUDGET, budget);
  }

  function resetBudgetDefaults() {
    const active = getActiveCategories();
    const categories = {};
    for (const [id, cat] of Object.entries(active)) {
      categories[id] = cat.defaultCap;
    }
    const defaultBudget = {
      overallCap: DEFAULT_BUDGET.overallCap,
      categories,
    };
    saveBudget(defaultBudget);
    return defaultBudget;
  }

  // --- Settings CRUD Operations ---

  function getSettings() {
    const stored = readJSON(STORAGE_KEYS.SETTINGS, null);
    return (stored && typeof stored === 'object') ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS };
  }

  function saveSettings(settings) {
    return writeJSON(STORAGE_KEYS.SETTINGS, settings);
  }

  // --- User Session ---

  function getUserSession() {
    return readJSON(STORAGE_KEYS.USER_SESSION, null);
  }

  function saveUserSession(session) {
    return writeJSON(STORAGE_KEYS.USER_SESSION, session);
  }

  function clearUserSession() {
    const storage = getStorageEngine();
    storage.removeItem(STORAGE_KEYS.USER_SESSION);
  }

  return {
    STORAGE_KEYS,
    DEFAULT_CATEGORIES,
    DEFAULT_BUDGET,
    DEFAULT_SETTINGS,
    normalizeCategoryKey,
    // Category operations
    getAllCategories,
    getActiveCategories,
    getCustomCategories,
    addCustomCategory,
    updateCustomCategory,
    deleteCategory,
    validateCategoryInput,
    // Expense operations
    getExpenses,
    saveExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    clearAllExpenses,
    // Budget operations
    getBudget,
    saveBudget,
    resetBudgetDefaults,
    // Settings operations
    getSettings,
    saveSettings,
    // User session
    getUserSession,
    saveUserSession,
    clearUserSession,
  };
});
