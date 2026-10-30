const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const FakeFirestore = require('./helpers/fake-firestore.js');

const db = FakeFirestore.createFakeFirestore();
globalThis.firebase = { firestore: () => db };
const DataLayer = require('../data-layer.js');
const BC = require('../budget-calculator.js');
const T = require('../expense-tools.js');

const UID = 'u5';
const path = (...p) => `users/${UID}/${p.join('/')}`;
const docsIn = (col) => [...db._store.keys()].filter((k) => k.startsWith(path(col) + '/'));
const TODAY = '2026-10-30';

async function fresh() {
  db.failWrites = null;
  db.failReads = null;
  db._store.clear();
  DataLayer.clearUserData();
  await DataLayer.initUser(UID);
}

describe('settings preferences', () => {
  beforeEach(fresh);

  test('have safe defaults', () => {
    const s = DataLayer.getSettings();
    assert.deepEqual([s.theme, s.currency, s.weekStart, s.monthStartDay, s.alertWarnPct], ['system', 'INR', 1, 1, 80]);
  });

  test('odd values are clamped to legal ones', () => {
    const s = DataLayer.normalizeSettings({ theme: 'neon', currency: 'XYZ', weekStart: 9, monthStartDay: 31, alertWarnPct: 5 });
    assert.deepEqual([s.theme, s.currency, s.weekStart, s.monthStartDay, s.alertWarnPct], ['system', 'INR', 1, 1, 80]);
    assert.equal(DataLayer.normalizeSettings({ monthStartDay: 15, alertWarnPct: 70, weekStart: 0, currency: 'USD', theme: 'dark' }).monthStartDay, 15);
  });

  test('are saved with the rest of the settings document', async () => {
    await DataLayer.saveSettings({ ...DataLayer.getSettings(), theme: 'dark', monthStartDay: 15 });
    const stored = db._store.get(`users/${UID}`).settings;
    assert.equal(stored.theme, 'dark');
    assert.equal(stored.monthStartDay, 15);
  });
});

describe('budget periods', () => {
  test('a month that starts on the 15th', () => {
    assert.deepEqual(BC.periodOf('2026-10-14', 15), { year: 2026, month: 8 });
    assert.deepEqual(BC.periodOf('2026-10-15', 15), { year: 2026, month: 9 });
    assert.deepEqual(BC.periodOf('2027-01-03', 15), { year: 2026, month: 11 });
    assert.deepEqual(BC.periodRange(2026, 9, 15), { start: '2026-10-15', end: '2026-11-14', days: 31 });
    assert.equal(BC.periodLabel(2026, 9, 15), '15 Oct to 14 Nov 2026');
    assert.equal(BC.periodLabel(2026, 9, 1), 'October 2026');
  });

  test('the calendar month is the default and covers every day exactly once', () => {
    assert.deepEqual(BC.periodRange(2026, 1, 1), { start: '2026-02-01', end: '2026-02-28', days: 28 });
    assert.deepEqual(BC.periodOf('2026-03-01', 1), { year: 2026, month: 2 });
  });

  test('daily average and projection use the period, not the calendar month', () => {
    const now = new Date(2026, 9, 25); // 25 Oct: day 11 of a period that began on the 15th
    const avg = BC.dailyAverage(1100, 2026, 9, now, 15);
    assert.deepEqual([avg.days, avg.average, avg.isCurrentMonth], [11, 100, true]);
    assert.deepEqual(BC.projectPeriodEnd(1100, 2026, 9, now, 15), { projected: 3100, daysElapsed: 11, daysTotal: 31 });
    assert.equal(BC.projectPeriodEnd(1100, 2026, 8, now, 15), null);
  });

  test('calendar weeks start on the chosen weekday and are never longer than seven days', () => {
    const mon = BC.weeklyBuckets(2026, 9, [], { weekStart: 1 }).map((b) => b.label);
    assert.deepEqual(mon, ['1–4 Oct', '5–11 Oct', '12–18 Oct', '19–25 Oct', '26–31 Oct']);
    const sun = BC.weeklyBuckets(2026, 9, [], { weekStart: 0 }).map((b) => b.label);
    assert.deepEqual(sun, ['1–3 Oct', '4–10 Oct', '11–17 Oct', '18–24 Oct', '25–31 Oct']);
    const cross = BC.weeklyBuckets(2026, 9, [], { weekStart: 1, startDay: 15 });
    assert.equal(cross[0].label, '15–18 Oct');
    assert.ok(cross.some((b) => b.label.includes('Oct') && b.label.includes('Nov')));
  });

  test('currency display only changes the symbol and grouping', () => {
    assert.equal(BC.formatMoney(1234567.5, 'INR'), '₹12,34,567.50');
    assert.equal(BC.formatMoney(1234567.5, 'USD'), '$1,234,567.50');
    assert.equal(BC.formatMoney(1234567, 'EUR'), '€1,234,567');
    assert.equal(BC.formatMoney(50, 'GBP'), '£50');
    assert.equal(BC.formatMoney(50, 'nope'), '₹50');
  });

  test('the warning level is configurable', () => {
    const input = { overallCap: 1000, totalSpent: 600, spendingMap: {}, caps: {}, categories: {} };
    assert.equal(BC.computeAlerts(input).length, 0);
    assert.equal(BC.computeAlerts({ ...input, warnPct: 60 })[0].level, 'warn');
    assert.equal(BC.computeAlerts({ ...input, warnPct: 70 }).length, 0);
    assert.equal(BC.computeAlerts({ ...input, warnPct: 5 }).length, 1); // 5 is clamped to 50, and 60% is above that
  });
});

