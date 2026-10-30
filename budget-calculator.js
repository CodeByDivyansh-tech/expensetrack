/**
 * ExpenseTrack - Budget Allocation Calculator
 * Pure calculation functions usable in both browser and Node.js environments.
 */

(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof root !== 'undefined') {
    root.BudgetCalculator = lib;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Pure function to compute budget allocation metrics.
   * 
   * @param {number|string} monthlyBudget - Total monthly budget cap
   * @param {Object} categoryBudgets - Key-value map of category caps (e.g. { food: 3500, groceries: 2000 })
   * @returns {Object} Calculated metrics
   */
  function computeAllocation(monthlyBudget, categoryBudgets, activeCategoryIds) {
    // 1. Sanitize monthly budget: non-negative number, handle decimals, 0, null, undefined, NaN
    const rawBudget = Number(monthlyBudget);
    const budget = (!isNaN(rawBudget) && rawBudget > 0) ? Math.round(rawBudget * 100) / 100 : 0;

    // 2. Sum category caps: ignore negative or NaN values, preserve decimals
    let totalAllocated = 0;
    if (categoryBudgets && typeof categoryBudgets === 'object') {
      // When the active category ids are given, caps of archived or unknown categories do not count.
      const counted = Array.isArray(activeCategoryIds)
        ? Object.entries(categoryBudgets).filter(([id]) => activeCategoryIds.includes(id))
        : Object.entries(categoryBudgets);
      for (const [, val] of counted) {
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
          totalAllocated += num;
        }
      }
    }
    totalAllocated = Math.round(totalAllocated * 100) / 100;

    // 3. Compute buffer and over-budget state
    const buffer = Math.round((budget - totalAllocated) * 100) / 100;
    const isOverBudget = budget > 0 ? (totalAllocated > budget) : (totalAllocated > 0);
    const overAmount = isOverBudget ? Math.abs(buffer) : 0;
    const remaining = !isOverBudget ? Math.max(0, buffer) : 0;

    // 4. Compute percentage: prevent division by zero / NaN
    let allocatedPercent = 0;
    if (budget > 0) {
      const rawPct = (totalAllocated / budget) * 100;
      // Round to 1 decimal place if has decimals, otherwise whole number
      allocatedPercent = Math.round(rawPct * 10) / 10;
    } else {
      allocatedPercent = totalAllocated > 0 ? 100 : 0;
    }

    // 5. Visual progress bar width: capped at 100% max, 0% min
    const visualBarWidthPercent = Math.min(100, Math.max(0, allocatedPercent));
    const bufferPercent = Math.max(0, Math.round((100 - visualBarWidthPercent) * 10) / 10);

    // 6. User-facing status strings
    const formattedTotal = totalAllocated.toLocaleString('en-IN');
    const formattedBudget = budget.toLocaleString('en-IN');
    const formattedRemaining = remaining.toLocaleString('en-IN');
    const formattedOver = overAmount.toLocaleString('en-IN');

    const statusText = isOverBudget
      ? `₹${formattedOver} over budget`
      : `₹${formattedRemaining} remaining`;

    const percentLabel = isOverBudget
      ? `${allocatedPercent}% allocated`
      : `${allocatedPercent}% assigned`;

    return {
      monthlyBudget: budget,
      totalAllocated,
      buffer,
      remaining,
      overAmount,
      isOverBudget,
      allocatedPercent,
      visualBarWidthPercent,
      bufferPercent,
      formattedTotal,
      formattedBudget,
      statusText,
      percentLabel,
    };
  }

  // --- Money ---
  const OVERALL_CAP_MIN = 500;
  const OVERALL_CAP_MAX = 1000000;

  function roundMoney(value) {
    const n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Indian grouping; paise are shown only when there are any (49.5 -> 49.50, 50 -> 50). */
  function formatINR(value) {
    const n = roundMoney(value);
    const hasPaise = Math.round(n * 100) % 100 !== 0;
    return n.toLocaleString('en-IN', hasPaise
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 0 });
  }

  /** The one rule for the monthly budget cap, used by the UI and the data layer. */
  function validateOverallCap(raw) {
    if (raw === '' || raw === null || raw === undefined) {
      return { valid: false, error: 'Enter your monthly budget.' };
    }
    const n = Number(raw);
    if (!isFinite(n)) {
      return { valid: false, error: 'Enter a valid number.' };
    }
    if (!Number.isInteger(n)) {
      return { valid: false, error: 'Use whole rupees (no decimals).' };
    }
    if (n < OVERALL_CAP_MIN || n > OVERALL_CAP_MAX) {
      return { valid: false, error: 'Monthly budget must be between ₹500 and ₹10,00,000.' };
    }
    return { valid: true, value: n };
  }

  // --- Category caps ---
  const CATEGORY_CAP_MAX = 1000000;

  /** A single category cap: whole rupees, 0 (no cap) up to ₹10,00,000. */
  function validateCategoryCap(raw) {
    if (raw === '' || raw === null || raw === undefined) {
      return { valid: false, error: 'Enter a cap amount.' };
    }
    const n = Number(raw);
    if (!isFinite(n)) return { valid: false, error: 'Enter a valid number.' };
    if (!Number.isInteger(n)) return { valid: false, error: 'Use whole rupees (no decimals).' };
    if (n < 0 || n > CATEGORY_CAP_MAX) return { valid: false, error: 'A category cap must be between ₹0 and ₹10,00,000.' };
    return { valid: true, value: n };
  }

  /** Multiply the active categories' caps by newCap/oldCap, rounded to the nearest ₹10. */
  function scaleCaps(categories, oldCap, newCap, activeIds) {
    const factor = Number(oldCap) > 0 ? Number(newCap) / Number(oldCap) : 1;
    const out = { ...(categories || {}) };
    Object.keys(out).forEach(id => {
      if (Array.isArray(activeIds) && !activeIds.includes(id)) return;
      const scaled = Math.round((Number(out[id]) || 0) * factor / 10) * 10;
      out[id] = Math.min(CATEGORY_CAP_MAX, Math.max(0, scaled));
    });
    return out;
  }

  /**
   * Which budgets need attention? level "warn" from warnPct (default 80%), "over" from 100%.
   * input: { overallCap, totalSpent, spendingMap, caps, categories: { id: { name } }, warnPct }
   */
  function computeAlerts({ overallCap, totalSpent, spendingMap, caps, categories, warnPct }) {
    const alerts = [];
    const warnAt = Math.min(95, Math.max(50, Number(warnPct) || 80));
    const levelFor = (spent, cap) => {
      if (!(cap > 0)) return null;
      const pct = (spent / cap) * 100;
      if (pct >= 100) return 'over';
      if (pct >= warnAt) return 'warn';
      return null;
    };
    const overallLevel = levelFor(totalSpent, overallCap);
    if (overallLevel) {
      alerts.push({ type: 'overall', id: 'overall', name: 'Monthly budget', level: overallLevel, spent: roundMoney(totalSpent), cap: overallCap, pct: Math.floor((totalSpent / overallCap) * 100) });
    }
    Object.keys(categories || {}).forEach(id => {
      const cap = Number((caps || {})[id]);
      const spent = Number((spendingMap || {})[id]) || 0;
      const level = levelFor(spent, cap);
      if (level) {
        alerts.push({ type: 'category', id, name: categories[id].name, level, spent: roundMoney(spent), cap, pct: Math.floor((spent / cap) * 100) });
      }
    });
    return alerts;
  }

  // --- Currency display (a label and a grouping style; amounts are never converted) ---
  const CURRENCIES = {
    INR: { symbol: '₹', locale: 'en-IN', name: 'Indian rupee' },
    USD: { symbol: '$', locale: 'en-US', name: 'US dollar' },
    EUR: { symbol: '€', locale: 'en-IE', name: 'Euro' },
    GBP: { symbol: '£', locale: 'en-GB', name: 'Pound sterling' },
  };

  function currencyOf(code) {
    return CURRENCIES[code] || CURRENCIES.INR;
  }

  /** The number part only (no symbol), grouped the way the chosen currency is written. */
  function formatNumber(value, code) {
    const n = roundMoney(value);
    const hasPaise = Math.round(n * 100) % 100 !== 0;
    return n.toLocaleString(currencyOf(code).locale, hasPaise
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 0 });
  }

  function formatMoney(value, code) {
    return currencyOf(code).symbol + formatNumber(value, code);
  }

  // --- Dates and budget periods ---
  // A budget "month" can start on any day 1-28 (for example the day an allowance arrives), so
  // "October" with start day 15 runs 15 Oct to 14 Nov.
  function isoFromParts(y, m, d) {
    const date = new Date(y, m, d);
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDays(iso, delta) {
    const [y, m, d] = iso.split('-').map(Number);
    return isoFromParts(y, m - 1, d + delta);
  }

  function daysBetween(fromIso, toIso) {
    const [y1, m1, d1] = fromIso.split('-').map(Number);
    const [y2, m2, d2] = toIso.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  function clampStartDay(day) {
    const n = Math.floor(Number(day));
    return n >= 1 && n <= 28 ? n : 1;
  }

  /** Which budget period (year, month index) does this date belong to? */
  function periodOf(iso, startDay) {
    const s = clampStartDay(startDay);
    let [y, m, d] = iso.split('-').map(Number);
    m -= 1;
    if (d < s) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    return { year: y, month: m };
  }

  function periodShift(period, delta) {
    const total = period.year * 12 + period.month + delta;
    return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
  }

  /** First and last day (inclusive) of a period. */
  function periodRange(year, month, startDay) {
    const s = clampStartDay(startDay);
    const start = isoFromParts(year, month, s);
    const nextStart = isoFromParts(year, month + 1, s);
    return { start, end: addDays(nextStart, -1), days: daysBetween(start, nextStart) };
  }

  function periodContains(iso, year, month, startDay) {
    const r = periodRange(year, month, startDay);
    return iso >= r.start && iso <= r.end;
  }

  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function periodLabel(year, month, startDay) {
    if (clampStartDay(startDay) === 1) return `${LONG_MONTHS[month]} ${year}`;
    const r = periodRange(year, month, startDay);
    const [, m1, d1] = r.start.split('-').map(Number);
    const [y2, m2, d2] = r.end.split('-').map(Number);
    return `${d1} ${SHORT_MONTHS[m1 - 1]} to ${d2} ${SHORT_MONTHS[m2 - 1]} ${y2}`;
  }

  // --- Analytics helpers ---
  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function dayOfMonth(dateStr) {
    const parts = String(dateStr || '').split('-');
    const day = parseInt(parts[2], 10);
    return day >= 1 && day <= 31 ? day : 1;
  }

  function bucketLabel(startIso, endIso) {
    const [, m1, d1] = startIso.split('-').map(Number);
    const [, m2, d2] = endIso.split('-').map(Number);
    if (startIso === endIso) return `${d1} ${SHORT_MONTHS[m1 - 1]}`;
    return m1 === m2
      ? `${d1}\u2013${d2} ${SHORT_MONTHS[m1 - 1]}`
      : `${d1} ${SHORT_MONTHS[m1 - 1]}\u2013${d2} ${SHORT_MONTHS[m2 - 1]}`;
  }

  /**
   * Spending per week of a budget period. weekStart null: seven-day blocks from the first day
   * (1-7, 8-14, ...). weekStart 0-6 (Sunday = 0): calendar weeks that begin on that weekday, so the
   * first and last block may be shorter. No block is ever longer than a week.
   */
  function weeklyBuckets(year, month, expenses, options) {
    const startDay = clampStartDay(options && options.startDay);
    const weekStart = options && options.weekStart !== undefined && options.weekStart !== null ? Number(options.weekStart) : null;
    const range = periodRange(year, month, startDay);
    const buckets = [];
    let cursor = range.start;
    while (cursor <= range.end) {
      let last = addDays(cursor, 6);
      if (weekStart !== null) {
        const [y, m, d] = cursor.split('-').map(Number);
        const weekday = new Date(y, m - 1, d).getDay();
        const untilNextWeekStart = (((weekStart - weekday) % 7) + 7) % 7 || 7;
        last = addDays(cursor, untilNextWeekStart - 1);
      }
      if (last > range.end) last = range.end;
      buckets.push({ start: cursor, end: last, label: bucketLabel(cursor, last), total: 0 });
      cursor = addDays(last, 1);
    }
    (expenses || []).forEach(exp => {
      const bucket = buckets.find(b => exp.date >= b.start && exp.date <= b.end);
      if (bucket) bucket.total = roundMoney(bucket.total + (Number(exp.amount) || 0));
    });
    return buckets;
  }

  /** Daily average: days elapsed for the current period, the full period for any other. */
  function dailyAverage(totalSpent, year, month, now, startDay) {
    const today = now || new Date();
    const todayIso = isoFromParts(today.getFullYear(), today.getMonth(), today.getDate());
    const range = periodRange(year, month, startDay);
    const isCurrent = todayIso >= range.start && todayIso <= range.end;
    const days = isCurrent ? Math.max(1, daysBetween(range.start, todayIso) + 1) : range.days;
    return { average: roundMoney((Number(totalSpent) || 0) / days), days, isCurrentMonth: isCurrent };
  }

  /** Totals for the last `count` periods ending at (year, month), oldest first. */
  function periodTotals(expenses, year, month, count, startDay) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const p = periodShift({ year, month }, -i);
      const r = periodRange(p.year, p.month, startDay);
      const total = (expenses || []).reduce((s, e) => (e.date >= r.start && e.date <= r.end ? s + (Number(e.amount) || 0) : s), 0);
      out.push({ year: p.year, month: p.month, key: `${p.year}-${String(p.month + 1).padStart(2, '0')}`, label: `${SHORT_MONTHS[p.month]} ${String(p.year).slice(2)}`, total: roundMoney(total) });
    }
    return out;
  }

  /** This period against the one before, per category (biggest increase first). */
  function categoryComparison(expenses, year, month, startDay) {
    const prev = periodShift({ year, month }, -1);
    const cur = periodRange(year, month, startDay);
    const old = periodRange(prev.year, prev.month, startDay);
    const sums = {};
    (expenses || []).forEach(e => {
      const amount = Number(e.amount) || 0;
      const id = e.category;
      if (e.date >= cur.start && e.date <= cur.end) (sums[id] = sums[id] || { current: 0, previous: 0 }).current += amount;
      else if (e.date >= old.start && e.date <= old.end) (sums[id] = sums[id] || { current: 0, previous: 0 }).previous += amount;
    });
    const rows = Object.entries(sums).map(([id, v]) => {
      const current = roundMoney(v.current);
      const previous = roundMoney(v.previous);
      return { id, current, previous, delta: roundMoney(current - previous), pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
    }).sort((a, b) => b.delta - a.delta);
    return {
      rows,
      currentTotal: roundMoney(rows.reduce((s, r) => s + r.current, 0)),
      previousTotal: roundMoney(rows.reduce((s, r) => s + r.previous, 0)),
    };
  }

  /** "At this pace" total for a period that is still running; null for any other period. */
  function projectPeriodEnd(totalSoFar, year, month, now, startDay) {
    const daily = dailyAverage(totalSoFar, year, month, now, startDay);
    if (!daily.isCurrentMonth) return null;
    const range = periodRange(year, month, startDay);
    return { projected: Math.round(daily.average * range.days), daysElapsed: daily.days, daysTotal: range.days };
  }

  return {
    computeAllocation,
    OVERALL_CAP_MIN,
    OVERALL_CAP_MAX,
    roundMoney,
    formatINR,
    validateOverallCap,
    CATEGORY_CAP_MAX,
    validateCategoryCap,
    scaleCaps,
    computeAlerts,
    CURRENCIES,
    currencyOf,
    formatNumber,
    formatMoney,
    clampStartDay,
    periodOf,
    periodShift,
    periodRange,
    periodContains,
    periodLabel,
    daysBetween,
    addDays,
    weeklyBuckets,
    dailyAverage,
    periodTotals,
    categoryComparison,
    projectPeriodEnd,
  };
});
