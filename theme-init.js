/* Runs before the page paints, so a dark-mode user never sees a white flash. */
(function () {
  try {
    var choice = localStorage.getItem('expensetrack_theme') || 'system';
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) { /* storage blocked: stay light */ }
})();