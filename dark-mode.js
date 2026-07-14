
/**
 * dark-mode.js — My Care ERP
 * Include in every page alongside notifications.js.
 * Reads saved preference from localStorage on load (no flash).
 * Exposes window.toggleTheme() for the nav toggle button.
 * Toggle button must have id="themeToggle" in the page nav.
 */
(function () {
  'use strict';
 
  function applyTheme(mode) {
    var isDark = mode === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.innerText = isDark ? '☀️' : '🌙';
      btn.title     = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }
  }
 
  // Apply immediately before first paint — prevents flash of wrong theme
  var saved = localStorage.getItem('ERP_THEME') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
 
  // Update button text once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyTheme(saved); });
  } else {
    applyTheme(saved);
  }
 
  // Global function called by the toggle button in every page nav
  window.toggleTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next    = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ERP_THEME', next);
    applyTheme(next);
  };
 
}());
 
