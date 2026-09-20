/**
 * ExpenseTrack - Student Finance App
 * Core Application Logic & State Management
 */

(function () {
  'use strict';

  // --- Constants & Category Definitions ---
  // Strictly using the 6 categories from the Stitch design
  const CATEGORIES = {
    food: {
      id: 'food',
      name: 'Food & Dining',
      icon: 'restaurant',
      color: '#f59e0b',
      iconBgClass: 'bg-tertiary-fixed text-on-tertiary-fixed',
      badgeBgClass: 'bg-tertiary-fixed-dim text-on-tertiary-fixed',
      desc: 'Off-campus meals, takeout, morning coffees',
      defaultCap: 4000,
      minCap: 2000,
      maxCap: 6000,
      step: 100,
    },
    groceries: {
      id: 'groceries',
      name: 'Groceries',
      icon: 'local_mall',
      color: '#006948',
      iconBgClass: 'bg-surface-container text-primary',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: "Trader Joe's runs, pantry staples, dorm snacks",
      defaultCap: 2200,
      minCap: 1000,
      maxCap: 4000,
      step: 100,
    },
    textbooks: {
      id: 'textbooks',
      name: 'Textbooks & Coursework',
      icon: 'menu_book',
      color: '#ba1a1a',
      iconBgClass: 'bg-error-container text-error',
      badgeBgClass: 'bg-error-container text-on-error-container',
      desc: 'Lab manual rentals, Chegg, printing balance',
      defaultCap: 1200,
      minCap: 500,
      maxCap: 3000,
      step: 50,
    },
    entertainment: {
      id: 'entertainment',
      name: 'Entertainment & Social',
      icon: 'celebration',
      color: '#565e74',
      iconBgClass: 'bg-secondary-container text-on-secondary-container',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'Game tickets, weekend movies, campus concerts',
      defaultCap: 1800,
      minCap: 500,
      maxCap: 3000,
      step: 50,
    },
    personal: {
      id: 'personal',
      name: 'Personal & Subscriptions',
      icon: 'subscriptions',
      color: '#00855d',
      iconBgClass: 'bg-surface-container text-primary',
      badgeBgClass: 'bg-primary-fixed text-on-primary-fixed',
      desc: 'Spotify Student, iCloud, haircut, laundry card',
      defaultCap: 600,
      minCap: 200,
      maxCap: 1500,
      step: 50,
    },
    emergency: {
      id: 'emergency',
      name: 'Emergency Student Fund',
      icon: 'lock',
      color: '#006948',
      iconBgClass: 'bg-primary text-on-primary',
      badgeBgClass: 'bg-primary-container text-on-primary-container',
      desc: 'Automated cushion for flight changes, tech repairs, urgent needs',
      defaultCap: 1200,
      minCap: 500,
      maxCap: 5000,
      step: 100,
      isAutoSave: true,
    },
  };

  const STORAGE_KEYS = {
    EXPENSES: 'expensetrack_expenses',
    BUDGET: 'expensetrack_budget',
    SETTINGS: 'expensetrack_settings',
  };

  // --- Initial Seed Data matching Stitch Demo numbers exactly ---
  const INITIAL_DEMO_EXPENSES = [
    {
      id: 'exp-1',
      amount: 1800,
      category: 'food',
      date: '2025-10-14',
      note: 'Off-campus dining & group dinner',
      createdAt: 1728900000000,
    },
    {
      id: 'exp-2',
      amount: 950,
      category: 'food',
      date: '2025-10-11',
      note: 'Starbucks morning coffees & study fuel',
      createdAt: 1728640800000,
    },
    {
      id: 'exp-3',
      amount: 750,
      category: 'food',
      date: '2025-10-07',
      note: 'Late night library takeout',
      createdAt: 1728295200000,
    },
    {
      id: 'exp-4',
      amount: 1100,
      category: 'groceries',
      date: '2025-10-12',
      note: "Trader Joe's pantry restock",
      createdAt: 1728727200000,
    },
    {
      id: 'exp-5',
      amount: 500,
      category: 'groceries',
      date: '2025-10-05',
      note: 'Dorm snacks & fruit',
      createdAt: 1728122400000,
    },
    {
      id: 'exp-6',
      amount: 900,
      category: 'textbooks',
      date: '2025-10-02',
      note: 'Chegg semester textbook rental',
      createdAt: 1727863200000,
    },
    {
      id: 'exp-7',
      amount: 500,
      category: 'textbooks',
      date: '2025-10-08',
      note: 'Lab manual & campus printing quota',
      createdAt: 1728381600000,
    },
    {
      id: 'exp-8',
      amount: 500,
      category: 'entertainment',
      date: '2025-10-10',
      note: 'Campus homecoming game tickets',
      createdAt: 1728554400000,
    },
    {
      id: 'exp-9',
      amount: 300,
      category: 'entertainment',
      date: '2025-10-04',
      note: 'Weekend movie with roommates',
      createdAt: 1728036000000,
    },
    {
      id: 'exp-10',
      amount: 200,
      category: 'personal',
      date: '2025-10-01',
      note: 'Spotify Student & Apple iCloud plan',
      createdAt: 1727776800000,
    },
    {
      id: 'exp-11',
      amount: 250,
      category: 'personal',
      date: '2025-10-06',
      note: 'Laundry card reload & haircut',
      createdAt: 1728208800000,
    },
    {
      id: 'exp-12',
      amount: 1200,
      category: 'emergency',
      date: '2025-10-01',
      note: 'Campus payroll auto-save cushion',
      createdAt: 1727776800001,
    },
  ];

  const INITIAL_DEMO_BUDGET = {
    overallCap: 12000,
    categories: {
      food: 4000,
      groceries: 2200,
      textbooks: 1200,
      entertainment: 1800,
      personal: 600,
      emergency: 1200,
    },
  };

  const INITIAL_SETTINGS = {
    notify80: true,
    weeklyDigest: true,
    roommateAlert: false,
  };

  // --- State Object ---
  const state = {
    currentView: 'dashboard',
    expenses: [],
    budget: null,
    settings: null,
    editingExpenseId: null,
    charts: {
      categoryDonut: null,
      monthlyBar: null,
    },
  };

  // --- Storage Functions ---
  function loadState() {
    try {
      const storedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      const storedBudget = localStorage.getItem(STORAGE_KEYS.BUDGET);
      const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);

      state.expenses = storedExpenses ? JSON.parse(storedExpenses) : [...INITIAL_DEMO_EXPENSES];
      state.budget = storedBudget ? JSON.parse(storedBudget) : { ...INITIAL_DEMO_BUDGET, categories: { ...INITIAL_DEMO_BUDGET.categories } };
      state.settings = storedSettings ? JSON.parse(storedSettings) : { ...INITIAL_SETTINGS };

      // Ensure storage is seeded if first visit
      if (!storedExpenses) saveExpenses();
      if (!storedBudget) saveBudget();
      if (!storedSettings) saveSettings();
    } catch (err) {
      console.error('Error loading state from localStorage:', err);
      state.expenses = [...INITIAL_DEMO_EXPENSES];
      state.budget = { ...INITIAL_DEMO_BUDGET, categories: { ...INITIAL_DEMO_BUDGET.categories } };
      state.settings = { ...INITIAL_SETTINGS };
    }
  }

  function saveExpenses() {
    try {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(state.expenses));
    } catch (err) {
      console.error('Failed to save expenses to localStorage:', err);
    }
  }

  function saveBudget() {
    try {
      localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(state.budget));
    } catch (err) {
      console.error('Failed to save budget to localStorage:', err);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
    } catch (err) {
      console.error('Failed to save settings to localStorage:', err);
    }
  }

  // --- Formatting Helpers ---
  function formatINR(val) {
    const num = Math.round(Number(val) || 0);
    return num.toLocaleString('en-IN');
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  // --- Calculations ---
  function getCategorySpendingMap() {
    const map = {
      food: 0,
      groceries: 0,
      textbooks: 0,
      entertainment: 0,
      personal: 0,
      emergency: 0,
    };
    state.expenses.forEach(exp => {
      const cat = exp.category;
      if (map[cat] !== undefined) {
        map[cat] += Number(exp.amount) || 0;
      }
    });
    return map;
  }

  function getTotalSpending() {
    return state.expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
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
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCurrentView() {
    updateSidebarWidget();
    if (state.currentView === 'dashboard') {
      renderDashboard();
    } else if (state.currentView === 'budget-setup') {
      renderBudgetSetup();
    } else if (state.currentView === 'analytics') {
      renderAnalytics();
    } else if (state.currentView === 'profile-&-settings') {
      renderProfile();
    }
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
  }

  function renderDashboardCategoryChips() {
    const container = document.getElementById('dash-category-cards');
    if (!container) return;

    const spendingMap = getCategorySpendingMap();
    const caps = state.budget?.categories || {};

    let html = '';
    Object.keys(CATEGORIES).forEach(catKey => {
      const cat = CATEGORIES[catKey];
      const spent = spendingMap[catKey] || 0;
      const cap = caps[catKey] || cat.defaultCap;
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
            <div class="w-10 h-10 rounded-xl ${cat.iconBgClass} flex items-center justify-center">
              <span class="material-symbols-outlined text-xl">${cat.icon}</span>
            </div>
            <span class="px-2 py-0.5 rounded-full ${badgeColor} text-label-sm font-label-sm flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">${badgeIcon}</span>
              ${badgeLabel}
            </span>
          </div>
          <div>
            <div class="font-label-md text-label-md text-on-surface font-bold truncate">${cat.name}</div>
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

    if (countBadge) {
      countBadge.textContent = `${state.expenses.length} Total`;
    }

    if (!state.expenses || state.expenses.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Sort descending by date / createdAt
    const sorted = [...state.expenses].sort((a, b) => {
      const dateA = new Date(a.date).getTime() || a.createdAt || 0;
      const dateB = new Date(b.date).getTime() || b.createdAt || 0;
      return dateB - dateA;
    });

    let html = '';
    sorted.forEach(exp => {
      const cat = CATEGORIES[exp.category] || CATEGORIES.personal;
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

    // Macro figures
    const totalAllocatedElem = document.getElementById('total-allocated-val');
    const bufferElem = document.getElementById('buffer-val');
    const barAllocated = document.getElementById('bar-allocated');
    const barBuffer = document.getElementById('bar-buffer');
    const macroCapDisplay = document.getElementById('macro-cap-display');
    const macroAllocatedLabel = document.getElementById('macro-allocated-label');
    const macroBufferLabel = document.getElementById('macro-buffer-label');

    let sumAllocated = 0;
    Object.keys(CATEGORIES).forEach(catKey => {
      const cap = categoryCaps[catKey] !== undefined ? categoryCaps[catKey] : CATEGORIES[catKey].defaultCap;
      sumAllocated += cap;

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

    const buffer = overallCap - sumAllocated;
    if (totalAllocatedElem) totalAllocatedElem.textContent = formatINR(sumAllocated);
    if (bufferElem) bufferElem.textContent = formatINR(Math.abs(buffer));
    if (macroCapDisplay) macroCapDisplay.textContent = `₹${formatINR(overallCap)} / mo`;

    const allocatedPercent = overallCap > 0 ? Math.min(100, Math.max(0, (sumAllocated / overallCap) * 100)) : 100;
    const bufferPercent = Math.max(0, 100 - allocatedPercent);

    if (barAllocated) barAllocated.style.width = `${allocatedPercent}%`;
    if (barBuffer) barBuffer.style.width = `${bufferPercent}%`;

    if (macroAllocatedLabel) {
      macroAllocatedLabel.textContent = `${allocatedPercent.toFixed(1)}% assigned to categories`;
    }

    if (buffer < 0) {
      if (bufferElem && bufferElem.parentElement) {
        bufferElem.parentElement.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container text-on-error-container font-title-md text-title-md font-bold mt-1';
        bufferElem.nextSibling.nodeValue = ' over cap!';
      }
      if (macroBufferLabel) {
        macroBufferLabel.className = 'text-error font-bold';
        macroBufferLabel.textContent = `Deficit (-₹${formatINR(Math.abs(buffer))})`;
      }
    } else {
      if (bufferElem && bufferElem.parentElement) {
        bufferElem.parentElement.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-title-md text-title-md font-bold mt-1';
        bufferElem.nextSibling.nodeValue = ' left';
      }
      if (macroBufferLabel) {
        macroBufferLabel.className = 'text-primary font-bold';
        macroBufferLabel.textContent = `Safe Cushion (±${bufferPercent.toFixed(1)}%)`;
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

  function handleSliderChange(slider) {
    const cat = slider.dataset.category;
    const val = parseInt(slider.value, 10);
    if (!state.budget.categories) state.budget.categories = {};
    state.budget.categories[cat] = val;
    saveBudget();
    renderBudgetSetup();
    updateSidebarWidget();
  }

  // ==========================================
  // VIEW 3: ANALYTICS (Chart.js Integration)
  // ==========================================
  function renderAnalytics() {
    const spendingMap = getCategorySpendingMap();
    const totalSpent = getTotalSpending();
    const overallCap = state.budget?.overallCap || 0;
    const categoryCaps = state.budget?.categories || {};

    const emptyElem = document.getElementById('analytics-empty-state');
    const contentElem = document.getElementById('analytics-content');

    if (totalSpent === 0) {
      if (emptyElem) emptyElem.classList.remove('hidden');
      if (contentElem) contentElem.classList.add('hidden');
      return;
    }

    if (emptyElem) emptyElem.classList.add('hidden');
    if (contentElem) contentElem.classList.remove('hidden');

    // Key Stat Metrics
    const totalSpentElem = document.getElementById('analytics-total-spent');
    const topCategoryElem = document.getElementById('analytics-top-category');
    const dailyAvgElem = document.getElementById('analytics-daily-avg');

    if (totalSpentElem) totalSpentElem.textContent = `₹${formatINR(totalSpent)}`;

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
      const topCat = CATEGORIES[topCatKey] || CATEGORIES.food;
      topCategoryElem.textContent = `${topCat.name} (₹${formatINR(maxVal)})`;
    }

    // Daily Average (approx 30 days)
    if (dailyAvgElem) {
      const avg = Math.round(totalSpent / 30);
      dailyAvgElem.textContent = `₹${formatINR(avg)} / day`;
    }

    // Category Breakdown Rows
    const breakdownList = document.getElementById('analytics-breakdown-list');
    if (breakdownList) {
      let rowsHtml = '';
      Object.keys(CATEGORIES).forEach(catKey => {
        const cat = CATEGORIES[catKey];
        const spent = spendingMap[catKey] || 0;
        const cap = categoryCaps[catKey] || cat.defaultCap;
        const sharePct = totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0;
        const budgetPct = cap > 0 ? Math.round((spent / cap) * 100) : 0;

        rowsHtml += `
          <div class="flex items-center justify-between p-space-sm rounded-xl hover:bg-surface-container-low transition-colors">
            <div class="flex items-center gap-space-sm">
              <div class="w-8 h-8 rounded-lg ${cat.iconBgClass} flex items-center justify-center">
                <span class="material-symbols-outlined text-lg">${cat.icon}</span>
              </div>
              <div class="flex flex-col">
                <span class="font-label-md text-label-md text-on-surface font-bold">${cat.name}</span>
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
    initOrUpdateCharts(spendingMap);
  }

  function initOrUpdateCharts(spendingMap) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js is not loaded.');
      return;
    }

    const catLabels = Object.keys(CATEGORIES).map(k => CATEGORIES[k].name);
    const catData = Object.keys(CATEGORIES).map(k => spendingMap[k] || 0);
    const catColors = [
      '#f59e0b', // food (tertiary/amber)
      '#006948', // groceries (primary green)
      '#ba1a1a', // textbooks (error red)
      '#565e74', // entertainment (secondary slate)
      '#00855d', // personal (primary container)
      '#825100', // emergency fund (tertiary container)
    ];

    // Donut Chart
    const donutCtx = document.getElementById('chart-category-donut')?.getContext?.('2d');
    if (donutCtx) {
      if (state.charts.categoryDonut) {
        state.charts.categoryDonut.data.labels = catLabels;
        state.charts.categoryDonut.data.datasets[0].data = catData;
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
      // Group expenses into 4 weeks of the term
      const weekBuckets = [0, 0, 0, 0];
      state.expenses.forEach(exp => {
        if (!exp.date) return;
        const day = parseInt(exp.date.split('-')[2], 10) || 1;
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
    if (errorContainer) {
      errorContainer.style.display = 'none';
      errorContainer.classList.add('hidden');
      errorContainer.classList.remove('flex');
    }
  }

  // Helper to show modal error banner only on validation failure
  function showExpenseFormError(message) {
    const errorContainer = document.getElementById('expense-form-error');
    const errorText = document.getElementById('expense-form-error-text');
    if (errorContainer && errorText) {
      errorText.textContent = message;
      errorContainer.classList.remove('hidden');
      errorContainer.classList.add('flex');
      errorContainer.style.display = 'flex';
    }
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

    // Default to today's date YYYY-MM-DD
    if (dateInput) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // Default category chip: food
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

    // Ensure error is completely hidden on modal open
    hideExpenseFormError();

    if (title) title.textContent = 'Edit Expense';
    if (subtitle) subtitle.textContent = 'Modify transaction details';
    if (submitBtn) submitBtn.textContent = 'Update Expense';

    if (amountInput) amountInput.value = exp.amount;
    if (noteInput) noteInput.value = exp.note || '';
    if (dateInput) dateInput.value = exp.date || '';

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

  function selectCategoryChip(catKey) {
    const chips = document.querySelectorAll('.expense-category-chip');
    chips.forEach(chip => {
      const key = chip.dataset.category;
      if (key === catKey) {
        chip.classList.add('ring-2', 'ring-primary', 'bg-primary-container', 'text-on-primary-container');
        chip.classList.remove('bg-surface-container-low', 'text-on-surface');
      } else {
        chip.classList.remove('ring-2', 'ring-primary', 'bg-primary-container', 'text-on-primary-container');
        chip.classList.add('bg-surface-container-low', 'text-on-surface');
      }
    });

    const hiddenInput = document.getElementById('expense-selected-category');
    if (hiddenInput) hiddenInput.value = catKey;
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

    // Strict Validation:
    // 1. Amount must be a positive number
    // 2. Category is required and must be one of the allowed categories
    // 3. Date is required
    const errors = [];
    if (isNaN(amountVal) || amountVal <= 0) {
      errors.push('Amount must be a positive number greater than ₹0.');
    }
    if (!catVal || !CATEGORIES[catVal]) {
      errors.push('Please select a valid expense category.');
    }
    if (!dateVal) {
      errors.push('Transaction date is required.');
    }

    if (errors.length > 0) {
      showExpenseFormError(errors.join(' '));
      return;
    }

    hideExpenseFormError();

    if (state.editingExpenseId) {
      // Update existing
      const idx = state.expenses.findIndex(x => x.id === state.editingExpenseId);
      if (idx !== -1) {
        state.expenses[idx] = {
          ...state.expenses[idx],
          amount: Math.round(amountVal),
          category: catVal,
          date: dateVal,
          note: noteVal || CATEGORIES[catVal].name,
        };
        showToast('Expense updated successfully!', 'success');
      }
    } else {
      // Create new
      const newExp = {
        id: 'exp-' + Date.now(),
        amount: Math.round(amountVal),
        category: catVal,
        date: dateVal,
        note: noteVal || CATEGORIES[catVal].name,
        createdAt: Date.now(),
      };
      state.expenses.unshift(newExp);
      showToast('Expense logged successfully!', 'success');
    }

    saveExpenses();
    closeExpenseModal();
    renderCurrentView();
  }

  function confirmDeleteExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    const cat = CATEGORIES[exp.category]?.name || 'Expense';
    const msg = `Delete transaction: "${exp.note || cat}" for ₹${formatINR(exp.amount)}?`;
    if (window.confirm(msg)) {
      state.expenses = state.expenses.filter(e => e.id !== id);
      saveExpenses();
      showToast('Expense deleted.', 'info');
      renderCurrentView();
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
    renderCurrentView();
  }

  function resetBudgetDefaults() {
    if (window.confirm('Reset all category caps and monthly ceiling to default semester targets?')) {
      state.budget = {
        overallCap: INITIAL_DEMO_BUDGET.overallCap,
        categories: { ...INITIAL_DEMO_BUDGET.categories },
      };
      saveBudget();
      showToast('Budget caps reset to defaults.', 'info');
      renderCurrentView();
    }
  }

  function clearAllExpenses() {
    if (window.confirm('Are you sure you want to delete ALL logged expenses? This will allow you to test the empty state.')) {
      state.expenses = [];
      saveExpenses();
      showToast('All expenses cleared. Empty state activated.', 'info');
      renderCurrentView();
    }
  }

  function loadSampleData() {
    state.expenses = JSON.parse(JSON.stringify(INITIAL_DEMO_EXPENSES));
    state.budget = JSON.parse(JSON.stringify(INITIAL_DEMO_BUDGET));
    saveExpenses();
    saveBudget();
    showToast('Sample student demo data restored!', 'success');
    renderCurrentView();
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

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

    // Budget Sliders
    const sliders = document.querySelectorAll('.budget-slider');
    sliders.forEach(slider => {
      slider.addEventListener('input', () => handleSliderChange(slider));
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

    // Expense Modal Buttons & Form
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) expenseForm.addEventListener('submit', handleExpenseFormSubmit);

    const closeExpenseModalBtn = document.getElementById('close-expense-modal');
    if (closeExpenseModalBtn) closeExpenseModalBtn.addEventListener('click', closeExpenseModal);

    const cancelExpenseModalBtn = document.getElementById('cancel-expense-modal');
    if (cancelExpenseModalBtn) cancelExpenseModalBtn.addEventListener('click', closeExpenseModal);

    // Category chips selection in Expense Modal
    const chips = document.querySelectorAll('.expense-category-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        selectCategoryChip(chip.dataset.category);
      });
    });

    // Notification Toggles in Budget Setup
    const toggle80 = document.getElementById('toggle-80');
    if (toggle80) {
      toggle80.addEventListener('change', () => {
        state.settings.notify80 = toggle80.checked;
        saveSettings();
        showToast(toggle80.checked ? '80% threshold ping enabled.' : '80% threshold ping disabled.');
      });
    }

    const toggleDigest = document.getElementById('toggle-digest');
    if (toggleDigest) {
      toggleDigest.addEventListener('change', () => {
        state.settings.weeklyDigest = toggleDigest.checked;
        saveSettings();
        showToast(toggleDigest.checked ? 'Sunday weekly digest enabled.' : 'Weekly digest disabled.');
      });
    }

    const toggleRoom = document.getElementById('toggle-roommate');
    if (toggleRoom) {
      toggleRoom.addEventListener('change', () => {
        state.settings.roommateAlert = toggleRoom.checked;
        saveSettings();
        showToast(toggleRoom.checked ? 'Roommate split reminder enabled.' : 'Roommate split reminder disabled.');
      });
    }

    // Settings Screen Action Buttons
    const btnClearData = document.getElementById('btn-clear-expenses');
    if (btnClearData) btnClearData.addEventListener('click', clearAllExpenses);

    const btnLoadSample = document.getElementById('btn-load-sample');
    if (btnLoadSample) btnLoadSample.addEventListener('click', loadSampleData);

    const btnEditCapFromSettings = document.getElementById('btn-edit-budget-cap');
    if (btnEditCapFromSettings) btnEditCapFromSettings.addEventListener('click', openBudgetModal);

    // Logout Buttons (Profile Screen & Sidebar)
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (window.FirebaseService) {
          window.FirebaseService.signOut();
        } else {
          localStorage.removeItem('expensetrack_user_session');
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
          localStorage.removeItem('expensetrack_user_session');
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

    const name = profile.displayName || profile.phoneNumber || 'Student User';
    const contact = profile.email || profile.phoneNumber || 'Campus Sync Active';

    if (headerName) headerName.textContent = name;
    if (headerEmail) headerEmail.textContent = contact;
    if (headerAvatar && profile.photoURL) headerAvatar.src = profile.photoURL;

    if (profileName) profileName.textContent = name;
    if (profileEmail) profileEmail.textContent = `${contact} • On-Campus Resident`;
    if (profileAvatar && profile.photoURL) profileAvatar.src = profile.photoURL;
  }

  function initAuthGuardAndSyncUser() {
    if (!window.FirebaseService) return;

    // 1. Instant sync from cached session
    const cached = window.FirebaseService.getCachedSession();
    if (cached) {
      applyUserProfile(cached);
    }

    // 2. Live Firebase listener
    window.FirebaseService.onAuthStateChanged(user => {
      if (!user) {
        window.location.replace('login.html');
      } else {
        applyUserProfile({
          displayName: user.displayName || user.phoneNumber || 'Student User',
          email: user.email || user.phoneNumber || 'Campus Living',
          photoURL: user.photoURL || '',
          phoneNumber: user.phoneNumber || ''
        });
      }
    });
  }

  // Expose API for inline onclick handlers
  window.ExpenseTrackApp = {
    navigateTo,
    openAddExpenseModal,
    openEditExpenseModal,
    confirmDeleteExpense,
    openBudgetModal,
    closeBudgetModal,
    saveBudgetModal,
    resetBudgetDefaults,
    clearAllExpenses,
    loadSampleData,
  };

  // Bootstrap Application
  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initEventListeners();
    hideExpenseFormError();
    initAuthGuardAndSyncUser();
    navigateTo('dashboard');
  });
})();
