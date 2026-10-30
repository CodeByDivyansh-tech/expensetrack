// Run with the Firestore emulator:  npm run test:rules
const { test, describe, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

const RULES = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
const ME = 'alice';
const OTHER = 'bob';

let env;

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-expensetrack',
    firestore: { rules: RULES, host, port: Number(port) },
  });
});

after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const me = () => env.authenticatedContext(ME).firestore();
const other = () => env.authenticatedContext(OTHER).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const expense = (over = {}) => ({
  id: 'e1', amount: 120.5, category: 'food', date: '2026-10-30', note: 'Lunch', createdAt: 1761800000000, ...over,
});
const expRef = (db, id = 'e1') => db.collection('users').doc(ME).collection('expenses').doc(id);
const userRef = (db) => db.collection('users').doc(ME);

describe('expenses: who may do what', () => {
  test('the owner can create, read, update and delete an expense', async () => {
    await assertSucceeds(expRef(me()).set(expense()));
    await assertSucceeds(expRef(me()).get());
    await assertSucceeds(expRef(me()).set({ amount: 99, updatedAt: 1 }, { merge: true }));
    await assertSucceeds(expRef(me()).delete());
  });

  test('another signed-in user cannot read or write it', async () => {
    await env.withSecurityRulesDisabled((ctx) => expRef(ctx.firestore()).set(expense()));
    await assertFails(expRef(other()).get());
    await assertFails(expRef(other()).set(expense()));
    await assertFails(expRef(other()).delete());
    await assertFails(other().collection('users').doc(ME).collection('expenses').get());
  });

  test('a signed-out visitor cannot read or write anything', async () => {
    await assertFails(expRef(anon()).get());
    await assertFails(expRef(anon()).set(expense()));
    await assertFails(userRef(anon()).get());
  });
});

describe('expenses: what a valid document looks like', () => {
  const accepted = {
    'without a note': () => { const e = expense(); delete e.note; return e; },
    'without an id field': () => { const e = expense(); delete e.id; return e; },
    'with a payment method': () => expense({ paymentMethod: 'UPI' }),
    'at the amount limit': () => expense({ amount: 1000000 }),
    'with paise': () => expense({ amount: 0.01 }),
    'with a 200 character note': () => expense({ note: 'x'.repeat(200) }),
    'with a 64 character category': () => expense({ category: 'c'.repeat(64) }),
    'on the first allowed date': () => expense({ date: '2000-01-01' }),
    'with an empty note (older exports)': () => expense({ note: '' }),
  };
  for (const [name, make] of Object.entries(accepted)) {
    test(`accepts an expense ${name}`, async () => {
      await assertSucceeds(expRef(me()).set(make()));
    });
  }

  const rejected = {
    'with an extra field': () => expense({ admin: true }),
    'with zero amount': () => expense({ amount: 0 }),
    'with a negative amount': () => expense({ amount: -5 }),
    'above the amount limit': () => expense({ amount: 1000000.01 }),
    'with a text amount': () => expense({ amount: '50' }),
    'with no amount': () => { const e = expense(); delete e.amount; return e; },
    'with no category': () => { const e = expense(); delete e.category; return e; },
    'with an empty category': () => expense({ category: '' }),
    'with a 65 character category': () => expense({ category: 'c'.repeat(65) }),
    'with no date': () => { const e = expense(); delete e.date; return e; },
    'with a badly formatted date': () => expense({ date: '30/10/2026' }),
    'with a date that has extra text': () => expense({ date: '2026-10-30T00:00:00Z' }),
    'before the year 2000': () => expense({ date: '1999-12-31' }),
    'with a 201 character note': () => expense({ note: 'x'.repeat(201) }),
    'with a non-text note': () => expense({ note: 5 }),
    'with no createdAt': () => { const e = expense(); delete e.createdAt; return e; },
    'with a text createdAt': () => expense({ createdAt: 'today' }),
    'whose id field differs from its document id': () => expense({ id: 'someone-else' }),
    'with an over-long payment method': () => expense({ paymentMethod: 'p'.repeat(21) }),
  };
  for (const [name, make] of Object.entries(rejected)) {
    test(`rejects an expense ${name}`, async () => {
      await assertFails(expRef(me()).set(make()));
    });
  }

  test('an update cannot turn a valid expense into an invalid one', async () => {
    await assertSucceeds(expRef(me()).set(expense()));
    await assertFails(expRef(me()).set({ amount: -1 }, { merge: true }));
    await assertFails(expRef(me()).set({ date: 'nope' }, { merge: true }));
    await assertFails(expRef(me()).set({ surprise: 1 }, { merge: true }));
  });
});

describe('user document', () => {
  const goodDoc = () => ({
    budget: { overallCap: 12000, categories: { food: 3500, custom_1: 400 } },
    settings: { notify80: true, weeklyDigest: false, roommateAlert: false },
    customCategories: { custom_1: { id: 'custom_1', name: 'Gym' } },
    updatedAt: 1761800000000,
  });

  test('the owner can create and read it', async () => {
    await assertSucceeds(userRef(me()).set(goodDoc()));
    await assertSucceeds(userRef(me()).get());
  });

  test('field-by-field updates like the app makes are accepted', async () => {
    await assertSucceeds(userRef(me()).set(goodDoc()));
    await assertSucceeds(userRef(me()).set({ budget: { overallCap: 15000, categories: {} }, updatedAt: 2 }, { merge: true }));
    await assertSucceeds(userRef(me()).set({ legacyImportHandled: true }, { merge: true }));
  });

  test('another user cannot read or write it', async () => {
    await env.withSecurityRulesDisabled((ctx) => userRef(ctx.firestore()).set(goodDoc()));
    await assertFails(userRef(other()).get());
    await assertFails(userRef(other()).set(goodDoc()));
  });

  const rejected = {
    'an unknown top-level field': { ...{ budget: { overallCap: 1000, categories: {} } }, isAdmin: true },
    'a text monthly cap': { budget: { overallCap: '12000', categories: {} } },
    'a zero monthly cap': { budget: { overallCap: 0, categories: {} } },
    'an absurd monthly cap': { budget: { overallCap: 1e12, categories: {} } },
    'an unknown budget field': { budget: { overallCap: 1000, categories: {}, extra: 1 } },
    'a budget that is not a map': { budget: 5 },
    'an unknown setting': { settings: { notify80: true, hack: true } },
    'a non-boolean setting': { settings: { notify80: 'yes' } },
    'more than 100 custom categories': { customCategories: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`c${i}`, { name: 'x' }])) },
    'more than 100 category caps': { budget: { overallCap: 1000, categories: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`c${i}`, 1])) } },
    'a text updatedAt': { updatedAt: 'now' },
  };
  for (const [name, data] of Object.entries(rejected)) {
    test(`rejects ${name}`, async () => {
      await assertFails(userRef(me()).set(data));
    });
  }

  test('the owner can delete it (account deletion)', async () => {
    await assertSucceeds(userRef(me()).set(goodDoc()));
    await assertSucceeds(userRef(me()).delete());
  });
});

describe('everything else is closed', () => {
  test('unknown sub-collections under the user are denied', async () => {
    await assertFails(me().collection('users').doc(ME).collection('secrets').doc('x').set({ a: 1 }));
    await assertFails(me().collection('users').doc(ME).collection('secrets').doc('x').get());
  });

  test('top-level collections are denied', async () => {
    await assertFails(me().collection('public').doc('x').set({ a: 1 }));
    await assertFails(me().collection('users').get());
  });
});
