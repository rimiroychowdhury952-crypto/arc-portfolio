// Applies the saved theme before the page draws, to avoid a flash of the wrong theme.
(function () {
  'use strict';
  try {
    if (localStorage.getItem('arc-theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (error) {
    // Storage is blocked. The default dark theme is used.
  }
})();