describe('analytics comparison', () => {
  const e = (date, amount, category) => ({ date, amount, category });
  const list = [e('2026-10-02', 300, 'food'), e('2026-10-20', 200, 'food'), e('2026-10-05', 100, 'transport'), e('2026-09-10', 250, 'food'), e('2026-09-12', 400, 'groceries'), e('2026-07-01', 999, 'food')];

  test('this month against last month, per category', () => {
    const c = BC.categoryComparison(list, 2026, 9, 1);
    assert.deepEqual(c.rows.map((r) => [r.id, r.current, r.previous, r.delta, r.pct]), [
      ['food', 500, 250, 250, 100],
      ['transport', 100, 0, 100, null],
      ['groceries', 0, 400, -400, -100],
    ]);
    assert.deepEqual([c.currentTotal, c.previousTotal], [600, 650]);
  });

  test('six month trend, oldest first, with empty months as zero', () => {
    const t = BC.periodTotals(list, 2026, 9, 6, 1);
    assert.deepEqual(t.map((x) => [x.label, x.total]), [['May 26', 0], ['Jun 26', 0], ['Jul 26', 999], ['Aug 26', 0], ['Sep 26', 650], ['Oct 26', 600]]);
  });
});

describe('recurring dates', () => {
  test('monthly: the 31st falls back to the last day of shorter months', () => {
    assert.deepEqual(T.occurrenceDates({ frequency: 'monthly', startDate: '2026-01-31' }, '2026-05-15'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    assert.deepEqual(T.occurrenceDates({ frequency: 'monthly', startDate: '2028-01-31' }, '2028-03-01'), ['2028-01-31', '2028-02-29']);
  });

  test('weekly keeps the weekday; nothing in the future; the end date stops it', () => {
    assert.deepEqual(T.occurrenceDates({ frequency: 'weekly', startDate: '2026-10-05' }, TODAY), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    assert.deepEqual(T.occurrenceDates({ frequency: 'weekly', startDate: '2026-10-05', endDate: '2026-10-13' }, TODAY), ['2026-10-05', '2026-10-12']);
    assert.deepEqual(T.occurrenceDates({ frequency: 'monthly', startDate: '2026-11-05' }, TODAY), []);
  });

  test('only dates after the last generated one', () => {
    assert.deepEqual(T.occurrenceDates({ frequency: 'monthly', startDate: '2026-01-05', lastGenerated: '2026-09-05' }, TODAY), ['2026-10-05']);
  });

  test('describes itself and finds the next date', () => {
    assert.equal(T.describeRule({ frequency: 'monthly', startDate: '2026-01-05' }), 'Every month on the 5th');
    assert.equal(T.describeRule({ frequency: 'monthly', startDate: '2026-01-22' }), 'Every month on the 22nd');
    assert.equal(T.describeRule({ frequency: 'weekly', startDate: '2026-10-05' }), 'Every Monday');
    assert.equal(T.nextOccurrence({ frequency: 'monthly', startDate: '2026-01-05' }, TODAY), '2026-11-05');
    assert.equal(T.nextOccurrence({ frequency: 'monthly', startDate: '2026-01-05', endDate: '2026-10-31' }, TODAY), null);
  });
});

describe('recurring expenses in the data layer', () => {
  beforeEach(fresh);

  const rule = (over = {}) => ({ name: 'Hostel rent', amount: 5000, category: 'personal', frequency: 'monthly', startDate: '2026-08-05', ...over });

  test('validation', async () => {
    await assert.rejects(() => DataLayer.addRecurring(rule({ name: ' ' })), /name/);
    await assert.rejects(() => DataLayer.addRecurring(rule({ amount: 0 })), /amount/);
    await assert.rejects(() => DataLayer.addRecurring(rule({ category: 'nope' })), /category/);
    await assert.rejects(() => DataLayer.addRecurring(rule({ frequency: 'daily' })), /often/);
    await assert.rejects(() => DataLayer.addRecurring(rule({ startDate: '2026-02-31' })), /valid first date/);
    await assert.rejects(() => DataLayer.addRecurring(rule({ endDate: '2026-07-01' })), /last date/);
    await assert.rejects(() => DataLayer.addRecurring(rule({ paymentMethod: 'Cheque' })), /payment/);
  });

  test('catches up on every missed date once, with fixed ids', async () => {
    const r = await DataLayer.addRecurring(rule());
    const result = await DataLayer.runDueRecurring(TODAY);
    assert.equal(result.created, 3); // 5 Aug, 5 Sep, 5 Oct
    const ids = docsIn('expenses').map((k) => k.split('/').pop()).sort();
    assert.deepEqual(ids, [`rec-${r.id}-2026-08-05`, `rec-${r.id}-2026-09-05`, `rec-${r.id}-2026-10-05`]);
    const sample = db._store.get(path('expenses', `rec-${r.id}-2026-10-05`));
    assert.deepEqual([sample.amount, sample.note, sample.recurringId, sample.date], [5000, 'Hostel rent', r.id, '2026-10-05']);
    assert.equal(db._store.get(path('recurring', r.id)).lastGenerated, '2026-10-05');
  });

  test('running again, or on a second device, never makes duplicates', async () => {
    const r = await DataLayer.addRecurring(rule());
    await DataLayer.runDueRecurring(TODAY);
    assert.equal((await DataLayer.runDueRecurring(TODAY)).created, 0);
    // a second device that has not yet seen the updated rule runs the same job
    const stale = { ...db._store.get(path('recurring', r.id)) };
    delete stale.lastGenerated;
    db._store.set(path('recurring', r.id), stale);
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    const again = await DataLayer.runDueRecurring(TODAY);
    assert.equal(again.created, 0); // the expenses already exist, so none are re-created
    assert.equal(docsIn('expenses').length, 3);
  });

  test('an expense you edited is not overwritten by a later run', async () => {
    const r = await DataLayer.addRecurring(rule());
    await DataLayer.runDueRecurring(TODAY);
    const id = `rec-${r.id}-2026-10-05`;
    await DataLayer.updateExpense(id, { amount: 5200, category: 'personal', note: 'Rent + water' });
    const stale = { ...db._store.get(path('recurring', r.id)) };
    delete stale.lastGenerated;
    db._store.set(path('recurring', r.id), stale);
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    await DataLayer.runDueRecurring(TODAY);
    assert.equal(db._store.get(path('expenses', id)).amount, 5200);
  });

  test('a deleted occurrence is not brought back', async () => {
    const r = await DataLayer.addRecurring(rule());
    await DataLayer.runDueRecurring(TODAY);
    await DataLayer.deleteExpense(`rec-${r.id}-2026-09-05`);
    assert.equal((await DataLayer.runDueRecurring(TODAY)).created, 0);
    assert.equal(docsIn('expenses').length, 2);
  });

  test('picks up the next date when it arrives', async () => {
    await DataLayer.addRecurring(rule());
    await DataLayer.runDueRecurring(TODAY);
    assert.equal((await DataLayer.runDueRecurring('2026-11-04')).created, 0);
    assert.equal((await DataLayer.runDueRecurring('2026-11-05')).created, 1);
  });

  test('a paused rule makes nothing, and resuming does not back-fill the pause', async () => {
    const real = DataLayer.localDateString();
    const r = await DataLayer.addRecurring(rule({ startDate: BC.addDays(real, -70) }));
    await DataLayer.runDueRecurring(BC.addDays(real, -40));
    const before = docsIn('expenses').length;
    assert.ok(before >= 1);
    await DataLayer.updateRecurring(r.id, { active: false });
    assert.equal((await DataLayer.runDueRecurring(real)).created, 0);
    assert.equal(docsIn('expenses').length, before);
    await DataLayer.updateRecurring(r.id, { active: true });
    assert.equal(db._store.get(path('recurring', r.id)).lastGenerated, BC.addDays(real, -1));
    const run = await DataLayer.runDueRecurring(real);
    assert.ok(run.created <= 1, 'only an occurrence dated today could be created');
    docsIn('expenses').forEach((k) => assert.ok(!(db._store.get(k).date > BC.addDays(real, -40) && db._store.get(k).date < real), 'nothing back-filled'));
  });
  test('a rule whose category was deleted is skipped, not lost', async () => {
    const cat = await DataLayer.addCustomCategory({ name: 'Gym', budgetCap: 500 });
    const r = await DataLayer.addRecurring(rule({ category: cat.id }));
    await DataLayer.deleteCategory(cat.id); // no expenses yet, so it is removed for good
    const result = await DataLayer.runDueRecurring(TODAY);
    assert.deepEqual([result.created, result.skipped], [0, 1]);
    assert.equal(db._store.get(path('recurring', r.id)).lastGenerated, undefined);
  });

  test('a failed write changes nothing', async () => {
    await DataLayer.addRecurring(rule());
    db.failWrites = new Error('Missing or insufficient permissions.');
    await assert.rejects(() => DataLayer.runDueRecurring(TODAY), /insufficient permissions/);
    assert.equal(DataLayer.getExpenses().length, 0);
    db.failWrites = null;
    assert.equal((await DataLayer.runDueRecurring(TODAY)).created, 3);
  });

  test('can be edited and deleted', async () => {
    const r = await DataLayer.addRecurring(rule());
    await DataLayer.updateRecurring(r.id, { amount: 5500, name: 'Rent' });
    assert.equal(db._store.get(path('recurring', r.id)).amount, 5500);
    await DataLayer.deleteRecurring(r.id);
    assert.equal(docsIn('recurring').length, 0);
  });
});

describe('savings goals', () => {
  beforeEach(fresh);

  test('create, add money, take money out, and track the progress', async () => {
    const g = await DataLayer.addGoal({ name: 'Laptop', target: 60000 });
    await DataLayer.addContribution(g.id, { amount: 15000, note: 'Diwali money' });
    await DataLayer.addContribution(g.id, { amount: 2500.5, kind: 'withdraw', note: 'Phone repair' });
    const stored = db._store.get(path('goals', g.id));
    assert.equal(stored.saved, 12499.5);
    assert.deepEqual(stored.contributions.map((c) => c.amount), [15000, -2500.5]);
    const p = T.goalProgress(stored, TODAY);
    assert.deepEqual([p.pct, p.remaining, p.done], [20, 47500.5, false]);
  });

  test('you cannot take out more than is saved, or save a future date, or an empty amount', async () => {
    const g = await DataLayer.addGoal({ name: 'Trip', target: 1000 });
    await DataLayer.addContribution(g.id, { amount: 100 });
    await assert.rejects(() => DataLayer.addContribution(g.id, { amount: 101, kind: 'withdraw' }), /more than you have saved/);
    await assert.rejects(() => DataLayer.addContribution(g.id, { amount: 0 }), /above zero/);
    await assert.rejects(() => DataLayer.addContribution(g.id, { amount: 5, date: '2999-01-01' }), /future/);
    assert.equal(DataLayer.getGoals()[0].saved, 100);
  });

  test('goal validation, a deadline helps with a monthly figure, and reaching the target is noticed', async () => {
    await assert.rejects(() => DataLayer.addGoal({ name: '', target: 5 }), /name/);
    await assert.rejects(() => DataLayer.addGoal({ name: 'x', target: 0 }), /target/);
    await assert.rejects(() => DataLayer.addGoal({ name: 'x', target: 5, deadline: '2001-01-01' }), /future/);
    const p = T.goalProgress({ target: 12000, saved: 0, deadline: '2027-04-30' }, TODAY);
    assert.equal(p.perMonth, 2000);
    assert.equal(T.goalProgress({ target: 100, saved: 100 }, TODAY).done, true);
    assert.equal(T.goalProgress({ target: 100, saved: 10, deadline: '2026-01-01' }, TODAY).overdue, true);
  });

  test('a failed save rolls back, and only 200 contributions are kept', async () => {
    const g = await DataLayer.addGoal({ name: 'Fund', target: 1000000 });
    db.failWrites = new Error('Missing or insufficient permissions.');
    await assert.rejects(() => DataLayer.addContribution(g.id, { amount: 10 }), /insufficient permissions/);
    assert.equal(DataLayer.getGoals()[0].saved, 0);
    db.failWrites = null;
    for (let i = 0; i < 205; i++) await DataLayer.addContribution(g.id, { amount: 1 });
    const stored = db._store.get(path('goals', g.id));
    assert.equal(stored.contributions.length, 200);
    assert.equal(stored.saved, 205);
  });

  test('edit and delete', async () => {
    const g = await DataLayer.addGoal({ name: 'Bike', target: 9000 });
    await DataLayer.updateGoal(g.id, { name: 'E-bike', target: 20000 });
    assert.deepEqual([db._store.get(path('goals', g.id)).name, db._store.get(path('goals', g.id)).target], ['E-bike', 20000]);
    await DataLayer.deleteGoal(g.id);
    assert.equal(docsIn('goals').length, 0);
  });
});

describe('deleting an account', () => {
  beforeEach(fresh);

  test('removes every document, in chunks, and clears local state', async () => {
    for (let i = 0; i < 700; i++) db._store.set(path('expenses', `e${i}`), { amount: 1, category: 'food', date: '2026-01-01', note: 'x', createdAt: i });
    DataLayer.clearUserData();
    await DataLayer.initUser(UID);
    await DataLayer.addGoal({ name: 'Laptop', target: 100 });
    await DataLayer.addRecurring({ name: 'Rent', amount: 100, category: 'food', frequency: 'monthly', startDate: '2026-10-01' });
    await DataLayer.deleteAllUserData();
    assert.deepEqual([...db._store.keys()].filter((k) => k.startsWith(`users/${UID}`)), []);
    assert.equal(DataLayer.getExpenses().length, 0);
    assert.equal(DataLayer.getGoals().length, 0);
  });
});
