/**
 * ExpenseTrack - Expense tools: dates, search/filter/sort/group for the Transactions page,
 * and CSV export/import. Pure functions, usable in the browser and in Node tests.
 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof root !== 'undefined') {
    root.ExpenseTools = lib;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Wallet', 'Other'];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // ---------- Dates (all local, "YYYY-MM-DD") ----------
  function isoFromParts(y, m, d) {
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function todayISO(now) {
    const n = now || new Date();
    return isoFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }

  function addDaysISO(iso, delta) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  /** 30 Oct 2026 */
  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** "Today", "Yesterday", otherwise 30 Oct 2026 */
  function dayLabel(iso, now) {
    const today = todayISO(now);
    if (iso === today) return 'Today';
    if (iso === addDaysISO(today, -1)) return 'Yesterday';
    return formatDate(iso);
  }

  function monthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  // ---------- Search, filter, sort, group ----------
  function categoryName(categories, id) {
    return (categories && categories[id] && categories[id].name) || 'Uncategorized';
  }

  /**
   * filters: { query, category, payment, from, to, min, max }
   *   payment: a method name, or 'none' for expenses saved without one
   */
  function filterExpenses(expenses, filters, categories) {
    const f = filters || {};
    const tokens = String(f.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const min = f.min === '' || f.min === undefined || f.min === null ? null : Number(f.min);
    const max = f.max === '' || f.max === undefined || f.max === null ? null : Number(f.max);
    return (expenses || []).filter((e) => {
      if (f.category === 'uncategorized') {
        if (categories && categories[e.category]) return false; // only expenses whose category is not a known one
      } else if (f.category && e.category !== f.category) return false;
      if (f.payment === 'none' && e.paymentMethod) return false;
      if (f.payment && f.payment !== 'none' && e.paymentMethod !== f.payment) return false;
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (min !== null && !isNaN(min) && e.amount < min) return false;
      if (max !== null && !isNaN(max) && e.amount > max) return false;
      if (tokens.length) {
        const hay = `${e.note || ''} ${categoryName(categories, e.category)} ${e.paymentMethod || ''} ${e.amount} ${e.date} ${formatDate(e.date)}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }

  function sortExpenses(list, sort) {
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
    const copy = [...list];
    switch (sort) {
      case 'oldest': return copy.sort((a, b) => byDate(a, b) || byCreated(a, b));
      case 'high': return copy.sort((a, b) => b.amount - a.amount || byDate(b, a) || byCreated(b, a));
      case 'low': return copy.sort((a, b) => a.amount - b.amount || byDate(b, a) || byCreated(b, a));
      case 'newest':
      default: return copy.sort((a, b) => byDate(b, a) || byCreated(b, a));
    }
  }

  function summarize(list) {
    return { count: list.length, total: round2(list.reduce((s, e) => s + (Number(e.amount) || 0), 0)) };
  }

  /** Months, then days, each with a subtotal. The list must already be sorted by date. */
  function groupByMonthAndDay(list) {
    const months = [];
    const monthIndex = new Map();
    const dayIndex = new Map();
    list.forEach((e) => {
      const mk = e.date.slice(0, 7);
      if (!monthIndex.has(mk)) {
        const month = { key: mk, label: monthLabel(mk), total: 0, count: 0, days: [] };
        monthIndex.set(mk, month);
        months.push(month);
      }
      const month = monthIndex.get(mk);
      if (!dayIndex.has(e.date)) {
        const day = { date: e.date, total: 0, items: [] };
        dayIndex.set(e.date, day);
        month.days.push(day);
      }
      const day = dayIndex.get(e.date);
      day.items.push(e);
      day.total = round2(day.total + e.amount);
      month.total = round2(month.total + e.amount);
      month.count += 1;
    });
    return months;
  }

  // ---------- CSV ----------
  const CSV_HEADERS = ['Date', 'Amount', 'Category', 'Payment method', 'Note', 'ID'];
  const MAX_IMPORT_ROWS = 5000;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  // A cell that starts with = + - @ would be run as a formula by spreadsheet programs.
  function guardCell(text) {
    const s = String(text === undefined || text === null ? '' : text);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  }

  function unguardCell(text) {
    return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
  }

  function csvField(value) {
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** Excel-friendly CSV: UTF-8 with a byte-order mark, CRLF line ends. */
  function toCSV(expenses, categories) {
    const lines = [CSV_HEADERS.join(',')];
    expenses.forEach((e) => {
      lines.push([
        e.date,
        String(round2(e.amount)),
        guardCell(categoryName(categories, e.category)),
        e.paymentMethod || '',
        guardCell(e.note || ''),
        e.id || '',
      ].map(csvField).join(','));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  function detectDelimiter(text) {
    const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || '';
    let best = ',';
    let bestCount = -1;
    [',', ';', '\t'].forEach((d) => {
      let inQuotes = false;
      let count = 0;
      for (const ch of firstLine) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === d && !inQuotes) count++;
      }
      if (count > bestCount) { best = d; bestCount = count; }
    });
    return best;
  }

  /** RFC 4180 style parser: quotes, doubled quotes, newlines inside quotes. */
  function parseCSV(input) {
    const text = String(input || '').replace(/^﻿/, '');
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"' && field === '') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    if (inQuotes) return { rows: [], delimiter, error: 'A quoted value is never closed. Check the file for a stray quote mark.' };
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return { rows: rows.filter((r) => r.some((c) => c.trim() !== '')), delimiter };
  }

  const COLUMN_ALIASES = {
    date: ['date', 'transaction date', 'txn date', 'day'],
    amount: ['amount', 'amt', 'amount (inr)', 'amount (rs)', 'debit', 'value', 'price'],
    category: ['category', 'cat', 'type'],
    payment: ['payment method', 'payment', 'paid with', 'mode', 'method', 'payment mode'],
    note: ['note', 'notes', 'description', 'merchant', 'memo', 'details', 'narration'],
    id: ['id', 'expense id'],
  };

  function parseImportDate(text) {
    const s = String(text || '').trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) return isoFromParts(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s); // day first, as used in India
    if (m) return isoFromParts(+m[3], +m[2], +m[1]);
    m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]*(\d{4})$/.exec(s);
    if (m) {
      const mi = MONTHS.indexOf(m[2].toLowerCase());
      if (mi >= 0) return isoFromParts(+m[3], mi + 1, +m[1]);
    }
    return null;
  }

  function parseImportAmount(text) {
    const cleaned = String(text || '').replace(/(?:₹|rs\.?|inr)/gi, '').replace(/[\s,]/g, '');
    if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  /**
   * Read a CSV and say what would happen to each row, without saving anything.
   * options: { categories (all, incl. archived), existing (current expenses), resolveCategory(text)->id|null,
   *            validate(input)->{valid,error}, today }
   * Each result row: { line, status: 'ok'|'duplicate'|'invalid', data, errors }
   */
  function prepareImport(text, options) {
    const { categories, existing, resolveCategory, validate } = options;
    if (String(text).length > MAX_IMPORT_BYTES) {
      return { fatal: 'That file is larger than 2 MB. Split it into smaller files.', rows: [], counts: { ok: 0, duplicate: 0, invalid: 0 } };
    }
    const parsed = parseCSV(text);
    if (parsed.error) return { fatal: parsed.error, rows: [], counts: { ok: 0, duplicate: 0, invalid: 0 } };
    if (parsed.rows.length < 2) {
      return { fatal: 'The file has no expenses in it. It needs a header row and at least one data row.', rows: [], counts: { ok: 0, duplicate: 0, invalid: 0 } };
    }
    if (parsed.rows.length - 1 > MAX_IMPORT_ROWS) {
      return { fatal: `The file has more than ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} rows. Split it into smaller files.`, rows: [], counts: { ok: 0, duplicate: 0, invalid: 0 } };
    }

    const header = parsed.rows[0].map((h) => h.trim().toLowerCase());
    const col = {};
    Object.entries(COLUMN_ALIASES).forEach(([key, names]) => {
      const idx = header.findIndex((h) => names.includes(h));
      if (idx >= 0) col[key] = idx;
    });
    const missing = ['date', 'amount', 'category'].filter((k) => col[k] === undefined);
    if (missing.length) {
      return { fatal: `The first row must name these columns: ${missing.map((k) => k[0].toUpperCase() + k.slice(1)).join(', ')}. Found: ${parsed.rows[0].join(', ') || 'nothing'}.`, rows: [], counts: { ok: 0, duplicate: 0, invalid: 0 } };
    }

    // How many of each look-alike already exist: the first N matching rows are duplicates, the rest are new.
    const keyOf = (date, amount, catId, note) => `${date}|${round2(amount).toFixed(2)}|${catId}|${String(note).trim().toLowerCase()}`;
    const remaining = new Map();
    const existingIds = new Set();
    (existing || []).forEach((e) => {
      existingIds.add(e.id);
      const k = keyOf(e.date, e.amount, e.category, e.note || categoryName(categories, e.category));
      remaining.set(k, (remaining.get(k) || 0) + 1);
    });

    const cell = (r, key) => (col[key] === undefined ? '' : String(r[col[key]] === undefined ? '' : r[col[key]]).trim());
    const rows = [];
    const counts = { ok: 0, duplicate: 0, invalid: 0 };

    parsed.rows.slice(1).forEach((r, i) => {
      const line = i + 2; // the spreadsheet row number
      const errors = [];
      const date = parseImportDate(cell(r, 'date'));
      if (!date) errors.push(`Date "${cell(r, 'date')}" is not a date. Use YYYY-MM-DD or DD/MM/YYYY.`);
      const amount = parseImportAmount(cell(r, 'amount'));
      if (isNaN(amount)) errors.push(`Amount "${cell(r, 'amount')}" is not a positive number.`);
      const catText = cell(r, 'category');
      const catId = catText ? resolveCategory(catText) : null;
      if (!catId) errors.push(catText ? `Category "${catText}" does not exist. Create it first or fix the spelling.` : 'Category is empty.');
      let payment = '';
      const payText = cell(r, 'payment');
      if (payText) {
        payment = PAYMENT_METHODS.find((p) => p.toLowerCase() === payText.toLowerCase()) || '';
        if (!payment) errors.push(`Payment method "${payText}" is not one of ${PAYMENT_METHODS.join(', ')}.`);
      }
      const note = unguardCell(cell(r, 'note'));

      if (!errors.length) {
        const check = validate({ amount, date, note, paymentMethod: payment });
        if (!check.valid) errors.push(check.error);
      }
      if (errors.length) {
        counts.invalid++;
        rows.push({ line, status: 'invalid', errors, data: null });
        return;
      }

      const data = { date, amount: round2(amount), category: catId, note, paymentMethod: payment };
      const id = cell(r, 'id');
      const k = keyOf(date, amount, catId, note || categoryName(categories, catId));
      let duplicate = false;
      if (id && existingIds.has(id)) duplicate = true;
      else if ((remaining.get(k) || 0) > 0) { remaining.set(k, remaining.get(k) - 1); duplicate = true; }
      if (duplicate) {
        counts.duplicate++;
        rows.push({ line, status: 'duplicate', errors: [], data });
      } else {
        counts.ok++;
        rows.push({ line, status: 'ok', errors: [], data });
      }
    });

    return { rows, counts };
  }

  return {
    PAYMENT_METHODS,
    CSV_HEADERS,
    MAX_IMPORT_ROWS,
    todayISO,
    addDaysISO,
    formatDate,
    dayLabel,
    monthLabel,
    filterExpenses,
    sortExpenses,
    summarize,
    groupByMonthAndDay,
    toCSV,
    parseCSV,
    parseImportDate,
    parseImportAmount,
    prepareImport,
  };
});
