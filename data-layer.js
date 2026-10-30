/**
 * ExpenseTrack - Data Access Layer (DAL)
 * Unified persistence abstraction supporting Cloud Firestore with offline persistence
 * and multi-tab synchronization, with graceful local fallback.
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

  const BudgetCalc = (typeof window !== 'undefined' && window.BudgetCalculator)
    ? window.BudgetCalculator
    : require('./budget-calculator.js');

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

  // --- Local Time Helpers (Fix for midnight - 5:30 AM IST UTC offset) ---
  function localDateString(date = new Date()) {
    const d = (date instanceof Date) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    const parts = String(dateStr).split('-');
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date(dateStr);
  }

  // --- Expense input rules (shared by the form and the data layer) ---
  const MAX_EXPENSE_AMOUNT = 1000000;
  const MIN_EXPENSE_DATE = '2000-01-01';
  const MAX_NOTE_LENGTH = 100;

  function validateExpenseInput({ amount, date, note }, today = localDateString()) {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      return { valid: false, error: 'Please enter an amount greater than ₹0.' };
    }
    if (num > MAX_EXPENSE_AMOUNT) {
      return { valid: false, error: 'An expense can be at most ₹10,00,000.' };
    }
    if (date) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
      const real = m && parseLocalDate(date);
      if (!m || real.getFullYear() !== +m[1] || real.getMonth() !== +m[2] - 1 || real.getDate() !== +m[3]) {
        return { valid: false, error: 'Please enter a valid date.' };
      }
      if (date > today) {
        return { valid: false, error: "The date can't be in the future." };
      }
      if (date < MIN_EXPENSE_DATE) {
        return { valid: false, error: "The date can't be before 2000." };
      }
    }
    if (note && String(note).trim().length > MAX_NOTE_LENGTH) {
      return { valid: false, error: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` };
    }
    return { valid: true, amount: BudgetCalc.roundMoney(num) };
  }

  function isSameMonth(dateStr, targetYear, targetMonth) {
    const d = parseLocalDate(dateStr);
    return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
  }

  function isCurrentMonth(dateStr) {
    const now = new Date();
    return isSameMonth(dateStr, now.getFullYear(), now.getMonth());
  }

  // --- Safe Storage Helper (Browser localStorage or Node mock) ---
  function getStorageEngine() {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
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

  function getDb() {
    if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
      return firebase.firestore();
    }
    if (typeof window !== 'undefined' && window.FirebaseService && window.FirebaseService.db) {
      return window.FirebaseService.db;
    }
    return null;
  }

  // --- In-Memory State for Active User ---
  let _currentUid = null;
  let _expenses = [];
  let _budget = null;
  let _settings = null;
  let _customCategories = null;
  let _unsubscribeUserDoc = null;
  let _unsubscribeExpenses = null;
  let _changeListeners = [];

  function notifyChange() {
    _changeListeners.forEach(fn => {
      try { fn(); } catch (e) { console.error('Data change listener error:', e); }
    });
  }

  function onDataChanged(listener) {
    if (typeof listener === 'function') {
      _changeListeners.push(listener);
    }
    return () => {
      _changeListeners = _changeListeners.filter(l => l !== listener);
    };
  }

  // --- Appearance validation (icons and colours end up in the DOM) ---
  const ALLOWED_ICONS = [
    'category', 'fitness_center', 'local_laundry_service', 'home', 'phone_android', 'medical_services',
    'flight', 'local_cafe', 'shopping_bag', 'sports_esports', 'school', 'savings',
    'restaurant', 'local_mall', 'directions_bus', 'menu_book', 'celebration', 'subscriptions', 'lock', 'receipt_long',
  ];
  const DEFAULT_CATEGORY_COLOR = '#006948';

  function isValidColor(color) {
    return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
  }

  function safeIcon(icon) {
    return ALLOWED_ICONS.includes(icon) ? icon : 'category';
  }

  function safeColor(color) {
    return isValidColor(color) ? color : DEFAULT_CATEGORY_COLOR;
  }

  // --- Write handling ---
  let _writeErrorListeners = [];

  function onWriteError(listener) {
    if (typeof listener === 'function') _writeErrorListeners.push(listener);
    return () => {
      _writeErrorListeners = _writeErrorListeners.filter(l => l !== listener);
    };
  }

  function notifyWriteError(err) {
    _writeErrorListeners.forEach(fn => {
      try { fn(err); } catch (e) { console.error('Write error listener failed:', e); }
    });
  }

  function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /**
   * Wait for a Firestore write. Offline, the server never acknowledges, so the write stays queued
   * in the SDK and we resolve right away; a later rejection is reported through onWriteError.
   */
  async function commitWrite(promise) {
    if (isOffline()) {
      promise.catch(err => {
        console.error('Queued Firestore write failed:', err);
        notifyWriteError(err);
      });
      return { queued: true };
    }
    await promise;
    return { queued: false };
  }

  /**
   * Persist top-level user-doc fields (budget, settings, customCategories) in one write.
   * Each field is replaced as a whole, so deleted keys really disappear from Firestore.
   */
  async function persistUserFields(fields) {
    const db = getDb();
    if (db && _currentUid) {
      const names = Object.keys(fields);
      return commitWrite(db.collection('users').doc(_currentUid).set(
        { ...fields, updatedAt: Date.now() },
        { mergeFields: [...names, 'updatedAt'] }
      ));
    }
    const keyFor = {
      budget: STORAGE_KEYS.BUDGET,
      settings: STORAGE_KEYS.SETTINGS,
      customCategories: STORAGE_KEYS.CUSTOM_CATEGORIES,
    };
    for (const [name, value] of Object.entries(fields)) {
      if (!writeJSON(keyFor[name], value)) {
        throw new Error('Could not save to this browser\'s storage. It may be full or blocked.');
      }
    }
    return { queued: false };
  }

  const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch; keep a margin

  /** Apply set/delete writes in sequential batches. writes: [{ ref, data?, options?, remove? }] */
  async function commitInBatches(db, writes) {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      writes.slice(i, i + BATCH_LIMIT).forEach(w => {
        if (w.remove) batch.delete(w.ref);
        else if (w.options) batch.set(w.ref, w.data, w.options);
        else batch.set(w.ref, w.data);
      });
      await batch.commit();
    }
  }

  async function persistExpense(id, data, merge) {
    const db = getDb();
    if (db && _currentUid) {
      const ref = db.collection('users').doc(_currentUid).collection('expenses').doc(id);
      return commitWrite(merge ? ref.set(data, { merge: true }) : ref.set(data));
    }
    if (!writeJSON(STORAGE_KEYS.EXPENSES, _expenses)) {
      throw new Error('Could not save to this browser\'s storage. It may be full or blocked.');
    }
    return { queued: false };
  }

  /**
   * Initialize Firestore state for the authenticated user with one-time migration.
   */
  async function initUser(uid) {
    if (!uid) {
      clearUserData();
      return;
    }

    _currentUid = uid;
    const db = getDb();

    if (!db) {
      // Offline or non-Firebase environment: fallback to localStorage
      _expenses = readJSON(STORAGE_KEYS.EXPENSES, []);
      _budget = readJSON(STORAGE_KEYS.BUDGET, DEFAULT_BUDGET);
      _settings = readJSON(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
      _customCategories = readJSON(STORAGE_KEYS.CUSTOM_CATEGORIES, {});
      return;
    }

    try {
      const userDocRef = db.collection('users').doc(uid);
      const expensesColRef = userDocRef.collection('expenses');

      // Fetch existing data
      const [userDocSnap, expensesSnap] = await Promise.all([
        userDocRef.get(),
        expensesColRef.get(),
      ]);

      const isFirestoreEmpty = (!userDocSnap.exists || !userDocSnap.data() || Object.keys(userDocSnap.data()).length === 0) && expensesSnap.empty;

      // Check for legacy localStorage data
      const storage = getStorageEngine();
      const legacyExpensesRaw = storage.getItem(STORAGE_KEYS.EXPENSES);
      const legacyBudgetRaw = storage.getItem(STORAGE_KEYS.BUDGET);
      const legacySettingsRaw = storage.getItem(STORAGE_KEYS.SETTINGS);
      const legacyCustomCategoriesRaw = storage.getItem(STORAGE_KEYS.CUSTOM_CATEGORIES);

      let hasLegacyData = false;
      let legacyExpenses = [];
      let legacyBudget = null;
      let legacySettings = null;
      let legacyCustomCategories = {};

      if (legacyExpensesRaw) {
        try {
          legacyExpenses = JSON.parse(legacyExpensesRaw);
          if (Array.isArray(legacyExpenses) && legacyExpenses.length > 0) hasLegacyData = true;
        } catch (e) {}
      }
      if (legacyBudgetRaw) {
        try {
          legacyBudget = JSON.parse(legacyBudgetRaw);
          if (legacyBudget && legacyBudget.overallCap) hasLegacyData = true;
        } catch (e) {}
      }
      if (legacySettingsRaw) {
        try { legacySettings = JSON.parse(legacySettingsRaw); } catch (e) {}
      }
      if (legacyCustomCategoriesRaw) {
        try { legacyCustomCategories = JSON.parse(legacyCustomCategoriesRaw); } catch (e) {}
      }

      if (isFirestoreEmpty && hasLegacyData) {
        // --- One-Time Migration to Firestore ---
        console.log('ExpenseTrack: Performing one-time migration of localStorage data to Firestore for user', uid);
        // Fix ids once so the cloud copy and the in-memory copy agree.
        legacyExpenses = legacyExpenses.map(exp => ({
          ...exp,
          id: exp.id || ('exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000000)),
        }));

        const initialBudget = legacyBudget || DEFAULT_BUDGET;
        const initialSettings = legacySettings || DEFAULT_SETTINGS;
        const initialCustom = legacyCustomCategories || {};

        // Expenses first (chunked: a batch holds at most 500 writes), the user doc last.
        const writes = legacyExpenses.map(exp => ({
          ref: expensesColRef.doc(exp.id),
          data: {
            amount: Number(exp.amount) || 0,
            category: normalizeCategoryKey(exp.category),
            date: exp.date || localDateString(),
            note: exp.note || '',
            createdAt: exp.createdAt || Date.now(),
          },
        }));
        writes.push({
          ref: userDocRef,
          data: { budget: initialBudget, settings: initialSettings, customCategories: initialCustom, updatedAt: Date.now() },
          options: { merge: true },
        });
        await commitInBatches(db, writes);

        // Delete old localStorage keys
        storage.removeItem(STORAGE_KEYS.EXPENSES);
        storage.removeItem(STORAGE_KEYS.BUDGET);
        storage.removeItem(STORAGE_KEYS.SETTINGS);
        storage.removeItem(STORAGE_KEYS.CUSTOM_CATEGORIES);

        // Update in-memory state
        _expenses = legacyExpenses.map(e => ({
          id: e.id || ('exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
          amount: Number(e.amount) || 0,
          category: normalizeCategoryKey(e.category),
          date: e.date || localDateString(),
          note: e.note || '',
          createdAt: e.createdAt || Date.now(),
        }));
        _budget = { ...DEFAULT_BUDGET, ...initialBudget, categories: { ...DEFAULT_BUDGET.categories, ...(initialBudget.categories || {}) } };
        _settings = { ...DEFAULT_SETTINGS, ...initialSettings };
        _customCategories = { ...initialCustom };
      } else {
        // Normal Load from Firestore
        if (userDocSnap.exists) {
          const uData = userDocSnap.data() || {};
          _budget = uData.budget
            ? { ...DEFAULT_BUDGET, ...uData.budget, categories: { ...DEFAULT_BUDGET.categories, ...(uData.budget.categories || {}) } }
            : { ...DEFAULT_BUDGET };
          _settings = uData.settings ? { ...DEFAULT_SETTINGS, ...uData.settings } : { ...DEFAULT_SETTINGS };
          _customCategories = uData.customCategories || {};
        } else {
          // Document does not exist yet: initialize with defaults
          _budget = { ...DEFAULT_BUDGET };
          _settings = { ...DEFAULT_SETTINGS };
          _customCategories = {};
          await userDocRef.set({
            budget: _budget,
            settings: _settings,
            customCategories: _customCategories,
            updatedAt: Date.now(),
          });
        }

        _expenses = [];
        expensesSnap.forEach(doc => {
          const d = doc.data();
          _expenses.push({
            id: doc.id,
            amount: Number(d.amount) || 0,
            category: normalizeCategoryKey(d.category),
            date: d.date || localDateString(),
            note: d.note || '',
            createdAt: d.createdAt || Date.now(),
          });
        });

        _expenses.sort((a, b) => {
          const timeA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
          const timeB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
          return timeB - timeA || (b.createdAt || 0) - (a.createdAt || 0);
        });
      }

      // Detach any previous listeners
      if (_unsubscribeUserDoc) { _unsubscribeUserDoc(); _unsubscribeUserDoc = null; }
      if (_unsubscribeExpenses) { _unsubscribeExpenses(); _unsubscribeExpenses = null; }

      // Real-time synchronization listeners
      _unsubscribeUserDoc = userDocRef.onSnapshot(snap => {
        if (snap && snap.exists) {
          const d = snap.data() || {};
          if (d.budget) {
            _budget = { ...DEFAULT_BUDGET, ...d.budget, categories: { ...DEFAULT_BUDGET.categories, ...(d.budget.categories || {}) } };
          }
          if (d.settings) {
            _settings = { ...DEFAULT_SETTINGS, ...d.settings };
          }
          if (d.customCategories !== undefined) {
            _customCategories = d.customCategories || {};
          }
          notifyChange();
        }
      }, err => {
        console.warn('ExpenseTrack: User doc snapshot listener notice:', err);
      });

      _unsubscribeExpenses = expensesColRef.onSnapshot(snap => {
        if (snap) {
          const updated = [];
          snap.forEach(doc => {
            const d = doc.data();
            updated.push({
              id: doc.id,
              amount: Number(d.amount) || 0,
              category: normalizeCategoryKey(d.category),
              date: d.date || localDateString(),
              note: d.note || '',
              createdAt: d.createdAt || Date.now(),
            });
          });
          updated.sort((a, b) => {
            const timeA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
            const timeB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
            return timeB - timeA || (b.createdAt || 0) - (a.createdAt || 0);
          });
          _expenses = updated;
          notifyChange();
        }
      }, err => {
        console.warn('ExpenseTrack: Expenses snapshot listener notice:', err);
      });

    } catch (err) {
      console.error('ExpenseTrack: Error initializing user data from Firestore:', err);
      // Fallback
      if (!_budget) _budget = { ...DEFAULT_BUDGET };
      if (!_settings) _settings = { ...DEFAULT_SETTINGS };
      if (!_customCategories) _customCategories = {};
    }
  }

  /**
   * Reset in-memory state and clear all stored data on logout
   */
  function clearUserData() {
    if (_unsubscribeUserDoc) {
      _unsubscribeUserDoc();
      _unsubscribeUserDoc = null;
    }
    if (_unsubscribeExpenses) {
      _unsubscribeExpenses();
      _unsubscribeExpenses = null;
    }
    _currentUid = null;
    _expenses = [];
    _budget = null;
    _settings = null;
    _customCategories = null;

    const storage = getStorageEngine();
    try {
      storage.removeItem(STORAGE_KEYS.EXPENSES);
      storage.removeItem(STORAGE_KEYS.BUDGET);
      storage.removeItem(STORAGE_KEYS.SETTINGS);
      storage.removeItem(STORAGE_KEYS.CUSTOM_CATEGORIES);
      storage.removeItem(STORAGE_KEYS.USER_SESSION);
    } catch (e) {}
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

    const all = getAllCategories(true);
    if (all[key]) return key;
    const found = Object.values(all).find(c => c.name.toLowerCase() === lower);
    if (found) return found.id;

    return DEFAULT_CATEGORIES[lower] ? lower : key;
  }

  // --- Category CRUD Operations ---
  function getCustomCategories() {
    if (_customCategories && typeof _customCategories === 'object') {
      return { ..._customCategories };
    }
    const custom = readJSON(STORAGE_KEYS.CUSTOM_CATEGORIES, {});
    return custom && typeof custom === 'object' ? custom : {};
  }

  async function saveCustomCategories(categories) {
    const previous = _customCategories;
    _customCategories = { ...(categories || {}) };
    try {
      await persistUserFields({ customCategories: _customCategories });
    } catch (err) {
      _customCategories = previous;
      throw err;
    }
    return true;
  }

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

  function getActiveCategories() {
    return getAllCategories(false);
  }

  function validateAppearance(icon, color) {
    if (icon !== undefined && !ALLOWED_ICONS.includes(icon)) {
      return 'Please choose an icon from the list.';
    }
    if (color !== undefined && !isValidColor(color)) {
      return 'Please choose a colour from the list.';
    }
    return null;
  }

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

  /** Save a custom-category change and its budget cap together; undo both if the write fails. */
  async function persistCategoryAndBudget(custom, budget) {
    const prevCustom = _customCategories;
    const prevBudget = _budget;
    _customCategories = { ...custom };
    _budget = budget;
    try {
      await persistUserFields({ customCategories: _customCategories, budget: _budget });
    } catch (err) {
      _customCategories = prevCustom;
      _budget = prevBudget;
      throw err;
    }
  }

  function normalizeBudget(budget) {
    return {
      overallCap: Number(budget.overallCap) || DEFAULT_BUDGET.overallCap,
      categories: { ...DEFAULT_BUDGET.categories, ...(budget.categories || {}) },
    };
  }

  async function addCustomCategory({ name, budgetCap = 500, icon = 'category', color = DEFAULT_CATEGORY_COLOR }) {
    const validation = validateCategoryInput(name, budgetCap);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const appearanceError = validateAppearance(icon || 'category', color || DEFAULT_CATEGORY_COLOR);
    if (appearanceError) {
      throw new Error(appearanceError);
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

    const budget = getBudget();
    budget.categories[id] = validation.budgetCap;
    await persistCategoryAndBudget(custom, normalizeBudget(budget));

    return newCategory;
  }

  async function updateCustomCategory(id, { name, budgetCap, icon, color }) {
    const custom = getCustomCategories();
    if (!custom[id]) {
      throw new Error('Custom category not found or cannot edit default categories.');
    }

    const validation = validateCategoryInput(name, budgetCap, id);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const appearanceError = validateAppearance(icon, color);
    if (appearanceError) {
      throw new Error(appearanceError);
    }

    custom[id] = {
      ...custom[id],
      name: validation.name,
      defaultCap: validation.budgetCap,
      icon: icon || custom[id].icon,
      color: color || custom[id].color,
      updatedAt: Date.now(),
    };

    const budget = getBudget();
    budget.categories[id] = validation.budgetCap;
    await persistCategoryAndBudget(custom, normalizeBudget(budget));

    return custom[id];
  }

  async function deleteCategory(id) {
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
    const budget = getBudget();
    if (hasExpenses) {
      custom[id] = { ...custom[id], isArchived: true, archivedAt: Date.now() };
      action = 'archived';
    } else {
      delete custom[id];
      delete budget.categories[id];
      action = 'deleted';
    }
    await persistCategoryAndBudget(custom, normalizeBudget(budget));

    return { action, categoryId: id };
  }

  // --- Expenses CRUD Operations ---
  function getExpenses() {
    if (_expenses && (_expenses.length > 0 || _currentUid)) {
      return [..._expenses];
    }
    const expenses = readJSON(STORAGE_KEYS.EXPENSES, []);
    return Array.isArray(expenses) ? expenses : [];
  }

  function saveExpenses(expenses) {
    _expenses = Array.isArray(expenses) ? [...expenses] : [];
    if (!_currentUid) {
      writeJSON(STORAGE_KEYS.EXPENSES, _expenses);
    }
    return true;
  }

  async function addExpense({ amount, category, date, note }) {
    const input = validateExpenseInput({ amount, date, note });
    if (!input.valid) {
      throw new Error(input.error);
    }
    const num = input.amount;

    const normCat = normalizeCategoryKey(category);
    const all = getAllCategories(true);
    if (!all[normCat]) {
      throw new Error('Please select a valid category.');
    }

    const todayLocal = localDateString();
    const expDate = date || todayLocal;
    const id = 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const newExp = {
      id,
      amount: Math.round(num * 100) / 100,
      category: normCat,
      date: expDate,
      note: (note && String(note).trim()) || all[normCat].name,
      createdAt: Date.now(),
    };

    const previous = _expenses;
    _expenses = [newExp, ...previous];
    _expenses.sort((a, b) => {
      const timeA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
      const timeB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA || (b.createdAt || 0) - (a.createdAt || 0);
    });

    try {
      await persistExpense(id, newExp, false);
    } catch (err) {
      _expenses = previous;
      throw err;
    }

    return newExp;
  }

  async function updateExpense(id, { amount, category, date, note }) {
    const idx = _expenses.findIndex(e => e.id === id);
    if (idx === -1) {
      throw new Error('Expense not found.');
    }

    const input = validateExpenseInput({ amount, date, note });
    if (!input.valid) {
      throw new Error(input.error);
    }
    const num = input.amount;

    const normCat = normalizeCategoryKey(category);
    const all = getAllCategories(true);

    const updatedExp = {
      ..._expenses[idx],
      amount: Math.round(num * 100) / 100,
      category: normCat,
      date: date || _expenses[idx].date,
      note: (note && String(note).trim()) || all[normCat]?.name || _expenses[idx].note,
      updatedAt: Date.now(),
    };

    const previous = _expenses;
    _expenses = previous.map(e => (e.id === id ? updatedExp : e));
    _expenses.sort((a, b) => {
      const timeA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
      const timeB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA || (b.createdAt || 0) - (a.createdAt || 0);
    });

    try {
      await persistExpense(id, updatedExp, true);
    } catch (err) {
      _expenses = previous;
      throw err;
    }

    return updatedExp;
  }

  async function deleteExpense(id) {
    const previous = _expenses;
    _expenses = previous.filter(e => e.id !== id);

    try {
      const db = getDb();
      if (db && _currentUid) {
        await commitWrite(db.collection('users').doc(_currentUid).collection('expenses').doc(id).delete());
      } else if (!writeJSON(STORAGE_KEYS.EXPENSES, _expenses)) {
        throw new Error('Could not save to this browser\'s storage. It may be full or blocked.');
      }
    } catch (err) {
      _expenses = previous;
      throw err;
    }

    return true;
  }

  async function clearAllExpenses() {
    const db = getDb();
    if (db && _currentUid) {
      const colRef = db.collection('users').doc(_currentUid).collection('expenses');
      const snap = await colRef.get();
      const writes = [];
      snap.forEach(doc => writes.push({ ref: doc.ref, remove: true }));
      await commitWrite(commitInBatches(db, writes));
    } else if (!writeJSON(STORAGE_KEYS.EXPENSES, [])) {
      throw new Error('Could not save to this browser\'s storage. It may be full or blocked.');
    }
    _expenses = [];
    return true;
  }

  // --- Budget CRUD Operations ---
  function getBudget() {
    if (_budget && typeof _budget === 'object') {
      return {
        overallCap: Number(_budget.overallCap) || DEFAULT_BUDGET.overallCap,
        categories: { ...DEFAULT_BUDGET.categories, ...(_budget.categories || {}) },
      };
    }
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

  async function saveBudget(budget) {
    const previous = _budget;
    // A changed monthly cap must pass the shared rule; an unchanged (possibly legacy) cap is kept as is.
    if (Number(budget.overallCap) !== getBudget().overallCap) {
      const check = BudgetCalc.validateOverallCap(budget.overallCap);
      if (!check.valid) {
        throw new Error(check.error);
      }
    }
    _budget = normalizeBudget(budget);
    try {
      await persistUserFields({ budget: _budget });
    } catch (err) {
      _budget = previous;
      throw err;
    }
    return true;
  }

  async function resetBudgetDefaults() {
    const active = getActiveCategories();
    const categories = {};
    for (const [id, cat] of Object.entries(active)) {
      categories[id] = cat.defaultCap;
    }
    const defaultBudget = {
      overallCap: DEFAULT_BUDGET.overallCap,
      categories,
    };
    await saveBudget(defaultBudget);
    return defaultBudget;
  }

  // --- Settings CRUD Operations ---
  function getSettings() {
    if (_settings && typeof _settings === 'object') {
      return { ...DEFAULT_SETTINGS, ..._settings };
    }
    const stored = readJSON(STORAGE_KEYS.SETTINGS, null);
    return (stored && typeof stored === 'object') ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS };
  }

  async function saveSettings(settings) {
    const previous = _settings;
    _settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    try {
      await persistUserFields({ settings: _settings });
    } catch (err) {
      _settings = previous;
      throw err;
    }
    return true;
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
    // Local date helpers
    localDateString,
    parseLocalDate,
    isSameMonth,
    isCurrentMonth,
    normalizeCategoryKey,
    validateExpenseInput,
    MAX_EXPENSE_AMOUNT,
    MAX_NOTE_LENGTH,
    // Firestore & user lifecycle
    initUser,
    clearUserData,
    onDataChanged,
    onWriteError,
    isOffline,
    // Appearance validation
    ALLOWED_ICONS,
    isValidColor,
    safeIcon,
    safeColor,
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
