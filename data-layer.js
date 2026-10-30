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
    RECURRING: 'expensetrack_recurring',
    GOALS: 'expensetrack_goals',
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
      name: 'Textbooks & Coursework',
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
    notify80: false,        // show budget warnings (the name is historical: it now covers 80% and 100%)
    weeklyDigest: false,
    roommateAlert: false,
    theme: 'system',        // 'system' | 'light' | 'dark'
    currency: 'INR',        // display only; amounts are never converted
    weekStart: 1,           // first day of the week, 0 = Sunday
    monthStartDay: 1,       // the day a budget month begins (1-28)
    alertWarnPct: 80,       // warn when a budget reaches this percentage (50-95)
  };

  const THEMES = ['system', 'light', 'dark'];

  /** Clamp every preference to a legal value, so a stored or typed oddity can never break the app. */
  function normalizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    s.theme = THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme;
    s.currency = BudgetCalc.CURRENCIES[s.currency] ? s.currency : DEFAULT_SETTINGS.currency;
    const week = Math.floor(Number(s.weekStart));
    s.weekStart = week >= 0 && week <= 6 ? week : DEFAULT_SETTINGS.weekStart;
    s.monthStartDay = BudgetCalc.clampStartDay(s.monthStartDay);
    const warn = Math.round(Number(s.alertWarnPct));
    s.alertWarnPct = warn >= 50 && warn <= 95 ? warn : DEFAULT_SETTINGS.alertWarnPct;
    ['notify80', 'weeklyDigest', 'roommateAlert'].forEach(k => { s[k] = !!s[k]; });
    return s;
  }

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

  const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Wallet', 'Other'];

  function validateExpenseInput({ amount, date, note, paymentMethod }, today = localDateString()) {
    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
      return { valid: false, error: 'Please choose a payment method from the list.' };
    }
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
  let _recurring = [];
  let _goals = [];
  let _unsubscribeRecurring = null;
  let _unsubscribeGoals = null;
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
  // --- Sync status (for the indicator in the header) ---
  let _inFlight = 0;
  let _syncListeners = [];
  let _loadError = null;

  function getSyncState() {
    if (!getDb() || !_currentUid) return 'local';
    if (isOffline()) return 'offline';
    return _inFlight > 0 ? 'syncing' : 'synced';
  }

  function onSyncChange(listener) {
    if (typeof listener === 'function') _syncListeners.push(listener);
    return () => { _syncListeners = _syncListeners.filter(l => l !== listener); };
  }

  function notifySync() {
    _syncListeners.forEach(fn => { try { fn(getSyncState()); } catch (e) { console.error('Sync listener failed:', e); } });
  }

  /** The error from the first read of the user's data, if it failed while online; otherwise null. */
  function getLoadError() {
    return _loadError;
  }

  async function commitWrite(promise) {
    _inFlight++;
    notifySync();
    const settled = () => { _inFlight = Math.max(0, _inFlight - 1); notifySync(); };
    promise.then(settled, settled);
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

  // Data saved in this browser by the first, localStorage-only version of the app. It is never
  // imported silently: whoever signs in first on a shared computer must not inherit it.
  let _pendingLegacy = null;

  function readLegacyData() {
    const storage = getStorageEngine();
    const parse = (key, fallback) => {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    };
    const expenses = parse(STORAGE_KEYS.EXPENSES, []);
    const budget = parse(STORAGE_KEYS.BUDGET, null);
    const settings = parse(STORAGE_KEYS.SETTINGS, null);
    const customCategories = parse(STORAGE_KEYS.CUSTOM_CATEGORIES, {});
    const hasExpenses = Array.isArray(expenses) && expenses.length > 0;
    const hasBudget = !!(budget && budget.overallCap);
    if (!hasExpenses && !hasBudget) return null;
    return {
      expenses: hasExpenses ? expenses : [],
      budget: hasBudget ? budget : null,
      settings: settings && typeof settings === 'object' ? settings : null,
      customCategories: customCategories && typeof customCategories === 'object' ? customCategories : {},
    };
  }

  function removeLegacyKeys() {
    const storage = getStorageEngine();
    [STORAGE_KEYS.EXPENSES, STORAGE_KEYS.BUDGET, STORAGE_KEYS.SETTINGS, STORAGE_KEYS.CUSTOM_CATEGORIES]
      .forEach(key => storage.removeItem(key));
  }

  function sortExpenses(list) {
    return list.sort((a, b) => {
      const timeA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
      const timeB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA || (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function expenseFromDoc(doc) {
    const d = doc.data();
    const exp = {
      id: doc.id,
      amount: Number(d.amount) || 0,
      category: normalizeCategoryKey(d.category),
      date: d.date || localDateString(),
      note: d.note || '',
      createdAt: d.createdAt || Date.now(),
    };
    if (typeof d.paymentMethod === 'string' && d.paymentMethod) exp.paymentMethod = d.paymentMethod;
    return exp;
  }

  function mergeBudget(stored) {
    return { ...DEFAULT_BUDGET, ...stored, categories: { ...DEFAULT_BUDGET.categories, ...((stored && stored.categories) || {}) } };
  }

  /** What an earlier version left in this browser, or null. Shown to the user to import or discard. */
  function getPendingLegacyImport() {
    if (!_pendingLegacy) return null;
    return {
      expenseCount: _pendingLegacy.expenses.length,
      hasBudget: !!_pendingLegacy.budget,
      customCategoryCount: Object.keys(_pendingLegacy.customCategories).length,
    };
  }

  /** Copy the pending legacy data into the signed-in account, then remove it from this browser. */
  async function importLegacyData() {
    const db = getDb();
    if (!_pendingLegacy || !db || !_currentUid) return { imported: 0 };
    const legacy = _pendingLegacy;
    const userDocRef = db.collection('users').doc(_currentUid);
    const expensesColRef = userDocRef.collection('expenses');

    // Fix ids once so the cloud copy and the in-memory copy agree.
    // Only rows the security rules would accept are copied: a positive amount within the limit,
    // a real YYYY-MM-DD date, and text within the length limits.
    const expenses = legacy.expenses
      .map(exp => ({
        id: String(exp.id || ('exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000000))),
        amount: BudgetCalc.roundMoney(exp.amount),
        category: String(normalizeCategoryKey(exp.category)).slice(0, 64),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(exp.date || '')) ? String(exp.date) : localDateString(),
        note: String(exp.note || '').slice(0, 200),
        createdAt: Number(exp.createdAt) || Date.now(),
      }))
      .filter(exp => exp.amount > 0 && exp.amount <= MAX_EXPENSE_AMOUNT);
    const budget = mergeBudget(legacy.budget || _budget || DEFAULT_BUDGET);
    const settings = { ...DEFAULT_SETTINGS, ...(legacy.settings || _settings || {}) };
    const customCategories = { ..._customCategories, ...legacy.customCategories };

    // Expenses first (a batch holds at most 500 writes), the user doc last. Ids are reused, so a
    // retry after a partial failure just rewrites the same documents.
    const writes = expenses.map(exp => {
      const { id, ...data } = exp;
      return { ref: expensesColRef.doc(id), data };
    });
    writes.push({
      ref: userDocRef,
      data: { budget, settings, customCategories, legacyImportHandled: true, updatedAt: Date.now() },
      options: { merge: true },
    });
    await commitInBatches(db, writes);

    removeLegacyKeys();
    _expenses = sortExpenses([..._expenses.filter(e => !expenses.some(x => x.id === e.id)), ...expenses]);
    _budget = budget;
    _settings = settings;
    _customCategories = customCategories;
    _pendingLegacy = null;
    notifyChange();
    return { imported: expenses.length };
  }

  /** Throw the pending legacy data away (and remember that the question was answered). */
  async function discardLegacyData() {
    const db = getDb();
    removeLegacyKeys();
    _pendingLegacy = null;
    if (db && _currentUid) {
      await commitWrite(db.collection('users').doc(_currentUid).set({ legacyImportHandled: true }, { merge: true }));
    }
  }

  /**
   * Load the signed-in user's data and keep it live. Real-time listeners are always attached, even
   * when the first read fails (for example offline on a first visit): they serve the cache and
   * catch up once the connection is back.
   */
  async function initUser(uid) {
    if (!uid) {
      clearUserData();
      return;
    }

    _currentUid = uid;
    _pendingLegacy = null;
    const db = getDb();

    if (!db) {
      // Offline or non-Firebase environment: fallback to localStorage
      _expenses = readJSON(STORAGE_KEYS.EXPENSES, []);
      _recurring = readJSON(STORAGE_KEYS.RECURRING, []);
      _goals = readJSON(STORAGE_KEYS.GOALS, []);
      _budget = readJSON(STORAGE_KEYS.BUDGET, DEFAULT_BUDGET);
      _settings = readJSON(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
      _customCategories = readJSON(STORAGE_KEYS.CUSTOM_CATEGORIES, {});
      return;
    }

    const userDocRef = db.collection('users').doc(uid);
    const expensesColRef = userDocRef.collection('expenses');

    const recurringColRef = userDocRef.collection('recurring');
    const goalsColRef = userDocRef.collection('goals');
    let userDocSnap = null;
    let expensesSnap = null;
    let recurringSnap = null;
    let goalsSnap = null;
    try {
      [userDocSnap, expensesSnap, recurringSnap, goalsSnap] = await Promise.all([userDocRef.get(), expensesColRef.get(), recurringColRef.get(), goalsColRef.get()]);
      _loadError = null;
    } catch (err) {
      console.warn('ExpenseTrack: first read failed, continuing with live listeners:', err);
      _loadError = isOffline() ? null : err;
    }

    if (userDocSnap && expensesSnap) {
      const uData = (userDocSnap.exists && userDocSnap.data()) || {};

      // Offer data an earlier version left in this browser, only to an account with no expenses yet
      if (expensesSnap.empty && !uData.legacyImportHandled) {
        const legacy = readLegacyData();
        if (legacy) _pendingLegacy = legacy;
      }

      _budget = uData.budget ? mergeBudget(uData.budget) : { ...DEFAULT_BUDGET };
      _settings = uData.settings ? { ...DEFAULT_SETTINGS, ...uData.settings } : { ...DEFAULT_SETTINGS };
      _customCategories = uData.customCategories || {};
      if (!userDocSnap.exists) {
        // First visit: create the document with defaults
        try {
          await userDocRef.set({ budget: _budget, settings: _settings, customCategories: _customCategories, updatedAt: Date.now() });
        } catch (err) {
          console.warn('ExpenseTrack: could not create the user document yet:', err);
        }
      }

      _expenses = [];
      expensesSnap.forEach(doc => _expenses.push(expenseFromDoc(doc)));
      sortExpenses(_expenses);
      _recurring = [];
      recurringSnap.forEach(doc => _recurring.push({ ...doc.data(), id: doc.id }));
      _goals = [];
      goalsSnap.forEach(doc => _goals.push({ ...doc.data(), id: doc.id }));
    } else {
      if (!_budget) _budget = { ...DEFAULT_BUDGET };
      if (!_settings) _settings = { ...DEFAULT_SETTINGS };
      if (!_customCategories) _customCategories = {};
    }

    // Detach any previous listeners
    if (_unsubscribeUserDoc) { _unsubscribeUserDoc(); _unsubscribeUserDoc = null; }
    if (_unsubscribeExpenses) { _unsubscribeExpenses(); _unsubscribeExpenses = null; }
    if (_unsubscribeRecurring) { _unsubscribeRecurring(); _unsubscribeRecurring = null; }
    if (_unsubscribeGoals) { _unsubscribeGoals(); _unsubscribeGoals = null; }

    _unsubscribeUserDoc = userDocRef.onSnapshot(snap => {
      if (snap && snap.exists) {
        _loadError = null; // data is flowing, so the first failure no longer matters
        const d = snap.data() || {};
        if (d.budget) _budget = mergeBudget(d.budget);
        if (d.settings) _settings = { ...DEFAULT_SETTINGS, ...d.settings };
        if (d.customCategories !== undefined) _customCategories = d.customCategories || {};
        notifyChange();
      }
    }, err => {
      console.warn('ExpenseTrack: User doc snapshot listener notice:', err);
    });

    _unsubscribeRecurring = recurringColRef.onSnapshot(snap => {
      if (snap) {
        const list = [];
        snap.forEach(doc => list.push({ ...doc.data(), id: doc.id }));
        _recurring = list;
        notifyChange();
      }
    }, err => console.warn('ExpenseTrack: Recurring snapshot listener notice:', err));

    _unsubscribeGoals = goalsColRef.onSnapshot(snap => {
      if (snap) {
        const list = [];
        snap.forEach(doc => list.push({ ...doc.data(), id: doc.id }));
        _goals = list;
        notifyChange();
      }
    }, err => console.warn('ExpenseTrack: Goals snapshot listener notice:', err));

    _unsubscribeExpenses = expensesColRef.onSnapshot(snap => {
      if (snap) {
        const updated = [];
        snap.forEach(doc => updated.push(expenseFromDoc(doc)));
        _expenses = sortExpenses(updated);
        notifyChange();
      }
    }, err => {
      console.warn('ExpenseTrack: Expenses snapshot listener notice:', err);
    });
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
    if (_unsubscribeRecurring) { _unsubscribeRecurring(); _unsubscribeRecurring = null; }
    if (_unsubscribeGoals) { _unsubscribeGoals(); _unsubscribeGoals = null; }
    _currentUid = null;
    _pendingLegacy = null;
    _expenses = [];
    _recurring = [];
    _goals = [];
    _budget = null;
    _settings = null;
    _customCategories = null;

    const storage = getStorageEngine();
    try {
      storage.removeItem(STORAGE_KEYS.EXPENSES);
      storage.removeItem(STORAGE_KEYS.BUDGET);
      storage.removeItem(STORAGE_KEYS.SETTINGS);
      storage.removeItem(STORAGE_KEYS.CUSTOM_CATEGORIES);
      storage.removeItem(STORAGE_KEYS.RECURRING);
      storage.removeItem(STORAGE_KEYS.GOALS);
      storage.removeItem(STORAGE_KEYS.USER_SESSION);
    } catch (e) {}
  }

  // --- Category Normalization Helper ---
  // Exact spellings older versions (or imports) used for the built-in categories.
  const LEGACY_CATEGORY_ALIASES = {
    dining: 'food',
    grocery: 'groceries',
    transportation: 'transport',
    commute: 'transport',
    bus: 'transport',
    metro: 'transport',
    education: 'textbooks',
    coursework: 'textbooks',
    books: 'textbooks',
    'education & textbooks': 'textbooks',
    subscriptions: 'personal',
  };

  const UNCATEGORIZED = 'uncategorized';

  /**
   * Map a stored category value to a category id. Matching is exact: an id, then a category name,
   * then a known legacy spelling. Anything else is kept as it is (it shows as "Uncategorized"),
   * never silently relabelled as Food.
   */
  function normalizeCategoryKey(key) {
    if (key === undefined || key === null || String(key).trim() === '') return UNCATEGORIZED;
    const raw = String(key).trim();
    const all = getAllCategories(true);
    if (Object.prototype.hasOwnProperty.call(all, raw)) return raw;
    const lower = raw.toLowerCase();
    const byName = Object.values(all).find(c => String(c.name).toLowerCase() === lower);
    if (byName) return byName.id;
    if (Object.prototype.hasOwnProperty.call(all, lower)) return lower;
    if (Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_ALIASES, lower)) return LEGACY_CATEGORY_ALIASES[lower];
    return raw;
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

  async function addExpense({ amount, category, date, note, paymentMethod }) {
    const input = validateExpenseInput({ amount, date, note, paymentMethod });
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
    if (paymentMethod) newExp.paymentMethod = paymentMethod;

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

  async function updateExpense(id, { amount, category, date, note, paymentMethod }) {
    const idx = _expenses.findIndex(e => e.id === id);
    if (idx === -1) {
      throw new Error('Expense not found.');
    }

    const input = validateExpenseInput({ amount, date, note, paymentMethod });
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
    // undefined keeps the stored payment method; an empty value clears it
    if (paymentMethod !== undefined) {
      if (paymentMethod) updatedExp.paymentMethod = paymentMethod;
      else delete updatedExp.paymentMethod;
    }

    const previous = _expenses;
    _expenses = previous.map(e => (e.id === id ? updatedExp : e));
    _expenses.sort((a, b) => {
      const timeA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
      const timeB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA || (b.createdAt || 0) - (a.createdAt || 0);
    });

    try {
      // Replace the whole document (not merge) so a cleared field really disappears
      await persistExpense(id, updatedExp, false);
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

  /**
   * Add many expenses at once (CSV import). Every row is validated first; nothing is written if
   * any row is bad. Writes go out in chunks, so a very large import is several batches.
   */
  async function addExpensesBulk(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const all = getAllCategories(true);
    const stamp = Date.now();
    const docs = list.map((row, i) => {
      const input = validateExpenseInput(row);
      if (!input.valid) throw new Error(`Row ${i + 1}: ${input.error}`);
      const cat = normalizeCategoryKey(row.category);
      if (!all[cat]) throw new Error(`Row ${i + 1}: unknown category.`);
      const doc = {
        id: `exp-${stamp}-${i}-${Math.floor(Math.random() * 1000)}`,
        amount: input.amount,
        category: cat,
        date: row.date || localDateString(),
        note: (row.note && String(row.note).trim()) || all[cat].name,
        createdAt: stamp,
      };
      if (row.paymentMethod) doc.paymentMethod = row.paymentMethod;
      return doc;
    });
    if (docs.length === 0) return [];

    const previous = _expenses;
    _expenses = sortExpenses([...docs, ...previous]);
    try {
      const db = getDb();
      if (db && _currentUid) {
        const col = db.collection('users').doc(_currentUid).collection('expenses');
        await commitWrite(commitInBatches(db, docs.map(d => ({ ref: col.doc(d.id), data: d }))));
      } else if (!writeJSON(STORAGE_KEYS.EXPENSES, _expenses)) {
        throw new Error('Could not save to this browser\'s storage. It may be full or blocked.');
      }
    } catch (err) {
      _expenses = previous;
      throw err;
    }
    return docs;
  }

  // ==========================================
  // Recurring expenses, savings goals, account deletion
  // ==========================================
  function toolsLib() {
    return (typeof window !== 'undefined' && window.ExpenseTools) || require('./expense-tools.js');
  }

  const STORAGE_FULL_MESSAGE = 'Could not save to this browser\'s storage. It may be full or blocked.';

  /** Write (or delete, when data is null) one document of a user sub-collection. */
  async function writeSubdoc(collection, localKey, id, data, nextList) {
    const db = getDb();
    if (db && _currentUid) {
      const ref = db.collection('users').doc(_currentUid).collection(collection).doc(id);
      return commitWrite(data === null ? ref.delete() : ref.set(data));
    }
    if (!writeJSON(localKey, nextList)) throw new Error(STORAGE_FULL_MESSAGE);
    return { queued: false };
  }

  function validDateString(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  }

  // --- Recurring expenses ---
  function getRecurring() {
    return _recurring.map(r => ({ ...r })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function validateRecurringInput(input, today = localDateString()) {
    const name = String(input.name || '').trim();
    if (!name) return { valid: false, error: 'Give it a name, like "Hostel rent".' };
    if (name.length > 100) return { valid: false, error: 'The name must be 100 characters or fewer.' };
    const amountCheck = validateExpenseInput({ amount: input.amount, paymentMethod: input.paymentMethod }, today);
    if (!amountCheck.valid) return { valid: false, error: amountCheck.error };
    const category = normalizeCategoryKey(input.category);
    if (!getActiveCategories()[category]) return { valid: false, error: 'Please choose a category.' };
    if (!['monthly', 'weekly'].includes(input.frequency)) return { valid: false, error: 'Choose how often it repeats.' };
    if (!validDateString(input.startDate)) return { valid: false, error: 'Please enter a valid first date.' };
    if (input.startDate < MIN_EXPENSE_DATE) return { valid: false, error: "The first date can't be before 2000." };
    const limit = BudgetCalc.addDays(today, 366);
    if (input.startDate > limit) return { valid: false, error: 'The first date can be at most a year ahead.' };
    if (input.endDate) {
      if (!validDateString(input.endDate)) return { valid: false, error: 'Please enter a valid last date.' };
      if (input.endDate < input.startDate) return { valid: false, error: 'The last date must not be before the first date.' };
    }
    const value = {
      name,
      amount: amountCheck.amount,
      category,
      frequency: input.frequency,
      startDate: input.startDate,
    };
    if (input.paymentMethod) value.paymentMethod = input.paymentMethod;
    if (input.endDate) value.endDate = input.endDate;
    return { valid: true, value };
  }

  async function addRecurring(input) {
    const check = validateRecurringInput(input);
    if (!check.valid) throw new Error(check.error);
    const id = 'rule_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const doc = { id, ...check.value, active: true, createdAt: Date.now() };
    const previous = _recurring;
    _recurring = [...previous, doc];
    try {
      await writeSubdoc('recurring', STORAGE_KEYS.RECURRING, id, doc, _recurring);
    } catch (err) {
      _recurring = previous;
      throw err;
    }
    return doc;
  }

  async function updateRecurring(id, patch) {
    const current = _recurring.find(r => r.id === id);
    if (!current) throw new Error('That recurring expense no longer exists.');
    const today = localDateString();
    const merged = { ...current, ...patch };
    if (patch.paymentMethod === '') delete merged.paymentMethod;
    if (patch.endDate === '' || patch.endDate === null) delete merged.endDate;
    const check = validateRecurringInput(merged, today);
    if (!check.valid) throw new Error(check.error);
    const next = { ...check.value, id, active: !!merged.active, createdAt: current.createdAt, updatedAt: Date.now() };
    if (current.lastGenerated) next.lastGenerated = current.lastGenerated;
    // Resuming after a pause does not back-fill the paused weeks
    if (patch.active === true && !current.active) {
      const yesterday = BudgetCalc.addDays(today, -1);
      if (!next.lastGenerated || next.lastGenerated < yesterday) next.lastGenerated = yesterday;
    }
    const previous = _recurring;
    _recurring = previous.map(r => (r.id === id ? next : r));
    try {
      await writeSubdoc('recurring', STORAGE_KEYS.RECURRING, id, next, _recurring);
    } catch (err) {
      _recurring = previous;
      throw err;
    }
    return next;
  }

  async function deleteRecurring(id) {
    const previous = _recurring;
    _recurring = previous.filter(r => r.id !== id);
    try {
      await writeSubdoc('recurring', STORAGE_KEYS.RECURRING, id, null, _recurring);
    } catch (err) {
      _recurring = previous;
      throw err;
    }
    return true;
  }

  let _runningRecurring = false;

  /**
   * Create the expenses that have fallen due since the last run. Safe to run any number of times,
   * on any number of devices: each occurrence has a fixed id (rec-<rule>-<date>), so the same date can
   * only ever exist once, and an expense you already have (even one you edited) is never overwritten.
   */
  async function runDueRecurring(today = localDateString()) {
    if (_runningRecurring) return { created: 0, skipped: 0 };
    _runningRecurring = true;
    try {
      const Tools = toolsLib();
      const all = getAllCategories(true);
      const have = new Set(_expenses.map(e => e.id));
      const newDocs = [];
      const ruleUpdates = [];
      let skipped = 0;

      for (const rule of _recurring) {
        if (!rule.active) continue;
        const dates = Tools.occurrenceDates(rule, today);
        if (dates.length === 0) continue;
        if (!all[rule.category]) { skipped += 1; continue; } // its category is gone: leave it for the user to fix
        dates.forEach(date => {
          const id = `rec-${rule.id}-${date}`;
          if (have.has(id)) return;
          const doc = { id, amount: rule.amount, category: rule.category, date, note: rule.name, createdAt: Date.now(), recurringId: rule.id };
          if (rule.paymentMethod) doc.paymentMethod = rule.paymentMethod;
          newDocs.push(doc);
        });
        ruleUpdates.push({ ...rule, lastGenerated: dates[dates.length - 1], updatedAt: Date.now() });
      }
      if (ruleUpdates.length === 0) return { created: 0, skipped };

      const previousExpenses = _expenses;
      const previousRules = _recurring;
      _expenses = sortExpenses([...newDocs, ...previousExpenses]);
      _recurring = previousRules.map(r => ruleUpdates.find(u => u.id === r.id) || r);
      try {
        const db = getDb();
        if (db && _currentUid) {
          const user = db.collection('users').doc(_currentUid);
          // The new expenses first, the rules last: if the run is cut short, the next run finishes the job
          const writes = newDocs.map(d => ({ ref: user.collection('expenses').doc(d.id), data: d }));
          ruleUpdates.forEach(r => writes.push({ ref: user.collection('recurring').doc(r.id), data: r }));
          await commitWrite(commitInBatches(db, writes));
        } else if (!writeJSON(STORAGE_KEYS.EXPENSES, _expenses) || !writeJSON(STORAGE_KEYS.RECURRING, _recurring)) {
          throw new Error(STORAGE_FULL_MESSAGE);
        }
      } catch (err) {
        _expenses = previousExpenses;
        _recurring = previousRules;
        throw err;
      }
      return { created: newDocs.length, skipped };
    } finally {
      _runningRecurring = false;
    }
  }

  // --- Savings goals ---
  function getGoals() {
    return _goals.map(g => ({ ...g, contributions: [...(g.contributions || [])] })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function validateGoalInput(input, today = localDateString()) {
    const name = String(input.name || '').trim();
    if (!name) return { valid: false, error: 'Give the goal a name.' };
    if (name.length > 60) return { valid: false, error: 'The name must be 60 characters or fewer.' };
    const target = Number(input.target);
    if (!isFinite(target) || target <= 0) return { valid: false, error: 'Enter a target amount above zero.' };
    if (target > 100000000) return { valid: false, error: 'The target can be at most 10,00,00,000.' };
    if (input.deadline && !validDateString(input.deadline)) return { valid: false, error: 'Please enter a valid target date.' };
    if (input.deadline && input.deadline < today) return { valid: false, error: 'The target date has to be in the future.' };
    const value = { name, target: BudgetCalc.roundMoney(target) };
    if (input.deadline) value.deadline = input.deadline;
    return { valid: true, value };
  }

  async function saveGoalDoc(doc, previousList) {
    try {
      await writeSubdoc('goals', STORAGE_KEYS.GOALS, doc.id, doc, _goals);
    } catch (err) {
      _goals = previousList;
      throw err;
    }
    return doc;
  }

  async function addGoal(input) {
    const check = validateGoalInput(input);
    if (!check.valid) throw new Error(check.error);
    const id = 'goal_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const doc = { id, ...check.value, saved: 0, contributions: [], createdAt: Date.now() };
    const previous = _goals;
    _goals = [...previous, doc];
    return saveGoalDoc(doc, previous);
  }

  async function updateGoal(id, input) {
    const current = _goals.find(g => g.id === id);
    if (!current) throw new Error('That goal no longer exists.');
    // Keeping an old, already-passed target date is fine; only a changed date must be in the future
    const check = validateGoalInput({ ...input, deadline: input.deadline === current.deadline ? '' : input.deadline });
    if (!check.valid) throw new Error(check.error);
    const doc = { ...current, ...check.value, updatedAt: Date.now() };
    if (!input.deadline) delete doc.deadline;
    else doc.deadline = input.deadline;
    const previous = _goals;
    _goals = previous.map(g => (g.id === id ? doc : g));
    return saveGoalDoc(doc, previous);
  }

  async function deleteGoal(id) {
    const previous = _goals;
    _goals = previous.filter(g => g.id !== id);
    try {
      await writeSubdoc('goals', STORAGE_KEYS.GOALS, id, null, _goals);
    } catch (err) {
      _goals = previous;
      throw err;
    }
    return true;
  }

  /** kind: 'add' puts money in, 'withdraw' takes money out (never more than is saved). */
  async function addContribution(goalId, { amount, kind = 'add', date, note }) {
    const current = _goals.find(g => g.id === goalId);
    if (!current) throw new Error('That goal no longer exists.');
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) throw new Error('Enter an amount above zero.');
    if (num > 100000000) throw new Error('That amount is too large.');
    const when = date || localDateString();
    if (!validDateString(when) || when > localDateString()) throw new Error('The date can not be in the future.');
    const signed = BudgetCalc.roundMoney(kind === 'withdraw' ? -num : num);
    const saved = BudgetCalc.roundMoney((Number(current.saved) || 0) + signed);
    if (saved < 0) throw new Error("You can't take out more than you have saved.");
    if (saved > 100000000) throw new Error('That would be more than the goal can hold.');
    const entry = { id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1000), date: when, amount: signed };
    if (note && String(note).trim()) entry.note = String(note).trim().slice(0, 60);
    const contributions = [...(current.contributions || []), entry].slice(-200);
    const doc = { ...current, saved, contributions, updatedAt: Date.now() };
    const previous = _goals;
    _goals = previous.map(g => (g.id === goalId ? doc : g));
    return saveGoalDoc(doc, previous);
  }

  /** Delete everything this account has stored (used before the sign-in itself is removed). */
  async function deleteAllUserData() {
    const db = getDb();
    if (db && _currentUid) {
      const user = db.collection('users').doc(_currentUid);
      const writes = [];
      for (const name of ['expenses', 'recurring', 'goals']) {
        const snap = await user.collection(name).get();
        snap.forEach(doc => writes.push({ ref: doc.ref, remove: true }));
      }
      writes.push({ ref: user, remove: true });
      await commitInBatches(db, writes);
    }
    clearUserData();
    return true;
  }

  /** Put back an expense that was just deleted (the Undo action). It keeps its id and fields. */
  async function restoreExpense(expense) {
    const { id } = expense || {};
    if (!id) throw new Error('Nothing to restore.');
    const previous = _expenses;
    const restored = { ...expense, amount: BudgetCalc.roundMoney(expense.amount) };
    _expenses = sortExpenses([restored, ...previous.filter(e => e.id !== id)]);
    try {
      await persistExpense(id, restored, false);
    } catch (err) {
      _expenses = previous;
      throw err;
    }
    return restored;
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
    const current = getBudget();
    if (Number(budget.overallCap) !== current.overallCap) {
      const check = BudgetCalc.validateOverallCap(budget.overallCap);
      if (!check.valid) {
        throw new Error(check.error);
      }
    }
    // Same for category caps: only the ones that changed are checked.
    for (const [id, value] of Object.entries(budget.categories || {})) {
      if (Number(value) !== Number(current.categories[id])) {
        const check = BudgetCalc.validateCategoryCap(value);
        if (!check.valid) {
          throw new Error(check.error);
        }
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
      return normalizeSettings(_settings);
    }
    const stored = readJSON(STORAGE_KEYS.SETTINGS, null);
    return normalizeSettings(stored && typeof stored === 'object' ? stored : null);
  }

  async function saveSettings(settings) {
    const previous = _settings;
    _settings = normalizeSettings(settings);
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
    PAYMENT_METHODS,
    // Firestore & user lifecycle
    initUser,
    clearUserData,
    getPendingLegacyImport,
    importLegacyData,
    discardLegacyData,
    UNCATEGORIZED,
    onDataChanged,
    getDataListenerCount: () => _changeListeners.length,
    onWriteError,
    isOffline,
    normalizeSettings,
    getSyncState,
    onSyncChange,
    getLoadError,
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
    addExpensesBulk,
    restoreExpense,
    // Recurring expenses
    getRecurring,
    validateRecurringInput,
    addRecurring,
    updateRecurring,
    deleteRecurring,
    runDueRecurring,
    // Savings goals
    getGoals,
    validateGoalInput,
    addGoal,
    updateGoal,
    deleteGoal,
    addContribution,
    deleteAllUserData,
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
