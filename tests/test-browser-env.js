const fs = require('fs');

// Setup mock window & document
globalThis.window = globalThis;
globalThis._mockStore = {};
globalThis.localStorage = {
  getItem: (k) => globalThis._mockStore[k] || null,
  setItem: (k, v) => { globalThis._mockStore[k] = String(v); },
  removeItem: (k) => { delete globalThis._mockStore[k]; },
  clear: () => { globalThis._mockStore = {}; }
};

globalThis.document = {
  getElementById: (id) => ({
    id,
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    style: {},
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: () => {},
    value: '',
    textContent: '',
    innerHTML: '',
  }),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
};

// Load modules
require('../budget-calculator.js');
require('../data-layer.js');
require('../app.js');

console.log('Successfully loaded all modules!');
console.log('window.BudgetCalculator:', typeof window.BudgetCalculator);
console.log('window.ExpenseTrackDataLayer:', typeof window.ExpenseTrackDataLayer);
console.log('window.ExpenseTrackApp:', typeof window.ExpenseTrackApp);

// Verify basic methods on window.ExpenseTrackApp
if (typeof window.ExpenseTrackApp.openAddCustomCategoryModal !== 'function') {
  throw new Error('openAddCustomCategoryModal is missing');
}
if (typeof window.ExpenseTrackApp.confirmDeleteCategory !== 'function') {
  throw new Error('confirmDeleteCategory is missing');
}
if (typeof window.ExpenseTrackApp.handleSliderInput !== 'function') {
  throw new Error('handleSliderInput is missing');
}
console.log('All API methods verified on window.ExpenseTrackApp!');
