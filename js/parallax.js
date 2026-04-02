/**
 * Скролл-параллакс: один requestAnimationFrame на кадр при scroll/resize, настройки в CONFIG.
 * Панда не использует живую высоту hero (она сжимается) — только vh, иначе дрожание.
 */
(function () {
  'use strict';

  var CONFIG = {
    skyYPerScroll: -0.1,
    grassYPerScroll: 2,
    hero: {
      innerSpeed: 1.56,
      maxTranslateRatio: 0.78,
      /** Сколько «вычитается» из vh на 1px скролла — больше = hero сжимается быстрее. */
      shrinkPerScroll: 0.9,
      /** Потолок вычитания: max shrink = vh * это (вместе с minHeroFrac / minHeroRem). */
      maxShrinkFrac: 0.86,
      /** Минимальная высота hero: не ниже этой доли vh (0.2 ≈ 20%). */
      minHeroFrac: 0.2,
      /** Абсолютный минимум в rem (от --rem-base на html). */
      minHeroRem: 6.5,
    },
    panda: {
      moveRangeVhFrac: 0.38,
      easePow: 2.45,
      maxTyVhMul: 1.96,
      scaleAmp: 0.92,
      horizBaseHMul: 0.16,
      horizBaseVhMul: 0.035,
      horizCoeff: 0.045,
      horizMobileScale: 0.72,
      fadeStartMoveRangeMul: 1,
      fadeSpanVhFrac: 0.36,
    },
  };

  var sky = document.querySelector('.page-bg__sky');
  var grass = document.querySelector('.page-bg__grass');
  var pandaSlot = document.querySelector('.page-bg__panda-slot');
  var heroEl = document.querySelector('.hero');
  var heroInner = document.querySelector('.hero__inner');
  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqlMobile =
    window.matchMedia && window.matchMedia('(max-width: 767px)');

  if (reduce) return;

  function smoothstep(t) {
    t = Math.min(1, Math.max(0, t));
    return t * t * (3 - 2 * t);
  }

  function easeOut(t, pow) {
    t = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - t, pow);
  }

  function computeHeroH(y, vh, cfg) {
    var shrink = Math.min(y * cfg.shrinkPerScroll, vh * cfg.maxShrinkFrac);
    var rootPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var minH = Math.max(cfg.minHeroRem * rootPx, vh * cfg.minHeroFrac);
    return Math.round(Math.max(minH, vh - shrink));
  }

  /**
   * Только высота hero от scrollY — без scrollTo на каждом кадре.
   * scrollTo при непрерывном скролле дрался с трекпадом/инерцией и сдвигал scrollY
   * после расчёта панды → дрожание.
   */
  function updateHeroHeight(hero, y, vh, cfg) {
    var heroH = computeHeroH(y, vh, cfg);
    hero.style.height = heroH + 'px';
    document.documentElement.style.setProperty('--hero-block-h', heroH + 'px');
    document.documentElement.style.setProperty('--hero-block-h-fixed', heroH + 'px');
  }

  function updateHeroInner(y, hero, cfg) {
    if (!heroInner) return;
    var cap = hero.offsetHeight * cfg.maxTranslateRatio;
    var t = -Math.min(y * cfg.innerSpeed, cap);
    heroInner.style.transform = 'translate3d(0,' + Math.round(t) + 'px,0)';
  }

  function updateSkyGrass(y) {
    if (sky) sky.style.transform = 'translate3d(0,' + Math.round(y * CONFIG.skyYPerScroll) + 'px,0)';
    if (grass) grass.style.transform = 'translate3d(0,' + Math.round(y * CONFIG.grassYPerScroll) + 'px,0)';
  }

  /**
   * Опорная высота — vh, не hero.offsetHeight (hero сжимается и даёт джиттер).
   */
  function updatePanda(scrollY, vh, cfg) {
    if (!pandaSlot) return;
    var isMobile = mqlMobile && mqlMobile.matches;
    var hRef = vh;
    var moveRange = hRef * cfg.moveRangeVhFrac;
    var sm = moveRange > 0 ? scrollY / moveRange : 0;
    if (sm > 1) sm = 1;
    var e = easeOut(sm, cfg.easePow);

    var maxTy = hRef * cfg.maxTyVhMul;
    var scaleGrow = cfg.scaleAmp * e;
    var scale = 1 + scaleGrow;
    var horizBase =
      (hRef * cfg.horizBaseHMul + vh * cfg.horizBaseVhMul) *
      (isMobile ? cfg.horizMobileScale : 1);
    var tx = Math.round(-cfg.horizCoeff * scaleGrow * horizBase);
    var ty = Math.round(e * maxTy);

    var fadeStart = moveRange * cfg.fadeStartMoveRangeMul;
    var fadeSpan = hRef * cfg.fadeSpanVhFrac;
    var opacity = 1;
    if (scrollY > fadeStart && fadeSpan > 0) {
      var fu = (scrollY - fadeStart) / fadeSpan;
      opacity = 1 - smoothstep(Math.min(1, Math.max(0, fu)));
    }

    var translate = isMobile
      ? 'translate3d(calc(-50% + ' + tx + 'px), ' + ty + 'px, 0) '
      : 'translate3d(' + tx + 'px,' + ty + 'px, 0) ';
    pandaSlot.style.transform = translate + 'scale(' + scale.toFixed(4) + ')';
    pandaSlot.style.opacity = String(opacity);
  }

  function frame() {
    var vh = window.innerHeight || 1;
    var y = window.scrollY || window.pageYOffset;

    if (heroEl) {
      updateHeroHeight(heroEl, y, vh, CONFIG.hero);
    }

    y = window.scrollY || window.pageYOffset;
    if (heroEl) updateHeroInner(y, heroEl, CONFIG.hero);
    updateSkyGrass(y);
    updatePanda(y, vh, CONFIG.panda);
  }

  var ticking = false;
  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        frame();
      });
    }
  }

  if (heroInner) heroInner.style.willChange = 'transform';
  if (heroEl) heroEl.style.willChange = 'height';
  if (sky) sky.style.willChange = 'transform';
  if (grass) grass.style.willChange = 'transform';
  if (pandaSlot) pandaSlot.style.willChange = 'transform, opacity';

  if (mqlMobile) {
    if (mqlMobile.addEventListener) mqlMobile.addEventListener('change', frame);
    else if (mqlMobile.addListener) mqlMobile.addListener(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', frame, { passive: true });
  frame();

  /**
   * Скролл без анимации: при html { scroll-behavior: smooth } и «auto» у scrollIntoView
   * браузер всё равно крутит плавно — временно гасим на время scrollTo.
   */
  function scrollToDocumentYInstant(topPx) {
    var y = Math.max(0, Math.round(topPx));
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo({ left: 0, top: y, behavior: 'auto' });
    html.style.scrollBehavior = prev;
  }

  var heroCta = document.querySelector('a.hero-cta[href="#page-content-inner"]');
  if (heroCta) {
    heroCta.addEventListener('click', function (e) {
      e.preventDefault();
      var href = heroCta.getAttribute('href') || '';
      var target = href.charAt(0) === '#' ? document.querySelector(href) : null;
      if (!target) return;
      var top =
        target.getBoundingClientRect().top +
        (window.scrollY || window.pageYOffset || 0);
      scrollToDocumentYInstant(top);
    });
  }

  window.QUIZ_SCROLL_PARALLAX_CONFIG = CONFIG;
})();
