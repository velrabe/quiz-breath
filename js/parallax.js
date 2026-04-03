/**
 * Скролл-параллакс: один requestAnimationFrame на кадр при scroll/resize, настройки в CONFIG.
 * Панда не использует живую высоту hero (она сжимается) — только vh, иначе дрожание.
 */
(function () {
  'use strict';

  var CONFIG = {
    skyYPerScroll: -0.1,
    grassYPerScroll: 2,
    background: {
      baseScale: 1.1,
      pointerEase: 0.08,
      pointerSettleThreshold: 0.0008,
    },
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
      baseScale: 1.1,
      moveRangeVhFrac: 0.32,
      easePow: 2.45,
      maxTyVhMul: 1.72,
      scaleAmp: 1.14,
      pointerShiftFrac: 0.05,
      fadeStartMoveRangeMul: 1,
      fadeSpanVhFrac: 0.36,
    },
    mobileSnap: {
      minSwipePx: 18,
      minScrollPx: 32,
      switchSwipePx: 42,
      switchScrollPx: 90,
      snapZoneBelowPageContentVhFrac: 0.18,
      durationMs: 460,
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
    skyTransform: '',
    grassTransform: '',
    grassOpacity: '',
    pandaTransform: '',
    pandaOpacity: '',
    pointerTargetX: 0,
    pointerTargetY: 0,
    pointerCurrentX: 0,
    pointerCurrentY: 0,
    heroTouchActive: false,
    heroTouchStartX: 0,
    heroTouchStartY: 0,
    heroTouchLastX: 0,
    heroTouchLastY: 0,
    heroTouchStartScrollY: 0,
  };

  var sky = document.querySelector('.page-bg__sky');
  var grass = document.querySelector('.page-bg__grass');
  var pandaSlot = document.querySelector('.page-bg__panda-slot');
  var pageContent = document.getElementById('page-content');
  var quizStage = document.getElementById('quiz-stage');
  var introScreen = document.getElementById('screen-intro');
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

  function isMobileViewport() {
    return Boolean(mqlMobile && mqlMobile.matches);
  }

  function computeHeroMetrics(y, vh, cfg) {
    if (isMobileViewport()) {
      return {
        height: Math.round(vh),
        progress: 0,
        easedProgress: 0,
      };
    }
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

  function updatePointerMotion() {
    var cfg = CONFIG.background;
    var dx = state.pointerTargetX - state.pointerCurrentX;
    var dy = state.pointerTargetY - state.pointerCurrentY;
    var moving =
      Math.abs(dx) > cfg.pointerSettleThreshold ||
      Math.abs(dy) > cfg.pointerSettleThreshold;

    if (!moving) {
      state.pointerCurrentX = state.pointerTargetX;
      state.pointerCurrentY = state.pointerTargetY;
      return false;
    }

    state.pointerCurrentX += dx * cfg.pointerEase;
    state.pointerCurrentY += dy * cfg.pointerEase;
    return true;
  }

  function getBackgroundPointerShift(node, pointerValue, axis) {
    if (!node) return 0;
    var size = getNodeBaseSize(node, axis);
    var halfOverflow = getHalfOverflow(size, CONFIG.background.baseScale);
    return -pointerValue * halfOverflow;
  }

  function getNodeBaseSize(node, axis) {
    if (!node) return 0;
    var size =
      axis === 'x'
        ? node.offsetWidth || node.clientWidth
        : node.offsetHeight || node.clientHeight;

    if (size) return size;

    var rect = node.getBoundingClientRect();
    return axis === 'x' ? rect.width : rect.height;
  }

  function getHalfOverflow(size, scale) {
    if (!size || !scale || scale <= 1) return 0;
    return size * ((scale - 1) * 0.5);
  }

  function getPointerShiftWithinScale(node, pointerValue, axis, scale, frac) {
    if (!node) return 0;
    var size = getNodeBaseSize(node, axis);
    var halfOverflow = getHalfOverflow(size, scale);
    return -pointerValue * Math.min(halfOverflow, size * frac);
  }

  function getPandaConfig() {
    if (!isMobileViewport()) return CONFIG.panda;
    return {
      baseScale: 1.18,
      moveRangeVhFrac: 0.44,
      easePow: 2.2,
      maxTyVhMul: 2.15,
      scaleAmp: 4.15,
      pointerShiftFrac: 0.05,
      fadeStartMoveRangeMul: 1.18,
      fadeSpanVhFrac: 0.62,
    };
  }

  function updateSkyGrass(y, heroVisible) {
    var skyY = Math.round(y * CONFIG.skyYPerScroll);
    var grassY = Math.round(y * CONFIG.grassYPerScroll);
    var grassOpacityValue = heroVisible ? '1' : '0';
    var scaleValue = CONFIG.background.baseScale.toFixed(3);
    var skyShiftX = getBackgroundPointerShift(sky, state.pointerCurrentX, 'x');
    var skyShiftY = getBackgroundPointerShift(sky, state.pointerCurrentY, 'y');
    var grassShiftX = getBackgroundPointerShift(grass, state.pointerCurrentX, 'x');
    var grassShiftY = getBackgroundPointerShift(grass, state.pointerCurrentY, 'y');
    var skyTransform =
      'translate3d(' +
      skyShiftX.toFixed(2) +
      'px,' +
      (skyY + skyShiftY).toFixed(2) +
      'px,0) scale(' +
      scaleValue +
      ')';
    var grassTransform =
      'translate3d(' +
      grassShiftX.toFixed(2) +
      'px,' +
      (grassY + grassShiftY).toFixed(2) +
      'px,0) scale(' +
      scaleValue +
      ')';

    if (sky && state.skyTransform !== skyTransform) {
      state.skyTransform = skyTransform;
      sky.style.transform = skyTransform;
    }

    if (grass && state.grassTransform !== grassTransform) {
      state.grassTransform = grassTransform;
      grass.style.transform = grassTransform;
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
    var hRef = vh;
    var moveRange = hRef * cfg.moveRangeVhFrac;
    var sm = moveRange > 0 ? scrollY / moveRange : 0;
    if (sm > 1) sm = 1;
    var e = easeOut(sm, cfg.easePow);

    var maxTy = hRef * cfg.maxTyVhMul;
    var scaleGrow = cfg.scaleAmp * e;
    var scale = cfg.baseScale + scaleGrow;
    var pointerX = getPointerShiftWithinScale(
      pandaSlot,
      state.pointerCurrentX,
      'x',
      scale,
      cfg.pointerShiftFrac
    );
    var pointerY = getPointerShiftWithinScale(
      pandaSlot,
      state.pointerCurrentY,
      'y',
      scale,
      cfg.pointerShiftFrac
    );
    var tx = Math.round(pointerX);
    var ty = Math.round(e * maxTy + pointerY);

    var fadeStart = moveRange * cfg.fadeStartMoveRangeMul;
    var fadeSpan = hRef * cfg.fadeSpanVhFrac;
    var opacity = 1;
    if (scrollY > fadeStart && fadeSpan > 0) {
      var fu = (scrollY - fadeStart) / fadeSpan;
      opacity = 1 - smoothstep(Math.min(1, Math.max(0, fu)));
    }

    var translate = 'translate3d(' + tx + 'px,' + ty + 'px, 0) ';
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
    var isMobile = isMobileViewport();
    var pointerMoving = updatePointerMotion();
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

    if (heroEl) updateHeroInner(isMobile ? 0 : heroProgress, vh, CONFIG.hero);
    updateSkyGrass(effectY, heroVisible);
    updatePanda(effectY, vh, getPandaConfig(), heroVisible);
    return pointerMoving;
  }

  var frameScheduled = false;
  function runFrame() {
    frameScheduled = false;
    if (frame()) scheduleFrame();
  }

  function scheduleFrame() {
    if (frameScheduled) return;
    frameScheduled = true;
    requestAnimationFrame(runFrame);
  }

  if (heroInner) heroInner.style.willChange = 'transform';
  if (heroEl) heroEl.style.willChange = 'height';
  if (sky) sky.style.willChange = 'transform';
  if (grass) grass.style.willChange = 'transform, opacity';
  if (pandaSlot) pandaSlot.style.willChange = 'transform, opacity';

  if (mqlMobile) {
    if (mqlMobile.addEventListener) {
      mqlMobile.addEventListener('change', function () {
        state.pointerTargetX = 0;
        state.pointerTargetY = 0;
        scheduleFrame();
      });
    } else if (mqlMobile.addListener) {
      mqlMobile.addListener(function () {
        state.pointerTargetX = 0;
        state.pointerTargetY = 0;
        scheduleFrame();
      });
    }
  }

  window.addEventListener('scroll', scheduleFrame, { passive: true });
  window.addEventListener(
    'pointermove',
    function (e) {
      if (!e || e.pointerType === 'touch') return;
      if (mqlMobile && mqlMobile.matches) return;
      var vw = window.innerWidth || 1;
      var vh = window.innerHeight || 1;
      state.pointerTargetX = clamp01(e.clientX / vw) * 2 - 1;
      state.pointerTargetY = clamp01(e.clientY / vh) * 2 - 1;
      scheduleFrame();
    },
    { passive: true }
  );
  window.addEventListener(
    'pointerleave',
    function () {
      state.pointerTargetX = 0;
      state.pointerTargetY = 0;
      scheduleFrame();
    },
    { passive: true }
  );
  window.addEventListener(
    'blur',
    function () {
      state.pointerTargetX = 0;
      state.pointerTargetY = 0;
      scheduleFrame();
    },
    { passive: true }
  );
  window.addEventListener('wheel', cancelTargetScrollFromUserInput, { passive: true });
  window.addEventListener('touchstart', cancelTargetScrollFromUserInput, {
    passive: true,
  });
  window.addEventListener('touchstart', handleHeroTouchStart, { passive: true });
  window.addEventListener('touchmove', handleHeroTouchMove, { passive: true });
  window.addEventListener(
    'touchend',
    function () {
      requestAnimationFrame(maybeSnapHeroToPageContent);
    },
    { passive: true }
  );
  window.addEventListener(
    'touchcancel',
    function () {
      state.heroTouchActive = false;
    },
    { passive: true }
  );
  window.addEventListener('pointerdown', cancelTargetScrollFromUserInput, {
    passive: true,
  });
  window.addEventListener('keydown', cancelTargetScrollFromUserInput);
  window.addEventListener('resize', scheduleFrame, { passive: true });
  scheduleFrame();

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

  function canUseMobileHeroSnap() {
    return Boolean(
      mqlMobile &&
        mqlMobile.matches &&
        heroEl &&
        pageContent &&
        introScreen &&
        !introScreen.hidden
    );
  }

  function getMobileSnapMaxY(vh) {
    var snapWindow = Math.round(vh * CONFIG.mobileSnap.snapZoneBelowPageContentVhFrac);
    return getPageContentScrollY() + snapWindow;
  }

  function getPageContentScrollY() {
    if (!pageContent) return 0;
    return Math.max(
      0,
      Math.round(pageContent.getBoundingClientRect().top + getScrollY())
    );
  }

  function getNearestSnapIndex(points, y) {
    if (!points || !points.length) return 0;
    var nearestIndex = 0;
    var nearestDistance = Math.abs(points[0] - y);
    var i = 1;
    for (; i < points.length; i += 1) {
      var distance = Math.abs(points[i] - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    return nearestIndex;
  }

  function handleHeroTouchStart(e) {
    if (!canUseMobileHeroSnap()) return;
    if (!e.touches || e.touches.length !== 1) return;
    var vh = window.innerHeight || 1;
    var heroExitY = computeHeroExitScrollY(vh, CONFIG.hero);
    var maxSnapY = getMobileSnapMaxY(vh);
    var y = getScrollY();
    if (y < 0 || y > maxSnapY || y >= heroExitY + Math.round(vh * 0.5)) {
      state.heroTouchActive = false;
      return;
    }

    state.heroTouchActive = true;
    state.heroTouchStartX = e.touches[0].clientX;
    state.heroTouchStartY = e.touches[0].clientY;
    state.heroTouchLastX = e.touches[0].clientX;
    state.heroTouchLastY = e.touches[0].clientY;
    state.heroTouchStartScrollY = y;
  }

  function handleHeroTouchMove(e) {
    if (!state.heroTouchActive) return;
    if (!e.touches || e.touches.length !== 1) return;
    state.heroTouchLastX = e.touches[0].clientX;
    state.heroTouchLastY = e.touches[0].clientY;
  }

  function maybeSnapHeroToPageContent() {
    if (!state.heroTouchActive || !canUseMobileHeroSnap()) {
      state.heroTouchActive = false;
      return;
    }

    state.heroTouchActive = false;

    var vh = window.innerHeight || 1;
    var currentY = getScrollY();
    var currentX = state.heroTouchLastX;
    var snapCfg = CONFIG.mobileSnap;
    var pageContentY = getPageContentScrollY();
    var maxSnapY = getMobileSnapMaxY(vh);
    var deltaFingerY = state.heroTouchLastY - state.heroTouchStartY;
    var deltaFingerX = currentX - state.heroTouchStartX;
    var deltaScrollY = currentY - state.heroTouchStartScrollY;
    var absFingerY = Math.abs(deltaFingerY);
    var absFingerX = Math.abs(deltaFingerX);
    var absScrollY = Math.abs(deltaScrollY);
    var snapPoints = [0, pageContentY];
    var startIndex = getNearestSnapIndex(snapPoints, state.heroTouchStartScrollY);
    var nearestIndex = getNearestSnapIndex(snapPoints, currentY);
    var targetIndex = nearestIndex;
    var isVerticalGesture =
      absFingerY >= snapCfg.minSwipePx && absFingerY >= absFingerX * 0.9;

    if (currentY < 0 || currentY > maxSnapY) return;

    if (isVerticalGesture && absScrollY >= snapCfg.minScrollPx) {
      var isTowardNext = deltaScrollY > 0 || deltaFingerY < 0;
      var isStrongGesture =
        absFingerY >= snapCfg.switchSwipePx ||
        absScrollY >= snapCfg.switchScrollPx;

      if (isStrongGesture) {
        if (isTowardNext) targetIndex = Math.min(startIndex + 1, snapPoints.length - 1);
        else targetIndex = Math.max(startIndex - 1, 0);
      }
    }

    if (targetIndex <= 0) {
      scrollToDocumentYSmooth(0, snapCfg.durationMs);
      return;
    }

    scrollTargetIntoViewSmooth(pageContent, {
      targetTopPx: 0,
      durationMs: snapCfg.durationMs,
    });
  }

  function scrollToDocumentY(topPx) {
    var y = Math.max(0, Math.round(topPx));
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo({ left: 0, top: y, behavior: 'auto' });
    html.style.scrollBehavior = prev;
  }

  function scrollToDocumentYSmooth(topPx, durationMs) {
    cancelTargetScroll();

    var targetY = Math.max(0, Math.round(topPx));
    var frameCount = 0;
    var scrollCfg = CONFIG.scroll;
    var startedAt = 0;

    function step(now) {
      if (!startedAt) startedAt = now;
      frameCount += 1;

      var currentY = getScrollY();
      var delta = targetY - currentY;
      var deltaAbs = Math.abs(delta);

      if (deltaAbs <= scrollCfg.settleTolerancePx || frameCount >= scrollCfg.maxFrames) {
        scrollToDocumentY(targetY);
        scrollAnimationId = 0;
        scheduleFrame();
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
      scheduleFrame();
      scrollAnimationId = requestAnimationFrame(step);
    }

    scrollAnimationId = requestAnimationFrame(step);
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
        scheduleFrame();
        return;
      }

      if (
        prevDelta !== null &&
        delta * prevDelta < 0 &&
        deltaAbs < 6 &&
        Math.abs(prevDelta) < 6
      ) {
        scrollAnimationId = 0;
        scheduleFrame();
        return;
      }

      if (frameCount >= scrollCfg.maxFrames) {
        scrollAnimationId = 0;
        scheduleFrame();
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
      scheduleFrame();
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
