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

describe('preferences in settings', () => {
  const put = (settings) => userRef(me()).set({ settings, updatedAt: 1 });

  test('accepts the full set of preferences', async () => {
    await assertSucceeds(put({ notify80: true, weeklyDigest: false, roommateAlert: false, theme: 'dark', currency: 'USD', weekStart: 0, monthStartDay: 15, alertWarnPct: 70 }));
  });

  for (const [name, settings] of Object.entries({
    'an unknown theme': { theme: 'neon' },
    'an unknown currency': { currency: 'XYZ' },
    'a week start of 7': { weekStart: 7 },
    'a month start day of 0': { monthStartDay: 0 },
    'a month start day of 29': { monthStartDay: 29 },
    'a warning level of 10%': { alertWarnPct: 10 },
    'a warning level of 99%': { alertWarnPct: 99 },
    'a text warning level': { alertWarnPct: '80' },
  })) {
    test(`rejects ${name}`, async () => {
      await assertFails(put(settings));
    });
  }
});

describe('recurring expenses', () => {
  const ref = (db, id = 'r1') => db.collection('users').doc(ME).collection('recurring').doc(id);
  const rule = (over = {}) => ({
    id: 'r1', name: 'Rent', amount: 5000, category: 'custom_rent', frequency: 'monthly', startDate: '2026-01-05', active: true, createdAt: 1, ...over,
  });

  test('the owner can create, update and delete one; others cannot touch it', async () => {
    await assertSucceeds(ref(me()).set(rule()));
    await assertSucceeds(ref(me()).set({ lastGenerated: '2026-10-05', updatedAt: 2 }, { merge: true }));
    await assertFails(ref(other()).get());
    await assertFails(ref(other()).set(rule()));
    await assertFails(ref(anon()).get());
    await assertSucceeds(ref(me()).delete());
  });

  for (const [name, make] of Object.entries({
    'an unknown frequency': () => rule({ frequency: 'daily' }),
    'a zero amount': () => rule({ amount: 0 }),
    'an amount over the limit': () => rule({ amount: 1000001 }),
    'a missing name': () => { const r = rule(); delete r.name; return r; },
    'a name over 100 characters': () => rule({ name: 'n'.repeat(101) }),
    'a bad start date': () => rule({ startDate: '5/1/2026' }),
    'a start date before 2000': () => rule({ startDate: '1999-01-01' }),
    'a text "active" flag': () => rule({ active: 'yes' }),
    'an extra field': () => rule({ admin: true }),
    'an id that is not the document id': () => rule({ id: 'other' }),
  })) {
    test(`rejects ${name}`, async () => {
      await assertFails(ref(me()).set(make()));
    });
  }

  test('an expense may carry the id of the rule that created it', async () => {
    await assertSucceeds(expRef(me(), 'rec-r1-2026-10-05').set(expense({ id: 'rec-r1-2026-10-05', recurringId: 'r1' })));
    await assertFails(expRef(me(), 'x').set(expense({ id: 'x', recurringId: 'r'.repeat(65) })));
  });
});

describe('savings goals', () => {
  const ref = (db, id = 'g1') => db.collection('users').doc(ME).collection('goals').doc(id);
  const goal = (over = {}) => ({ id: 'g1', name: 'Laptop', target: 60000, saved: 0, createdAt: 1, ...over });

  test('the owner can create and update one; others cannot', async () => {
    await assertSucceeds(ref(me()).set(goal()));
    await assertSucceeds(ref(me()).set({ saved: 2500, contributions: [{ id: 'c1', date: '2026-10-30', amount: 2500 }], deadline: '2027-06-01', updatedAt: 2 }, { merge: true }));
    await assertFails(ref(other()).get());
    await assertFails(ref(other()).set(goal()));
    await assertSucceeds(ref(me()).delete());
  });

  for (const [name, make] of Object.entries({
    'a zero target': () => goal({ target: 0 }),
    'a negative saved amount': () => goal({ saved: -1 }),
    'a text target': () => goal({ target: '100' }),
    'a missing name': () => { const g = goal(); delete g.name; return g; },
    'a name over 60 characters': () => goal({ name: 'n'.repeat(61) }),
    'a bad deadline': () => goal({ deadline: 'soon' }),
    'more than 200 contributions': () => goal({ contributions: Array.from({ length: 201 }, (_, i) => ({ id: `c${i}`, amount: 1 })) }),
    'contributions that are not a list': () => goal({ contributions: { a: 1 } }),
    'an extra field': () => goal({ owner: 'me' }),
  })) {
    test(`rejects ${name}`, async () => {
      await assertFails(ref(me()).set(make()));
    });
  }
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
