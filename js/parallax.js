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
      maxTranslateRatio: 0.78,
      /** Сколько «вычитается» из vh на 1px scroll. */
      shrinkPerScroll: 1.8,
      /** Потолок вычитания: max shrink = vh * это (вместе с minHeroFrac / minHeroRem). */
      maxShrinkFrac: 0.86,
      /** Минимальная высота hero: не ниже этой доли vh (0.2 ≈ 20%). */
      minHeroFrac: 0.2,
      /** Абсолютный минимум в rem (от --rem-base на html). */
      minHeroRem: 6.5,
      /** Единая easing-кривая для shrink hero и ухода hero-контента вверх. */
      easePow: 1.75,
    },
    panda: {
      moveRangeVhFrac: 0.32,
      easePow: 2.45,
      maxTyVhMul: 1.72,
      scaleAmp: 1.14,
      fadeStartMoveRangeMul: 1,
      fadeSpanVhFrac: 0.36,
    },
    scroll: {
      durationMs: 760,
      minFactor: 0.045,
      maxFactor: 0.34,
      easePow: 1.9,
      settleTolerancePx: 0.75,
      maxFrames: 120,
    },
  };
  var state = {
    heroHeight: null,
    heroInnerY: null,
    skyY: null,
    grassY: null,
    grassOpacity: '',
    pandaTransform: '',
    pandaOpacity: '',
  };

  var sky = document.querySelector('.page-bg__sky');
  var grass = document.querySelector('.page-bg__grass');
  var pandaSlot = document.querySelector('.page-bg__panda-slot');
  var heroEl = document.querySelector('.hero');
  var heroInner = document.querySelector('.hero__inner');
  var rootStyle = document.documentElement.style;
  var scrollAnimationId = 0;
  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqlMobile =
    window.matchMedia && window.matchMedia('(max-width: 767px)');

  if (reduce) return;

  function smoothstep(t) {
    t = Math.min(1, Math.max(0, t));
    return t * t * (3 - 2 * t);
  }

  function clamp01(t) {
    return Math.min(1, Math.max(0, t));
  }

  function easeIn(t, pow) {
    return Math.pow(clamp01(t), pow);
  }

  function easeOut(t, pow) {
    t = clamp01(t);
    return 1 - Math.pow(1 - t, pow);
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function computeHeroMetrics(y, vh, cfg) {
    var rootPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var minH = Math.max(cfg.minHeroRem * rootPx, vh * cfg.minHeroFrac);
    var maxShrink = Math.min(vh * cfg.maxShrinkFrac, Math.max(0, vh - minH));
    var linearShrink = Math.min(Math.max(0, y * cfg.shrinkPerScroll), maxShrink);
    var progress = maxShrink > 0 ? linearShrink / maxShrink : 0;
    var easedProgress = easeIn(progress, cfg.easePow);
    var shrink = maxShrink * easedProgress;
    return {
      height: Math.round(Math.max(minH, vh - shrink)),
      progress: progress,
      easedProgress: easedProgress,
    };
  }

  function computeHeroExitScrollY(vh, cfg) {
    var low = 0;
    var high = vh * 2;
    var i = 0;

    for (; i < 20; i += 1) {
      var mid = (low + high) / 2;
      var diff = computeHeroMetrics(mid, vh, cfg).height - mid;
      if (diff > 0) low = mid;
      else high = mid;
    }

    return Math.round(high);
  }

  /**
   * Только высота hero от scrollY — без scrollTo на каждом кадре.
   * scrollTo при непрерывном скролле дрался с трекпадом/инерцией и сдвигал scrollY
   * после расчёта панды → дрожание.
   */
  function updateHeroHeight(heroH) {
    if (state.heroHeight === heroH) return;
    state.heroHeight = heroH;
    var heroHeightValue = heroH + 'px';
    if (heroEl) heroEl.style.height = heroHeightValue;
    rootStyle.setProperty('--hero-block-h', heroHeightValue);
    rootStyle.setProperty('--hero-block-h-fixed', heroHeightValue);
  }

  function updateHeroInner(progress, vh, cfg) {
    if (!heroInner) return;
    var cap = vh * cfg.maxTranslateRatio;
    var t = -(cap * progress);
    var translateY = Math.round(t);
    if (state.heroInnerY === translateY) return;
    state.heroInnerY = translateY;
    heroInner.style.transform = 'translate3d(0,' + translateY + 'px,0)';
  }

  function updateSkyGrass(y, heroVisible) {
    var skyY = Math.round(y * CONFIG.skyYPerScroll);
    var grassY = Math.round(y * CONFIG.grassYPerScroll);
    var grassOpacityValue = heroVisible ? '1' : '0';

    if (sky && state.skyY !== skyY) {
      state.skyY = skyY;
      sky.style.transform = 'translate3d(0,' + skyY + 'px,0)';
    }

    if (grass && state.grassY !== grassY) {
      state.grassY = grassY;
      grass.style.transform = 'translate3d(0,' + grassY + 'px,0)';
    }

    if (grass && state.grassOpacity !== grassOpacityValue) {
      state.grassOpacity = grassOpacityValue;
      grass.style.opacity = grassOpacityValue;
    }
  }

  /**
   * Опорная высота — vh, не hero.offsetHeight (hero сжимается и даёт джиттер).
   */
  function updatePanda(scrollY, vh, cfg, heroVisible) {
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
    var ty = Math.round(e * maxTy);

    var fadeStart = moveRange * cfg.fadeStartMoveRangeMul;
    var fadeSpan = hRef * cfg.fadeSpanVhFrac;
    var opacity = 1;
    if (scrollY > fadeStart && fadeSpan > 0) {
      var fu = (scrollY - fadeStart) / fadeSpan;
      opacity = 1 - smoothstep(Math.min(1, Math.max(0, fu)));
    }

    var translate = isMobile
      ? 'translate3d(-50%, ' + ty + 'px, 0) '
      : 'translate3d(0,' + ty + 'px, 0) ';
    var transform = translate + 'scale(' + scale.toFixed(4) + ')';
    var opacityValue = heroVisible ? String(opacity) : '0';

    if (state.pandaTransform !== transform) {
      state.pandaTransform = transform;
      pandaSlot.style.transform = transform;
    }

    if (state.pandaOpacity !== opacityValue) {
      state.pandaOpacity = opacityValue;
      pandaSlot.style.opacity = opacityValue;
    }
  }

  function frame() {
    var vh = window.innerHeight || 1;
    var y = window.scrollY || window.pageYOffset;
    var heroExitY = computeHeroExitScrollY(vh, CONFIG.hero);
    var heroVisible = y < heroExitY;
    var effectY = heroVisible ? y : heroExitY;
    var heroH = 0;
    var heroProgress = 0;

    if (heroEl) {
      var heroMetrics = computeHeroMetrics(effectY, vh, CONFIG.hero);
      heroH = heroMetrics.height;
      heroProgress = heroMetrics.easedProgress;
      updateHeroHeight(heroH);
    }

    if (heroEl) updateHeroInner(heroProgress, vh, CONFIG.hero);
    updateSkyGrass(effectY, heroVisible);
    updatePanda(effectY, vh, CONFIG.panda, heroVisible);
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
  if (grass) grass.style.willChange = 'transform, opacity';
  if (pandaSlot) pandaSlot.style.willChange = 'transform, opacity';

  if (mqlMobile) {
    if (mqlMobile.addEventListener) mqlMobile.addEventListener('change', frame);
    else if (mqlMobile.addListener) mqlMobile.addListener(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', cancelTargetScrollFromUserInput, { passive: true });
  window.addEventListener('touchstart', cancelTargetScrollFromUserInput, {
    passive: true,
  });
  window.addEventListener('pointerdown', cancelTargetScrollFromUserInput, {
    passive: true,
  });
  window.addEventListener('keydown', cancelTargetScrollFromUserInput);
  window.addEventListener('resize', frame, { passive: true });
  frame();

  function getScrollY() {
    return window.scrollY || window.pageYOffset || 0;
  }

  function cancelTargetScroll() {
    if (!scrollAnimationId) return;
    cancelAnimationFrame(scrollAnimationId);
    scrollAnimationId = 0;
  }

  function isScrollInterruptKey(e) {
    var key = e.key;
    return (
      key === 'ArrowDown' ||
      key === 'ArrowUp' ||
      key === 'PageDown' ||
      key === 'PageUp' ||
      key === 'Home' ||
      key === 'End' ||
      key === ' ' ||
      key === 'Spacebar'
    );
  }

  function cancelTargetScrollFromUserInput(e) {
    if (!scrollAnimationId) return;
    if (e.type === 'keydown' && !isScrollInterruptKey(e)) return;
    cancelTargetScroll();
  }

  function scrollToDocumentY(topPx) {
    var y = Math.max(0, Math.round(topPx));
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo({ left: 0, top: y, behavior: 'auto' });
    html.style.scrollBehavior = prev;
  }

  function resolveTargetViewportTop(target, options) {
    var vh = window.innerHeight || 1;
    if (options && typeof options.targetTopPx === 'number') {
      return options.targetTopPx;
    }
    if (options && typeof options.targetTopVh === 'number') {
      return (vh * options.targetTopVh) / 100;
    }
    return 0;
  }

  function scrollTargetIntoViewSmooth(target, options) {
    if (!target) return;
    /**
     * Hero меняет высоту во время scroll, поэтому ведём анимацию по фактическому rect target
     * и на каждом кадре пересчитываем координату, пока не попадём в нужную точку.
     */
    cancelTargetScroll();

    var frameCount = 0;
    var desiredTop = resolveTargetViewportTop(target, options);
    var scrollCfg = CONFIG.scroll;
    var durationMs =
      options && typeof options.durationMs === 'number'
        ? options.durationMs
        : scrollCfg.durationMs;
    var startedAt = 0;
    var prevDelta = null;

    function step(now) {
      if (!startedAt) startedAt = now;
      frameCount += 1;

      var currentY = getScrollY();
      var delta = target.getBoundingClientRect().top - desiredTop;
      var deltaAbs = Math.abs(delta);
      if (deltaAbs <= scrollCfg.settleTolerancePx) {
        scrollAnimationId = 0;
        frame();
        return;
      }

      if (
        prevDelta !== null &&
        delta * prevDelta < 0 &&
        deltaAbs < 6 &&
        Math.abs(prevDelta) < 6
      ) {
        scrollAnimationId = 0;
        frame();
        return;
      }

      if (frameCount >= scrollCfg.maxFrames) {
        scrollAnimationId = 0;
        frame();
        return;
      }

      var progress = durationMs > 0 ? (now - startedAt) / durationMs : 1;
      var easedProgress = easeIn(progress, scrollCfg.easePow);
      var factor = mix(scrollCfg.minFactor, scrollCfg.maxFactor, easedProgress);

      if (deltaAbs < 48) factor = Math.min(factor, 0.24);
      if (deltaAbs < 24) factor = Math.min(factor, 0.18);
      if (deltaAbs < 10) factor = Math.min(factor, 0.12);

      var nextY = currentY + delta * factor;
      if (Math.round(nextY) === Math.round(currentY)) {
        nextY = currentY + (delta > 0 ? 1 : -1);
      }

      scrollToDocumentY(nextY);
      prevDelta = delta;
      frame();
      scrollAnimationId = requestAnimationFrame(step);
    }
    scrollAnimationId = requestAnimationFrame(step);
  }

  function queryScrollTarget(selector) {
    return selector && selector.charAt(0) === '#' ? document.querySelector(selector) : null;
  }

  var heroCta = document.querySelector('a.hero-cta[href^="#"]');
  if (heroCta) {
    heroCta.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof window.QUIZ_START_FROM_HERO === 'function') {
        window.QUIZ_START_FROM_HERO();
        return;
      }
      var href = heroCta.getAttribute('href') || '';
      var targetSelector = heroCta.getAttribute('data-scroll-target') || href;
      var target = queryScrollTarget(targetSelector) || queryScrollTarget(href);
      scrollTargetIntoViewSmooth(target, { targetTopPx: 0 });
    });
  }

  window.QUIZ_SCROLL_TO_TARGET = scrollTargetIntoViewSmooth;
  window.QUIZ_SCROLL_PARALLAX_CONFIG = CONFIG;
})();
