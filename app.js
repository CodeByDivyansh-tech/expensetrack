/**
 * ExpenseTrack - Student Finance App
 * Core Application Logic & State Management
 */

(function () {
  'use strict';

  // --- Modules: Data Access Layer & Budget Allocation Calculator ---
  const DataLayer = (typeof window !== 'undefined' && window.ExpenseTrackDataLayer)
    ? window.ExpenseTrackDataLayer
    : (typeof require !== 'undefined' ? require('./data-layer.js') : null);

  const BudgetCalculator = (typeof window !== 'undefined' && window.BudgetCalculator)
    ? window.BudgetCalculator
    : (typeof require !== 'undefined' ? require('./budget-calculator.js') : null);

  // Dynamic Categories Getter
  function getCategories() {
    return DataLayer ? DataLayer.getActiveCategories() : {};
  }

  function getAllCategories(includeArchived = false) {
    return DataLayer ? DataLayer.getAllCategories(includeArchived) : {};
  }

  function normalizeCategoryKey(key) {
    return DataLayer ? DataLayer.normalizeCategoryKey(key) : (key || 'food');
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  const escapeHtml = escapeHTML;

  // --- State Object ---
  const state = {
    currentView: 'dashboard',
    expenses: [],
    budget: null,
    settings: null,
    editingExpenseId: null,
    analyticsYear: new Date().getFullYear(),
    analyticsMonth: new Date().getMonth(), // 0-indexed: 0 = Jan, 9 = Oct
    charts: {
      categoryDonut: null,
      monthlyBar: null,
    },
    renderCounts: { dashboard: 0, 'budget-setup': 0, analytics: 0, 'profile-&-settings': 0 },
  };

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Stored expenses whose category is not a known id show up under this placeholder.
  const UNCATEGORIZED_ID = 'uncategorized';
  const UNCATEGORIZED_CATEGORY = {
    id: UNCATEGORIZED_ID,
    name: 'Uncategorized',
    icon: 'category',
    color: '#6d7a72',
    iconBgClass: 'bg-surface-container text-on-surface-variant',
    defaultCap: 0,
  };

  // --- Storage via Data Access Layer ---
  function loadState() {
    if (!DataLayer) return;
    state.expenses = DataLayer.getExpenses();
    state.budget = DataLayer.getBudget();
    state.settings = DataLayer.getSettings();
  }

  function saveExpenses() {
    if (!DataLayer) return;
    DataLayer.saveExpenses(state.expenses);
  }

  async function saveBudget() {
    if (!DataLayer) return;
    await DataLayer.saveBudget(state.budget);
  }

  async function saveSettings() {
    if (!DataLayer) return;
    await DataLayer.saveSettings(state.settings);
  }

  // Shown in toasts: say so when a save was only queued for later.
  function savedMessage(message) {
    return DataLayer && DataLayer.isOffline && DataLayer.isOffline()
      ? "Saved offline. It will sync when you're back online."
      : message;
  }

  function errorDetail(err) {
    return (err && err.message) ? err.message : 'Something went wrong.';
  }

  // Put the in-memory state back in line with what the data layer really holds.
  function reloadFromDataLayer() {
    loadState();
    syncAllViewsWithData();
  }

  const safeIcon = (icon) => (DataLayer && DataLayer.safeIcon ? DataLayer.safeIcon(icon) : 'category');
  const safeColor = (color) => (DataLayer && DataLayer.safeColor ? DataLayer.safeColor(color) : '#006948');

  // --- Formatting & Local Date Helpers ---
  function formatINR(val) {
    if (BudgetCalculator) return BudgetCalculator.formatINR(val);
    return (Number(val) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function roundMoney(val) {
    return BudgetCalculator ? BudgetCalculator.roundMoney(val) : Math.round((Number(val) || 0) * 100) / 100;
  }

  const localDateString = (DataLayer && DataLayer.localDateString) || function(date = new Date()) {
    const d = (date instanceof Date) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseLocalDate = (DataLayer && DataLayer.parseLocalDate) || function(dateStr) {
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
  };

  const isSameMonth = (DataLayer && DataLayer.isSameMonth) || function(dateStr, targetYear, targetMonth) {
    const d = parseLocalDate(dateStr);
    return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
  };

  const isCurrentMonth = (DataLayer && DataLayer.isCurrentMonth) || function(dateStr) {
    const now = new Date();
    return isSameMonth(dateStr, now.getFullYear(), now.getMonth());
  };

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    try {
      const date = parseLocalDate(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function getCurrentMonthExpenses() {
    return state.expenses.filter(exp => isCurrentMonth(exp.date));
  }

  function getMonthExpenses(year, month) {
    return state.expenses.filter(exp => isSameMonth(exp.date, year, month));
  }

  // --- Calculations (Defaulting to Current Month) ---
  function getCategorySpendingMap(expensesList = null) {
    const expenses = expensesList !== null ? expensesList : getCurrentMonthExpenses();
    const map = {};
    const allCats = getAllCategories(true);
    Object.keys(allCats).forEach(k => {
      map[k] = 0;
    });
    expenses.forEach(exp => {
      const known = normalizeCategoryKey(exp.category);
      // Anything that is not a known category id is grouped as "Uncategorized"
      const cat = allCats[known] ? known : UNCATEGORIZED_ID;
      map[cat] = (map[cat] || 0) + (Number(exp.amount) || 0);
    });
    Object.keys(map).forEach(k => { map[k] = roundMoney(map[k]); });
    return map;
  }

  function getTotalSpending(expensesList = null) {
    const expenses = expensesList !== null ? expensesList : getCurrentMonthExpenses();
    return roundMoney(expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0));
  }

  function getTotalAllocatedBudget() {
    if (!state.budget || !state.budget.categories) return 0;
    const activeIds = Object.keys(getCategories());
    return Object.entries(state.budget.categories)
      .filter(([id]) => activeIds.includes(id))
      .reduce((sum, [, val]) => sum + (Number(val) || 0), 0);
  }

  // --- Navigation & Router ---
  function navigateTo(viewName) {
    const allowed = ['dashboard', 'budget-setup', 'analytics', 'profile-&-settings'];
    if (!allowed.includes(viewName)) {
      viewName = 'dashboard';
    }
    state.currentView = viewName;

    // Toggle views visibility
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => {
      if (v.id === `view-${viewName}`) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });

    // Update Desktop Sidebar active classes
    const desktopLinks = document.querySelectorAll('aside nav a[data-path]');
    desktopLinks.forEach(link => {
      const path = link.getAttribute('data-path');
      if (path === viewName) {
        link.classList.add('bg-primary-container', 'text-on-primary-container', 'font-semibold');
        link.classList.remove('text-on-surface-variant', 'hover:bg-surface-container', 'hover:text-on-surface');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('bg-primary-container', 'text-on-primary-container', 'font-semibold');
        link.classList.add('text-on-surface-variant', 'hover:bg-surface-container', 'hover:text-on-surface');
        link.removeAttribute('aria-current');
      }
    });

    // Update Mobile Bottom Nav active classes
    const mobileLinks = document.querySelectorAll('nav.lg\\:hidden a[data-path]');
    mobileLinks.forEach(link => {
      const path = link.getAttribute('data-path');
      if (path === 'add-expense') return; // FAB is always styled distinctively
      if (path === viewName) {
        link.classList.add('text-primary', 'font-bold');
        link.classList.remove('text-on-surface-variant');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('text-primary', 'font-bold');
        link.classList.add('text-on-surface-variant');
        link.removeAttribute('aria-current');
      }
    });

    // Refresh view specific content
    syncAllViewsWithData();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // --- Academic Term & Real Month Display (Section 7) ---
  function getAcademicTermInfo() {
    const now = new Date();
    const currentMonthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); // e.g. "October 2026"
    return {
      year: now.getFullYear(),
      termName: currentMonthYear,
      weekText: currentMonthYear,
      termCycle: currentMonthYear,
    };
  }

  function updateAcademicTermDisplay() {
    const info = getAcademicTermInfo();
    const semBadges = document.querySelectorAll('.dynamic-semester-badge');
    semBadges.forEach(el => { el.textContent = info.termName; });

    const termBadges = document.querySelectorAll('.dynamic-term-badge');
    termBadges.forEach(el => { el.textContent = `${info.termName} • Campus Living`; });

    const weekBadges = document.querySelectorAll('.dynamic-term-week');
    weekBadges.forEach(el => { el.textContent = info.termName; });

    const cycleBadges = document.querySelectorAll('.dynamic-term-cycle');
    cycleBadges.forEach(el => { el.textContent = info.termName; });
  }

  function getTopSpendingCategory(spendingMap) {
    const allCats = getAllCategories(true);
    let topKey = null;
    let maxVal = 0;
    Object.keys(allCats).forEach(key => {
      const val = spendingMap[key] || 0;
      if (val > maxVal) {
        maxVal = val;
        topKey = key;
      }
    });
    // Nothing spent in the period: there is no "top" category.
    if (topKey === null) return null;
    return { ...allCats[topKey], amount: maxVal };
  }

  // --- In-App 80% Budget Alert Check ---
  function checkBudget80Alert() {
    const banner = document.getElementById('budget-warning-banner');
    if (!banner) return;

    const totalSpent = getTotalSpending();
    const overallCap = state.budget?.overallCap || 12000;
    const isNotifyEnabled = state.settings?.notify80;

    if (isNotifyEnabled && overallCap > 0 && (totalSpent / overallCap) >= 0.8) {
      const pct = Math.round((totalSpent / overallCap) * 100);
      const title = document.getElementById('budget-warning-title');
      const desc = document.getElementById('budget-warning-desc');
      if (title) {
        title.textContent = pct >= 100 ? 'Monthly Budget Exceeded!' : 'Budget Warning: 80% Limit Reached';
      }
      if (desc) {
        desc.textContent = pct >= 100
          ? `You have exceeded your monthly budget of ₹${formatINR(overallCap)} by ₹${formatINR(totalSpent - overallCap)}.`
          : `You have spent ₹${formatINR(totalSpent)} of your ₹${formatINR(overallCap)} monthly budget (${pct}% used).`;
      }
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // --- Unified Single Source of Truth Synchronization ---
  // Shared widgets plus the view that is on screen; other views render when you open them.
  function syncAllViewsWithData() {
    updateSidebarWidget();
    updateAcademicTermDisplay();
    switch (state.currentView) {
      case 'dashboard': renderDashboard(); break;
      case 'budget-setup': renderBudgetSetup(); break;
      case 'analytics': renderAnalytics(); break;
      case 'profile-&-settings': renderProfile(); break;
      default: break;
    }
    checkBudget80Alert();
  }

  function renderCurrentView() {
    syncAllViewsWithData();
  }

  // --- Sidebar Semester Budget Widget Update ---
  function updateSidebarWidget() {
    const widgetSafePercent = document.getElementById('sidebar-safe-percent');
    const widgetBar = document.getElementById('sidebar-progress-bar');
    const widgetLeft = document.getElementById('sidebar-left-text');
    if (!widgetSafePercent || !widgetBar || !widgetLeft) return;

    const overallCap = state.budget?.overallCap || 0;
    const totalSpent = getTotalSpending();

    if (overallCap <= 0) {
      widgetSafePercent.textContent = 'No Cap';
      widgetSafePercent.className = 'font-label-sm text-label-sm text-on-surface-variant font-bold';
      widgetBar.style.width = '0%';
      widgetBar.className = 'bg-surface-container h-full rounded-full';
      widgetLeft.textContent = 'Set budget in Budget Setup';
      return;
    }

    const remaining = overallCap - totalSpent;
    const percentSpent = Math.min(100, Math.max(0, (totalSpent / overallCap) * 100));

    if (remaining < 0) {
      widgetSafePercent.textContent = 'Overrun!';
      widgetSafePercent.className = 'font-label-sm text-label-sm text-error font-bold';
      widgetBar.style.width = '100%';
      widgetBar.className = 'bg-error h-full rounded-full';
      widgetLeft.textContent = `₹${formatINR(Math.abs(remaining))} over budget`;
    } else {
      const safeRatio = Math.round(((overallCap - totalSpent) / overallCap) * 100);
      widgetSafePercent.textContent = `${safeRatio}% Safe`;
      widgetSafePercent.className = 'font-label-sm text-label-sm text-primary font-bold';
      widgetBar.style.width = `${percentSpent}%`;
      widgetBar.className = percentSpent > 80 ? 'bg-tertiary h-full rounded-full' : 'bg-primary h-full rounded-full';
      widgetLeft.textContent = `₹${formatINR(remaining)} left this month`;
    }
  }

  // ==========================================
  // VIEW 1: DASHBOARD
  // ==========================================
  function renderDashboard() {
    state.renderCounts.dashboard++;
    const totalSpent = getTotalSpending();
    const overallCap = state.budget?.overallCap || 0;
    const remaining = overallCap - totalSpent;
    const hasBudget = overallCap > 0;
    const isOverBudget = hasBudget && remaining < 0;

    // Hero Total Spent
    const heroSpentVal = document.getElementById('dash-total-spent');
    if (heroSpentVal) heroSpentVal.textContent = `₹${formatINR(totalSpent)}`;

    // Budget Cap Display
    const dashBudgetCap = document.getElementById('dash-budget-cap');
    if (dashBudgetCap) {
      dashBudgetCap.textContent = hasBudget ? `₹${formatINR(overallCap)}` : 'Not Set';
    }

    // Remaining / Buffer Display
    const dashRemainingPill = document.getElementById('dash-remaining-pill');
    const dashRemainingText = document.getElementById('dash-remaining-text');
    const dashProgressBar = document.getElementById('dash-progress-bar');
    const dashProgressSubtitle = document.getElementById('dash-progress-subtitle');

    if (dashRemainingPill && dashRemainingText) {
      if (!hasBudget) {
        dashRemainingPill.className = 'inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md';
        dashRemainingText.textContent = 'No budget set';
      } else if (isOverBudget) {
        dashRemainingPill.className = 'inline-flex items-center gap-1 px-3 py-1 rounded-full bg-error-container text-on-error-container font-label-md text-label-md font-bold';
        dashRemainingText.textContent = `₹${formatINR(Math.abs(remaining))} Over Budget!`;
      } else {
        dashRemainingPill.className = 'inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold';
        dashRemainingText.textContent = `₹${formatINR(remaining)} Remaining Safe`;
      }
    }

    if (dashProgressBar) {
      if (!hasBudget) {
        dashProgressBar.style.width = '0%';
        dashProgressBar.className = 'bg-surface-container h-full rounded-full transition-all duration-500';
      } else {
        const pct = Math.min(100, Math.max(0, (totalSpent / overallCap) * 100));
        dashProgressBar.style.width = `${pct}%`;
        if (isOverBudget) {
          dashProgressBar.className = 'bg-error h-full rounded-full transition-all duration-500';
        } else if (pct >= 80) {
          dashProgressBar.className = 'bg-tertiary h-full rounded-full transition-all duration-500';
        } else {
          dashProgressBar.className = 'bg-primary h-full rounded-full transition-all duration-500';
        }
      }
    }

    if (dashProgressSubtitle) {
      if (!hasBudget) {
        dashProgressSubtitle.innerHTML = `<span class="text-on-surface-variant">Tap <button class="text-primary font-bold underline" data-click="openBudgetModal">Set Budget</button> to configure your monthly budget.</span>`;
      } else if (isOverBudget) {
        dashProgressSubtitle.innerHTML = `<span class="text-error font-bold flex items-center gap-1"><span class="material-symbols-outlined text-sm">warning</span> Monthly limit exceeded by ₹${formatINR(Math.abs(remaining))}</span>`;
      } else {
        const pct = Math.round((totalSpent / overallCap) * 100);
        dashProgressSubtitle.innerHTML = `<span class="text-on-surface-variant">${pct}% of monthly cap used • Pacing healthy</span>`;
      }
    }

    // Category Quick Cards
    renderDashboardCategoryChips();

    // Transactions List
    renderDashboardTransactions();

    // Dynamic spending insight based on real history
    const dashInsight = document.getElementById('dash-spending-insight');
    if (dashInsight) {
      const topCat = getTopSpendingCategory(getCategorySpendingMap());
      if (state.expenses.length === 0) {
        dashInsight.textContent = 'Log your first expense to begin tracking your daily spending rhythm.';
      } else if (!topCat) {
        dashInsight.textContent = 'Nothing logged this month yet. Add an expense to see where your money is going.';
      } else {
        const now = new Date();
        const dailyAvg = BudgetCalculator
          ? BudgetCalculator.dailyAverage(totalSpent, now.getFullYear(), now.getMonth(), now).average
          : totalSpent / Math.max(1, now.getDate());
        dashInsight.textContent = `${topCat.name} leads your spending at ₹${formatINR(topCat.amount)}. Your month-to-date pacing is ₹${formatINR(dailyAvg)}/day.`;
      }
    }
  }

  function renderDashboardCategoryChips() {
    const container = document.getElementById('dash-category-cards');
    if (!container) return;

    const spendingMap = getCategorySpendingMap();
    const caps = state.budget?.categories || {};
    const activeCats = getCategories();

    let html = '';
    Object.keys(activeCats).forEach(catKey => {
      const cat = activeCats[catKey];
      const spent = spendingMap[catKey] || 0;
      const cap = caps[catKey] !== undefined ? caps[catKey] : cat.defaultCap;
      const pct = cap > 0 ? Math.round((spent / cap) * 100) : 0;
      const isOver = spent > cap;

      let badgeColor = 'bg-primary-fixed text-on-primary-fixed';
      let badgeIcon = 'check_circle';
      let badgeLabel = `${pct}%`;
      if (isOver) {
        badgeColor = 'bg-error-container text-on-error-container';
        badgeIcon = 'error';
        badgeLabel = 'Exceeded';
      } else if (pct >= 80) {
        badgeColor = 'bg-tertiary-fixed text-on-tertiary-fixed';
        badgeIcon = 'warning';
        badgeLabel = 'Near Limit';
      }

      html += `
        <div class="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-2">
            <div class="w-10 h-10 rounded-xl ${escapeHtml(cat.iconBgClass || 'bg-surface-container text-primary')} flex items-center justify-center">
              <span class="material-symbols-outlined text-xl">${escapeHtml(safeIcon(cat.icon))}</span>
            </div>
            <span class="px-2 py-0.5 rounded-full ${badgeColor} text-label-sm font-label-sm flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">${badgeIcon}</span>
              ${badgeLabel}
            </span>
          </div>
          <div>
            <div class="font-label-md text-label-md text-on-surface font-bold truncate">${escapeHtml(cat.name)}</div>
            <div class="flex items-baseline justify-between mt-1">
              <span class="font-title-md text-title-md font-bold text-on-surface">₹${formatINR(spent)}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">/ ₹${formatINR(cap)}</span>
            </div>
            <div class="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mt-2">
              <div class="${isOver ? 'bg-error' : pct >= 80 ? 'bg-tertiary' : 'bg-primary'} h-full rounded-full transition-all" style="width: ${Math.min(100, pct)}%"></div>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  function renderDashboardTransactions() {
    const container = document.getElementById('dash-transactions-list');
    const emptyState = document.getElementById('dash-transactions-empty');
    const countBadge = document.getElementById('dash-transactions-count');
    if (!container) return;

    const currentMonthExpenses = getCurrentMonthExpenses();

    if (countBadge) {
      countBadge.textContent = `${currentMonthExpenses.length} This Month`;
    }

    if (!currentMonthExpenses || currentMonthExpenses.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Sort descending by local date / createdAt
    const sorted = [...currentMonthExpenses].sort((a, b) => {
      const dateA = parseLocalDate(a.date).getTime() || a.createdAt || 0;
      const dateB = parseLocalDate(b.date).getTime() || b.createdAt || 0;
      return dateB - dateA;
    });

    const allCats = getAllCategories(true);
    let html = '';
    sorted.forEach(exp => {
      const normKey = normalizeCategoryKey(exp.category);
      const cat = allCats[exp.category] || allCats[normKey] || UNCATEGORIZED_CATEGORY;
      html += `
        <div class="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-slate-100 flex items-center justify-between gap-space-sm hover:border-surface-container-high transition-colors group">
          <div class="flex items-center gap-space-md min-w-0">
            <div class="w-10 h-10 rounded-xl ${escapeHtml(cat.iconBgClass)} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-xl">${escapeHtml(safeIcon(cat.icon))}</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-title-md text-title-md text-on-surface font-bold truncate">${escapeHtml(exp.note || cat.name)}</span>
              <div class="flex items-center gap-2 mt-0.5 text-on-surface-variant font-body-sm text-body-sm">
                <span class="truncate">${escapeHtml(cat.name)}</span>
                <span>•</span>
                <span>${escapeHtml(formatDateDisplay(exp.date))}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-space-md flex-shrink-0">
            <span class="font-title-md text-title-md font-bold text-on-surface">
              ₹${formatINR(exp.amount)}
            </span>
            <!-- Edit & Delete Action Buttons matching Stitch Design Style -->
            <div class="flex items-center gap-1">
              <button
                type="button"
                data-action="edit-expense"
                data-id="${escapeHtml(exp.id)}"
                class="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-surface-container hover:text-primary text-on-surface-variant flex items-center justify-center transition-colors"
                title="Edit Expense"
                aria-label="Edit Expense"
              >
                <span class="material-symbols-outlined text-base">edit</span>
              </button>
              <button
                type="button"
                data-action="delete-expense"
                data-id="${escapeHtml(exp.id)}"
                class="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-colors"
                title="Delete Expense"
                aria-label="Delete Expense"
              >
                <span class="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // ==========================================
  // VIEW 2: BUDGET SETUP (Matches code.html Stitch UI)
  // ==========================================
  function renderBudgetSetup() {
    state.renderCounts['budget-setup']++;
    const overallCap = state.budget?.overallCap || 12000;
    const spendingMap = getCategorySpendingMap();
    const categoryCaps = state.budget?.categories || {};
    const activeCategories = getCategories();

    // Use BudgetCalculator to get pure allocation metrics
    const alloc = BudgetCalculator
      ? BudgetCalculator.computeAllocation(overallCap, categoryCaps, Object.keys(activeCategories))
      : {
          monthlyBudget: overallCap,
          totalAllocated: 0,
          buffer: overallCap,
          remaining: overallCap,
          overAmount: 0,
          isOverBudget: false,
          allocatedPercent: 0,
          visualBarWidthPercent: 0,
          bufferPercent: 100,
          formattedTotal: '0',
          formattedBudget: formatINR(overallCap),
          statusText: `₹${formatINR(overallCap)} remaining`,
          percentLabel: '0% assigned',
        };

    // Macro figures
    const totalAllocatedElem = document.getElementById('total-allocated-val');
    const macroDenominatorElem = document.getElementById('macro-denominator-val');
    const bufferPillElem = document.getElementById('buffer-status-pill');
    const bufferIconElem = document.getElementById('buffer-status-icon');
    const bufferTextElem = document.getElementById('buffer-status-text');
    const barAllocated = document.getElementById('bar-allocated');
    const barBuffer = document.getElementById('bar-buffer');
    const macroCapDisplay = document.getElementById('macro-cap-display');
    const macroAllocatedLabel = document.getElementById('macro-allocated-label');
    const macroBufferLabel = document.getElementById('macro-buffer-label');

    const activeCountBadge = document.getElementById('active-categories-count-badge');
    if (activeCountBadge) activeCountBadge.textContent = `${Object.keys(activeCategories).length} Active Budgets`;

    if (totalAllocatedElem) totalAllocatedElem.textContent = formatINR(alloc.totalAllocated);
    if (macroDenominatorElem) macroDenominatorElem.textContent = formatINR(alloc.monthlyBudget);
    if (macroCapDisplay) macroCapDisplay.textContent = `₹${formatINR(alloc.monthlyBudget)} / mo`;

    // Cap visual bar width at 100%, show real percentage in label (e.g. 110% assigned to categories)
    if (barAllocated) {
      barAllocated.style.width = `${alloc.visualBarWidthPercent}%`;
      barAllocated.className = alloc.isOverBudget
        ? 'bg-error h-full rounded-full transition-all duration-300'
        : 'bg-primary h-full rounded-full transition-all duration-300';
    }
    if (barBuffer) barBuffer.style.width = `${alloc.bufferPercent}%`;

    if (macroAllocatedLabel) {
      macroAllocatedLabel.textContent = `${alloc.allocatedPercent}% assigned to categories`;
    }

    if (alloc.isOverBudget) {
      if (bufferPillElem) {
        bufferPillElem.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container text-on-error-container font-title-md text-title-md font-bold mt-1';
      }
      if (bufferIconElem) bufferIconElem.textContent = 'warning';
      if (bufferTextElem) bufferTextElem.textContent = `₹${formatINR(alloc.overAmount)} over budget`;
      if (macroBufferLabel) {
        macroBufferLabel.className = 'text-error font-bold';
        macroBufferLabel.textContent = `Deficit (-₹${formatINR(alloc.overAmount)})`;
      }
    } else {
      if (bufferPillElem) {
        bufferPillElem.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-title-md text-title-md font-bold mt-1';
      }
      if (bufferIconElem) bufferIconElem.textContent = 'check_circle';
      if (bufferTextElem) bufferTextElem.textContent = `₹${formatINR(alloc.remaining)} remaining`;
      if (macroBufferLabel) {
        macroBufferLabel.className = 'text-primary font-bold';
        macroBufferLabel.textContent = `Safe Cushion (±${alloc.bufferPercent.toFixed(1)}%)`;
      }
    }

    // Default categories update (the 7 static cards in HTML)
    const defaultKeys = ['food', 'groceries', 'transport', 'textbooks', 'entertainment', 'personal', 'emergency'];
    defaultKeys.forEach(catKey => {
      const cat = activeCategories[catKey];
      if (!cat) return;
      const cap = categoryCaps[catKey] !== undefined ? categoryCaps[catKey] : cat.defaultCap;

      // Update Slider range and value from the category definition (not from static markup)
      const slider = document.querySelector(`.budget-slider[data-category="${catKey}"]`);
      if (slider) {
        slider.min = cat.minCap;
        slider.max = Math.max(cat.maxCap, cap);
        slider.step = cat.step;
        slider.value = cap;
        const minLabel = slider.previousElementSibling;
        if (minLabel) minLabel.textContent = `₹${formatINR(cat.minCap)}`;
      }

      const display = document.getElementById(`slider-display-${catKey}`);
      const capDisplay = document.getElementById(`cap-${catKey}`);
      if (display) display.textContent = formatINR(cap);
      if (capDisplay) capDisplay.textContent = formatINR(cap);

      // Update spent values & status cards
      const spentValElem = document.querySelector(`.spent-val-${catKey}`);
      if (spentValElem) spentValElem.textContent = formatINR(spendingMap[catKey] || 0);

      // Update Progress Bar & Badges
      updateCategoryCardLive(catKey, spendingMap[catKey] || 0, cap);
    });

    // Dynamic Custom Categories Rendering
    const customContainer = document.getElementById('custom-category-cards-container');
    if (customContainer) {
      // Built-in categories have static cards in index.html; everything else is a custom category
      // (stored custom categories do not carry an isCustom flag, so test for "not built-in").
      const customCats = Object.values(activeCategories).filter(c => !c.isDefault);
      if (customCats.length === 0) {
        customContainer.innerHTML = '';
      } else {
        let customHtml = '';
        customCats.forEach(cat => {
          const catKey = cat.id;
          const cap = categoryCaps[catKey] !== undefined ? categoryCaps[catKey] : cat.defaultCap;
          const spent = spendingMap[catKey] || 0;
          const pct = cap > 0 ? (spent / cap) * 100 : 0;
          const roundedPct = Math.round(pct);
          const diff = cap - spent;

          let badgeColor = 'bg-primary-fixed text-on-primary-fixed';
          let badgeIcon = 'check_circle';
          let badgeText = 'On track';
          let progressColor = 'bg-primary';

          if (diff < 0) {
            badgeColor = 'bg-error-container text-on-error-container';
            badgeIcon = 'error';
            badgeText = `Exceeded by ₹${formatINR(Math.abs(diff))}!`;
            progressColor = 'bg-error';
          } else if (roundedPct >= 80) {
            badgeColor = 'bg-tertiary-fixed-dim text-on-tertiary-fixed';
            badgeIcon = 'warning';
            badgeText = 'Approaching limit!';
            progressColor = 'bg-tertiary';
          }

          customHtml += `
            <div id="cat-card-${escapeHtml(catKey)}" class="bg-surface-container-lowest rounded-3xl p-space-lg shadow-sm flex flex-col gap-space-md hover:shadow-md transition-shadow duration-200">
              <div class="flex items-start justify-between gap-space-sm">
                <div class="flex items-center gap-space-md min-w-0">
                  <div class="w-12 h-12 rounded-2xl ${escapeHtml(cat.iconBgClass || 'bg-surface-container text-primary')} flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-2xl">${escapeHtml(safeIcon(cat.icon))}</span>
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-title-md text-title-md text-on-surface font-bold truncate">${escapeHtml(cat.name)}</span>
                      <span class="category-status-badge px-2.5 py-0.5 rounded-full ${badgeColor} text-label-sm font-label-sm flex items-center gap-1 flex-shrink-0">
                        <span class="material-symbols-outlined text-xs">${badgeIcon}</span> ${badgeText}
                      </span>
                    </div>
                    <div class="font-body-sm text-body-sm text-on-surface-variant mt-0.5 truncate">${escapeHtml(cat.desc || 'Custom Category')}</div>
                  </div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button 
                    type="button"
                    data-action="edit-category"
                    data-id="${escapeHtml(catKey)}"
                    class="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-surface-container hover:text-primary text-on-surface-variant flex items-center justify-center transition-colors"
                    title="Edit Category"
                    aria-label="Edit Category"
                  >
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button 
                    type="button"
                    data-action="delete-category"
                    data-id="${escapeHtml(catKey)}"
                    class="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-colors"
                    title="Delete Category"
                    aria-label="Delete Category"
                  >
                    <span class="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>
              </div>

              <div>
                <div class="flex items-baseline justify-between mb-1">
                  <span class="font-headline-sm text-headline-sm text-on-surface font-bold">₹<span class="spent-val-${escapeHtml(catKey)}">${formatINR(spent)}</span></span>
                  <span class="font-body-sm text-body-sm text-on-surface-variant">of ₹<span id="cap-${escapeHtml(catKey)}">${formatINR(cap)}</span> cap</span>
                </div>
                <div class="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
                  <div class="category-progress-fill ${progressColor} h-full rounded-full transition-all duration-300" style="width: ${Math.min(100, Math.max(0, pct))}%"></div>
                </div>
                <div class="flex justify-between items-center mt-1.5 font-label-sm text-label-sm">
                  <span class="category-remaining-text ${diff < 0 ? 'text-error font-bold' : roundedPct >= 80 ? 'text-tertiary font-bold' : 'text-primary font-bold'}">
                    ${diff < 0 ? `${roundedPct}% Overrun (-₹${formatINR(Math.abs(diff))} over cap)` : `${roundedPct}% Spent (₹${formatINR(diff)} remaining)`}
                  </span>
                </div>
              </div>

              <div class="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-t border-slate-100">
                <label for="slider-${escapeHtml(catKey)}" class="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">tune</span> Adjust Cap Target:
                </label>
                <div class="flex items-center gap-space-md flex-1 max-w-sm">
                  <span class="font-body-sm text-body-sm text-on-surface-variant">₹${formatINR(cat.minCap || 200)}</span>
                  <input id="slider-${escapeHtml(catKey)}" class="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary budget-slider" data-category="${escapeHtml(catKey)}" max="${Number(cat.maxCap) || 10000}" min="${Number(cat.minCap) || 200}" step="${Number(cat.step) || 100}" type="range" value="${Number(cap) || 0}"/>
                  <span class="font-title-md text-title-md text-on-surface font-semibold w-20 text-right">₹<span id="slider-display-${escapeHtml(catKey)}">${formatINR(cap)}</span></span>
                </div>
              </div>
            </div>
          `;
        });
        customContainer.innerHTML = customHtml;
      }
    }

    // Emergency fund card dynamic updates
    const emergSpent = spendingMap.emergency || 0;
    const emergCap = categoryCaps.emergency !== undefined ? categoryCaps.emergency : 1200;
    const emergPct = emergCap > 0 ? Math.min(100, Math.round((emergSpent / emergCap) * 100)) : 0;
    const emergValElem = document.querySelector('.spent-val-emergency');
    const emergCapElem = document.getElementById('cap-emergency');
    const emergRadial = document.getElementById('emergency-radial-bar');
    const emergDesc = document.getElementById('emergency-cushion-desc');
    const emergGoalPct = document.getElementById('emergency-goal-percent');

    if (emergValElem) emergValElem.textContent = formatINR(emergSpent);
    if (emergCapElem) emergCapElem.textContent = formatINR(emergCap);
    if (emergRadial) emergRadial.setAttribute('stroke-dasharray', `${emergPct}, 100`);
    if (emergDesc) emergDesc.textContent = `₹${formatINR(emergSpent)} spent from this fund this month`;
    if (emergGoalPct) emergGoalPct.textContent = `${emergPct}% of monthly cap used`;

    // Dynamic budget insight
    const budgetInsight = document.getElementById('budget-spending-insight');
    if (budgetInsight) {
      const topCat = getTopSpendingCategory(spendingMap);
      if (state.expenses.length === 0 || !topCat) {
        budgetInsight.textContent = 'No expenses logged this month yet. Category gauges will track your real spending live as you log transactions.';
      } else {
        budgetInsight.textContent = `${topCat.name} is your highest budget demand (₹${formatINR(topCat.amount)}). Adjust sliders below to fine-tune your targets.`;
      }
    }

    // Reflect settings toggles
    const t80 = document.getElementById('toggle-80');
    const tDigest = document.getElementById('toggle-digest');
    const tRoom = document.getElementById('toggle-roommate');
    if (t80) t80.checked = !!state.settings?.notify80;
    if (tDigest) tDigest.checked = !!state.settings?.weeklyDigest;
    if (tRoom) tRoom.checked = !!state.settings?.roommateAlert;
  }

  function updateCategoryCardLive(catKey, spent, cap) {
    const card = document.getElementById(`cat-card-${catKey}`);
    if (!card) return;

    const progressBar = card.querySelector('.category-progress-fill');
    const badge = card.querySelector('.category-status-badge');
    const remainingText = card.querySelector('.category-remaining-text');

    const pct = cap > 0 ? (spent / cap) * 100 : 0;
    const roundedPct = Math.round(pct);
    const diff = cap - spent;

    if (progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      if (diff < 0) {
        progressBar.className = 'bg-error h-full rounded-full transition-all duration-300 category-progress-fill';
      } else if (roundedPct >= 80) {
        progressBar.className = 'bg-tertiary h-full rounded-full transition-all duration-300 category-progress-fill';
      } else {
        progressBar.className = 'bg-primary h-full rounded-full transition-all duration-300 category-progress-fill';
      }
    }

    if (badge) {
      if (diff < 0) {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container text-label-sm font-label-sm flex items-center gap-1 category-status-badge';
        badge.innerHTML = `<span class="material-symbols-outlined text-xs">error</span> Exceeded by ₹${formatINR(Math.abs(diff))}!`;
      } else if (roundedPct >= 80) {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-tertiary-fixed-dim text-on-tertiary-fixed text-label-sm font-label-sm flex items-center gap-1 category-status-badge';
        badge.innerHTML = `<span class="material-symbols-outlined text-xs">warning</span> Approaching limit!`;
      } else {
        badge.className = 'px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-label-sm font-label-sm flex items-center gap-1 category-status-badge';
        badge.innerHTML = `<span class="material-symbols-outlined text-xs">check_circle</span> On track`;
      }
    }

    if (remainingText) {
      if (diff < 0) {
        remainingText.className = 'text-error font-bold category-remaining-text';
        remainingText.textContent = `${roundedPct}% Overrun (-₹${formatINR(Math.abs(diff))} over cap)`;
      } else if (roundedPct >= 80) {
        remainingText.className = 'text-tertiary font-bold category-remaining-text';
        remainingText.textContent = `${roundedPct}% Spent (₹${formatINR(diff)} remaining)`;
      } else {
        remainingText.className = 'text-primary font-bold category-remaining-text';
        remainingText.textContent = `${roundedPct}% Spent (₹${formatINR(diff)} remaining)`;
      }
    }
  }

  function handleSliderInput(slider) {
    const cat = slider.dataset.category;
    const val = parseInt(slider.value, 10);
    const display = document.getElementById(`slider-display-${cat}`);
    const capDisplay = document.getElementById(`cap-${cat}`);
    if (display) display.textContent = formatINR(val);
    if (capDisplay) capDisplay.textContent = formatINR(val);

    if (!state.budget.categories) state.budget.categories = {};
    state.budget.categories[cat] = val;

    const overallCap = state.budget?.overallCap || 12000;
    const alloc = BudgetCalculator
      ? BudgetCalculator.computeAllocation(overallCap, state.budget.categories, Object.keys(getCategories()))
      : null;

    if (alloc) {
      const totalAllocatedElem = document.getElementById('total-allocated-val');
      const macroDenominatorElem = document.getElementById('macro-denominator-val');
      const bufferPillElem = document.getElementById('buffer-status-pill');
      const bufferIconElem = document.getElementById('buffer-status-icon');
      const bufferTextElem = document.getElementById('buffer-status-text');
      const barAllocated = document.getElementById('bar-allocated');
      const barBuffer = document.getElementById('bar-buffer');
      const macroAllocatedLabel = document.getElementById('macro-allocated-label');
      const macroBufferLabel = document.getElementById('macro-buffer-label');

      if (totalAllocatedElem) totalAllocatedElem.textContent = formatINR(alloc.totalAllocated);
      if (macroDenominatorElem) macroDenominatorElem.textContent = formatINR(alloc.monthlyBudget);
      if (barAllocated) {
        barAllocated.style.width = `${alloc.visualBarWidthPercent}%`;
        barAllocated.className = alloc.isOverBudget
          ? 'bg-error h-full rounded-full transition-all duration-300'
          : 'bg-primary h-full rounded-full transition-all duration-300';
      }
      if (barBuffer) barBuffer.style.width = `${alloc.bufferPercent}%`;

      if (macroAllocatedLabel) {
        macroAllocatedLabel.textContent = `${alloc.allocatedPercent}% assigned to categories`;
      }

      if (alloc.isOverBudget) {
        if (bufferPillElem) {
          bufferPillElem.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container text-on-error-container font-title-md text-title-md font-bold mt-1';
        }
        if (bufferIconElem) bufferIconElem.textContent = 'warning';
        if (bufferTextElem) bufferTextElem.textContent = `₹${formatINR(alloc.overAmount)} over budget`;
        if (macroBufferLabel) {
          macroBufferLabel.className = 'text-error font-bold';
          macroBufferLabel.textContent = `Deficit (-₹${formatINR(alloc.overAmount)})`;
        }
      } else {
        if (bufferPillElem) {
          bufferPillElem.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-title-md text-title-md font-bold mt-1';
        }
        if (bufferIconElem) bufferIconElem.textContent = 'check_circle';
        if (bufferTextElem) bufferTextElem.textContent = `₹${formatINR(alloc.remaining)} remaining`;
        if (macroBufferLabel) {
          macroBufferLabel.className = 'text-primary font-bold';
          macroBufferLabel.textContent = `Safe Cushion (±${alloc.bufferPercent.toFixed(1)}%)`;
        }
      }
    }

    const spendingMap = getCategorySpendingMap();
    updateCategoryCardLive(cat, spendingMap[cat] || 0, val);
  }

  async function handleSliderChange(slider) {
    const cat = slider.dataset.category;
    const val = parseInt(slider.value, 10);
    if (!state.budget.categories) state.budget.categories = {};
    state.budget.categories[cat] = val;
    try {
      await saveBudget();
    } catch (err) {
      showToast(`Couldn't save your budget: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
      return;
    }
    syncAllViewsWithData();
  }

  // ==========================================
  // VIEW 3: ANALYTICS (Chart.js Integration)
  // ==========================================
  function renderAnalytics() {
    state.renderCounts.analytics++;
    const selectedYear = state.analyticsYear !== undefined ? state.analyticsYear : new Date().getFullYear();
    const selectedMonth = state.analyticsMonth !== undefined ? state.analyticsMonth : new Date().getMonth();
    const monthExpenses = getMonthExpenses(selectedYear, selectedMonth);

    const spendingMap = getCategorySpendingMap(monthExpenses);
    const totalSpent = getTotalSpending(monthExpenses);
    const overallCap = state.budget?.overallCap || 0;
    const categoryCaps = state.budget?.categories || {};

    // The newest month you can look at is the current one
    const nextBtn = document.getElementById('analytics-next-month');
    if (nextBtn) {
      const now = new Date();
      const atLatest = selectedYear > now.getFullYear() ||
        (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth());
      nextBtn.disabled = atLatest;
      nextBtn.classList.toggle('opacity-40', atLatest);
      nextBtn.classList.toggle('cursor-not-allowed', atLatest);
    }

    // Update Month Label in Analytics View
    const monthLabel = document.getElementById('analytics-month-label');
    if (monthLabel) {
      const monthObj = new Date(selectedYear, selectedMonth, 1);
      monthLabel.textContent = monthObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const totalSpentElem = document.getElementById('analytics-total-spent');
    const emptyElem = document.getElementById('analytics-empty-state');
    const contentElem = document.getElementById('analytics-content');

    if (totalSpentElem) totalSpentElem.textContent = `₹${formatINR(totalSpent)}`;

    if (totalSpent === 0) {
      if (emptyElem) {
        emptyElem.classList.remove('hidden');
        const emptyH3 = emptyElem.querySelector('h3');
        const emptyP = emptyElem.querySelector('p');
        const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (emptyH3) emptyH3.textContent = `No Expenses in ${monthName}`;
        if (emptyP) emptyP.textContent = `No transactions logged for ${monthName}. Use Quick Log to add an expense or browse other months using the arrows above.`;
      }
      if (contentElem) contentElem.classList.add('hidden');
      if (state.charts.categoryDonut) {
        state.charts.categoryDonut.destroy();
        state.charts.categoryDonut = null;
      }
      if (state.charts.monthlyBar) {
        state.charts.monthlyBar.destroy();
        state.charts.monthlyBar = null;
      }
      return;
    }

    if (emptyElem) emptyElem.classList.add('hidden');
    if (contentElem) contentElem.classList.remove('hidden');

    // Key Stat Metrics
    const topCategoryElem = document.getElementById('analytics-top-category');
    const dailyAvgElem = document.getElementById('analytics-daily-avg');

    // Top Category
    let topCatKey = 'food';
    let maxVal = 0;
    Object.keys(spendingMap).forEach(key => {
      if (spendingMap[key] > maxVal) {
        maxVal = spendingMap[key];
        topCatKey = key;
      }
    });
    if (topCategoryElem) {
      const allCats = getAllCategories(true);
      const topCat = allCats[topCatKey] || UNCATEGORIZED_CATEGORY;
      topCategoryElem.textContent = `${topCat.name} (₹${formatINR(maxVal)})`;
    }

    // Daily Average for the selected month
    if (dailyAvgElem) {
      const daily = BudgetCalculator.dailyAverage(totalSpent, selectedYear, selectedMonth);
      dailyAvgElem.textContent = `₹${formatINR(daily.average)} / day`;
      const dailyNote = document.getElementById('analytics-daily-avg-note');
      if (dailyNote) {
        dailyNote.textContent = daily.isCurrentMonth
          ? `Average over the ${daily.days} days so far this month`
          : `Average over all ${daily.days} days of the month`;
      }
    }

    // Category Breakdown Rows
    const breakdownList = document.getElementById('analytics-breakdown-list');
    if (breakdownList) {
      const activeCats = getCategories();
      const allCats = getAllCategories(true);
      const catKeySet = new Set(Object.keys(activeCats));
      Object.keys(spendingMap).forEach(k => {
        if (spendingMap[k] > 0) catKeySet.add(k);
      });

      let rowsHtml = '';
      catKeySet.forEach(catKey => {
        const cat = allCats[catKey] || UNCATEGORIZED_CATEGORY;
        const spent = spendingMap[catKey] || 0;
        const cap = categoryCaps[catKey] !== undefined ? categoryCaps[catKey] : (cat.defaultCap || 1000);
        const sharePct = totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0;
        const budgetPct = cap > 0 ? Math.round((spent / cap) * 100) : 0;

        rowsHtml += `
          <div class="flex items-center justify-between p-space-sm rounded-xl hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-space-sm">
              <div class="w-8 h-8 rounded-lg ${escapeHtml(cat.iconBgClass || 'bg-surface-container text-primary')} flex items-center justify-center">
                <span class="material-symbols-outlined text-lg">${escapeHtml(safeIcon(cat.icon))}</span>
              </div>
              <div class="flex flex-col">
                <span class="font-label-md text-label-md text-on-surface font-bold">${escapeHtml(cat.name)}</span>
                <span class="font-body-sm text-body-sm text-on-surface-variant">${sharePct}% of total spending</span>
              </div>
            </div>
            <div class="text-right">
              <span class="font-title-md text-title-md font-bold text-on-surface">₹${formatINR(spent)}</span>
              <span class="font-body-sm text-body-sm ${spent > cap ? 'text-error font-semibold' : 'text-on-surface-variant'} block">
                ${budgetPct}% of cap
              </span>
            </div>
          </div>
        `;
      });
      breakdownList.innerHTML = rowsHtml;
    }

    // Initialize or Update Chart.js
    initOrUpdateCharts(spendingMap, monthExpenses);
  }

  function initOrUpdateCharts(spendingMap, monthExpenses = []) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js is not loaded.');
      return;
    }

    const activeCats = getCategories();
    const allCats = getAllCategories(true);
    const catKeySet = new Set(Object.keys(activeCats));
    Object.keys(spendingMap).forEach(k => {
      if (spendingMap[k] > 0) catKeySet.add(k);
    });
    const catKeys = Array.from(catKeySet);

    const catLabels = catKeys.map(k => (allCats[k]?.name || UNCATEGORIZED_CATEGORY.name));
    const catData = catKeys.map(k => spendingMap[k] || 0);
    const catColors = catKeys.map(k => safeColor(allCats[k]?.color || UNCATEGORIZED_CATEGORY.color));

    // Donut Chart
    const donutCtx = document.getElementById('chart-category-donut')?.getContext?.('2d');
    if (donutCtx) {
      if (state.charts.categoryDonut) {
        state.charts.categoryDonut.data.labels = catLabels;
        state.charts.categoryDonut.data.datasets[0].data = catData;
        state.charts.categoryDonut.data.datasets[0].backgroundColor = catColors;
        state.charts.categoryDonut.update();
      } else {
        state.charts.categoryDonut = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: catLabels,
            datasets: [
              {
                data: catData,
                backgroundColor: catColors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 12,
                  font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
                  color: '#0b1c30',
                  padding: 12,
                },
              },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    const label = ctx.label || '';
                    const val = ctx.raw || 0;
                    return ` ${label}: ₹${formatINR(val)}`;
                  },
                },
              },
            },
            cutout: '68%',
          },
        });
      }
    }

    // Weekly/Monthly Velocity Bar Chart
    const barCtx = document.getElementById('chart-monthly-bar')?.getContext?.('2d');
    if (barCtx) {
      // Seven-day buckets of the selected month, labelled with their dates
      const buckets = BudgetCalculator.weeklyBuckets(state.analyticsYear, state.analyticsMonth, monthExpenses);
      const weekBuckets = buckets.map(b => b.total);
      const weekLabels = buckets.map(b => b.label);

      if (state.charts.monthlyBar) {
        state.charts.monthlyBar.data.labels = weekLabels;
        state.charts.monthlyBar.data.datasets[0].data = weekBuckets;
        state.charts.monthlyBar.update();
      } else {
        state.charts.monthlyBar = new Chart(barCtx, {
          type: 'bar',
          data: {
            labels: weekLabels,
            datasets: [
              {
                label: 'Spending (₹)',
                data: weekBuckets,
                backgroundColor: '#006948',
                borderRadius: 8,
                barThickness: 24,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    return ` Spent: ₹${formatINR(ctx.raw || 0)}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                  color: '#3d4a42',
                },
              },
              y: {
                beginAtZero: true,
                grid: { color: '#eff4ff' },
                ticks: {
                  font: { family: 'Inter', size: 11 },
                  color: '#6d7a72',
                  callback: function (val) {
                    return '₹' + formatINR(val);
                  },
                },
              },
            },
          },
        });
      }
    }
  }

  // ==========================================
  // VIEW 4: SETTINGS & PROFILE
  // ==========================================
  function renderProfile() {
    state.renderCounts['profile-&-settings']++;
    const totalSpent = getTotalSpending();
    const overallCap = state.budget?.overallCap || 0;

    const pSpent = document.getElementById('profile-total-spent');
    const pCap = document.getElementById('profile-budget-cap');
    const pTxCount = document.getElementById('profile-tx-count');

    if (pSpent) pSpent.textContent = `₹${formatINR(totalSpent)}`;
    if (pCap) pCap.textContent = overallCap > 0 ? `₹${formatINR(overallCap)}` : 'Not Set';
    if (pTxCount) pTxCount.textContent = `${state.expenses.length} Records`;
  }

  // ==========================================
  // EXPENSES CRUD OPERATIONS
  // Helper to ensure modal error banner is hidden by default
  function hideExpenseFormError() {
    const errorContainer = document.getElementById('expense-form-error');
    const errorText = document.getElementById('expense-form-error-text');
    if (errorContainer) {
      errorContainer.style.setProperty('display', 'none', 'important');
      errorContainer.classList.add('hidden');
      errorContainer.classList.remove('flex');
    }
    if (errorText) errorText.textContent = '';
  }

  // Helper to show modal error banner only on validation failure
  function showExpenseFormError(message) {
    const errorContainer = document.getElementById('expense-form-error');
    const errorText = document.getElementById('expense-form-error-text');
    if (errorContainer && errorText) {
      errorText.textContent = message;
      errorContainer.classList.remove('hidden');
      errorContainer.classList.add('flex');
      errorContainer.style.setProperty('display', 'flex', 'important');
    }
  }

  // Dynamic Quick Log Chips
  function renderQuickLogCategoryChips(selectedCatKey = 'food') {
    const container = document.getElementById('quick-log-category-container');
    if (!container) return;

    const activeCategories = getCategories();
    const currentSelected = selectedCatKey || document.getElementById('expense-selected-category')?.value || 'food';

    let html = '';
    Object.values(activeCategories).forEach(cat => {
      const isSelected = cat.id === currentSelected;
      const baseClass = isSelected
        ? 'expense-category-chip flex items-center gap-2 p-2.5 rounded-2xl bg-primary text-on-primary text-left transition-all min-h-[48px] shadow-sm'
        : 'expense-category-chip flex items-center gap-2 p-2.5 rounded-2xl bg-surface-container-low text-on-surface text-left transition-all min-h-[48px] hover:bg-surface-container';

      const iconClass = isSelected ? 'text-on-primary' : 'text-primary';

      html += `
        <button type="button" data-category="${escapeHtml(cat.id)}" aria-pressed="${isSelected}" class="${baseClass}">
          <span class="material-symbols-outlined text-xl ${iconClass} flex-shrink-0">${escapeHtml(safeIcon(cat.icon))}</span>
          <span class="font-label-sm text-label-sm leading-snug break-words hyphens-auto flex-1">${escapeHtml(cat.name)}</span>
        </button>
      `;
    });

    // Last tile: + Custom Category
    html += `
      <button type="button" id="btn-quick-log-add-custom" class="flex items-center gap-2 p-2.5 rounded-2xl border-2 border-dashed border-outline-variant hover:border-primary hover:bg-primary-fixed/20 text-primary text-left transition-all min-h-[48px]">
        <span class="material-symbols-outlined text-xl text-primary flex-shrink-0">add_circle</span>
        <span class="font-label-sm text-label-sm font-semibold leading-snug break-words flex-1">+ Custom Category</span>
      </button>
    `;

    container.innerHTML = html;

    // Attach click listeners to chips
    container.querySelectorAll('.expense-category-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.getAttribute('data-category');
        selectCategoryChip(catId);
      });
    });

    // Attach click listener to + Custom Category button
    const addCustomBtn = document.getElementById('btn-quick-log-add-custom');
    if (addCustomBtn) {
      addCustomBtn.addEventListener('click', () => {
        openAddCustomCategoryModal();
      });
    }
  }

  function selectCategoryChip(catKey) {
    const chips = document.querySelectorAll('.expense-category-chip');
    chips.forEach(chip => {
      const key = chip.dataset.category;
      const icon = chip.querySelector('.material-symbols-outlined');
      chip.setAttribute('aria-pressed', String(key === catKey));
      if (key === catKey) {
        chip.className = 'expense-category-chip flex items-center gap-2 p-2.5 rounded-2xl bg-primary text-on-primary text-left transition-all min-h-[48px] shadow-sm';
        if (icon) icon.className = 'material-symbols-outlined text-xl text-on-primary flex-shrink-0';
      } else {
        chip.className = 'expense-category-chip flex items-center gap-2 p-2.5 rounded-2xl bg-surface-container-low text-on-surface text-left transition-all min-h-[48px] hover:bg-surface-container';
        if (icon) icon.className = 'material-symbols-outlined text-xl text-primary flex-shrink-0';
      }
    });

    const hiddenInput = document.getElementById('expense-selected-category');
    if (hiddenInput) hiddenInput.value = catKey;
  }

  function openAddExpenseModal() {
    state.editingExpenseId = null;
    const modal = document.getElementById('expense-modal');
    const title = document.getElementById('expense-modal-title');
    const subtitle = document.getElementById('expense-modal-subtitle');
    const submitBtn = document.getElementById('expense-modal-submit');
    const amountInput = document.getElementById('expense-amount');
    const noteInput = document.getElementById('expense-note');
    const dateInput = document.getElementById('expense-date');

    // Ensure error is completely hidden on modal open
    hideExpenseFormError();

    if (title) title.textContent = 'Quick Log Expense';
    if (subtitle) subtitle.textContent = 'Capture transaction in under 10 seconds';
    if (submitBtn) submitBtn.textContent = 'Save Expense';

    // Clear inputs
    if (amountInput) amountInput.value = '';
    if (noteInput) noteInput.value = '';

    // Default to today's date YYYY-MM-DD (local time); future dates are not allowed
    if (dateInput) {
      dateInput.max = localDateString();
      dateInput.value = localDateString();
    }

    renderQuickLogCategoryChips('food');
    selectCategoryChip('food');

    showModal(modal);
    if (amountInput) focusSoon(amountInput);
  }

  function openEditExpenseModal(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    state.editingExpenseId = id;
    const modal = document.getElementById('expense-modal');
    const title = document.getElementById('expense-modal-title');
    const subtitle = document.getElementById('expense-modal-subtitle');
    const submitBtn = document.getElementById('expense-modal-submit');
    const amountInput = document.getElementById('expense-amount');
    const noteInput = document.getElementById('expense-note');
    const dateInput = document.getElementById('expense-date');

    hideExpenseFormError();

    if (title) title.textContent = 'Edit Expense';
    if (subtitle) subtitle.textContent = 'Modify transaction details';
    if (submitBtn) submitBtn.textContent = 'Update Expense';

    if (amountInput) amountInput.value = exp.amount;
    if (noteInput) noteInput.value = exp.note || '';
    if (dateInput) {
      dateInput.max = localDateString();
      dateInput.value = exp.date || '';
    }

    renderQuickLogCategoryChips(exp.category);
    selectCategoryChip(exp.category);

    showModal(modal);
    if (amountInput) focusSoon(amountInput);
  }

  function closeExpenseModal() {
    const modal = document.getElementById('expense-modal');
    hideModal(modal);
    hideExpenseFormError();
    state.editingExpenseId = null;
  }

  async function handleExpenseFormSubmit(e) {
    e.preventDefault();
    const amountInput = document.getElementById('expense-amount');
    const noteInput = document.getElementById('expense-note');
    const dateInput = document.getElementById('expense-date');
    const catInput = document.getElementById('expense-selected-category');

    const amountVal = parseFloat(amountInput.value);
    const noteVal = noteInput.value.trim();
    const dateVal = dateInput.value.trim();
    const catVal = catInput.value.trim();
    const normCat = normalizeCategoryKey(catVal);
    const allCats = getAllCategories(true);

    // Strict Validation:
    const errors = [];
    if (!dateVal) {
      errors.push('Please select a transaction date.');
    }
    // Amount, date range and note length use the same rules as the data layer
    const input = DataLayer
      ? DataLayer.validateExpenseInput({ amount: amountInput.value, date: dateVal, note: noteVal })
      : { valid: !isNaN(amountVal) && amountVal > 0, error: 'Please enter an amount greater than ₹0.' };
    if (!input.valid) {
      errors.push(input.error);
    }
    if (!catVal || !allCats[normCat]) {
      errors.push('Please select a valid expense category.');
    }

    if (errors.length > 0) {
      showExpenseFormError(errors.join(' '));
      return;
    }

    hideExpenseFormError();

    const categoryName = allCats[normCat]?.name || normCat;
    const submitBtn = document.getElementById('expense-modal-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
    if (state.editingExpenseId) {
      // Update existing
      if (DataLayer) {
        await DataLayer.updateExpense(state.editingExpenseId, {
          amount: amountVal,
          category: normCat,
          date: dateVal,
          note: noteVal || categoryName,
        });
        state.expenses = DataLayer.getExpenses();
      } else {
        const idx = state.expenses.findIndex(x => x.id === state.editingExpenseId);
        if (idx !== -1) {
          state.expenses[idx] = {
            ...state.expenses[idx],
            amount: amountVal,
            category: normCat,
            date: dateVal,
            note: noteVal || categoryName,
          };
          saveExpenses();
        }
      }
      showToast(savedMessage('Expense updated successfully!'), 'success');
    } else {
      // Create new
      if (DataLayer) {
        await DataLayer.addExpense({
          amount: amountVal,
          category: normCat,
          date: dateVal,
          note: noteVal || categoryName,
        });
        state.expenses = DataLayer.getExpenses();
      } else {
        const newExp = {
          id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          amount: amountVal,
          category: normCat,
          date: dateVal,
          note: noteVal || categoryName,
          createdAt: Date.now(),
        };
        state.expenses.unshift(newExp);
        saveExpenses();
      }
      showToast(savedMessage('Expense logged successfully!'), 'success');
    }
    } catch (err) {
      const message = `Couldn't save your expense: ${errorDetail(err)}`;
      showExpenseFormError(message);
      showToast(message, 'error');
      reloadFromDataLayer();
      return;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }

    closeExpenseModal();
    syncAllViewsWithData();
  }

  async function addExpense({ amount, category, date, note } = {}) {
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      throw new Error('Please enter an amount greater than ₹0.');
    }
    const normCat = normalizeCategoryKey(category);
    const allCats = getAllCategories(true);
    if (!allCats[normCat]) {
      throw new Error('Please select a valid expense category.');
    }
    const today = localDateString();
    const categoryName = allCats[normCat]?.name || normCat;

    let newExp;
    if (DataLayer) {
      newExp = await DataLayer.addExpense({
        amount: amountVal,
        category: normCat,
        date: date || today,
        note: (note && String(note).trim()) || categoryName,
      });
      state.expenses = DataLayer.getExpenses();
    } else {
      newExp = {
        id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        amount: amountVal,
        category: normCat,
        date: date || today,
        note: (note && String(note).trim()) || categoryName,
        createdAt: Date.now(),
      };
      state.expenses.unshift(newExp);
      saveExpenses();
    }
    syncAllViewsWithData();
    return newExp;
  }

  async function deleteExpense(id) {
    if (DataLayer) {
      try {
        await DataLayer.deleteExpense(id);
      } catch (err) {
        reloadFromDataLayer();
        throw err;
      }
      state.expenses = DataLayer.getExpenses();
    } else {
      state.expenses = state.expenses.filter(e => e.id !== id);
      saveExpenses();
    }
    syncAllViewsWithData();
  }

  async function confirmDeleteExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    // No confirmation: delete at once and offer Undo for a few seconds
    const removed = { ...exp };
    try {
      await deleteExpense(id);
    } catch (err) {
      showToast(`Couldn't delete the expense: ${errorDetail(err)}`, 'error');
      return;
    }
    showToast(savedMessage('Expense deleted.'), 'info', {
      actionLabel: 'Undo',
      duration: 6000,
      onAction: async () => {
        try {
          await DataLayer.restoreExpense(removed);
          reloadFromDataLayer();
          showToast('Expense restored.', 'success');
        } catch (err) {
          showToast(`Couldn't restore the expense: ${errorDetail(err)}`, 'error');
        }
      },
    });
  }

  // ==========================================
  // BUDGET MODAL & CEILING EDITING
  // ==========================================
  function showBudgetCapError(message) {
    const err = document.getElementById('overall-cap-error');
    const input = document.getElementById('overall-cap-input');
    if (err) {
      err.textContent = message;
      err.classList.remove('hidden');
    }
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function hideBudgetCapError() {
    const err = document.getElementById('overall-cap-error');
    const input = document.getElementById('overall-cap-input');
    if (err) {
      err.textContent = '';
      err.classList.add('hidden');
    }
    if (input) input.removeAttribute('aria-invalid');
  }

  function openBudgetModal() {
    const modal = document.getElementById('budget-modal');
    const input = document.getElementById('overall-cap-input');
    hideBudgetCapError();
    if (input) {
      input.value = state.budget?.overallCap || 12000;
    }
    showModal(modal);
    if (input) focusSoon(input);
  }

  function closeBudgetModal() {
    const modal = document.getElementById('budget-modal');
    hideModal(modal);
  }

  async function saveBudgetModal() {
    const input = document.getElementById('overall-cap-input');
    const check = BudgetCalculator.validateOverallCap(input.value);

    if (!check.valid) {
      showBudgetCapError(check.error);
      return;
    }
    hideBudgetCapError();
    const val = check.value;

    state.budget.overallCap = val;
    try {
      await saveBudget();
    } catch (err) {
      showToast(`Couldn't save your budget: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
      return;
    }
    closeBudgetModal();
    showToast(savedMessage(`Monthly budget ceiling updated to ₹${formatINR(val)}!`), 'success');
    syncAllViewsWithData();
  }

  async function resetBudgetDefaults() {
    if (await confirmDialog({
      title: 'Reset budget to defaults?',
      message: 'All category caps and your monthly budget go back to the default targets. Your expenses are not touched.',
      confirmLabel: 'Reset budget',
    })) {
      try {
        state.budget = DataLayer ? await DataLayer.resetBudgetDefaults() : {
          overallCap: 12000,
          categories: { food: 3500, groceries: 2000, transport: 1000, textbooks: 1200, entertainment: 1500, personal: 600, emergency: 1200 }
        };
        if (!DataLayer) await saveBudget();
      } catch (err) {
        showToast(`Couldn't reset your budget: ${errorDetail(err)}`, 'error');
        reloadFromDataLayer();
        return;
      }
      showToast(savedMessage('Budget caps reset to defaults.'), 'info');
      syncAllViewsWithData();
    }
  }

  async function clearAllExpenses() {
    if (await confirmDialog({
      title: 'Delete ALL expenses?',
      message: `This permanently deletes all ${state.expenses.length} logged expenses from your account. It cannot be undone.`,
      confirmLabel: 'Delete everything',
      danger: true,
      requireText: 'DELETE',
    })) {
      try {
        if (DataLayer) await DataLayer.clearAllExpenses();
        state.expenses = [];
        saveExpenses();
      } catch (err) {
        showToast(`Couldn't clear your expenses: ${errorDetail(err)}`, 'error');
        reloadFromDataLayer();
        return;
      }
      showToast(savedMessage('All expenses cleared. Empty state activated.'), 'info');
      syncAllViewsWithData();
    }
  }

  // ==========================================
  // CUSTOM CATEGORY MODAL & CRUD
  // ==========================================
  function openAddCustomCategoryModal() {
    const modal = document.getElementById('custom-category-modal');
    const form = document.getElementById('custom-category-form');
    const title = document.getElementById('custom-category-modal-title');
    const idInput = document.getElementById('custom-category-id');
    const nameInput = document.getElementById('custom-category-name');
    const capInput = document.getElementById('custom-category-cap');
    const iconInput = document.getElementById('custom-category-icon');
    const colorInput = document.getElementById('custom-category-color');

    hideCustomCategoryError();
    if (form) form.reset();
    if (idInput) idInput.value = '';
    if (title) title.textContent = 'Add Custom Category';
    if (iconInput) iconInput.value = 'category';
    if (colorInput) colorInput.value = '#006948';

    selectCustomIcon('category');
    selectCustomColor('#006948');

    showModal(modal);
    if (nameInput) focusSoon(nameInput);
  }

  function openEditCustomCategoryModal(catId) {
    if (!catId) return;
    const allCats = getAllCategories(true);
    const cat = allCats[catId];
    if (!cat) return;

    const modal = document.getElementById('custom-category-modal');
    const title = document.getElementById('custom-category-modal-title');
    const idInput = document.getElementById('custom-category-id');
    const nameInput = document.getElementById('custom-category-name');
    const capInput = document.getElementById('custom-category-cap');
    const iconInput = document.getElementById('custom-category-icon');
    const colorInput = document.getElementById('custom-category-color');

    hideCustomCategoryError();
    if (title) title.textContent = 'Edit Category';
    if (idInput) idInput.value = catId;
    if (nameInput) nameInput.value = cat.name || '';

    const currentCap = state.budget?.categories?.[catId] !== undefined
      ? state.budget.categories[catId]
      : (cat.defaultCap || 500);
    if (capInput) capInput.value = currentCap;

    const icon = cat.icon || 'category';
    const color = cat.color || '#006948';
    if (iconInput) iconInput.value = icon;
    if (colorInput) colorInput.value = color;

    selectCustomIcon(icon);
    selectCustomColor(color);

    showModal(modal);
    if (nameInput) focusSoon(nameInput);
  }

  function closeCustomCategoryModal() {
    const modal = document.getElementById('custom-category-modal');
    hideModal(modal);
    hideCustomCategoryError();
  }

  function showCustomCategoryError(msg) {
    const errBox = document.getElementById('custom-category-error');
    const errText = document.getElementById('custom-category-error-text');
    if (errText) errText.textContent = msg;
    if (errBox) errBox.classList.remove('hidden');
  }

  function hideCustomCategoryError() {
    const errBox = document.getElementById('custom-category-error');
    if (errBox) errBox.classList.add('hidden');
  }

  function selectCustomIcon(iconName) {
    const iconInput = document.getElementById('custom-category-icon');
    if (iconInput) iconInput.value = iconName;

    const buttons = document.querySelectorAll('#custom-icon-selector .icon-option');
    buttons.forEach(btn => {
      const ic = btn.getAttribute('data-icon');
      const selected = ic === iconName;
      btn.setAttribute('aria-pressed', String(selected));
      btn.classList.toggle('bg-primary-container', selected);
      btn.classList.toggle('text-on-primary-container', selected);
      btn.classList.toggle('ring-2', selected);
      btn.classList.toggle('ring-primary', selected);
      btn.classList.toggle('bg-surface-container', !selected);
      btn.classList.toggle('hover:bg-surface-container-high', !selected);
      btn.classList.toggle('text-on-surface', !selected);
    });
  }

  function selectCustomColor(hexColor) {
    const colorInput = document.getElementById('custom-category-color');
    if (colorInput) colorInput.value = hexColor;

    const buttons = document.querySelectorAll('#custom-color-selector .color-option');
    buttons.forEach(btn => {
      const col = btn.getAttribute('data-color');
      // The swatch colour is an inline style, so toggling the ring never loses it
      const selected = col === hexColor;
      btn.setAttribute('aria-pressed', String(selected));
      btn.classList.toggle('ring-2', selected);
      btn.classList.toggle('ring-offset-2', selected);
      btn.classList.toggle('ring-primary', selected);
    });
  }

  async function handleCustomCategoryFormSubmit(e) {
    e.preventDefault();
    const idInput = document.getElementById('custom-category-id');
    const nameInput = document.getElementById('custom-category-name');
    const capInput = document.getElementById('custom-category-cap');
    const iconInput = document.getElementById('custom-category-icon');
    const colorInput = document.getElementById('custom-category-color');

    const id = idInput?.value?.trim() || null;
    const name = nameInput?.value?.trim() || '';
    const cap = parseFloat(capInput?.value) || 0;
    const icon = iconInput?.value?.trim() || 'category';
    const color = colorInput?.value?.trim() || '#006948';

    if (!DataLayer) return;

    const validation = DataLayer.validateCategoryInput(name, cap, id);
    if (!validation.valid) {
      showCustomCategoryError(validation.error);
      return;
    }

    const submitBtn = document.querySelector('#custom-category-form button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      // The data layer saves the category and its cap together, so there is no second budget write here.
      let savedId = id;
      if (id) {
        const updated = await DataLayer.updateCustomCategory(id, { name, budgetCap: cap, icon, color });
        showToast(savedMessage(`Category "${updated.name}" updated!`), 'success');
      } else {
        const created = await DataLayer.addCustomCategory({ name, budgetCap: cap, icon, color });
        savedId = created.id;
        showToast(savedMessage(`Category "${created.name}" created!`), 'success');
      }

      loadState();
      closeCustomCategoryModal();
      syncAllViewsWithData();

      // If Quick Log modal is open, re-render its chips and select the category just saved
      const expenseModal = document.getElementById('expense-modal');
      if (expenseModal && !expenseModal.classList.contains('hidden')) {
        renderQuickLogCategoryChips(savedId);
        selectCategoryChip(savedId);
      }
    } catch (err) {
      showCustomCategoryError(err.message || 'Failed to save category');
      reloadFromDataLayer();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function confirmDeleteCategory(catId) {
    if (!catId || !DataLayer) return;
    const allCats = getAllCategories(true);
    const cat = allCats[catId];
    if (!cat) return;

    if (cat.isDefault) {
      showToast('Built-in categories cannot be deleted.', 'info');
      return;
    }

    const expenses = DataLayer.getExpenses();
    const hasExpenses = expenses.some(e => normalizeCategoryKey(e.category) === catId);

    const proceed = hasExpenses
      ? await confirmDialog({
          title: `Archive "${cat.name}"?`,
          message: 'It has expenses, so it will be hidden from new entries but all past transactions stay intact.',
          confirmLabel: 'Archive',
        })
      : await confirmDialog({
          title: `Delete "${cat.name}"?`,
          message: 'This category has no expenses. It will be removed permanently.',
          confirmLabel: 'Delete',
          danger: true,
        });
    if (!proceed) return;

    let result;
    try {
      result = await DataLayer.deleteCategory(catId);
    } catch (err) {
      showToast(`Couldn't remove the category: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
      return;
    }
    loadState();
    showToast(
      savedMessage(result.action === 'archived' ? `Category "${cat.name}" archived.` : `Category "${cat.name}" deleted.`),
      'info'
    );

    syncAllViewsWithData();

    // Re-render Quick Log chips if open
    const expenseModal = document.getElementById('expense-modal');
    if (expenseModal && !expenseModal.classList.contains('hidden')) {
      renderQuickLogCategoryChips('food');
    }
  }

  // ==========================================
  // TOAST NOTIFICATIONS
  // ==========================================
  // ==========================================
  // MODALS (focus trap, Escape, backdrop click, focus return) AND DIALOGS
  // ==========================================
  const openModals = []; // most recent last: { el, opener }

  function closeFnFor(modalEl) {
    const closers = {
      'expense-modal': closeExpenseModal,
      'budget-modal': closeBudgetModal,
      'custom-category-modal': closeCustomCategoryModal,
      'confirm-modal': () => settleDialog('cancel'),
    };
    return closers[modalEl.id];
  }

  function focusableIn(el) {
    return Array.from(el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(n => !n.disabled && n.type !== 'hidden' && n.offsetParent !== null);
  }

  // Autofocus a field shortly after a dialog opens, unless the user has already clicked into one.
  function focusSoon(el) {
    setTimeout(() => {
      const active = document.activeElement;
      const typing = active && active !== el && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && el.form && el.form.contains(active);
      if (!typing && el.isConnected) el.focus();
    }, 100);
  }

  function showModal(modal) {
    if (!modal) return;
    if (!openModals.some(m => m.el === modal)) {
      openModals.push({ el: modal, opener: document.activeElement });
    }
    modal.classList.remove('hidden');
    modal.removeAttribute('aria-hidden');
    setTimeout(() => {
      if (!modal.contains(document.activeElement)) {
        const first = focusableIn(modal)[0];
        if (first) first.focus();
      }
    }, 0);
  }

  function hideModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    const idx = openModals.findIndex(m => m.el === modal);
    if (idx !== -1) {
      const { opener } = openModals.splice(idx, 1)[0];
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    }
  }

  function handleModalKeydown(e) {
    const top = openModals[openModals.length - 1];
    if (!top) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const close = closeFnFor(top.el);
      if (close) close();
    } else if (e.key === 'Tab') {
      const items = focusableIn(top.el);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!top.el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleModalBackdropClick(e) {
    const top = openModals[openModals.length - 1];
    if (top && e.target === top.el) {
      const close = closeFnFor(top.el);
      if (close) close();
    }
  }

  // In-app replacement for window.confirm / alert. Resolves 'confirm', 'extra' or 'cancel'.
  let dialogResolver = null;

  function settleDialog(result) {
    const resolve = dialogResolver;
    dialogResolver = null;
    hideModal(document.getElementById('confirm-modal'));
    if (resolve) resolve(result);
  }

  function askDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', extraLabel = null, danger = false, requireText = null }) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return Promise.resolve('cancel');
    if (dialogResolver) settleDialog('cancel');

    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    const extraBtn = document.getElementById('confirm-modal-extra');
    const inputWrap = document.getElementById('confirm-modal-input-wrap');
    const input = document.getElementById('confirm-modal-input');

    okBtn.textContent = confirmLabel;
    okBtn.className = `px-space-lg py-2.5 rounded-full font-label-md text-label-md transition-colors shadow-sm min-h-[44px] ${
      danger ? 'bg-error hover:bg-red-700 text-on-error' : 'bg-primary hover:bg-primary-container text-on-primary'
    } disabled:opacity-50 disabled:cursor-not-allowed`;
    cancelBtn.textContent = cancelLabel;
    extraBtn.textContent = extraLabel || '';
    extraBtn.classList.toggle('hidden', !extraLabel);

    input.value = '';
    inputWrap.classList.toggle('hidden', !requireText);
    document.getElementById('confirm-modal-input-label').textContent = requireText ? `Type ${requireText} to confirm` : '';
    okBtn.disabled = !!requireText;
    input.oninput = () => { okBtn.disabled = input.value.trim() !== requireText; };

    return new Promise(resolve => {
      dialogResolver = resolve;
      okBtn.onclick = () => settleDialog('confirm');
      cancelBtn.onclick = () => settleDialog('cancel');
      extraBtn.onclick = () => settleDialog('extra');
      showModal(modal);
      // Focus the safe button for destructive prompts, the input when typing is required
      setTimeout(() => (requireText ? input : danger ? cancelBtn : okBtn).focus(), 10);
    });
  }

  async function confirmDialog(options) {
    return (await askDialog(options)) === 'confirm';
  }

  function showToast(message, type = 'info', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';

    let bg = 'bg-inverse-surface text-inverse-on-surface';
    let icon = 'info';
    if (isError) {
      bg = 'bg-error text-on-error';
      icon = 'warning';
    } else if (isSuccess) {
      bg = 'bg-primary text-on-primary';
      icon = 'check_circle';
    }

    toast.className = `flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-label-md font-label-md transition-all duration-300 transform translate-y-4 opacity-0 ${bg}`;
    toast.innerHTML = `<span class="material-symbols-outlined text-lg">${icon}</span> <span>${escapeHtml(message)}</span>`;
    toast.classList.add('pointer-events-auto');
    if (options.actionLabel && typeof options.onAction === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'ml-2 px-3 py-1 min-h-[32px] rounded-full bg-white/20 hover:bg-white/30 font-bold underline-offset-2';
      actionBtn.textContent = options.actionLabel;
      actionBtn.addEventListener('click', () => {
        actionBtn.disabled = true;
        toast.remove();
        options.onAction();
      });
      toast.appendChild(actionBtn);
    }

    if (container.appendChild) {
      container.appendChild(toast);
    }

    const rAF = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
    rAF(() => {
      toast.classList?.remove?.('translate-y-4', 'opacity-0');
    });

    const visibleFor = options.duration || (isError ? 6000 : 3200);
    setTimeout(() => {
      toast.classList?.add?.('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove?.(), 300);
    }, visibleFor);
  }

  // ==========================================
  // EVENT LISTENERS & INITIALIZATION
  // ==========================================
  function initEventListeners() {
    // Buttons in the page markup (no inline handlers, so a strict Content-Security-Policy works)
    const CLICK_ACTIONS = {
      navigateTo: (arg) => navigateTo(arg),
      openBudgetModal: () => openBudgetModal(),
      openAddExpenseModal: () => openAddExpenseModal(),
      dismissBanner: () => document.getElementById('budget-warning-banner')?.classList.add('hidden'),
    };
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-click]');
      const action = el && CLICK_ACTIONS[el.getAttribute('data-click')];
      if (action) action(el.getAttribute('data-arg'));
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest && e.target.closest('[data-click][role="button"]');
      const action = el && CLICK_ACTIONS[el.getAttribute('data-click')];
      if (action) {
        e.preventDefault();
        action(el.getAttribute('data-arg'));
      }
    });

    // Row actions in rendered lists (no inline handlers: ids come from stored data)
    document.addEventListener('click', e => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const id = actionBtn.getAttribute('data-id');
      switch (actionBtn.getAttribute('data-action')) {
        case 'edit-expense': openEditExpenseModal(id); break;
        case 'delete-expense': confirmDeleteExpense(id); break;
        case 'edit-category': openEditCustomCategoryModal(id); break;
        case 'delete-category': confirmDeleteCategory(id); break;
        default: break;
      }
    });

    // Writes that were queued offline and later rejected by the server
    if (DataLayer && typeof DataLayer.onWriteError === 'function') {
      DataLayer.onWriteError(err => {
        showToast(`A change could not be synced and was undone: ${errorDetail(err)}`, 'error');
        reloadFromDataLayer();
      });
    }

    // Navigation clicks
    document.addEventListener('click', e => {
      const navLink = e.target.closest('a[data-path]');
      if (navLink) {
        e.preventDefault();
        const path = navLink.getAttribute('data-path');
        if (path === 'add-expense') {
          openAddExpenseModal();
        } else {
          navigateTo(path);
        }
      }
    });

    // Budget Sliders via delegation for static & dynamic sliders
    document.addEventListener('input', e => {
      if (e.target && e.target.matches && e.target.matches('.budget-slider')) {
        handleSliderInput(e.target);
      }
    });

    document.addEventListener('change', e => {
      if (e.target && e.target.matches && e.target.matches('.budget-slider')) {
        handleSliderChange(e.target);
      }
    });

    // Budget Setup Action Buttons
    const resetBtn = document.getElementById('reset-defaults');
    if (resetBtn) resetBtn.addEventListener('click', resetBudgetDefaults);

    const openBudgetModalBtn = document.getElementById('open-budget-modal');
    if (openBudgetModalBtn) openBudgetModalBtn.addEventListener('click', openBudgetModal);

    const closeBudgetModalBtn = document.getElementById('close-budget-modal');
    if (closeBudgetModalBtn) closeBudgetModalBtn.addEventListener('click', closeBudgetModal);

    const cancelBudgetModalBtn = document.getElementById('cancel-budget-modal');
    if (cancelBudgetModalBtn) cancelBudgetModalBtn.addEventListener('click', closeBudgetModal);

    const saveBudgetModalBtn = document.getElementById('save-budget-modal');
    if (saveBudgetModalBtn) saveBudgetModalBtn.addEventListener('click', saveBudgetModal);

    // Custom Category Action Buttons & Modal
    const addCatBtn = document.getElementById('btn-budget-add-category');
    if (addCatBtn) addCatBtn.addEventListener('click', openAddCustomCategoryModal);

    const closeCustomCatModalBtn = document.getElementById('close-custom-category-modal');
    if (closeCustomCatModalBtn) closeCustomCatModalBtn.addEventListener('click', closeCustomCategoryModal);

    const cancelCustomCatModalBtn = document.getElementById('cancel-custom-category-modal');
    if (cancelCustomCatModalBtn) cancelCustomCatModalBtn.addEventListener('click', closeCustomCategoryModal);

    const customCategoryForm = document.getElementById('custom-category-form');
    if (customCategoryForm) customCategoryForm.addEventListener('submit', handleCustomCategoryFormSubmit);

    // Custom Category Modal Icon Selector
    const iconSelector = document.getElementById('custom-icon-selector');
    if (iconSelector) {
      iconSelector.addEventListener('click', e => {
        const btn = e.target.closest('.icon-option');
        if (btn) {
          const icon = btn.getAttribute('data-icon');
          if (icon) selectCustomIcon(icon);
        }
      });
    }

    // Custom Category Modal Color Selector
    const colorSelector = document.getElementById('custom-color-selector');
    if (colorSelector) {
      colorSelector.addEventListener('click', e => {
        const btn = e.target.closest('.color-option');
        if (btn) {
          const color = btn.getAttribute('data-color');
          if (color) selectCustomColor(color);
        }
      });
    }

    // Expense Modal Buttons & Form
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) expenseForm.addEventListener('submit', handleExpenseFormSubmit);

    const closeExpenseModalBtn = document.getElementById('close-expense-modal');
    if (closeExpenseModalBtn) closeExpenseModalBtn.addEventListener('click', closeExpenseModal);

    const cancelExpenseModalBtn = document.getElementById('cancel-expense-modal');
    if (cancelExpenseModalBtn) cancelExpenseModalBtn.addEventListener('click', closeExpenseModal);

    // Month Selector Buttons in Analytics View
    const prevMonthBtn = document.getElementById('analytics-prev-month');
    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        state.analyticsMonth--;
        if (state.analyticsMonth < 0) {
          state.analyticsMonth = 11;
          state.analyticsYear--;
        }
        renderAnalytics();
      });
    }

    const nextMonthBtn = document.getElementById('analytics-next-month');
    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        const now = new Date();
        if (state.analyticsYear > now.getFullYear() ||
            (state.analyticsYear === now.getFullYear() && state.analyticsMonth >= now.getMonth())) {
          return; // no future months
        }
        state.analyticsMonth++;
        if (state.analyticsMonth > 11) {
          state.analyticsMonth = 0;
          state.analyticsYear++;
        }
        renderAnalytics();
      });
    }

    // Notification Toggles in Budget Setup
    const toggle80 = document.getElementById('toggle-80');
    if (toggle80) {
      toggle80.addEventListener('change', async () => {
        if (!state.settings) state.settings = {};
        state.settings.notify80 = toggle80.checked;
        try {
          await saveSettings();
        } catch (err) {
          showToast(`Couldn't save your setting: ${errorDetail(err)}`, 'error');
          reloadFromDataLayer();
          return;
        }
        syncAllViewsWithData();
        if (toggle80.checked) {
          const totalSpent = getTotalSpending();
          const cap = state.budget?.overallCap || 12000;
          if (cap > 0 && (totalSpent / cap) >= 0.8) {
            showToast('Budget Alert: You have used over 80% of your monthly budget!', 'warning');
          } else {
            showToast('80% budget alert activated.', 'info');
          }
        } else {
          showToast('80% budget alert deactivated.', 'info');
        }
      });
    }

    const toggleDigest = document.getElementById('toggle-digest');
    if (toggleDigest) {
      toggleDigest.addEventListener('change', async () => {
        if (!state.settings) state.settings = {};
        state.settings.weeklyDigest = toggleDigest.checked;
        try {
          await saveSettings();
        } catch (err) {
          showToast(`Couldn't save your setting: ${errorDetail(err)}`, 'error');
          reloadFromDataLayer();
          return;
        }
        showToast(toggleDigest.checked ? 'Sunday weekly digest enabled.' : 'Weekly digest disabled.');
      });
    }

    const toggleRoom = document.getElementById('toggle-roommate');
    if (toggleRoom) {
      toggleRoom.addEventListener('change', async () => {
        if (!state.settings) state.settings = {};
        state.settings.roommateAlert = toggleRoom.checked;
        try {
          await saveSettings();
        } catch (err) {
          showToast(`Couldn't save your setting: ${errorDetail(err)}`, 'error');
          reloadFromDataLayer();
          return;
        }
        showToast(toggleRoom.checked ? 'Roommate split reminder enabled.' : 'Roommate split reminder disabled.');
      });
    }

    // Settings Screen Action Buttons
    const btnClearData = document.getElementById('btn-clear-expenses');
    if (btnClearData) btnClearData.addEventListener('click', clearAllExpenses);

    const btnEditCapFromSettings = document.getElementById('btn-edit-budget-cap');
    if (btnEditCapFromSettings) btnEditCapFromSettings.addEventListener('click', openBudgetModal);

    // Logout Buttons (Profile Screen & Sidebar)
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (window.FirebaseService) {
          window.FirebaseService.signOut();
        } else {
          if (DataLayer) DataLayer.clearUserData();
          window.location.replace('login.html');
        }
      });
    }

    const btnLogoutSidebar = document.getElementById('btn-logout-sidebar');
    if (btnLogoutSidebar) {
      btnLogoutSidebar.addEventListener('click', () => {
        if (window.FirebaseService) {
          window.FirebaseService.signOut();
        } else {
          if (DataLayer) DataLayer.clearUserData();
          window.location.replace('login.html');
        }
      });
    }
  }

  // ==========================================
  // AUTH GUARD & USER PROFILE SYNC
  // ==========================================
  // An initial on the brand green, drawn locally so no name is sent to an avatar service.
  function avatarDataUri(name) {
    const initial = (String(name || 'S').trim().match(/[\p{L}\p{N}]/u) || ['S'])[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#006948"/>` +
      `<text x="32" y="43" font-size="30" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${escapeHtml(initial)}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function applyUserProfile(profile) {
    if (!profile) return;
    const headerName = document.getElementById('header-user-name');
    const headerEmail = document.getElementById('header-user-email');
    const headerAvatar = document.getElementById('header-user-avatar');
    const profileName = document.getElementById('profile-user-name');
    const profileEmail = document.getElementById('profile-user-email');
    const profileAvatar = document.getElementById('profile-user-avatar');

    const name = profile.displayName || 'Student';
    const contact = profile.email || 'Signed in via Google';
    const photo = profile.photoURL || avatarDataUri(name);

    if (headerName) headerName.textContent = name;
    if (headerEmail) headerEmail.textContent = contact;
    if (headerAvatar) headerAvatar.src = photo;

    if (profileName) profileName.textContent = name;
    if (profileEmail) profileEmail.textContent = `${contact} • Synced to your Google account`;
    if (profileAvatar) profileAvatar.src = photo;
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('auth-loading-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 300);
    }
  }

  function redirectToLogin() {
    const currentPath = window.location.pathname.toLowerCase();
    // Strictly guard against redirect loops: Never redirect if already on login screen
    if (!currentPath.endsWith('login.html') && !currentPath.endsWith('/login') && currentPath !== '/login') {
      window.location.replace('login.html');
    }
  }

  function initAuthGuardAndSyncUser() {
    if (!window.FirebaseService) {
      hideLoadingOverlay();
      return;
    }

    // Live Firebase listener - single source of truth for auth
    window.FirebaseService.onAuthStateChanged(async (user) => {
      if (!user || !user.uid) {
        redirectToLogin();
        return;
      }

      try {
        if (DataLayer && typeof DataLayer.initUser === 'function') {
          await DataLayer.initUser(user.uid);
        }
        loadState();

        // Synchronize toggle-80 input state with user's settings
        const toggle80 = document.getElementById('toggle-80');
        if (toggle80 && state.settings) {
          toggle80.checked = !!state.settings.notify80;
        }

        applyUserProfile({
          displayName: user.displayName || user.phoneNumber || 'Student',
          email: user.email || user.phoneNumber || 'Campus Living',
          photoURL: user.photoURL || '',
          phoneNumber: user.phoneNumber || ''
        });

        // Only the first sign-in event moves you to the dashboard; later events keep your place
        if (!hasShownFirstView) {
          hasShownFirstView = true;
          navigateTo('dashboard');
        }
        syncAllViewsWithData();

        // Listen for live Firestore updates across tabs/cloud (once, however many auth events fire)
        if (!dataListenerRegistered && DataLayer && typeof DataLayer.onDataChanged === 'function') {
          dataListenerRegistered = true;
          DataLayer.onDataChanged(() => {
            loadState();
            syncAllViewsWithData();
          });
        }
      } catch (err) {
        console.error('ExpenseTrack: Error initializing user data:', err);
      } finally {
        hideLoadingOverlay();
      }

      promptLegacyImport();
    });
  }

  let hasShownFirstView = false;
  let dataListenerRegistered = false;

  // Data an earlier, localStorage-only version left in this browser is never imported silently.
  async function promptLegacyImport() {
    const pending = DataLayer && DataLayer.getPendingLegacyImport && DataLayer.getPendingLegacyImport();
    if (!pending) return;
    const parts = [];
    if (pending.expenseCount) parts.push(`${pending.expenseCount} expense${pending.expenseCount === 1 ? '' : 's'}`);
    if (pending.hasBudget) parts.push('a budget');
    if (pending.customCategoryCount) parts.push(`${pending.customCategoryCount} custom categor${pending.customCategoryCount === 1 ? 'y' : 'ies'}`);
    const choice = await askDialog({
      title: 'Import data saved in this browser?',
      message: `An earlier version of ExpenseTrack saved ${parts.join(', ')} in this browser. Import it into this account? Only do this if the data is yours.`,
      confirmLabel: 'Import it',
      cancelLabel: 'Ask me later',
      extraLabel: 'Delete it',
    });
    try {
      if (choice === 'confirm') {
        const { imported } = await DataLayer.importLegacyData();
        reloadFromDataLayer();
        showToast(`Imported ${imported} expense${imported === 1 ? '' : 's'} into your account.`, 'success');
      } else if (choice === 'extra') {
        await DataLayer.discardLegacyData();
        showToast('The old data in this browser was deleted.', 'info');
      }
    } catch (err) {
      showToast(`Couldn't finish that: ${errorDetail(err)}`, 'error');
    }
  }

  function updateOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    banner.classList.toggle('hidden', !offline);
  }

  // Expose API for inline onclick handlers and testing
  window.ExpenseTrackApp = {
    navigateTo,
    syncAllViewsWithData,
    openAddExpenseModal,
    openEditExpenseModal,
    openExpenseModal: openAddExpenseModal,
    closeExpenseModal,
    addExpense,
    deleteExpense,
    confirmDeleteExpense,
    openBudgetModal,
    closeBudgetModal,
    saveBudgetModal,
    resetBudgetDefaults,
    clearAllExpenses,
    // Custom Categories API
    openAddCustomCategoryModal,
    openEditCustomCategoryModal,
    closeCustomCategoryModal,
    confirmDeleteCategory,
    handleSliderInput,
    handleSliderChange,
    handleCustomCategoryFormSubmit,
    selectCategoryChip,
    // Data queries
    getExpenses: () => [...state.expenses],
    getCurrentMonthExpenses: () => getCurrentMonthExpenses(),
    getMonthExpenses: (y, m) => getMonthExpenses(y, m),
    getTotalSpending: (list) => getTotalSpending(list),
    getCategorySpending: (cat, list) => {
      const m = getCategorySpendingMap(list);
      return m[normalizeCategoryKey(cat)] || 0;
    },
    getActiveCategories: () => getCategories(),
    getAllCategories: (archived = false) => getAllCategories(archived),
    getState: () => state,
    // Testing aid: the data layer's active change listeners
    getDataListenerCount: () => (DataLayer && DataLayer.getDataListenerCount ? DataLayer.getDataListenerCount() : 0),
  };

  // Bootstrap Application (Never load data before auth resolves)
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    hideExpenseFormError();
    updateOfflineBanner();
    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
    document.addEventListener('keydown', handleModalKeydown);
    document.addEventListener('mousedown', handleModalBackdropClick);
    initAuthGuardAndSyncUser();
  });
})();
