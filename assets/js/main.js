// ARC portfolio - mobile menu, theme toggle, active nav link
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Mobile menu ---------- */
  var topbar = document.querySelector('.topbar');
  var menuButton = document.querySelector('.menu-btn');
  var nav = document.getElementById('topbar-nav');

  function setMenuOpen(open) {
    topbar.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  if (topbar && menuButton && nav) {
    menuButton.addEventListener('click', function () {
      setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) { setMenuOpen(false); }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        setMenuOpen(false);
        menuButton.focus();
      }
    });
  }

  /* ---------- Theme toggle (dark is the default) ---------- */
  var themeButton = document.querySelector('.theme-toggle');

  function applyTheme(theme) {
    var isLight = theme === 'light';
    if (isLight) {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    if (themeButton) {
      themeButton.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    }
  }

  if (themeButton) {
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    themeButton.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try {
        localStorage.setItem('arc-theme', next);
      } catch (error) {
        // Storage is blocked. The theme still changes for this visit.
      }
    });
  }

  /* ---------- Active nav link follows the scroll position ---------- */
  var navLinks = document.querySelectorAll('.sidebar__nav a[href^="#"], .topbar__nav a[href^="#"]');
  var sections = [];

  navLinks.forEach(function (link) {
    var section = document.getElementById(link.getAttribute('href').slice(1));
    if (section && sections.indexOf(section) === -1) { sections.push(section); }
  });

  // Keep the sections in the order they appear on the page
  sections.sort(function (a, b) {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  });

  function setActive(id) {
    navLinks.forEach(function (link) {
      if (link.getAttribute('href') === '#' + id) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  var ticking = false;

  function updateActive() {
    ticking = false;
    if (!sections.length) { return; }

    // The active section is the last one whose top edge is above 35% of the screen
    var line = window.innerHeight * 0.35;
    var current = sections[0];
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= line) { current = section; }
    });

    // At the very bottom of the page, the last section is active
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1];
    }
    setActive(current.id);
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateActive);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateActive();
})();