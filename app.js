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

  function saveBudget() {
    if (!DataLayer) return;
    DataLayer.saveBudget(state.budget);
  }

  function saveSettings() {
    if (!DataLayer) return;
    DataLayer.saveSettings(state.settings);
  }

  // --- Formatting & Local Date Helpers ---
  function formatINR(val) {
    const num = Math.round(Number(val) || 0);
    return num.toLocaleString('en-IN');
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
      const cat = normalizeCategoryKey(exp.category);
      if (map[cat] !== undefined) {
        map[cat] += Number(exp.amount) || 0;
      } else {
        map[cat] = (map[cat] || 0) + (Number(exp.amount) || 0);
      }
    });
    return map;
  }

  function getTotalSpending(expensesList = null) {
    const expenses = expensesList !== null ? expensesList : getCurrentMonthExpenses();
    return expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }

  function getTotalAllocatedBudget() {
    if (!state.budget || !state.budget.categories) return 0;
    return Object.values(state.budget.categories).reduce((sum, val) => sum + (Number(val) || 0), 0);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    let topKey = 'food';
    let maxVal = -1;
    Object.keys(allCats).forEach(key => {
      const val = spendingMap[key] || 0;
      if (val > maxVal) {
        maxVal = val;
        topKey = key;
      }
    });
    const catObj = allCats[topKey] || { name: 'Food & Dining', icon: 'restaurant', color: '#f59e0b' };
    return { ...catObj, amount: maxVal > 0 ? maxVal : 0 };
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
  function syncAllViewsWithData() {
    updateSidebarWidget();
    updateAcademicTermDisplay();
    renderDashboard();
    renderBudgetSetup();
    renderAnalytics();
    renderProfile();
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
        dashProgressSubtitle.innerHTML = `<span class="text-on-surface-variant">Tap <button class="text-primary font-bold underline" onclick="window.ExpenseTrackApp.openBudgetModal()">Set Budget</button> to configure your semester ceiling.</span>`;
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
      if (state.expenses.length === 0) {
        dashInsight.textContent = 'Log your first college expense to begin tracking your daily spending rhythm.';
      } else {
        const spendingMap = getCategorySpendingMap();
        const topCat = getTopSpendingCategory(spendingMap);
        const dayOfMonth = Math.max(1, new Date().getDate());
        const dailyAvg = Math.round(totalSpent / dayOfMonth);
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
            <div class="w-10 h-10 rounded-xl ${cat.iconBgClass || 'bg-surface-container text-primary'} flex items-center justify-center">
              <span class="material-symbols-outlined text-xl">${escapeHtml(cat.icon || 'category')}</span>
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
      const cat = allCats[exp.category] || allCats[normKey] || { name: exp.category, icon: 'receipt_long', iconBgClass: 'bg-surface-container text-primary', color: '#006948' };
      html += `
        <div class="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-slate-100 flex items-center justify-between gap-space-sm hover:border-surface-container-high transition-colors group">
          <div class="flex items-center gap-space-md min-w-0">
            <div class="w-10 h-10 rounded-xl ${cat.iconBgClass} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-xl">${cat.icon}</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-title-md text-title-md text-on-surface font-bold truncate">${escapeHtml(exp.note || cat.name)}</span>
              <div class="flex items-center gap-2 mt-0.5 text-on-surface-variant font-body-sm text-body-sm">
                <span class="truncate">${cat.name}</span>
                <span>•</span>
                <span>${formatDateDisplay(exp.date)}</span>
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
                onclick="window.ExpenseTrackApp.openEditExpenseModal('${exp.id}')"
                class="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-surface-container hover:text-primary text-on-surface-variant flex items-center justify-center transition-colors"
                title="Edit Expense"
                aria-label="Edit Expense"
              >
                <span class="material-symbols-outlined text-base">edit</span>
              </button>
              <button 
                type="button"
                onclick="window.ExpenseTrackApp.confirmDeleteExpense('${exp.id}')"
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
    const overallCap = state.budget?.overallCap || 12000;
    const spendingMap = getCategorySpendingMap();
    const categoryCaps = state.budget?.categories || {};
    const activeCategories = getCategories();

    // Use BudgetCalculator to get pure allocation metrics
    const alloc = BudgetCalculator
      ? BudgetCalculator.computeAllocation(overallCap, categoryCaps)
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

      // Update Slider value and displays
      const slider = document.querySelector(`.budget-slider[data-category="${catKey}"]`);
      if (slider) slider.value = cap;

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
      const customCats = Object.values(activeCategories).filter(c => c.isCustom);
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
            <div id="cat-card-${catKey}" class="bg-surface-container-lowest rounded-3xl p-space-lg shadow-sm flex flex-col gap-space-md hover:shadow-md transition-shadow duration-200">
              <div class="flex items-start justify-between gap-space-sm">
                <div class="flex items-center gap-space-md min-w-0">
                  <div class="w-12 h-12 rounded-2xl ${cat.iconBgClass || 'bg-surface-container text-primary'} flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-2xl">${escapeHtml(cat.icon || 'category')}</span>
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
                    onclick="window.ExpenseTrackApp.openEditCustomCategoryModal('${catKey}')"
                    class="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-surface-container hover:text-primary text-on-surface-variant flex items-center justify-center transition-colors"
                    title="Edit Category"
                    aria-label="Edit Category"
                  >
                    <span class="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button 
                    type="button"
                    onclick="window.ExpenseTrackApp.confirmDeleteCategory('${catKey}')"
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
                  <span class="font-headline-sm text-headline-sm text-on-surface font-bold">₹<span class="spent-val-${catKey}">${formatINR(spent)}</span></span>
                  <span class="font-body-sm text-body-sm text-on-surface-variant">of ₹<span id="cap-${catKey}">${formatINR(cap)}</span> cap</span>
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
                <label class="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">tune</span> Adjust Cap Target:
                </label>
                <div class="flex items-center gap-space-md flex-1 max-w-sm">
                  <span class="font-body-sm text-body-sm text-on-surface-variant">₹${formatINR(cat.minCap || 200)}</span>
                  <input class="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary budget-slider" data-category="${catKey}" max="${cat.maxCap || 10000}" min="${cat.minCap || 200}" step="${cat.step || 100}" type="range" value="${cap}"/>
                  <span class="font-title-md text-title-md text-on-surface font-semibold w-20 text-right">₹<span id="slider-display-${catKey}">${formatINR(cap)}</span></span>
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
    if (emergDesc) emergDesc.textContent = `₹${formatINR(emergSpent)} saved on this device`;
    if (emergGoalPct) emergGoalPct.textContent = `${emergPct}% of Semester Target`;

    // Dynamic budget insight
    const budgetInsight = document.getElementById('budget-spending-insight');
    if (budgetInsight) {
      if (state.expenses.length === 0) {
        budgetInsight.textContent = 'No expenses logged yet. Category gauges will track your real spending live as you log transactions.';
      } else {
        const topCat = getTopSpendingCategory(spendingMap);
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
      ? BudgetCalculator.computeAllocation(overallCap, state.budget.categories)
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

  function handleSliderChange(slider) {
    const cat = slider.dataset.category;
    const val = parseInt(slider.value, 10);
    if (!state.budget.categories) state.budget.categories = {};
    state.budget.categories[cat] = val;
    saveBudget();
    syncAllViewsWithData();
  }

  // ==========================================
  // VIEW 3: ANALYTICS (Chart.js Integration)
  // ==========================================
  function renderAnalytics() {
    const selectedYear = state.analyticsYear !== undefined ? state.analyticsYear : new Date().getFullYear();
    const selectedMonth = state.analyticsMonth !== undefined ? state.analyticsMonth : new Date().getMonth();
    const monthExpenses = getMonthExpenses(selectedYear, selectedMonth);

    const spendingMap = getCategorySpendingMap(monthExpenses);
    const totalSpent = getTotalSpending(monthExpenses);
    const overallCap = state.budget?.overallCap || 0;
    const categoryCaps = state.budget?.categories || {};

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
      const topCat = allCats[topCatKey] || { name: 'Food & Dining' };
      topCategoryElem.textContent = `${topCat.name} (₹${formatINR(maxVal)})`;
    }

    // Daily Average for the selected month
    if (dailyAvgElem) {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const avg = Math.round(totalSpent / daysInMonth);
      dailyAvgElem.textContent = `₹${formatINR(avg)} / day`;
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
        const cat = allCats[catKey] || { name: catKey, icon: 'category', iconBgClass: 'bg-surface-container text-primary', defaultCap: 1000 };
        const spent = spendingMap[catKey] || 0;
        const cap = categoryCaps[catKey] !== undefined ? categoryCaps[catKey] : (cat.defaultCap || 1000);
        const sharePct = totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0;
        const budgetPct = cap > 0 ? Math.round((spent / cap) * 100) : 0;

        rowsHtml += `
          <div class="flex items-center justify-between p-space-sm rounded-xl hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-space-sm">
              <div class="w-8 h-8 rounded-lg ${cat.iconBgClass || 'bg-surface-container text-primary'} flex items-center justify-center">
                <span class="material-symbols-outlined text-lg">${escapeHtml(cat.icon || 'category')}</span>
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

    const catLabels = catKeys.map(k => (allCats[k]?.name || k));
    const catData = catKeys.map(k => spendingMap[k] || 0);
    const catColors = catKeys.map(k => allCats[k]?.color || '#006948');

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
      // Group expenses into 4 weeks of the selected month
      const weekBuckets = [0, 0, 0, 0];
      monthExpenses.forEach(exp => {
        if (!exp.date) return;
        const day = parseLocalDate(exp.date).getDate() || 1;
        if (day <= 7) weekBuckets[0] += Number(exp.amount) || 0;
        else if (day <= 14) weekBuckets[1] += Number(exp.amount) || 0;
        else if (day <= 21) weekBuckets[2] += Number(exp.amount) || 0;
        else weekBuckets[3] += Number(exp.amount) || 0;
      });

      if (state.charts.monthlyBar) {
        state.charts.monthlyBar.data.datasets[0].data = weekBuckets;
        state.charts.monthlyBar.update();
      } else {
        state.charts.monthlyBar = new Chart(barCtx, {
          type: 'bar',
          data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
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
        <button type="button" data-category="${escapeHtml(cat.id)}" class="${baseClass}">
          <span class="material-symbols-outlined text-xl ${iconClass} flex-shrink-0">${escapeHtml(cat.icon || 'category')}</span>
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

    // Default to today's date YYYY-MM-DD (local time)
    if (dateInput) {
      dateInput.value = localDateString();
    }

    renderQuickLogCategoryChips('food');
    selectCategoryChip('food');

    if (modal) modal.classList.remove('hidden');
    if (amountInput) setTimeout(() => amountInput.focus(), 100);
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
    if (dateInput) dateInput.value = exp.date || '';

    renderQuickLogCategoryChips(exp.category);
    selectCategoryChip(exp.category);

    if (modal) modal.classList.remove('hidden');
    if (amountInput) setTimeout(() => amountInput.focus(), 100);
  }

  function closeExpenseModal() {
    const modal = document.getElementById('expense-modal');
    if (modal) modal.classList.add('hidden');
    hideExpenseFormError();
    state.editingExpenseId = null;
  }

  function handleExpenseFormSubmit(e) {
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
    if (isNaN(amountVal) || amountVal <= 0) {
      errors.push('Please enter an amount greater than ₹0.');
    }
    if (!catVal || !allCats[normCat]) {
      errors.push('Please select a valid expense category.');
    }
    if (!dateVal) {
      errors.push('Please select a transaction date.');
    }

    if (errors.length > 0) {
      showExpenseFormError(errors.join(' '));
      return;
    }

    hideExpenseFormError();

    const categoryName = allCats[normCat]?.name || normCat;

    if (state.editingExpenseId) {
      // Update existing
      if (DataLayer) {
        DataLayer.updateExpense(state.editingExpenseId, {
          amount: Math.round(amountVal),
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
            amount: Math.round(amountVal),
            category: normCat,
            date: dateVal,
            note: noteVal || categoryName,
          };
          saveExpenses();
        }
      }
      showToast('Expense updated successfully!', 'success');
    } else {
      // Create new
      if (DataLayer) {
        DataLayer.addExpense({
          amount: Math.round(amountVal),
          category: normCat,
          date: dateVal,
          note: noteVal || categoryName,
        });
        state.expenses = DataLayer.getExpenses();
      } else {
        const newExp = {
          id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          amount: Math.round(amountVal),
          category: normCat,
          date: dateVal,
          note: noteVal || categoryName,
          createdAt: Date.now(),
        };
        state.expenses.unshift(newExp);
        saveExpenses();
      }
      showToast('Expense logged successfully!', 'success');
    }

    closeExpenseModal();
    syncAllViewsWithData();
  }

  function addExpense({ amount, category, date, note } = {}) {
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
      newExp = DataLayer.addExpense({
        amount: Math.round(amountVal),
        category: normCat,
        date: date || today,
        note: (note && String(note).trim()) || categoryName,
      });
      state.expenses = DataLayer.getExpenses();
    } else {
      newExp = {
        id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        amount: Math.round(amountVal),
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

  function deleteExpense(id) {
    if (DataLayer) {
      DataLayer.deleteExpense(id);
      state.expenses = DataLayer.getExpenses();
    } else {
      state.expenses = state.expenses.filter(e => e.id !== id);
      saveExpenses();
    }
    syncAllViewsWithData();
  }

  function confirmDeleteExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    const allCats = getAllCategories(true);
    const cat = allCats[normalizeCategoryKey(exp.category)]?.name || 'Expense';
    const msg = `Delete transaction: "${exp.note || cat}" for ₹${formatINR(exp.amount)}?`;
    if (window.confirm(msg)) {
      deleteExpense(id);
      showToast('Expense deleted.', 'info');
    }
  }

  // ==========================================
  // BUDGET MODAL & CEILING EDITING
  // ==========================================
  function openBudgetModal() {
    const modal = document.getElementById('budget-modal');
    const input = document.getElementById('overall-cap-input');
    if (input) {
      input.value = state.budget?.overallCap || 12000;
    }
    if (modal) modal.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 100);
  }

  function closeBudgetModal() {
    const modal = document.getElementById('budget-modal');
    if (modal) modal.classList.add('hidden');
  }

  function saveBudgetModal() {
    const input = document.getElementById('overall-cap-input');
    const val = parseInt(input.value, 10);

    if (isNaN(val) || val < 0) {
      alert('Please enter a valid monthly budget amount (positive number).');
      return;
    }

    state.budget.overallCap = val;
    saveBudget();
    closeBudgetModal();
    showToast(`Monthly budget ceiling updated to ₹${formatINR(val)}!`, 'success');
    syncAllViewsWithData();
  }

  function resetBudgetDefaults() {
    if (window.confirm('Reset all category caps and monthly ceiling to default semester targets?')) {
      const defBudget = DataLayer ? DataLayer.resetBudgetDefaults() : {
        overallCap: 12000,
        categories: { food: 3500, groceries: 2000, transport: 1000, textbooks: 1200, entertainment: 1500, personal: 600, emergency: 1200 }
      };
      state.budget = defBudget;
      saveBudget();
      showToast('Budget caps reset to defaults.', 'info');
      syncAllViewsWithData();
    }
  }

  function clearAllExpenses() {
    if (window.confirm('Are you sure you want to delete ALL logged expenses? This will reset the app to an empty state.')) {
      state.expenses = [];
      if (DataLayer) DataLayer.clearAllExpenses();
      saveExpenses();
      showToast('All expenses cleared. Empty state activated.', 'info');
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

    if (modal) modal.classList.remove('hidden');
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
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

    if (modal) modal.classList.remove('hidden');
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
  }

  function closeCustomCategoryModal() {
    const modal = document.getElementById('custom-category-modal');
    if (modal) modal.classList.add('hidden');
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
      if (ic === iconName) {
        btn.className = 'icon-option p-2 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center ring-2 ring-primary';
      } else {
        btn.className = 'icon-option p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center';
      }
    });
  }

  function selectCustomColor(hexColor) {
    const colorInput = document.getElementById('custom-category-color');
    if (colorInput) colorInput.value = hexColor;

    const buttons = document.querySelectorAll('#custom-color-selector .color-option');
    buttons.forEach(btn => {
      const col = btn.getAttribute('data-color');
      if (col === hexColor) {
        btn.className = 'color-option w-7 h-7 rounded-full ring-2 ring-offset-2 ring-primary transition-all';
      } else {
        btn.className = 'color-option w-7 h-7 rounded-full transition-all';
      }
    });
  }

  function handleCustomCategoryFormSubmit(e) {
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

    const validation = DataLayer.validateCategoryInput({ name, defaultCap: cap, icon, color }, !!id, id);
    if (!validation.valid) {
      showCustomCategoryError(validation.errors.join(' '));
      return;
    }

    try {
      if (id) {
        // Edit existing category
        const updated = DataLayer.updateCustomCategory(id, { name, defaultCap: cap, icon, color });
        if (!state.budget.categories) state.budget.categories = {};
        state.budget.categories[id] = cap;
        saveBudget();
        showToast(`Category "${updated.name}" updated!`, 'success');
      } else {
        // Add new custom category
        const created = DataLayer.addCustomCategory({ name, defaultCap: cap, icon, color });
        if (!state.budget.categories) state.budget.categories = {};
        state.budget.categories[created.id] = cap;
        saveBudget();
        showToast(`Category "${created.name}" created!`, 'success');
      }

      closeCustomCategoryModal();
      syncAllViewsWithData();

      // If Quick Log modal is open, re-render its chips
      const expenseModal = document.getElementById('expense-modal');
      if (expenseModal && !expenseModal.classList.contains('hidden')) {
        renderQuickLogCategoryChips(id || undefined);
      }
    } catch (err) {
      showCustomCategoryError(err.message || 'Failed to save category');
    }
  }

  function confirmDeleteCategory(catId) {
    if (!catId || !DataLayer) return;
    const allCats = getAllCategories(true);
    const cat = allCats[catId];
    if (!cat) return;

    if (cat.isDefault) {
      alert('Default categories cannot be deleted.');
      return;
    }

    const expenses = DataLayer.getExpenses();
    const hasExpenses = expenses.some(e => normalizeCategoryKey(e.category) === catId);

    if (hasExpenses) {
      const proceed = window.confirm(
        `"${cat.name}" has active expenses recorded.\n\nArchiving will hide it from future logging but keep all historical transaction data intact. Proceed?`
      );
      if (!proceed) return;
    } else {
      const proceed = window.confirm(`Permanently delete custom category "${cat.name}"?`);
      if (!proceed) return;
    }

    const result = DataLayer.deleteCategory(catId);
    if (result.action === 'archived') {
      showToast(`Category "${cat.name}" archived.`, 'info');
    } else {
      if (state.budget?.categories?.[catId] !== undefined) {
        delete state.budget.categories[catId];
        saveBudget();
      }
      showToast(`Category "${cat.name}" deleted.`, 'info');
    }

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
  function showToast(message, type = 'info') {
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

    if (container.appendChild) {
      container.appendChild(toast);
    }

    const rAF = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
    rAF(() => {
      toast.classList?.remove?.('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList?.add?.('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove?.(), 300);
    }, 3200);
  }

  // ==========================================
  // EVENT LISTENERS & INITIALIZATION
  // ==========================================
  function initEventListeners() {
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
      toggle80.addEventListener('change', () => {
        if (!state.settings) state.settings = {};
        state.settings.notify80 = toggle80.checked;
        saveSettings();
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
      toggleDigest.addEventListener('change', () => {
        if (!state.settings) state.settings = {};
        state.settings.weeklyDigest = toggleDigest.checked;
        saveSettings();
        showToast(toggleDigest.checked ? 'Sunday weekly digest enabled.' : 'Weekly digest disabled.');
      });
    }

    const toggleRoom = document.getElementById('toggle-roommate');
    if (toggleRoom) {
      toggleRoom.addEventListener('change', () => {
        if (!state.settings) state.settings = {};
        state.settings.roommateAlert = toggleRoom.checked;
        saveSettings();
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
    const photo = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=006948&color=ffffff&bold=true`;

    if (headerName) headerName.textContent = name;
    if (headerEmail) headerEmail.textContent = contact;
    if (headerAvatar) headerAvatar.src = photo;

    if (profileName) profileName.textContent = name;
    if (profileEmail) profileEmail.textContent = `${contact} • Saved on this device`;
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

        navigateTo('dashboard');
        syncAllViewsWithData();

        // Listen for live Firestore updates across tabs/cloud
        if (DataLayer && typeof DataLayer.onDataChanged === 'function') {
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
    });
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
  };

  // Bootstrap Application (Never load data before auth resolves)
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    hideExpenseFormError();
    initAuthGuardAndSyncUser();
  });
})();
