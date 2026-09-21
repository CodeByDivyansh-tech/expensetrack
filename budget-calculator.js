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
  function computeAllocation(monthlyBudget, categoryBudgets) {
    // 1. Sanitize monthly budget: non-negative number, handle decimals, 0, null, undefined, NaN
    const rawBudget = Number(monthlyBudget);
    const budget = (!isNaN(rawBudget) && rawBudget > 0) ? Math.round(rawBudget * 100) / 100 : 0;

    // 2. Sum category caps: ignore negative or NaN values, preserve decimals
    let totalAllocated = 0;
    if (categoryBudgets && typeof categoryBudgets === 'object') {
      for (const val of Object.values(categoryBudgets)) {
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

  return {
    computeAllocation,
  };
});
