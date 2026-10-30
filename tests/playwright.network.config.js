const base = require('./playwright.config.js');

// Only the tests that talk to the real Firebase SDK and Google (internet required, can be flaky).
module.exports = { ...base, testIgnore: undefined, testMatch: '**/csp-real.spec.js' };
