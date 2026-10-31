/* ExpenseTrack text effects: animated letters and numbers.
 *
 *  - Page titles (h1 and [data-fx-title]) are split into letters that rise in one after another,
 *    each time their page is shown.
 *  - Big amounts ([data-fx-num]) settle in with a soft blur whenever their value changes.
 *  - The ExpenseTrack wordmark (.fx-shimmer) gets a slow light sweep (CSS only).
 *
 * Only the presentation changes: an element's text stays exactly the same (textContent is untouched
 * apart from being wrapped in spans), screen readers get the whole word through aria-label, and
 * nothing runs when the person has asked for reduced motion.
 */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // Wrap each letter in a span. Words stay together so a title never breaks in the middle of a word.
  function split(el) {
    if (!el || el.dataset.fxSplit === '1') return;
    if (el.children.length) return; // only plain-text headings
    var text = el.textContent;
    if (!text.trim()) return;
    el.setAttribute('aria-label', text.trim().replace(/\s+/g, ' '));
    el.textContent = '';
    var index = 0;
    text.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
      var word = document.createElement('span');
      word.className = 'fx-word';
      word.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < part.length; i++) {
        var ch = document.createElement('span');
        ch.className = 'fx-ch';
        ch.style.setProperty('--i', String(index++));
        ch.textContent = part[i];
        word.appendChild(ch);
      }
      el.appendChild(word);
    });
    el.dataset.fxSplit = '1';
  }

  // Restart a CSS animation
  function play(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function titlesIn(scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll('h1, [data-fx-title]'));
  }

  function init() {
    var titles = titlesIn(document);
    titles.forEach(split);

    // Play the title of whatever is on screen now
    titles.forEach(function (t) { if (t.offsetParent !== null) play(t, 'fx-play'); });

    // The app keeps the page invisible until the first data arrives: play the titles again when it appears
    if (document.body.hasAttribute('data-loading') && 'MutationObserver' in window) {
      var loadObserver = new MutationObserver(function () {
        if (document.body.getAttribute('data-loading') === 'true') return;
        loadObserver.disconnect();
        titlesIn(document).forEach(function (t) { if (t.offsetParent !== null) play(t, 'fx-play'); });
      });
      loadObserver.observe(document.body, { attributes: true, attributeFilter: ['data-loading'] });
    }

    // App pages (.app-view) are shown by removing "hidden": play their title each time
    var views = document.querySelectorAll('.app-view');
    if (views.length && 'MutationObserver' in window) {
      var viewObserver = new MutationObserver(function (records) {
        records.forEach(function (r) {
          var view = r.target;
          var wasHidden = (r.oldValue || '').split(/\s+/).indexOf('hidden') !== -1;
          if (wasHidden && !view.classList.contains('hidden')) {
            titlesIn(view).forEach(function (t) { split(t); play(t, 'fx-play'); });
          }
        });
      });
      Array.prototype.forEach.call(views, function (v) {
        viewObserver.observe(v, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
      });
    }

    // Big amounts: animate when the value really changes (the app re-renders often with the same value)
    var numbers = document.querySelectorAll('[data-fx-num]');
    if (numbers.length && 'MutationObserver' in window) {
      var last = new WeakMap();
      Array.prototype.forEach.call(numbers, function (el) { last.set(el, el.textContent); });
      var numObserver = new MutationObserver(function (records) {
        var seen = [];
        records.forEach(function (r) {
          var el = r.target.nodeType === 3 ? r.target.parentElement : r.target;
          while (el && !el.hasAttribute('data-fx-num')) el = el.parentElement;
          if (!el || seen.indexOf(el) !== -1) return;
          seen.push(el);
          var value = el.textContent;
          if (value !== last.get(el)) {
            last.set(el, value);
            if (el.offsetParent !== null) play(el, 'fx-num-play');
          }
        });
      });
      Array.prototype.forEach.call(numbers, function (el) {
        numObserver.observe(el, { childList: true, characterData: true, subtree: true });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
