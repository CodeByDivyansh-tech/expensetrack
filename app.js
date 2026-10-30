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

  const Tools = (typeof window !== 'undefined' && window.ExpenseTools)
    ? window.ExpenseTools
    : (typeof require !== 'undefined' ? require('./expense-tools.js') : null);

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
    analyticsMonth: new Date().getMonth(), // the budget period shown in Analytics (0-indexed month)
    charts: {
      categoryDonut: null,
      monthlyBar: null,
    },
    renderCounts: { dashboard: 0, recurring: 0, goals: 0, transactions: 0, 'budget-setup': 0, analytics: 0, 'profile-&-settings': 0 },
    tx: {
      filters: { query: '', category: '', payment: '', from: '', to: '', min: '', max: '' },
      sort: 'newest',
      limit: 50,
    },
  };

  // Chart.js is pinned to one version and checked against this hash, whichever page asks for it
  const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
  const CHART_SRI = 'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ';
  let chartLoading = null;

  function ensureChart() {
    if (typeof Chart !== 'undefined') return Promise.resolve(true);
    if (chartLoading) return chartLoading;
    chartLoading = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = CHART_URL;
      script.integrity = CHART_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(true);
      script.onerror = () => { chartLoading = null; resolve(false); };
      document.head.appendChild(script);
    });
    return chartLoading;
  }

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
    applyTheme();
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

  // Static page text contains "₹" in labels and placeholders. Wrap each one once so the currency
  // preference can swap the symbol; text produced by the app already uses the chosen symbol.
  function markCurrencySymbols() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.includes('₹') && !['SCRIPT', 'STYLE', 'TEXTAREA'].includes(n.parentNode.nodeName) && !n.parentNode.closest('[data-cur]'))
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split('₹').forEach((part, i) => {
        if (i > 0) {
          const s = document.createElement('span');
          s.setAttribute('data-cur', '');
          s.textContent = '₹';
          frag.appendChild(s);
        }
        frag.appendChild(document.createTextNode(part));
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  function applyCurrency() {
    const symbol = sym();
    document.querySelectorAll('[data-cur]').forEach(el => { if (el.textContent !== symbol) el.textContent = symbol; });
  }

  // --- Theme: light, dark, or follow the device ---
  function cssRgb(token) {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--c-' + token).trim();
    return v ? `rgb(${v})` : '#000000';
  }

  // rgba() with commas works in every browser and canvas, unlike the space-separated form the tokens use
  function cssRgba(token, alpha) {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--c-' + token).trim().split(/\s+/);
    return v.length === 3 ? `rgba(${v.join(', ')}, ${alpha})` : 'rgba(0, 0, 0, 0.1)';
  }

  function effectiveTheme(choice) {
    if (choice === 'dark') return 'dark';
    if (choice === 'light') return 'light';
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  let appliedTheme = null;

  function applyTheme() {
    const choice = (state.settings && state.settings.theme) || 'system';
    const theme = effectiveTheme(choice);
    try { localStorage.setItem('expensetrack_theme', choice); } catch (e) { /* private mode */ }
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f4f4f5');
    if (appliedTheme !== null && appliedTheme !== theme) {
      // Charts keep their colours from when they were drawn, so draw them again
      ['categoryDonut', 'monthlyBar', 'trend'].forEach(k => { if (state.charts[k]) { state.charts[k].destroy(); state.charts[k] = null; } });
      if (state.currentView === 'analytics') renderAnalytics();
    }
    appliedTheme = theme;
  }

  // Shown in toasts: say so when a save was only queued for later.
  function savedMessage(message) {
    return DataLayer && DataLayer.isOffline && DataLayer.isOffline()
      ? "Saved offline. It will sync when you're back online."
      : message;
  }

  function errorDetail(err) {
    return Tools.friendlyError(err);
  }

  // Put the in-memory state back in line with what the data layer really holds.
  function reloadFromDataLayer() {
    loadState();
    syncAllViewsWithData();
  }

  const safeIcon = (icon) => (DataLayer && DataLayer.safeIcon ? DataLayer.safeIcon(icon) : 'category');
  const safeColor = (color) => (DataLayer && DataLayer.safeColor ? DataLayer.safeColor(color) : '#006948');

  // --- Formatting & Local Date Helpers ---
  // The currency is a display choice (symbol and digit grouping); amounts are never converted.
  function currencyCode() {
    return (state.settings && state.settings.currency) || 'INR';
  }

  function sym() {
    return BudgetCalculator.currencyOf(currencyCode()).symbol;
  }

  function formatINR(val) {
    if (BudgetCalculator) return BudgetCalculator.formatNumber(val, currencyCode());
    return (Number(val) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  // Budget month: starts on the day the user chose (default the 1st)
  function startDay() {
    return BudgetCalculator.clampStartDay(state.settings && state.settings.monthStartDay);
  }

  function currentPeriod() {
    return BudgetCalculator.periodOf(localDateString(), startDay());
  }

  function inPeriod(dateStr, year, month) {
    return BudgetCalculator.periodContains(dateStr, year, month, startDay());
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

  function getCurrentMonthExpenses() {
    const p = currentPeriod();
    return state.expenses.filter(exp => inPeriod(exp.date, p.year, p.month));
  }

  function getMonthExpenses(year, month) {
    return state.expenses.filter(exp => inPeriod(exp.date, year, month));
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
    const allowed = ['dashboard', 'transactions', 'budget-setup', 'analytics', 'profile-&-settings', 'recurring', 'goals'];
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
    const p = currentPeriod();
    const currentMonthYear = BudgetCalculator.periodLabel(p.year, p.month, startDay()); // "October 2026" or "15 Oct to 14 Nov 2026"
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
    termBadges.forEach(el => { el.textContent = info.termName; });

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

  // --- Budget alerts: overall and per category, at 80% and 100% ---
  let currentUid = null;

  // The budget period we are in, as "2026-10": a dismissal only lasts for the period it was made in
  function monthKeyNow() {
    const p = currentPeriod();
    return `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
  }

  function currentAlerts() {
    if (!BudgetCalculator || !state.budget) return [];
    const activeCats = getCategories();
    return BudgetCalculator.computeAlerts({
      overallCap: state.budget.overallCap || 0,
      totalSpent: getTotalSpending(),
      spendingMap: getCategorySpendingMap(),
      caps: state.budget.categories || {},
      categories: activeCats,
      warnPct: state.settings && state.settings.alertWarnPct,
    });
  }

  // "Food:warn,overall:over" - changes whenever a budget crosses a new threshold
  function alertSignature(alerts) {
    return `${monthKeyNow()}|${alerts.map(a => `${a.id}:${a.level}`).sort().join(',')}`;
  }

  const dismissKey = () => `expensetrack_alert_dismissed_${currentUid || 'anon'}`;

  function readDismissed() {
    try { return localStorage.getItem(dismissKey()); } catch (e) { return null; }
  }

  function writeDismissed(signature) {
    try { localStorage.setItem(dismissKey(), signature); } catch (e) { /* private mode: it just shows again */ }
  }

  function checkBudget80Alert() {
    const banner = document.getElementById('budget-warning-banner');
    if (!banner) return;

    const alerts = state.settings?.notify80 ? currentAlerts() : [];
    // Hidden when there is nothing to say, or the user already dismissed exactly this situation this month
    if (alerts.length === 0 || readDismissed() === alertSignature(alerts)) {
      banner.classList.add('hidden');
      return;
    }

    const over = alerts.filter(a => a.level === 'over');
    const title = document.getElementById('budget-warning-title');
    const desc = document.getElementById('budget-warning-desc');
    const list = document.getElementById('budget-warning-list');
    if (title) {
      title.textContent = over.length
        ? (over.length === 1 ? 'A budget has been exceeded' : `${over.length} budgets have been exceeded`)
        : (alerts.length === 1 ? 'A budget is close to its limit' : `${alerts.length} budgets are close to their limits`);
    }
    if (desc) desc.textContent = 'Warnings start at 80% and again at 100%.';
    if (list) {
      list.innerHTML = alerts.map(a =>
        `<li><strong>${escapeHtml(a.name)}</strong>: ${sym()}${formatINR(a.spent)} of ${sym()}${formatINR(a.cap)} (${a.pct}%)${a.level === 'over' ? ', over the limit' : ', nearly there'}</li>`
      ).join('');
    }
    banner.classList.remove('hidden');
  }

  function dismissBudgetBanner() {
    const alerts = state.settings?.notify80 ? currentAlerts() : [];
    writeDismissed(alertSignature(alerts));
    document.getElementById('budget-warning-banner')?.classList.add('hidden');
  }

  // After a save: tell the user about thresholds that were just crossed
  function toastNewAlerts(before) {
    if (!state.settings?.notify80) return;
    const fresh = currentAlerts().filter(a => !before.some(b => b.id === a.id && b.level === a.level));
    fresh.slice(0, 2).forEach(a => {
      showToast(
        a.level === 'over'
          ? `${a.name} is over its limit (${a.pct}%).`
          : `${a.name} has reached ${a.pct}% of its limit.`,
        'warning'
      );
    });
  }

  // --- Unified Single Source of Truth Synchronization ---
  // Shared widgets plus the view that is on screen; other views render when you open them.
  function syncAllViewsWithData() {
    updateSidebarWidget();
    updateAcademicTermDisplay();
    switch (state.currentView) {
      case 'dashboard': renderDashboard(); break;
      case 'transactions': renderTransactions(); break;
      case 'recurring': renderRecurring(); break;
      case 'goals': renderGoals(); break;
      case 'budget-setup': renderBudgetSetup(); break;
      case 'analytics': renderAnalytics(); break;
      case 'profile-&-settings': renderProfile(); break;
      default: break;
    }
    checkBudget80Alert();
    applyCurrency();
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
      widgetLeft.textContent = `${sym()}${formatINR(Math.abs(remaining))} over budget`;
    } else {
      const safeRatio = Math.round(((overallCap - totalSpent) / overallCap) * 100);
      widgetSafePercent.textContent = `${safeRatio}% Safe`;
      widgetSafePercent.className = 'font-label-sm text-label-sm text-primary font-bold';
      widgetBar.style.width = `${percentSpent}%`;
      widgetBar.className = percentSpent > 80 ? 'bg-tertiary h-full rounded-full' : 'bg-primary h-full rounded-full';
      widgetLeft.textContent = `${sym()}${formatINR(remaining)} left this month`;
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
    if (heroSpentVal) heroSpentVal.textContent = `${sym()}${formatINR(totalSpent)}`;

    // Budget Cap Display
    const dashBudgetCap = document.getElementById('dash-budget-cap');
    if (dashBudgetCap) {
      dashBudgetCap.textContent = hasBudget ? `${sym()}${formatINR(overallCap)}` : 'Not Set';
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
        dashRemainingText.textContent = `${sym()}${formatINR(Math.abs(remaining))} Over Budget!`;
      } else {
        dashRemainingPill.className = 'inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md font-bold';
        dashRemainingText.textContent = `${sym()}${formatINR(remaining)} Remaining Safe`;
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
        dashProgressSubtitle.innerHTML = `<span class="text-error font-bold flex items-center gap-1"><span class="material-symbols-outlined text-sm">warning</span> Monthly limit exceeded by ${sym()}${formatINR(Math.abs(remaining))}</span>`;
      } else {
        const pct = Math.round((totalSpent / overallCap) * 100);
        dashProgressSubtitle.innerHTML = `<span class="text-on-surface-variant">${pct}% of monthly cap used • Pacing healthy</span>`;
      }
    }

    // Category Quick Cards
    renderDashboardCategoryChips();

    // Transactions List
    renderDashboardTransactions();
    renderGoalCard();

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
          ? BudgetCalculator.dailyAverage(totalSpent, currentPeriod().year, currentPeriod().month, now, startDay()).average
          : totalSpent / Math.max(1, now.getDate());
        dashInsight.textContent = `${topCat.name} leads your spending at ${sym()}${formatINR(topCat.amount)}. Your month-to-date pacing is ${sym()}${formatINR(dailyAvg)}/day.`;
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
              <span class="font-title-md text-title-md font-bold text-on-surface">${sym()}${formatINR(spent)}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">/ ${sym()}${formatINR(cap)}</span>
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

  // One expense as a list row. opts.dateText: what to show after the category (omit inside a day group).
  function renderExpenseRow(exp, allCats, opts = {}) {
    const cat = allCats[exp.category] || allCats[normalizeCategoryKey(exp.category)] || UNCATEGORIZED_CATEGORY;
    const meta = [escapeHtml(cat.name)];
    if (opts.dateText) meta.push(escapeHtml(opts.dateText));
    return `
        <div class="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-slate-100 flex items-center justify-between gap-space-sm hover:border-surface-container-high transition-colors group">
          <div class="flex items-center gap-space-md min-w-0">
            <div class="w-10 h-10 rounded-xl ${escapeHtml(cat.iconBgClass)} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-xl">${escapeHtml(safeIcon(cat.icon))}</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-title-md text-title-md text-on-surface font-bold truncate">${escapeHtml(exp.note || cat.name)}</span>
              <div class="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5 text-on-surface-variant font-body-sm text-body-sm">
                <span class="truncate">${meta.join('</span><span>•</span><span class="truncate">')}</span>
                ${exp.paymentMethod ? `<span class="px-2 py-0.5 rounded-full bg-surface-container text-label-sm font-label-sm">${escapeHtml(exp.paymentMethod)}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-space-sm flex-shrink-0">
            <span class="font-title-md text-title-md font-bold text-on-surface tabular-nums">
              ${sym()}${formatINR(exp.amount)}
            </span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                data-action="edit-expense"
                data-id="${escapeHtml(exp.id)}"
                class="w-11 h-11 lg:w-9 lg:h-9 rounded-xl bg-surface-container-low hover:bg-surface-container hover:text-primary text-on-surface-variant flex items-center justify-center transition-colors"
                title="Edit Expense"
                aria-label="Edit Expense"
              >
                <span class="material-symbols-outlined text-base">edit</span>
              </button>
              <button
                type="button"
                data-action="delete-expense"
                data-id="${escapeHtml(exp.id)}"
                class="w-11 h-11 lg:w-9 lg:h-9 rounded-xl bg-surface-container-low hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center transition-colors"
                title="Delete Expense"
                aria-label="Delete Expense"
              >
                <span class="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>
        </div>
      `;
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

    const sorted = Tools.sortExpenses(currentMonthExpenses, 'newest');
    const allCats = getAllCategories(true);
    container.innerHTML = sorted.map(exp => renderExpenseRow(exp, allCats, { dateText: Tools.dayLabel(exp.date) })).join('');
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
          statusText: `${sym()}${formatINR(overallCap)} remaining`,
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
    if (macroCapDisplay) macroCapDisplay.textContent = `${sym()}${formatINR(alloc.monthlyBudget)} / mo`;

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
      if (bufferTextElem) bufferTextElem.textContent = `${sym()}${formatINR(alloc.overAmount)} over budget`;
      if (macroBufferLabel) {
        macroBufferLabel.className = 'text-error font-bold';
        macroBufferLabel.textContent = `Deficit (-${sym()}${formatINR(alloc.overAmount)})`;
      }
    } else {
      if (bufferPillElem) {
        bufferPillElem.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-title-md text-title-md font-bold mt-1';
      }
      if (bufferIconElem) bufferIconElem.textContent = 'check_circle';
      if (bufferTextElem) bufferTextElem.textContent = `${sym()}${formatINR(alloc.remaining)} remaining`;
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
        // The range grows with the monthly budget, so a bigger budget is not squeezed into a small slider
        const ceiling = Math.ceil((overallCap * 0.5) / cat.step) * cat.step;
        slider.min = Math.min(cat.minCap, cap);
        slider.max = Math.max(cat.maxCap, cap, ceiling);
        slider.step = cat.step;
        slider.value = cap;
        const minLabel = slider.previousElementSibling;
        if (minLabel) minLabel.textContent = `${sym()}${formatINR(Math.min(cat.minCap, cap))}`;
      }
      const capInput = document.getElementById(`cap-input-${catKey}`);
      if (capInput && document.activeElement !== capInput) capInput.value = cap;

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
            badgeText = `Exceeded by ${sym()}${formatINR(Math.abs(diff))}!`;
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
                  <span class="font-headline-sm text-headline-sm text-on-surface font-bold"><span data-cur>${sym()}</span><span class="spent-val-${escapeHtml(catKey)}">${formatINR(spent)}</span></span>
                  <span class="font-body-sm text-body-sm text-on-surface-variant">of <span data-cur>${sym()}</span><span id="cap-${escapeHtml(catKey)}">${formatINR(cap)}</span> cap</span>
                </div>
                <div class="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
                  <div class="category-progress-fill ${progressColor} h-full rounded-full transition-all duration-300" style="width: ${Math.min(100, Math.max(0, pct))}%"></div>
                </div>
                <div class="flex justify-between items-center mt-1.5 font-label-sm text-label-sm">
                  <span class="category-remaining-text ${diff < 0 ? 'text-error font-bold' : roundedPct >= 80 ? 'text-tertiary font-bold' : 'text-primary font-bold'}">
                    ${diff < 0 ? `${roundedPct}% Overrun (-${sym()}${formatINR(Math.abs(diff))} over cap)` : `${roundedPct}% Spent (${sym()}${formatINR(diff)} remaining)`}
                  </span>
                </div>
              </div>

              <div class="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-t border-slate-100">
                <label for="slider-${escapeHtml(catKey)}" class="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">tune</span> Adjust Cap Target:
                </label>
                <div class="flex flex-wrap items-center gap-x-space-sm gap-y-1 flex-1 max-w-sm w-full">
                  <span class="font-body-sm text-body-sm text-on-surface-variant">${sym()}${formatINR(cat.minCap || 200)}</span>
                  <input id="slider-${escapeHtml(catKey)}" class="flex-1 min-w-[120px] h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary budget-slider" data-category="${escapeHtml(catKey)}" max="${Math.max(Number(cat.maxCap) || 10000, Number(cap) || 0, Math.ceil(overallCap * 0.5 / 50) * 50)}" min="${Math.min(Number(cat.minCap) || 200, Number(cap) || 0)}" step="${Number(cat.step) || 100}" type="range" value="${Number(cap) || 0}"/>
                  <label class="flex items-center gap-1 font-title-md text-title-md text-on-surface font-semibold" for="cap-input-${escapeHtml(catKey)}"><span data-cur>${sym()}</span><input id="cap-input-${escapeHtml(catKey)}" data-category="${escapeHtml(catKey)}" class="cap-input w-24 px-2 py-2 min-h-[44px] bg-surface-container-low rounded-xl text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary" type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${Number(cap) || 0}"/></label><span id="slider-display-${escapeHtml(catKey)}" class="hidden">${formatINR(cap)}</span>
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
    if (emergDesc) emergDesc.textContent = `${sym()}${formatINR(emergSpent)} spent from this fund this month`;
    if (emergGoalPct) emergGoalPct.textContent = `${emergPct}% of monthly cap used`;

    // Dynamic budget insight
    const budgetInsight = document.getElementById('budget-spending-insight');
    if (budgetInsight) {
      const topCat = getTopSpendingCategory(spendingMap);
      if (state.expenses.length === 0 || !topCat) {
        budgetInsight.textContent = 'No expenses logged this month yet. Category gauges will track your real spending live as you log transactions.';
      } else {
        budgetInsight.textContent = `${topCat.name} is your highest budget demand (${sym()}${formatINR(topCat.amount)}). Adjust sliders below to fine-tune your targets.`;
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
        badge.innerHTML = `<span class="material-symbols-outlined text-xs">error</span> Exceeded by ${sym()}${formatINR(Math.abs(diff))}!`;
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
        remainingText.textContent = `${roundedPct}% Overrun (-${sym()}${formatINR(Math.abs(diff))} over cap)`;
      } else if (roundedPct >= 80) {
        remainingText.className = 'text-tertiary font-bold category-remaining-text';
        remainingText.textContent = `${roundedPct}% Spent (${sym()}${formatINR(diff)} remaining)`;
      } else {
        remainingText.className = 'text-primary font-bold category-remaining-text';
        remainingText.textContent = `${roundedPct}% Spent (${sym()}${formatINR(diff)} remaining)`;
      }
    }
  }

  function handleSliderInput(slider) {
    const cat = slider.dataset.category;
    const val = parseInt(slider.value, 10);
    const display = document.getElementById(`slider-display-${cat}`);
    const capDisplay = document.getElementById(`cap-${cat}`);
    const capField = document.getElementById(`cap-input-${cat}`);
    if (display) display.textContent = formatINR(val);
    if (capDisplay) capDisplay.textContent = formatINR(val);
    if (capField) capField.value = val;

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
        if (bufferTextElem) bufferTextElem.textContent = `${sym()}${formatINR(alloc.overAmount)} over budget`;
        if (macroBufferLabel) {
          macroBufferLabel.className = 'text-error font-bold';
          macroBufferLabel.textContent = `Deficit (-${sym()}${formatINR(alloc.overAmount)})`;
        }
      } else {
        if (bufferPillElem) {
          bufferPillElem.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-title-md text-title-md font-bold mt-1';
        }
        if (bufferIconElem) bufferIconElem.textContent = 'check_circle';
        if (bufferTextElem) bufferTextElem.textContent = `${sym()}${formatINR(alloc.remaining)} remaining`;
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
      const cur = currentPeriod();
      const atLatest = selectedYear * 12 + selectedMonth >= cur.year * 12 + cur.month;
      nextBtn.disabled = atLatest;
      nextBtn.classList.toggle('opacity-40', atLatest);
      nextBtn.classList.toggle('cursor-not-allowed', atLatest);
    }

    // Update Month Label in Analytics View
    const monthLabel = document.getElementById('analytics-month-label');
    if (monthLabel) {
      monthLabel.textContent = BudgetCalculator.periodLabel(selectedYear, selectedMonth, startDay());
    }

    const totalSpentElem = document.getElementById('analytics-total-spent');
    const emptyElem = document.getElementById('analytics-empty-state');
    const contentElem = document.getElementById('analytics-content');

    if (totalSpentElem) totalSpentElem.textContent = `${sym()}${formatINR(totalSpent)}`;

    if (totalSpent === 0) {
      if (emptyElem) {
        emptyElem.classList.remove('hidden');
        const emptyH3 = emptyElem.querySelector('h3');
        const emptyP = emptyElem.querySelector('p');
        const monthName = BudgetCalculator.periodLabel(selectedYear, selectedMonth, startDay());
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
      if (state.charts.trend) {
        state.charts.trend.destroy();
        state.charts.trend = null;
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
      topCategoryElem.textContent = `${topCat.name} (${sym()}${formatINR(maxVal)})`;
    }

    // Daily Average for the selected month
    if (dailyAvgElem) {
      const daily = BudgetCalculator.dailyAverage(totalSpent, selectedYear, selectedMonth, new Date(), startDay());
      dailyAvgElem.textContent = `${sym()}${formatINR(daily.average)} / day`;
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
              <span class="font-title-md text-title-md font-bold text-on-surface">${sym()}${formatINR(spent)}</span>
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
    renderAnalyticsInsights(selectedYear, selectedMonth, totalSpent);
    drawTrendChart(selectedYear, selectedMonth);
  }

  function initOrUpdateCharts(spendingMap, monthExpenses = []) {
    if (typeof Chart === 'undefined') {
      // Charts are only needed here, so the library is fetched the first time Analytics is opened
      ensureChart().then(ok => { if (ok && state.currentView === 'analytics') renderAnalytics(); });
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
                borderColor: cssRgb('surface-container-lowest'),
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
                  color: cssRgb('on-surface'),
                  padding: 12,
                },
              },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    const label = ctx.label || '';
                    const val = ctx.raw || 0;
                    return ` ${label}: ${sym()}${formatINR(val)}`;
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
      const buckets = BudgetCalculator.weeklyBuckets(state.analyticsYear, state.analyticsMonth, monthExpenses, {
        startDay: startDay(),
        weekStart: state.settings ? state.settings.weekStart : null, // calendar weeks from the chosen first day
      });
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
                label: `Spending (${sym()})`,
                data: weekBuckets,
                backgroundColor: cssRgb('primary'),
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
                    return ` Spent: ${sym()}${formatINR(ctx.raw || 0)}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                  color: cssRgb('on-surface-variant'),
                },
              },
              y: {
                beginAtZero: true,
                grid: { color: cssRgb('surface-container-high') },
                ticks: {
                  font: { family: 'Inter', size: 11 },
                  color: cssRgb('outline'),
                  callback: function (val) {
                    return sym() + formatINR(val);
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
    renderPreferences();
    const totalSpent = getTotalSpending();
    const overallCap = state.budget?.overallCap || 0;

    const pSpent = document.getElementById('profile-total-spent');
    const pCap = document.getElementById('profile-budget-cap');
    const pTxCount = document.getElementById('profile-tx-count');

    if (pSpent) pSpent.textContent = `${sym()}${formatINR(totalSpent)}`;
    if (pCap) pCap.textContent = overallCap > 0 ? `${sym()}${formatINR(overallCap)}` : 'Not Set';
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

    // Start from what was used last time (this browser only)
    const prefs = loadPrefs();
    const startCat = getCategories()[prefs.lastCategory] ? prefs.lastCategory : 'food';
    renderQuickLogCategoryChips(startCat);
    selectCategoryChip(startCat);
    selectPaymentChip(typeof prefs.lastPayment === 'string' ? prefs.lastPayment : 'UPI');

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
    selectPaymentChip(exp.paymentMethod || '');

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
    const paymentVal = (document.getElementById('expense-payment')?.value || '').trim();
    const input = DataLayer
      ? DataLayer.validateExpenseInput({ amount: amountInput.value, date: dateVal, note: noteVal, paymentMethod: paymentVal })
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
    const alertsBefore = currentAlerts();
    const wasNew = !state.editingExpenseId;

    try {
    if (state.editingExpenseId) {
      // Update existing
      if (DataLayer) {
        await DataLayer.updateExpense(state.editingExpenseId, {
          amount: amountVal,
          category: normCat,
          date: dateVal,
          note: noteVal || categoryName,
          paymentMethod: paymentVal, // '' clears it
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
          paymentMethod: paymentVal || undefined,
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

    if (wasNew) savePrefs({ lastCategory: normCat, lastPayment: paymentVal });
    closeExpenseModal();
    syncAllViewsWithData();
    toastNewAlerts(alertsBefore);
  }

  async function addExpense({ amount, category, date, note, paymentMethod } = {}) {
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
        paymentMethod: paymentMethod || undefined,
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
    const scale = document.getElementById('scale-caps');
    if (scale) scale.checked = false;
    updateScaleNote();
    showModal(modal);
    if (input) focusSoon(input);
  }

  // Says what scaling the category caps would do, before the user chooses it
  function updateScaleNote() {
    const note = document.getElementById('scale-caps-note');
    const input = document.getElementById('overall-cap-input');
    if (!note || !input) return;
    const oldCap = state.budget?.overallCap || 0;
    const check = BudgetCalculator.validateOverallCap(input.value);
    if (!check.valid || check.value === oldCap || oldCap <= 0) {
      note.textContent = 'Change the monthly budget above to see what this would do.';
      return;
    }
    const activeIds = Object.keys(getCategories());
    const scaled = BudgetCalculator.scaleCaps(state.budget.categories, oldCap, check.value, activeIds);
    const first = activeIds.find(id => state.budget.categories[id] !== undefined);
    const factor = (check.value / oldCap).toFixed(2).replace(/\.?0+$/, '');
    note.textContent = first
      ? `Every category cap is multiplied by ${factor}, for example ${getCategories()[first].name}: ${sym()}${formatINR(state.budget.categories[first])} becomes ${sym()}${formatINR(scaled[first])}.`
      : '';
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

    const oldCap = state.budget.overallCap;
    if (document.getElementById('scale-caps')?.checked && oldCap > 0 && val !== oldCap) {
      state.budget.categories = BudgetCalculator.scaleCaps(state.budget.categories, oldCap, val, Object.keys(getCategories()));
    }
    state.budget.overallCap = val;
    try {
      await saveBudget();
    } catch (err) {
      showToast(`Couldn't save your budget: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
      return;
    }
    closeBudgetModal();
    showToast(savedMessage(`Monthly budget ceiling updated to ${sym()}${formatINR(val)}!`), 'success');
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
      showCustomCategoryError(errorDetail(err));
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
  // VIEW: ALL TRANSACTIONS (search, filters, sort, month/day groups)
  // ==========================================
  const TX_PAGE_SIZE = 50;
  const TX_FILTER_FIELDS = {
    query: 'tx-search', category: 'tx-category', payment: 'tx-payment',
    from: 'tx-from', to: 'tx-to', min: 'tx-min', max: 'tx-max',
  };

  function readTxControls() {
    Object.entries(TX_FILTER_FIELDS).forEach(([key, id]) => {
      const el = document.getElementById(id);
      state.tx.filters[key] = el ? el.value.trim() : '';
    });
    const sort = document.getElementById('tx-sort');
    state.tx.sort = sort ? sort.value : 'newest';
    const activeCount = Object.entries(state.tx.filters).filter(([k, v]) => k !== 'query' && v !== '').length + (state.tx.sort !== 'newest' ? 1 : 0);
    const label = document.getElementById('tx-filter-toggle-text');
    if (label) label.textContent = activeCount ? ('Filters (' + activeCount + ')') : 'Filters';
  }

  function txFiltersActive() {
    return Object.values(state.tx.filters).some(v => v !== '');
  }

  function getFilteredTransactions() {
    const filtered = Tools.filterExpenses(state.expenses, state.tx.filters, getAllCategories(true));
    return Tools.sortExpenses(filtered, state.tx.sort);
  }

  function fillTxCategoryOptions() {
    const select = document.getElementById('tx-category');
    if (!select) return;
    const allCats = getAllCategories(true);
    const options = Object.values(allCats).map(c => ({ id: c.id, name: c.isArchived ? `${c.name} (archived)` : c.name }));
    if (state.expenses.some(e => !allCats[e.category])) options.push({ id: UNCATEGORIZED_ID, name: 'Uncategorized' });
    const signature = options.map(o => `${o.id}:${o.name}`).join('|');
    if (select.dataset.signature === signature) return;
    const keep = select.value;
    select.innerHTML = '<option value="">All categories</option>' +
      options.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
    if (options.some(o => o.id === keep)) select.value = keep;
    select.dataset.signature = signature;
  }

  function renderTransactions() {
    state.renderCounts.transactions++;
    const list = document.getElementById('tx-list');
    if (!list) return;
    fillTxCategoryOptions();

    const emptyAll = document.getElementById('tx-empty-all');
    const emptyNone = document.getElementById('tx-empty-none');
    const moreBtn = document.getElementById('tx-more');
    const summaryEl = document.getElementById('tx-summary');
    const allCats = getAllCategories(true);

    if (state.expenses.length === 0) {
      list.innerHTML = '';
      emptyAll.classList.remove('hidden');
      emptyNone.classList.add('hidden');
      moreBtn.classList.add('hidden');
      summaryEl.textContent = '';
      return;
    }
    emptyAll.classList.add('hidden');

    const sorted = getFilteredTransactions();
    const total = Tools.summarize(sorted);
    summaryEl.textContent = `${total.count.toLocaleString('en-IN')} transaction${total.count === 1 ? '' : 's'}, ${sym()}${formatINR(total.total)} in total` +
      (txFiltersActive() ? ` (filtered from ${state.expenses.length.toLocaleString('en-IN')})` : '');

    if (sorted.length === 0) {
      list.innerHTML = '';
      emptyNone.classList.remove('hidden');
      moreBtn.classList.add('hidden');
      return;
    }
    emptyNone.classList.add('hidden');

    const limit = state.tx.limit;
    let shown = 0;
    let html = '';
    if (state.tx.sort === 'newest' || state.tx.sort === 'oldest') {
      for (const month of Tools.groupByMonthAndDay(sorted)) {
        if (shown >= limit) break;
        html += `<section class="flex flex-col gap-space-sm" aria-label="${escapeHtml(month.label)}">
          <div class="flex items-baseline justify-between px-1 pt-space-sm">
            <h2 class="font-headline-sm text-headline-sm text-on-surface font-bold">${escapeHtml(month.label)}</h2>
            <span class="font-label-md text-label-md text-on-surface-variant">${sym()}${formatINR(month.total)} &middot; ${month.count}</span>
          </div>`;
        for (const day of month.days) {
          if (shown >= limit) break;
          html += `<div class="flex items-baseline justify-between px-1 mt-1">
            <h3 class="font-label-md text-label-md text-on-surface-variant font-semibold">${escapeHtml(Tools.dayLabel(day.date))}</h3>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${sym()}${formatINR(day.total)}</span>
          </div>`;
          for (const exp of day.items) {
            if (shown >= limit) break;
            html += renderExpenseRow(exp, allCats);
            shown++;
          }
        }
        html += '</section>';
      }
    } else {
      sorted.slice(0, limit).forEach(exp => {
        html += renderExpenseRow(exp, allCats, { dateText: Tools.formatDate(exp.date) });
        shown++;
      });
    }
    list.innerHTML = html;

    const left = sorted.length - shown;
    moreBtn.classList.toggle('hidden', left <= 0);
    moreBtn.textContent = `Show more (${left.toLocaleString('en-IN')} left)`;
  }

  function resetTxFilters() {
    Object.values(TX_FILTER_FIELDS).forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const sort = document.getElementById('tx-sort');
    if (sort) sort.value = 'newest';
    state.tx.limit = TX_PAGE_SIZE;
    readTxControls();
    renderTransactions();
  }

  function initTransactionsEvents() {
    let timer = null;
    const refresh = () => {
      state.tx.limit = TX_PAGE_SIZE;
      readTxControls();
      renderTransactions();
    };
    const debounced = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
    ['tx-search', 'tx-min', 'tx-max'].forEach(id => document.getElementById(id)?.addEventListener('input', debounced));
    ['tx-category', 'tx-payment', 'tx-from', 'tx-to', 'tx-sort', 'tx-min', 'tx-max', 'tx-search']
      .forEach(id => document.getElementById(id)?.addEventListener('change', refresh));
    document.getElementById('tx-filters')?.addEventListener('submit', e => e.preventDefault());
    document.getElementById('tx-clear')?.addEventListener('click', resetTxFilters);
    document.getElementById('tx-clear-empty')?.addEventListener('click', resetTxFilters);
    // On a phone the less-used filters sit behind a button
    const filterToggle = document.getElementById('tx-filter-toggle');
    const filterExtra = document.getElementById('tx-filter-extra');
    filterToggle?.addEventListener('click', () => {
      const open = filterToggle.getAttribute('aria-expanded') !== 'true';
      filterToggle.setAttribute('aria-expanded', String(open));
      filterExtra.classList.toggle('hidden', !open);
      ['grid', 'grid-cols-1', 'gap-space-md', 'col-span-full'].forEach(c => filterExtra.classList.toggle(c, open));
    });
    document.getElementById('tx-more')?.addEventListener('click', () => {
      state.tx.limit += TX_PAGE_SIZE;
      renderTransactions();
    });
    document.getElementById('tx-export')?.addEventListener('click', exportCsv);
    document.getElementById('tx-import')?.addEventListener('click', () => document.getElementById('csv-file')?.click());
    document.getElementById('csv-file')?.addEventListener('change', onCsvFileChosen);
    document.getElementById('import-close')?.addEventListener('click', closeImportModal);
    document.getElementById('import-cancel')?.addEventListener('click', closeImportModal);
    document.getElementById('import-confirm')?.addEventListener('click', confirmImport);
    document.getElementById('import-include-dups')?.addEventListener('change', updateImportConfirm);
  }

  // ==========================================
  // CSV EXPORT / IMPORT
  // ==========================================
  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCsv() {
    const all = state.expenses;
    if (all.length === 0) {
      showToast('There is nothing to export yet.', 'info');
      return;
    }
    let list = all;
    const filtered = getFilteredTransactions();
    if (txFiltersActive() && filtered.length !== all.length) {
      const choice = await askDialog({
        title: 'Export which transactions?',
        message: `${filtered.length} match your current filters. You have ${all.length} in total.`,
        confirmLabel: `Filtered (${filtered.length})`,
        extraLabel: `All (${all.length})`,
      });
      if (choice === 'cancel') return;
      list = choice === 'confirm' ? filtered : all;
    }
    if (list.length === 0) {
      showToast('Nothing matches the filters, so there is nothing to export.', 'info');
      return;
    }
    const csv = Tools.toCSV(Tools.sortExpenses(list, 'newest'), getAllCategories(true));
    downloadFile(`expensetrack-${localDateString()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast(`Exported ${list.length} transaction${list.length === 1 ? '' : 's'}.`, 'success');
  }

  let importState = null;

  function closeImportModal() {
    hideModal(document.getElementById('import-modal'));
    importState = null;
  }

  function updateImportConfirm() {
    if (!importState || !importState.result.rows) return;
    const { counts } = importState.result;
    const includeDups = document.getElementById('import-include-dups')?.checked;
    const n = counts.ok + (includeDups ? counts.duplicate : 0);
    const btn = document.getElementById('import-confirm');
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? 'Nothing to import' : `Import ${n.toLocaleString('en-IN')} expense${n === 1 ? '' : 's'}`;
  }

  async function onCsvFileChosen(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = ''; // so choosing the same file again still triggers a change
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('That file is larger than 2 MB. Split it into smaller files.', 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch (err) {
      showToast(`Couldn't read that file: ${errorDetail(err)}`, 'error');
      return;
    }
    const active = getCategories();
    const result = Tools.prepareImport(text, {
      categories: getAllCategories(true),
      existing: state.expenses,
      resolveCategory: (name) => { const key = normalizeCategoryKey(name); return active[key] ? key : null; },
      validate: (row) => DataLayer.validateExpenseInput(row),
    });
    importState = { result, fileName: file.name };
    renderImportPreview();
    showModal(document.getElementById('import-modal'));
  }

  function renderImportPreview() {
    const { result, fileName } = importState;
    const active = getCategories();
    document.getElementById('import-file-name').textContent = fileName;
    const fatal = document.getElementById('import-fatal');
    const body = document.getElementById('import-body');
    const confirmBtn = document.getElementById('import-confirm');
    if (result.fatal) {
      fatal.textContent = result.fatal;
      fatal.classList.remove('hidden');
      body.classList.add('hidden');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Import';
      return;
    }
    fatal.classList.add('hidden');
    body.classList.remove('hidden');

    const { counts, rows } = result;
    document.getElementById('import-summary').textContent =
      `${rows.length.toLocaleString('en-IN')} rows read: ${counts.ok} ready to import, ${counts.duplicate} already in your list, ${counts.invalid} with problems.`;

    const ok = rows.filter(r => r.status === 'ok');
    document.getElementById('import-ok-wrap').classList.toggle('hidden', ok.length === 0);
    document.getElementById('import-ok-list').innerHTML = ok.slice(0, 8).map(r => {
      const d = r.data;
      return `<li class="flex items-center justify-between gap-2 py-2"><span class="min-w-0 truncate">${escapeHtml(Tools.formatDate(d.date))} &middot; ${escapeHtml(d.note || active[d.category]?.name || '')} &middot; ${escapeHtml(active[d.category]?.name || '')}</span><span class="font-semibold tabular-nums">${sym()}${formatINR(d.amount)}</span></li>`;
    }).join('');

    document.getElementById('import-dup-wrap').classList.toggle('hidden', counts.duplicate === 0);
    document.getElementById('import-dup-text').textContent = `${counts.duplicate} row${counts.duplicate === 1 ? '' : 's'}`;
    document.getElementById('import-include-dups').checked = false;

    const bad = rows.filter(r => r.status === 'invalid');
    document.getElementById('import-bad-wrap').classList.toggle('hidden', bad.length === 0);
    document.getElementById('import-bad-list').innerHTML = bad.slice(0, 10).map(r =>
      `<li><strong>Row ${r.line}:</strong> ${escapeHtml(r.errors.join(' '))}</li>`
    ).join('') + (bad.length > 10 ? `<li>...and ${bad.length - 10} more.</li>` : '');
    updateImportConfirm();
  }

  async function confirmImport() {
    if (!importState || !importState.result.rows) return;
    const includeDups = document.getElementById('import-include-dups')?.checked;
    const rows = importState.result.rows
      .filter(r => r.status === 'ok' || (includeDups && r.status === 'duplicate'))
      .map(r => ({ ...r.data, paymentMethod: r.data.paymentMethod || undefined }));
    if (rows.length === 0) return;
    const btn = document.getElementById('import-confirm');
    btn.disabled = true;
    try {
      await DataLayer.addExpensesBulk(rows);
    } catch (err) {
      const fatal = document.getElementById('import-fatal');
      fatal.textContent = `Couldn't import: ${errorDetail(err)}`;
      fatal.classList.remove('hidden');
      btn.disabled = false;
      reloadFromDataLayer();
      return;
    }
    closeImportModal();
    reloadFromDataLayer();
    showToast(savedMessage(`Imported ${rows.length.toLocaleString('en-IN')} expense${rows.length === 1 ? '' : 's'}.`), 'success');
  }

  // ==========================================
  // REMEMBERED CHOICES (this browser only)
  // ==========================================
  const PREFS_KEY = 'expensetrack_prefs';

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
  }

  function savePrefs(patch) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); } catch (e) { /* private mode */ }
  }

  function selectPaymentChip(method) {
    document.querySelectorAll('#expense-payment-chips .payment-chip').forEach(chip => {
      const selected = chip.dataset.payment === method;
      chip.setAttribute('aria-pressed', String(selected));
      chip.classList.toggle('bg-primary', selected);
      chip.classList.toggle('text-on-primary', selected);
      chip.classList.toggle('bg-surface-container-low', !selected);
      chip.classList.toggle('text-on-surface', !selected);
    });
    const input = document.getElementById('expense-payment');
    if (input) input.value = method || '';
  }

  // ==========================================
  // SYNC STATUS AND LOAD ERRORS
  // ==========================================
  function updateSyncIndicator() {
    const el = document.getElementById('sync-indicator');
    if (!el || !DataLayer || !DataLayer.getSyncState) return;
    const states = {
      synced: ['cloud_done', 'Synced', 'All your changes are saved to your account.'],
      syncing: ['sync', 'Saving...', 'Saving your changes.'],
      offline: ['cloud_off', 'Offline', 'You are offline. Changes will sync when you are back online.'],
      local: ['save', 'This browser', 'Changes are stored in this browser only.'],
    };
    const s = DataLayer.getSyncState();
    const [icon, text, title] = states[s] || states.synced;
    document.getElementById('sync-icon').textContent = icon;
    document.getElementById('sync-icon').classList.toggle('animate-spin', s === 'syncing');
    document.getElementById('sync-text').textContent = text;
    el.title = title;
    el.dataset.state = s;
  }

  function updateLoadErrorBanner() {
    const banner = document.getElementById('load-error-banner');
    if (!banner) return;
    banner.classList.toggle('hidden', !(DataLayer && DataLayer.getLoadError && DataLayer.getLoadError()));
  }

  async function retryLoad() {
    const btn = document.getElementById('btn-retry-load');
    if (btn) btn.disabled = true;
    try {
      await DataLayer.initUser(currentUid);
      reloadFromDataLayer();
    } finally {
      if (btn) btn.disabled = false;
      updateLoadErrorBanner();
    }
  }

  // ==========================================
  // KEYBOARD SHORTCUTS: N = new expense, / = search
  // ==========================================
  function handleShortcuts(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (openModals.length > 0) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openAddExpenseModal();
    } else if (e.key === '/') {
      e.preventDefault();
      navigateTo('transactions');
      document.getElementById('tx-search')?.focus();
    }
  }

  // ==========================================
  // PREFERENCES (Settings & Profile)
  // ==========================================
  function setPressed(btn, on) {
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('bg-primary', on);
    btn.classList.toggle('text-on-primary', on);
    btn.classList.toggle('bg-surface-container-low', !on);
    btn.classList.toggle('text-on-surface', !on);
  }

  function renderPreferences() {
    const s = state.settings || {};
    document.querySelectorAll('.theme-choice').forEach(b => setPressed(b, b.dataset.themeChoice === s.theme));
    const values = { 'pref-currency': s.currency, 'pref-week-start': s.weekStart, 'pref-month-start': s.monthStartDay, 'pref-warn-pct': s.alertWarnPct };
    Object.entries(values).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = String(v);
    });
  }

  async function changePreference(patch) {
    state.settings = { ...state.settings, ...patch };
    try {
      await saveSettings();
    } catch (err) {
      showToast(`Couldn't save your preference: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
      return;
    }
    loadState(); // takes the cleaned-up values and applies the theme
    if ('monthStartDay' in patch) {
      const p = currentPeriod();
      state.analyticsYear = p.year;
      state.analyticsMonth = p.month;
    }
    syncAllViewsWithData();
    renderPreferences();
    showToast(savedMessage('Preference saved.'), 'success');
  }

  function initPreferences() {
    const card = document.getElementById('prefs-card');
    if (!card) return;
    card.addEventListener('click', e => {
      const btn = e.target.closest('.theme-choice');
      if (btn) changePreference({ theme: btn.dataset.themeChoice });
    });
    card.addEventListener('change', e => {
      const map = { 'pref-currency': ['currency', String], 'pref-week-start': ['weekStart', Number], 'pref-month-start': ['monthStartDay', Number], 'pref-warn-pct': ['alertWarnPct', Number] };
      const entry = map[e.target.id];
      if (entry) changePreference({ [entry[0]]: entry[1](e.target.value) });
    });
    if (typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if ((state.settings && state.settings.theme) === 'system') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
  }

  // ==========================================
  // RECURRING EXPENSES
  // ==========================================
  let lastRecurringRun = null;

  async function runRecurringNow({ announce = true } = {}) {
    if (!DataLayer || !DataLayer.runDueRecurring) return;
    const today = localDateString();
    try {
      const { created } = await DataLayer.runDueRecurring(today);
      lastRecurringRun = today;
      if (created > 0) {
        reloadFromDataLayer();
        if (announce) showToast(`Added ${created} recurring expense${created === 1 ? '' : 's'}.`, 'info');
      }
    } catch (err) {
      showToast(`Couldn't add your recurring expenses: ${errorDetail(err)}`, 'error');
    }
  }

  function renderRecurring() {
    state.renderCounts.recurring++;
    const list = document.getElementById('rec-list');
    const empty = document.getElementById('rec-empty');
    if (!list) return;
    const rules = DataLayer.getRecurring();
    empty.classList.toggle('hidden', rules.length > 0);
    const allCats = getAllCategories(true);
    const today = localDateString();
    list.innerHTML = rules.map(r => {
      const cat = allCats[r.category] || UNCATEGORIZED_CATEGORY;
      const next = r.active ? Tools.nextOccurrence(r, today) : null;
      const status = !r.active ? 'Paused' : next ? `Next: ${Tools.dayLabel(next)}` : 'Finished';
      const name = escapeHtml(r.name);
      return `
        <div class="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm ${r.active ? '' : 'opacity-75'}">
          <div class="flex items-center gap-space-md min-w-0">
            <div class="w-10 h-10 rounded-xl ${escapeHtml(cat.iconBgClass)} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">${escapeHtml(safeIcon(cat.icon))}</span></div>
            <div class="flex flex-col min-w-0">
              <span class="font-title-md text-title-md text-on-surface font-bold truncate">${name}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(Tools.describeRule(r))} &middot; ${escapeHtml(cat.name)}${r.paymentMethod ? ' &middot; ' + escapeHtml(r.paymentMethod) : ''}</span>
              <span class="font-label-sm text-label-sm ${r.active ? 'text-primary' : 'text-on-surface-variant'}">${escapeHtml(status)}${r.endDate ? ' &middot; ends ' + escapeHtml(Tools.formatDate(r.endDate)) : ''}</span>
            </div>
          </div>
          <div class="flex items-center gap-space-sm shrink-0 self-end sm:self-auto">
            <span class="font-title-md text-title-md font-bold text-on-surface tabular-nums">${sym()}${formatINR(r.amount)}</span>
            <button type="button" data-action="rec-toggle" data-id="${escapeHtml(r.id)}" class="px-4 min-h-[44px] rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md" aria-label="${r.active ? 'Pause' : 'Resume'} ${name}">${r.active ? 'Pause' : 'Resume'}</button>
            <button type="button" data-action="rec-edit" data-id="${escapeHtml(r.id)}" class="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center" aria-label="Edit ${name}" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>
            <button type="button" data-action="rec-delete" data-id="${escapeHtml(r.id)}" class="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-error-container hover:text-error text-on-surface-variant flex items-center justify-center" aria-label="Delete ${name}" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>
          </div>
        </div>`;
    }).join('');
  }

  function recForm() {
    const v = id => document.getElementById(id);
    return {
      id: v('rec-id').value,
      name: v('rec-name').value,
      amount: v('rec-amount').value,
      category: v('rec-category').value,
      paymentMethod: v('rec-payment').value,
      frequency: v('rec-frequency').value,
      startDate: v('rec-start').value,
      endDate: v('rec-end').value,
    };
  }

  function updateRecurringPreview() {
    const preview = document.getElementById('rec-preview');
    if (!preview) return;
    const f = recForm();
    if (!f.startDate) { preview.textContent = ''; return; }
    const today = localDateString();
    const rule = { frequency: f.frequency, startDate: f.startDate, endDate: f.endDate || undefined };
    let text = Tools.describeRule(rule) + '.';
    const due = f.id ? [] : Tools.occurrenceDates(rule, today);
    if (due.length > 0) {
      text += ` ${due.length} past date${due.length === 1 ? '' : 's'} will be added now, from ${Tools.formatDate(due[0])}.`;
    } else {
      const next = Tools.nextOccurrence(rule, today);
      if (next) text += ` First one: ${Tools.dayLabel(next)}.`;
    }
    preview.textContent = text;
  }

  function openRecurringModal(id) {
    const modal = document.getElementById('recurring-modal');
    const rule = id ? DataLayer.getRecurring().find(r => r.id === id) : null;
    const select = document.getElementById('rec-category');
    select.innerHTML = Object.values(getCategories()).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('recurring-modal-title').textContent = rule ? 'Edit recurring expense' : 'New recurring expense';
    document.getElementById('recurring-modal-error').classList.add('hidden');
    const set = (k, val) => { document.getElementById(k).value = val === undefined ? '' : val; };
    set('rec-id', rule ? rule.id : '');
    set('rec-name', rule ? rule.name : '');
    set('rec-amount', rule ? rule.amount : '');
    set('rec-frequency', rule ? rule.frequency : 'monthly');
    set('rec-category', rule ? rule.category : Object.keys(getCategories())[0]);
    set('rec-payment', rule ? rule.paymentMethod || '' : '');
    set('rec-start', rule ? rule.startDate : localDateString());
    set('rec-end', rule ? rule.endDate || '' : '');
    updateRecurringPreview();
    showModal(modal);
    focusSoon(document.getElementById('rec-name'));
  }

  function closeRecurringModal() {
    hideModal(document.getElementById('recurring-modal'));
  }

  async function saveRecurring(e) {
    e.preventDefault();
    const f = recForm();
    const errBox = document.getElementById('recurring-modal-error');
    const btn = document.getElementById('rec-save');
    btn.disabled = true;
    try {
      if (f.id) {
        await DataLayer.updateRecurring(f.id, { name: f.name, amount: f.amount, category: f.category, paymentMethod: f.paymentMethod, frequency: f.frequency, startDate: f.startDate, endDate: f.endDate });
      } else {
        await DataLayer.addRecurring({ name: f.name, amount: f.amount, category: f.category, paymentMethod: f.paymentMethod, frequency: f.frequency, startDate: f.startDate, endDate: f.endDate });
      }
      closeRecurringModal();
      showToast(savedMessage('Recurring expense saved.'), 'success');
      await runRecurringNow();
      reloadFromDataLayer();
    } catch (err) {
      errBox.textContent = errorDetail(err);
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  }

  async function handleRecurringAction(action, id) {
    const rule = DataLayer.getRecurring().find(r => r.id === id);
    if (!rule) return;
    try {
      if (action === 'rec-edit') {
        openRecurringModal(id);
      } else if (action === 'rec-toggle') {
        await DataLayer.updateRecurring(id, { active: !rule.active });
        reloadFromDataLayer();
        showToast(rule.active ? `${rule.name} is paused.` : `${rule.name} is on again.`, 'info');
      } else if (action === 'rec-delete') {
        const ok = await confirmDialog({
          title: `Delete "${rule.name}"?`,
          message: 'It stops repeating. Expenses it already added stay in your list.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        await DataLayer.deleteRecurring(id);
        reloadFromDataLayer();
        showToast(savedMessage('Recurring expense deleted.'), 'info');
      }
    } catch (err) {
      showToast(`Couldn't do that: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
    }
  }

  function initRecurringEvents() {
    document.getElementById('rec-add')?.addEventListener('click', () => openRecurringModal(null));
    document.getElementById('rec-form')?.addEventListener('submit', saveRecurring);
    document.getElementById('rec-cancel')?.addEventListener('click', closeRecurringModal);
    document.getElementById('recurring-modal-close')?.addEventListener('click', closeRecurringModal);
    ['rec-frequency', 'rec-start', 'rec-end'].forEach(id => document.getElementById(id)?.addEventListener('input', updateRecurringPreview));
    document.addEventListener('visibilitychange', () => {
      // A tab left open overnight picks up the new day's expenses when it is looked at again
      if (document.visibilityState === 'visible' && currentUid && lastRecurringRun && lastRecurringRun !== localDateString()) runRecurringNow();
    });
  }

  // ==========================================
  // SAVINGS GOALS
  // ==========================================
  function ringSvg(pct, size) {
    const label = `${pct}% saved`;
    return `<div class="relative shrink-0" style="width:${size}px;height:${size}px" role="img" aria-label="${label}">
      <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" stroke-width="3.5" class="text-surface-container-high"></circle>
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${pct}, 100" class="text-primary"></circle>
      </svg>
      <span class="absolute inset-0 flex items-center justify-center font-label-md text-label-md font-bold text-on-surface" aria-hidden="true">${pct}%</span>
    </div>`;
  }

  function goalsList() {
    return DataLayer && DataLayer.getGoals ? DataLayer.getGoals() : [];
  }

  function renderGoalCard() {
    const card = document.getElementById('dash-goal-card');
    if (!card) return;
    const goals = goalsList();
    if (goals.length === 0) { card.classList.add('hidden'); return; }
    const today = localDateString();
    const goal = goals.find(g => !Tools.goalProgress(g, today).done) || goals[0];
    const p = Tools.goalProgress(goal, today);
    card.classList.remove('hidden');
    document.getElementById('dash-goal-ring').innerHTML = ringSvg(p.pct, 64);
    document.getElementById('dash-goal-name').textContent = goal.name;
    document.getElementById('dash-goal-text').textContent = p.done
      ? `Reached! ${sym()}${formatINR(goal.saved)} saved.`
      : `${sym()}${formatINR(goal.saved)} of ${sym()}${formatINR(goal.target)} saved` + (goals.length > 1 ? ` (+${goals.length - 1} more goal${goals.length > 2 ? 's' : ''})` : '');
  }

  function renderGoals() {
    state.renderCounts.goals++;
    const list = document.getElementById('goal-list');
    const empty = document.getElementById('goal-empty');
    if (!list) return;
    const goals = goalsList();
    empty.classList.toggle('hidden', goals.length > 0);
    const today = localDateString();
    list.innerHTML = goals.map(g => {
      const p = Tools.goalProgress(g, today);
      const name = escapeHtml(g.name);
      const note = p.done ? 'Goal reached.'
        : p.overdue ? `The target date has passed. ${sym()}${formatINR(p.remaining)} to go.`
        : g.deadline ? `${sym()}${formatINR(p.remaining)} to go by ${Tools.formatDate(g.deadline)}` + (p.perMonth ? `, about ${sym()}${formatINR(p.perMonth)} a month` : '')
        : `${sym()}${formatINR(p.remaining)} to go`;
      const history = (g.contributions || []).slice(-4).reverse().map(c =>
        `<li class="flex items-center justify-between gap-2 py-1"><span class="min-w-0 truncate">${escapeHtml(Tools.formatDate(c.date))}${c.note ? ' &middot; ' + escapeHtml(c.note) : ''}</span><span class="font-semibold tabular-nums ${c.amount < 0 ? 'text-error' : 'text-primary'}">${c.amount < 0 ? '-' : '+'}${sym()}${formatINR(Math.abs(c.amount))}</span></li>`).join('');
      return `
        <div class="bg-surface-container-lowest rounded-3xl p-space-lg shadow-sm border border-slate-100 flex flex-col gap-space-md">
          <div class="flex items-center gap-space-md">
            ${ringSvg(p.pct, 96)}
            <div class="flex flex-col min-w-0">
              <h2 class="font-title-md text-title-md text-on-surface font-bold truncate">${name}</h2>
              <span class="font-numeric-balance text-headline-sm font-bold text-on-surface tabular-nums">${sym()}${formatINR(g.saved)}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">of ${sym()}${formatINR(g.target)}</span>
            </div>
          </div>
          <p class="font-body-sm text-body-sm ${p.done ? 'text-primary font-semibold' : p.overdue ? 'text-error' : 'text-on-surface-variant'}">${note}</p>
          ${history ? `<ul class="font-body-sm text-body-sm text-on-surface-variant divide-y divide-slate-100" aria-label="Recent activity">${history}</ul>` : ''}
          <div class="flex flex-wrap items-center gap-space-sm">
            <button type="button" data-action="goal-add-money" data-id="${escapeHtml(g.id)}" class="px-space-lg min-h-[44px] rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md" aria-label="Add or take out money for ${name}">Add or take out</button>
            <button type="button" data-action="goal-edit" data-id="${escapeHtml(g.id)}" class="px-4 min-h-[44px] rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md" aria-label="Edit ${name}">Edit</button>
            <button type="button" data-action="goal-delete" data-id="${escapeHtml(g.id)}" class="px-4 min-h-[44px] rounded-full bg-surface-container hover:bg-error-container hover:text-error text-on-surface-variant font-label-md text-label-md" aria-label="Delete ${name}">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function openGoalModal(id) {
    const goal = id ? goalsList().find(g => g.id === id) : null;
    document.getElementById('goal-modal-title').textContent = goal ? 'Edit goal' : 'New savings goal';
    document.getElementById('goal-modal-error').classList.add('hidden');
    document.getElementById('goal-id').value = goal ? goal.id : '';
    document.getElementById('goal-name').value = goal ? goal.name : '';
    document.getElementById('goal-target').value = goal ? goal.target : '';
    document.getElementById('goal-deadline').value = goal && goal.deadline ? goal.deadline : '';
    const dl = document.getElementById('goal-deadline');
    dl.min = localDateString();
    showModal(document.getElementById('goal-modal'));
    focusSoon(document.getElementById('goal-name'));
  }

  function closeGoalModal() { hideModal(document.getElementById('goal-modal')); }

  async function saveGoal(e) {
    e.preventDefault();
    const id = document.getElementById('goal-id').value;
    const input = {
      name: document.getElementById('goal-name').value,
      target: document.getElementById('goal-target').value,
      deadline: document.getElementById('goal-deadline').value,
    };
    const err = document.getElementById('goal-modal-error');
    const btn = document.getElementById('goal-save');
    btn.disabled = true;
    try {
      if (id) await DataLayer.updateGoal(id, input); else await DataLayer.addGoal(input);
      closeGoalModal();
      reloadFromDataLayer();
      showToast(savedMessage('Goal saved.'), 'success');
    } catch (e2) {
      err.textContent = errorDetail(e2);
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  }

  function setContribKind(kind) {
    document.querySelectorAll('.contrib-kind').forEach(b => setPressed(b, b.dataset.contribKind === kind));
    document.getElementById('contrib-modal-title').textContent = kind === 'withdraw' ? 'Take money out' : 'Add money to goal';
    document.getElementById('contrib-modal').dataset.kind = kind;
  }

  function openContribModal(goalId) {
    const goal = goalsList().find(g => g.id === goalId);
    if (!goal) return;
    document.getElementById('contrib-modal-error').classList.add('hidden');
    document.getElementById('contrib-goal-id').value = goalId;
    document.getElementById('contrib-summary').textContent = `${goal.name}: ${sym()}${formatINR(goal.saved)} of ${sym()}${formatINR(goal.target)} saved.`;
    document.getElementById('contrib-amount').value = '';
    document.getElementById('contrib-note').value = '';
    const date = document.getElementById('contrib-date');
    date.max = localDateString();
    date.value = localDateString();
    setContribKind('add');
    showModal(document.getElementById('contrib-modal'));
    focusSoon(document.getElementById('contrib-amount'));
  }

  function closeContribModal() { hideModal(document.getElementById('contrib-modal')); }

  async function saveContribution(e) {
    e.preventDefault();
    const modal = document.getElementById('contrib-modal');
    const err = document.getElementById('contrib-modal-error');
    const btn = document.getElementById('contrib-save');
    btn.disabled = true;
    try {
      await DataLayer.addContribution(document.getElementById('contrib-goal-id').value, {
        amount: document.getElementById('contrib-amount').value,
        kind: modal.dataset.kind || 'add',
        date: document.getElementById('contrib-date').value,
        note: document.getElementById('contrib-note').value,
      });
      closeContribModal();
      reloadFromDataLayer();
      showToast(savedMessage('Saved.'), 'success');
    } catch (e2) {
      err.textContent = errorDetail(e2);
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  }

  async function handleGoalAction(action, id) {
    if (action === 'goal-edit') return openGoalModal(id);
    if (action === 'goal-add-money') return openContribModal(id);
    const goal = goalsList().find(g => g.id === id);
    if (!goal) return;
    const ok = await confirmDialog({
      title: `Delete "${goal.name}"?`,
      message: `This removes the goal and its history. The ${sym()}${formatINR(goal.saved)} you set aside is not affected, it just stops being tracked here.`,
      confirmLabel: 'Delete goal',
      danger: true,
    });
    if (!ok) return;
    try {
      await DataLayer.deleteGoal(id);
      reloadFromDataLayer();
      showToast(savedMessage('Goal deleted.'), 'info');
    } catch (err) {
      showToast(`Couldn't delete the goal: ${errorDetail(err)}`, 'error');
      reloadFromDataLayer();
    }
  }

  function initGoalEvents() {
    document.getElementById('goal-add')?.addEventListener('click', () => openGoalModal(null));
    document.getElementById('goal-form')?.addEventListener('submit', saveGoal);
    document.getElementById('goal-cancel')?.addEventListener('click', closeGoalModal);
    document.getElementById('goal-modal-close')?.addEventListener('click', closeGoalModal);
    document.getElementById('contrib-form')?.addEventListener('submit', saveContribution);
    document.getElementById('contrib-cancel')?.addEventListener('click', closeContribModal);
    document.getElementById('contrib-modal-close')?.addEventListener('click', closeContribModal);
    document.querySelectorAll('.contrib-kind').forEach(b => b.addEventListener('click', () => setContribKind(b.dataset.contribKind)));
  }

  // ==========================================
  // ANALYTICS: against last month, six-month trend, projection
  // ==========================================
  function renderAnalyticsInsights(year, month, totalSpent) {
    const list = document.getElementById('analytics-compare-list');
    const summary = document.getElementById('analytics-compare-summary');
    if (list) {
      const cmp = BudgetCalculator.categoryComparison(state.expenses, year, month, startDay());
      const allCats = getAllCategories(true);
      const diff = BudgetCalculator.roundMoney(cmp.currentTotal - cmp.previousTotal);
      summary.textContent = cmp.previousTotal === 0
        ? 'Nothing was spent in the month before, so there is nothing to compare with yet.'
        : `${sym()}${formatINR(cmp.currentTotal)} so far against ${sym()}${formatINR(cmp.previousTotal)} last month: ${diff === 0 ? 'the same' : `${sym()}${formatINR(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}`}.`;
      list.innerHTML = cmp.rows.map(r => {
        const cat = allCats[r.id] || UNCATEGORIZED_CATEGORY;
        const up = r.delta > 0;
        const same = r.delta === 0;
        const change = same ? 'No change' : `${up ? '+' : '-'}${sym()}${formatINR(Math.abs(r.delta))}${r.pct === null ? ' (new)' : ` (${Math.abs(r.pct)}%)`}`;
        return `<div class="flex items-center justify-between gap-space-sm py-3">
          <div class="flex items-center gap-space-sm min-w-0">
            <div class="w-8 h-8 rounded-lg ${escapeHtml(cat.iconBgClass || 'bg-surface-container text-primary')} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-lg">${escapeHtml(safeIcon(cat.icon))}</span></div>
            <div class="flex flex-col min-w-0"><span class="font-label-md text-label-md text-on-surface font-bold truncate">${escapeHtml(cat.name)}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">${sym()}${formatINR(r.current)} now, ${sym()}${formatINR(r.previous)} before</span></div>
          </div>
          <span class="font-label-md text-label-md font-bold shrink-0 ${same ? 'text-on-surface-variant' : up ? 'text-error' : 'text-primary'}">${change}</span>
        </div>`;
      }).join('');
    }

    const card = document.getElementById('analytics-projection-card');
    if (card) {
      const proj = BudgetCalculator.projectPeriodEnd(totalSpent, year, month, new Date(), startDay());
      card.classList.toggle('hidden', !proj);
      if (proj) {
        document.getElementById('analytics-projection').textContent = `${sym()}${formatINR(proj.projected)}`;
        document.getElementById('analytics-projection-note').textContent = `At this pace: ${sym()}${formatINR(totalSpent)} in ${proj.daysElapsed} of ${proj.daysTotal} days.`;
        const cap = state.budget?.overallCap || 0;
        const capEl = document.getElementById('analytics-projection-cap');
        if (cap > 0) {
          const over = proj.projected > cap;
          capEl.textContent = over ? `That is ${sym()}${formatINR(proj.projected - cap)} over your ${sym()}${formatINR(cap)} budget.` : `That is ${sym()}${formatINR(cap - proj.projected)} under your ${sym()}${formatINR(cap)} budget.`;
          capEl.className = `font-body-sm text-body-sm font-semibold ${over ? 'text-error' : 'text-primary'}`;
        } else {
          capEl.textContent = '';
        }
      }
    }
  }

  function drawTrendChart(year, month) {
    const canvas = document.getElementById('chart-trend');
    if (!canvas || typeof Chart === 'undefined') return;
    const totals = BudgetCalculator.periodTotals(state.expenses, year, month, 6, startDay());
    const labels = totals.map(t => t.label);
    const data = totals.map(t => t.total);
    if (state.charts.trend) {
      state.charts.trend.data.labels = labels;
      state.charts.trend.data.datasets[0].data = data;
      state.charts.trend.update();
      return;
    }
    state.charts.trend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `Total spent (${sym()})`,
          data,
          borderColor: cssRgb('primary'),
          backgroundColor: cssRgba('primary', 0.15),
          pointBackgroundColor: cssRgb('primary'),
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${sym()}${formatINR(ctx.raw || 0)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cssRgb('on-surface-variant') } },
          y: { beginAtZero: true, grid: { color: cssRgb('surface-container-high') }, ticks: { color: cssRgb('outline'), callback: v => sym() + formatINR(v) } },
        },
      },
    });
  }

  // ==========================================
  // INSTALL AS AN APP, AND UPDATES (see pwa.js)
  // ==========================================
  function initInstall() {
    const card = document.getElementById('install-card');
    const button = document.getElementById('btn-install');
    const text = document.getElementById('install-text');

    const installed = () => (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    const onIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);

    function refresh() {
      if (!card) return;
      if (installed()) { card.classList.add('hidden'); return; }
      if (window.__installPrompt) {
        card.classList.remove('hidden');
        button.classList.remove('hidden');
        text.textContent = 'Add it to your home screen to open it like an app, even without a connection.';
      } else if (onIos()) {
        card.classList.remove('hidden');
        button.classList.add('hidden');
        text.textContent = 'On iPhone or iPad: tap the Share button, then "Add to Home Screen".';
      } else {
        card.classList.add('hidden');
      }
    }

    window.addEventListener('expensetrack:installable', refresh);
    window.addEventListener('expensetrack:installed', () => { refresh(); showToast('ExpenseTrack is installed.', 'success'); });
    button?.addEventListener('click', async () => {
      const prompt = window.__installPrompt;
      if (!prompt) return;
      prompt.prompt();
      try { await prompt.userChoice; } catch (e) { /* dismissed */ }
      window.__installPrompt = null;
      refresh();
    });
    window.addEventListener('expensetrack:update', (e) => {
      showToast('A new version of ExpenseTrack is ready.', 'info', { actionLabel: 'Reload', duration: 20000, onAction: () => e.detail.apply() });
    });
    refresh();
  }

  // ==========================================
  // DELETE ACCOUNT
  // ==========================================
  async function deleteAccountFlow() {
    const ok = await confirmDialog({
      title: 'Delete your account?',
      message: 'This permanently deletes every expense, budget, goal, recurring expense and setting, then removes your sign-in. It cannot be undone. Google will ask you to confirm it is you first.',
      confirmLabel: 'Delete everything',
      danger: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    const btn = document.getElementById('btn-delete-account');
    if (btn) btn.disabled = true;
    try {
      // Confirm the person first, so the data is never deleted by a sign-in that then cannot be removed
      await window.FirebaseService.reauthenticate();
      await DataLayer.deleteAllUserData();
      await window.FirebaseService.deleteAccount();
    } catch (err) {
      if (btn) btn.disabled = false;
      const cancelled = err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request');
      showToast(cancelled ? 'Nothing was deleted: the confirmation was cancelled.' : `Couldn't delete the account: ${errorDetail(err)}`, cancelled ? 'info' : 'error');
      reloadFromDataLayer();
    }
  }

  // ==========================================
  // MODALS (focus trap, Escape, backdrop click, focus return) AND DIALOGS
  // ==========================================
  const openModals = []; // most recent last: { el, opener }

  function closeFnFor(modalEl) {
    const closers = {
      'expense-modal': closeExpenseModal,
      'budget-modal': closeBudgetModal,
      'custom-category-modal': closeCustomCategoryModal,
      'import-modal': closeImportModal,
      'recurring-modal': closeRecurringModal,
      'goal-modal': closeGoalModal,
      'contrib-modal': closeContribModal,
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

  // Toast notifications (short messages at the bottom of the screen)
  function showToast(message, type = 'info', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';

    let bg = 'bg-inverse-surface text-inverse-on-surface';
    let icon = 'info';
    if (type === 'warning') {
      bg = 'bg-tertiary text-on-tertiary';
      icon = 'warning';
    } else if (isError) {
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
      dismissBanner: () => dismissBudgetBanner(),
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
        case 'rec-edit': case 'rec-toggle': case 'rec-delete': handleRecurringAction(actionBtn.getAttribute('data-action'), id); break;
        case 'goal-edit': case 'goal-add-money': case 'goal-delete': handleGoalAction(actionBtn.getAttribute('data-action'), id); break;
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
      } else if (e.target && e.target.matches && e.target.matches('.cap-input')) {
        handleCapInputChange(e.target);
      }
    });

    // Exact amount for a category cap, typed instead of dragged
    async function handleCapInputChange(input) {
      const id = input.dataset.category;
      const check = BudgetCalculator.validateCategoryCap(input.value);
      if (!check.valid) {
        showToast(check.error, 'error');
        reloadFromDataLayer();
        return;
      }
      if (!state.budget.categories) state.budget.categories = {};
      const alertsBefore = currentAlerts();
      state.budget.categories[id] = check.value;
      try {
        await saveBudget();
      } catch (err) {
        showToast(`Couldn't save your budget: ${errorDetail(err)}`, 'error');
        reloadFromDataLayer();
        return;
      }
      syncAllViewsWithData();
      toastNewAlerts(alertsBefore); // a cap lowered below what is already spent warns right away
    }

    // Quick Log: payment method chips (pressing the chosen one again clears it)
    document.getElementById('expense-payment-chips')?.addEventListener('click', e => {
      const chip = e.target.closest('.payment-chip');
      if (!chip) return;
      const current = document.getElementById('expense-payment').value;
      selectPaymentChip(current === chip.dataset.payment ? '' : chip.dataset.payment);
    });

    document.getElementById('overall-cap-input')?.addEventListener('input', updateScaleNote);
    document.getElementById('btn-retry-load')?.addEventListener('click', retryLoad);
    initPreferences();
    initRecurringEvents();
    initGoalEvents();
    initInstall();
    document.getElementById('btn-delete-account')?.addEventListener('click', deleteAccountFlow);
    document.addEventListener('keydown', handleShortcuts);
    initTransactionsEvents();
    if (DataLayer && DataLayer.onSyncChange) DataLayer.onSyncChange(updateSyncIndicator);
    window.addEventListener('online', updateSyncIndicator);
    window.addEventListener('offline', updateSyncIndicator);
    updateSyncIndicator();

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
        const cur = currentPeriod();
        if (state.analyticsYear * 12 + state.analyticsMonth >= cur.year * 12 + cur.month) {
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
  // An initial on the brand black, drawn locally so no name is sent to an avatar service.
  function avatarDataUri(name) {
    const initial = (String(name || 'S').trim().match(/[\p{L}\p{N}]/u) || ['S'])[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0a0a"/>` +
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

      currentUid = user.uid;
      try {
        if (DataLayer && typeof DataLayer.initUser === 'function') {
          await DataLayer.initUser(user.uid);
        }
        loadState();
        // The analytics page starts on the budget month we are in now (which depends on the start day)
        const startPeriod = currentPeriod();
        state.analyticsYear = startPeriod.year;
        state.analyticsMonth = startPeriod.month;
        updateLoadErrorBanner();
        updateSyncIndicator();

        // Synchronize toggle-80 input state with user's settings
        const toggle80 = document.getElementById('toggle-80');
        if (toggle80 && state.settings) {
          toggle80.checked = !!state.settings.notify80;
        }

        applyUserProfile({
          displayName: user.displayName || user.phoneNumber || 'Student',
          email: user.email || user.phoneNumber || 'Signed in with Google',
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
            updateLoadErrorBanner();
          });
        }
      } catch (err) {
        console.error('ExpenseTrack: Error initializing user data:', err);
      } finally {
        hideLoadingOverlay();
        document.body.removeAttribute('data-loading');
        updateLoadErrorBanner();
      }

      promptLegacyImport();
      runRecurringNow(); // add whatever has fallen due since the app was last opened
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
    getAlerts: () => currentAlerts(),
    // Testing aid: the data layer's active change listeners
    getDataListenerCount: () => (DataLayer && DataLayer.getDataListenerCount ? DataLayer.getDataListenerCount() : 0),
  };

  // Bootstrap Application (Never load data before auth resolves)
  document.addEventListener('DOMContentLoaded', () => {
    markCurrencySymbols();
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
