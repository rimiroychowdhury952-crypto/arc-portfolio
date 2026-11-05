// ARC Portfolio - Deferred Three.js loader
(function () {
  'use strict';

  const container = document.getElementById('hero-3d-container');

  if (!container) return;

  let started = false;

  function loadHero3D() {
    if (started) return;
    started = true;

    import('./hero3d.js').catch(function (error) {
      console.error('ARC 3D loading failed:', error);
      container.classList.add('hero-3d-unavailable');
    });
  }

  function scheduleLoad() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadHero3D, { timeout: 1500 });
    } else {
      window.setTimeout(loadHero3D, 300);
    }
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        scheduleLoad();
      }
    }, {
      rootMargin: '400px 0px'
    });

    observer.observe(container);
  } else {
    scheduleLoad();
  }
})();