(function () {
  'use strict';

  var CONFIG = {
    background: {
      baseScale: 1.1,
      pointerEase: 0.08,
      pointerSettleThreshold: 0.0008,
      skyYPerProgressVh: -0.1,
      grassYPerProgressVh: 2,
    },
    hero: {
      maxTranslateRatio: 0.78,
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
    pandaMobile: {
      baseScale: 1.18,
      moveRangeVhFrac: 0.44,
      easePow: 2.2,
      maxTyVhMul: 2.15,
      scaleAmp: 4.15,
      pointerShiftFrac: 0.05,
      fadeStartMoveRangeMul: 1.18,
      fadeSpanVhFrac: 0.62,
    },
    transition: {
      durationMs: 920,
      easePow: 1.65,
    },
  };

  var sky = document.querySelector('.page-bg__sky');
  var grass = document.querySelector('.page-bg__grass');
  var pandaSlot = document.querySelector('.page-bg__panda-slot');
  var heroEl = document.querySelector('.hero');
  var heroInner = document.querySelector('.hero__inner');
  var heroCtaRow = document.querySelector('.hero__cta-row');
  var heroCta = document.querySelector('a.hero-cta[href^="#"]');
  var rootStyle = document.documentElement.style;
  var body = document.body;
  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqlMobile =
    window.matchMedia && window.matchMedia('(max-width: 767px)');

  var state = {
    progress: 0,
    pointerTargetX: 0,
    pointerTargetY: 0,
    pointerCurrentX: 0,
    pointerCurrentY: 0,
    transitionRafId: 0,
    transitionStartTime: 0,
    transitionOnComplete: null,
    transitionActive: false,
    transitionFrom: 0,
    transitionTo: 1,
    heroHeight: null,
    heroInnerY: null,
    heroCtaRowY: null,
    skyTransform: '',
    grassTransform: '',
    grassOpacity: '',
    pandaTransform: '',
    pandaOpacity: '',
  };

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function smoothstep(value) {
    var x = clamp01(value);
    return x * x * (3 - 2 * x);
  }

  function easeIn(value, pow) {
    return Math.pow(clamp01(value), pow);
  }

  function easeInOut(value, pow) {
    var x = clamp01(value);
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x < 0.5) return 0.5 * Math.pow(x * 2, pow);
    return 1 - 0.5 * Math.pow((1 - x) * 2, pow);
  }

  function isMobileViewport() {
    return Boolean(mqlMobile && mqlMobile.matches);
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function getSceneHeight() {
    if (heroEl && heroEl.parentElement) {
      var rect = heroEl.parentElement.getBoundingClientRect();
      if (rect.height) return rect.height;
    }
    return window.innerHeight || 1;
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

  function getBackgroundPointerShift(node, pointerValue, axis) {
    if (!node) return 0;
    var size = getNodeBaseSize(node, axis);
    var halfOverflow = getHalfOverflow(size, CONFIG.background.baseScale);
    return -pointerValue * halfOverflow;
  }

  function getPointerShiftWithinScale(node, pointerValue, axis, scale, frac) {
    if (!node) return 0;
    var size = getNodeBaseSize(node, axis);
    var halfOverflow = getHalfOverflow(size, scale);
    return -pointerValue * Math.min(halfOverflow, size * frac);
  }

  function updatePointerMotion() {
    var dx = state.pointerTargetX - state.pointerCurrentX;
    var dy = state.pointerTargetY - state.pointerCurrentY;
    var moving =
      Math.abs(dx) > CONFIG.background.pointerSettleThreshold ||
      Math.abs(dy) > CONFIG.background.pointerSettleThreshold;

    if (!moving) {
      state.pointerCurrentX = state.pointerTargetX;
      state.pointerCurrentY = state.pointerTargetY;
      return false;
    }

    state.pointerCurrentX += dx * CONFIG.background.pointerEase;
    state.pointerCurrentY += dy * CONFIG.background.pointerEase;
    return true;
  }

  function updateHeroHeight(vh) {
    var heroHeight = Math.round(vh);
    if (state.heroHeight === heroHeight) return;
    state.heroHeight = heroHeight;
    var heroHeightValue = heroHeight + 'px';
    if (heroEl) heroEl.style.height = heroHeightValue;
    rootStyle.setProperty('--hero-block-h', heroHeightValue);
    rootStyle.setProperty('--hero-block-h-fixed', heroHeightValue);
  }

  function updateHeroInner(progress, vh) {
    if (!heroInner) return;
    var eased = easeIn(progress, CONFIG.hero.easePow);
    var translateY = Math.round(-(vh * CONFIG.hero.maxTranslateRatio * eased));
    if (state.heroInnerY === translateY) return;
    state.heroInnerY = translateY;
    heroInner.style.transform = 'translate3d(0,' + translateY + 'px,0)';
  }

  function updateHeroCtaRow(progress, vh) {
    if (!heroCtaRow) return;
    if (!isMobileViewport()) {
      if (state.heroCtaRowY !== 0) {
        state.heroCtaRowY = 0;
        heroCtaRow.style.transform = '';
      }
      return;
    }

    var eased = easeIn(progress, CONFIG.hero.easePow);
    var translateY = Math.round(vh * 1.18 * eased);
    if (state.heroCtaRowY === translateY) return;
    state.heroCtaRowY = translateY;
    heroCtaRow.style.transform = 'translate3d(0,' + translateY + 'px,0)';
  }

  function updateSkyGrass(progress, vh) {
    var motionProgress = smoothstep(progress);
    var virtualY = vh * motionProgress;
    var skyY = Math.round(virtualY * CONFIG.background.skyYPerProgressVh);
    var grassY = Math.round(virtualY * CONFIG.background.grassYPerProgressVh);
    var skyShiftX = getBackgroundPointerShift(sky, state.pointerCurrentX, 'x');
    var skyShiftY = getBackgroundPointerShift(sky, state.pointerCurrentY, 'y');
    var grassShiftX = getBackgroundPointerShift(grass, state.pointerCurrentX, 'x');
    var grassShiftY = getBackgroundPointerShift(grass, state.pointerCurrentY, 'y');
    var scaleValue = CONFIG.background.baseScale.toFixed(3);
    var grassFade = 1 - smoothstep((progress - 0.72) / 0.28);

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
    var grassOpacityValue = String(clamp01(grassFade));

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

  function getPandaConfig() {
    return isMobileViewport() ? CONFIG.pandaMobile : CONFIG.panda;
  }

  function updatePanda(progress, vh) {
    if (!pandaSlot) return;
    var cfg = getPandaConfig();
    var motionProgress = smoothstep(progress);
    var virtualY = vh * motionProgress;
    var moveRange = vh * cfg.moveRangeVhFrac;
    var sm = moveRange > 0 ? virtualY / moveRange : 0;
    if (sm > 1) sm = 1;
    var e = 1 - Math.pow(1 - clamp01(sm), cfg.easePow);

    var maxTy = vh * cfg.maxTyVhMul;
    var scale = cfg.baseScale + cfg.scaleAmp * e;
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
    var fadeSpan = vh * cfg.fadeSpanVhFrac;
    var opacity = 1;
    if (virtualY > fadeStart && fadeSpan > 0) {
      var fadeUnit = (virtualY - fadeStart) / fadeSpan;
      opacity = 1 - smoothstep(fadeUnit);
    }

    var transform =
      'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + scale.toFixed(4) + ')';
    var opacityValue = String(clamp01(opacity));

    if (state.pandaTransform !== transform) {
      state.pandaTransform = transform;
      pandaSlot.style.transform = transform;
    }

    if (state.pandaOpacity !== opacityValue) {
      state.pandaOpacity = opacityValue;
      pandaSlot.style.opacity = opacityValue;
    }
  }

  function render() {
    var vh = getSceneHeight();
    var pointerMoving = updatePointerMotion();
    updateHeroHeight(vh);
    updateHeroInner(state.progress, vh);
    updateHeroCtaRow(state.progress, vh);
    updateSkyGrass(state.progress, vh);
    updatePanda(state.progress, vh);
    return pointerMoving || state.transitionActive;
  }

  function runFrame(now) {
    if (state.transitionActive) {
      if (!state.transitionStartTime) state.transitionStartTime = now;
      var elapsed = now - state.transitionStartTime;
      var progress =
        CONFIG.transition.durationMs > 0
          ? elapsed / CONFIG.transition.durationMs
          : 1;
      var eased = easeInOut(progress, CONFIG.transition.easePow);
      state.progress = mix(state.transitionFrom, state.transitionTo, eased);
      if (progress >= 1) {
        state.progress = state.transitionTo;
        state.transitionActive = false;
        state.transitionStartTime = 0;
        var onComplete = state.transitionOnComplete;
        state.transitionOnComplete = null;
        if (typeof onComplete === 'function') onComplete();
      }
    }

    state.transitionRafId = 0;
    if (render()) scheduleFrame();
  }

  function scheduleFrame() {
    if (state.transitionRafId) return;
    state.transitionRafId = window.requestAnimationFrame(runFrame);
  }

  function resetHeroState() {
    state.progress = 0;
    state.transitionActive = false;
    state.transitionStartTime = 0;
    state.transitionOnComplete = null;
    state.transitionFrom = 0;
    state.transitionTo = 1;
    state.pointerTargetX = 0;
    state.pointerTargetY = 0;
    scheduleFrame();
  }

  function startHeroTransition(options) {
    if (reduce) {
      state.progress = 1;
      render();
      if (options && typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return;
    }

    state.transitionActive = true;
    state.transitionStartTime = 0;
    state.transitionFrom = state.progress;
    state.transitionTo = 1;
    state.transitionOnComplete = options && options.onComplete;
    body.classList.remove('experience--landing', 'experience--quiz-active');
    body.classList.add('experience--transitioning');
    scheduleFrame();
  }

  function rewindHeroTransition(options) {
    if (reduce) {
      state.progress = 0;
      render();
      if (options && typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return;
    }

    state.transitionActive = true;
    state.transitionStartTime = 0;
    state.transitionFrom = state.progress;
    state.transitionTo = 0;
    state.transitionOnComplete = options && options.onComplete;
    scheduleFrame();
  }

  if (heroInner) heroInner.style.willChange = 'transform';
  if (heroCtaRow) heroCtaRow.style.willChange = 'transform';
  if (heroEl) heroEl.style.willChange = 'height';
  if (sky) sky.style.willChange = 'transform';
  if (grass) grass.style.willChange = 'transform, opacity';
  if (pandaSlot) pandaSlot.style.willChange = 'transform, opacity';

  if (mqlMobile) {
    if (mqlMobile.addEventListener) {
      mqlMobile.addEventListener('change', resetHeroState);
    } else if (mqlMobile.addListener) {
      mqlMobile.addListener(resetHeroState);
    }
  }

  window.addEventListener(
    'pointermove',
    function (e) {
      if (!e || e.pointerType === 'touch') return;
      if (isMobileViewport()) return;
      if (body.classList.contains('experience--quiz-active')) return;
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

  window.addEventListener('resize', scheduleFrame, { passive: true });

  if (heroCta) {
    heroCta.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof window.QUIZ_START_FROM_HERO === 'function') {
        window.QUIZ_START_FROM_HERO();
      }
    });
  }

  window.QUIZ_HERO_TRANSITION = {
    start: startHeroTransition,
    rewind: rewindHeroTransition,
    reset: resetHeroState,
  };

  resetHeroState();
})();
