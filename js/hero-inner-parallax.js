(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  var inner = document.querySelector('.hero__inner');
  if (!hero || !inner) return;

  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  /**
   * Доля скролла страницы: inner сдвигается вверх сильнее, чем движется hero
   * (эффект «быстрее уходит вверх»).
   */
  var SPEED = 0.36;

  /** Ограничение сдвига (px), чтобы не уезжать бесконечно при длинной странице */
  var MAX_TRANSLATE_RATIO = 0.52;

  function tick() {
    var y = window.scrollY || window.pageYOffset;
    var h = hero.offsetHeight || 1;
    var cap = Math.min(h * MAX_TRANSLATE_RATIO, 240);
    var t = -Math.min(y * SPEED, cap);
    inner.style.transform = 'translate3d(0,' + t + 'px,0)';
  }

  var ticking = false;
  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () {
        tick();
        ticking = false;
      });
    }
  }

  inner.style.willChange = 'transform';

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', tick, { passive: true });
  tick();
})();
