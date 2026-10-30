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
   * Which budgets need attention? level "warn" from 80%, "over" from 100%.
   * input: { overallCap, totalSpent, spendingMap, caps, categories: { id: { name } } }
   */
  function computeAlerts({ overallCap, totalSpent, spendingMap, caps, categories }) {
    const alerts = [];
    const levelFor = (spent, cap) => {
      if (!(cap > 0)) return null;
      const pct = (spent / cap) * 100;
      if (pct >= 100) return 'over';
      if (pct >= 80) return 'warn';
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

  // --- Analytics helpers ---
  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function dayOfMonth(dateStr) {
    const parts = String(dateStr || '').split('-');
    const day = parseInt(parts[2], 10);
    return day >= 1 && day <= 31 ? day : 1;
  }

  /**
   * Seven-day buckets of a month (1-7, 8-14, ...). A month longer than 28 days gets a short last
   * bucket, so no bucket is ever longer than a week.
   */
  function weeklyBuckets(year, month, expenses) {
    const total = daysInMonth(year, month);
    const names = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' });
    const buckets = [];
    for (let start = 1; start <= total; start += 7) {
      const end = Math.min(start + 6, total);
      buckets.push({ start, end, label: start === end ? `${start} ${names}` : `${start}–${end} ${names}`, total: 0 });
    }
    (expenses || []).forEach(exp => {
      const day = dayOfMonth(exp.date);
      const bucket = buckets[Math.min(buckets.length - 1, Math.floor((day - 1) / 7))];
      bucket.total = roundMoney(bucket.total + (Number(exp.amount) || 0));
    });
    return buckets;
  }

  /** Daily average: days elapsed for the current month, the full month for any other month. */
  function dailyAverage(totalSpent, year, month, now) {
    const today = now || new Date();
    const isCurrent = today.getFullYear() === year && today.getMonth() === month;
    const days = isCurrent ? Math.max(1, today.getDate()) : daysInMonth(year, month);
    return { average: roundMoney((Number(totalSpent) || 0) / days), days, isCurrentMonth: isCurrent };
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
    weeklyBuckets,
    dailyAverage,
  };
});
