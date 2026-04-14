(function () {
  'use strict';

  const questions = window.QUIZ_QUESTIONS || [];
  const TOTAL = questions.length;
  const DEFAULT_QUESTION_IMAGE = 'img/banners/banner.png';

  const el = {
    body: document.body,
    pageContent: document.getElementById('page-content'),
    stage: document.getElementById('quiz-stage'),
    intro: document.getElementById('screen-intro'),
    quiz: document.getElementById('screen-quiz'),
    result: document.getElementById('screen-result'),
    success: document.getElementById('screen-success'),

    btnStart: document.getElementById('btn-start'),
    btnQuizRestart: document.getElementById('btn-quiz-restart'),
    btnReviewPrev: document.getElementById('btn-review-prev'),
    btnReviewNext: document.getElementById('btn-review-next'),
    btnSuccessReview: document.getElementById('btn-success-review'),

    card: document.getElementById('quiz-card'),
    quizCardAreaFrame: document.querySelector('#screen-quiz .quiz-card-area-frame'),
    quizCardArea: document.querySelector('#screen-quiz .quiz-card-area'),
    cardImage: document.getElementById('card-question-media'),
    cardText: document.getElementById('card-question-text'),
    progress: document.getElementById('quiz-progress'),
    runnerTrack: document.getElementById('quiz-runner-track'),
    runnerWorld: document.getElementById('quiz-runner-world'),
    runnerStones: document.getElementById('quiz-runner-stones'),
    runnerTickets: document.getElementById('quiz-runner-tickets'),
    runnerPanda: document.getElementById('quiz-runner-panda'),
    runnerSprite: document.getElementById('quiz-runner-sprite'),
    quizHint: document.getElementById('quiz-swipe-hint'),
    answerActions: document.getElementById('quiz-answer-actions'),
    nextActions: document.getElementById('quiz-next-actions'),
    reviewActions: document.getElementById('quiz-review-actions'),
    btnMyth: document.getElementById('btn-myth'),
    btnTruth: document.getElementById('btn-truth'),
    heroPromoTicket: document.querySelector('.hero-promo__ticket'),

    feedbackCard: document.getElementById('feedback-card'),
    feedbackTitle: document.getElementById('feedback-title'),
    feedbackExplain: document.getElementById('feedback-explanation'),
    feedbackImage: document.getElementById('feedback-question-media'),
    feedbackMediaFrame: document.getElementById('feedback-media-frame'),
    feedbackSources: document.getElementById('feedback-sources'),
    feedbackSourcesBlock: document.querySelector('#feedback-card .sources-block'),
    feedbackQuestionText: document.getElementById('feedback-question-text'),
    btnNext: document.getElementById('btn-feedback-next'),

    resultTier: document.getElementById('result-tier-message'),
    resultScore: document.getElementById('result-score'),
    resultTitle: document.getElementById('result-title'),

    formEl: document.getElementById('lead-form'),
    btnToForm: document.getElementById('btn-to-form'),
  };

  let index = 0;
  let score = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let cardOffsetX = 0;
  const SWIPE_THRESHOLD = 80;
  const SWIPE_AXIS_LOCK_THRESHOLD = 12;
  let cardAnimating = false;
  let cardFlyTimeoutId = 0;
  let questionAnswered = false;
  let reviewMode = false;
  let answers = [];
  const FLY_OUT_MS = 400;
  const RUNNER_MOVE_MS = 540;
  const RUNNER_SPRITE_COLS = 5;
  const RUNNER_SPRITE_ROWS = 2;
  const RUNNER_IDLE_FRAME = 1;
  /** Поза после подбора билетов (последняя ячейка спрайтшита 5×2). */
  const RUNNER_TICKETS_POSE_FRAME = 10;
  const RUNNER_WALK_FRAMES = [2, 3, 4, 5, 6];
  const RUNNER_STONE_GAP_MULT = 1;
  const RUNNER_STONE_GAP_MULT_MOBILE = 1.6;
  const RUNNER_STONE_SPRITE_COUNT = 4;
  /** Горизонтальная «привязка» камеры: центр панды в видимой полосе трека (0 — левый край вьюпорта, 1 — правый). */
  const RUNNER_CAMERA_PANDA_ANCHOR_X = 0.38;
  /** Фазы шага (moveT = t): ходьба → прыжок → ходьба. Горизонталь — равномерно за весь шаг (без замедления на стыках фаз). */
  const RUNNER_PHASE_WALK1_END = 0.16;
  const RUNNER_PHASE_JUMP_END = 0.84;
  const RUNNER_JUMP_FRAMES = [2, 7, 8, 8, 8, 9, 2];
  const RUNNER_JUMP_HEIGHT_RATIO = 0.48;
  const INLINE_NOTE_HOVER_CLOSE_DELAY = 300;
  const MOBILE_LAYOUT_MAX_WIDTH = 767;
  const DEFAULT_QUIZ_HINT = 'Смахните карточку или нажмите кнопку';
  const REVIEW_QUIZ_HINT = 'Смахните карточку или используйте кнопки для перехода между ответами';
  const SHORT_WORD_NBSP_RE =
    /(^|[\s([«„“"'])((?:[A-Za-zА-Яа-яЁё]{1,3}))\s+(?=[A-Za-zА-Яа-яЁё0-9])/gu;
  const QUESTION_IMAGE_PRELOAD_AHEAD = 3;
  const EXPERIENCE_STATES = [
    'experience--landing',
    'experience--transitioning',
    'experience--quiz-active',
    'experience--success-active',
  ];
  const preloadedQuestionImages = new Map();
  const hoverPopoverMql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)')
      : null;
  const reduceMotionMql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let pendingCardImageToken = '';
  let runnerCompleted = 0;
  let runnerVisualRatio = 0;
  let runnerAnimRafId = 0;
  let runnerAnimToken = 0;
  let runnerAnimActiveTarget = null;
  const runnerPendingTargets = [];
  let runnerTicketsPicked = false;
  let runnerPandaWidthPx = 0;
  let runnerStoneWidthPx = 0;
  let runnerWorldContentWidthPx = 0;
  let runnerViewportScrollPx = 0;
  let runnerMilestoneLeftPx = [];
  let runnerStoneBounds = [];
  let inlineNoteSeed = 0;
  const inlineNoteStore = new Map();
  let inlineNotePopoverEl = null;
  let inlineNoteAnchorEl = null;
  let inlineNoteCloseTimerId = 0;

  function isDesktopHoverInput() {
    return Boolean(hoverPopoverMql && hoverPopoverMql.matches);
  }

  function clearInlineNoteCloseTimer() {
    if (!inlineNoteCloseTimerId) return;
    window.clearTimeout(inlineNoteCloseTimerId);
    inlineNoteCloseTimerId = 0;
  }

  function isPopoverAnchorElement(node) {
    return Boolean(
      node instanceof Element && node.closest('.inline-note-ref, .quiz-runner__tickets')
    );
  }

  function setPopoverAnchorExpanded(anchor, expanded) {
    if (!(anchor instanceof Element)) return;
    if (!anchor.classList.contains('inline-note-ref')) return;
    anchor.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function scheduleInlineNoteClose(delayMs = INLINE_NOTE_HOVER_CLOSE_DELAY) {
    clearInlineNoteCloseTimer();
    inlineNoteCloseTimerId = window.setTimeout(() => {
      inlineNoteCloseTimerId = 0;
      closeInlineNotePopover();
    }, delayMs);
  }

  function getInlineNoteFromTrigger(trigger) {
    if (!trigger) return null;
    const key = trigger.getAttribute('data-inline-note-key') || '';
    if (!key) return null;
    return inlineNoteStore.get(key) || null;
  }

  function bindShortWords(text) {
    if (text === null || typeof text === 'undefined') return '';
    return String(text).replace(SHORT_WORD_NBSP_RE, (_, lead, word) => `${lead}${word}\u00A0`);
  }

  function applyNbspInTree(root) {
    if (!root) return;
    const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'OPTION']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !skipTags.has(parent.tagName) && node.nodeValue && node.nodeValue.trim()) {
        nodes.push(node);
      }
      node = walker.nextNode();
    }
    nodes.forEach((textNode) => {
      const updated = bindShortWords(textNode.nodeValue);
      if (updated !== textNode.nodeValue) {
        textNode.nodeValue = updated;
      }
    });
  }

  /** полный красный/зелёный при смещении ~в таком количестве px */
  const CARD_TINT_MAX = 140;

  const RGB_NEUTRAL = { r: 26, g: 26, b: 26 };
  const RGB_MYTH = { r: 245, g: 120, b: 66 };
  const RGB_TRUTH = { r: 122, g: 181, b: 79 };

  function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function smoothstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
  }

  function updateCardTextTint(dx) {
    if (!el.cardText) return;
    let t = 0;
    let from = RGB_NEUTRAL;
    let to = RGB_NEUTRAL;
    if (dx < 0) {
      t = smoothstep(Math.abs(dx) / CARD_TINT_MAX);
      to = RGB_MYTH;
    } else if (dx > 0) {
      t = smoothstep(dx / CARD_TINT_MAX);
      to = RGB_TRUTH;
    }
    if (t <= 0) {
      el.cardText.style.color = '';
      return;
    }
    const r = lerpChannel(RGB_NEUTRAL.r, to.r, t);
    const g = lerpChannel(RGB_NEUTRAL.g, to.g, t);
    const b = lerpChannel(RGB_NEUTRAL.b, to.b, t);
    el.cardText.style.color = `rgb(${r},${g},${b})`;
  }

  function showScreen(screen) {
    [el.intro, el.quiz, el.result].forEach((s) => {
      if (s) s.hidden = s !== screen;
    });
    if (el.body) {
      el.body.classList.toggle('experience--result-view', screen === el.result);
      el.body.classList.toggle('quiz-screen-active', screen === el.quiz);
    }
    if (screen === el.result) syncLeadFormSubmitReadyState();
    requestQuizCardOverflowHintSync();
  }

  function syncLeadFormSubmitReadyState() {
    const form = el.formEl;
    const btn = el.btnToForm;
    if (!form || !btn) return;
    const ready = typeof form.checkValidity === 'function' && form.checkValidity();
    btn.classList.toggle('is-ready', ready);
  }

  function isMobileQuizLayout() {
    return window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH;
  }

  function shouldSyncQuizCardOverflowHint() {
    if (!el.quiz || el.quiz.hidden) return false;
    return Boolean(questionAnswered || reviewMode);
  }

  function syncQuizCardOverflowHint() {
    const cardArea = el.quizCardArea;
    const hintHost = el.quizCardAreaFrame || cardArea;
    if (!cardArea) return;
    if (!shouldSyncQuizCardOverflowHint()) {
      hintHost?.classList.remove(
        'quiz-card-area--overflowing',
        'quiz-card-area--overflow-start',
        'quiz-card-area--overflow-end'
      );
      return;
    }
    const overflowGap = cardArea.scrollHeight - cardArea.clientHeight;
    const overflowing = overflowGap > 4;
    const scrolledFromStart = cardArea.scrollTop > 4;
    const scrolledToEnd = cardArea.scrollTop + cardArea.clientHeight >= cardArea.scrollHeight - 4;
    hintHost?.classList.toggle('quiz-card-area--overflowing', overflowing);
    hintHost?.classList.toggle(
      'quiz-card-area--overflow-start',
      overflowing && scrolledFromStart
    );
    hintHost?.classList.toggle('quiz-card-area--overflow-end', !overflowing || scrolledToEnd);
  }

  function requestQuizCardOverflowHintSync() {
    window.requestAnimationFrame(syncQuizCardOverflowHint);
  }

  function tierCopy(correctCount) {
    if (correctCount < 5) {
      return {
        tone: 'warm',
        title: 'Есть куда расти',
        body:
          'Мифов про астму много — это нормально. Соберите информацию у педиатра или пульмонолога и загляните в материалы на тему: так проще ориентироваться в симптомах и терапии.',
      };
    }
    if (correctCount <= 10) {
      return {
        tone: 'mid',
        title: 'Хороший уровень',
        body:
          'Вы уже отделяете часть мифов от фактов. Закрепите знания: обсудите с врачом триггеры, план действий при обострении и почему важна регулярная терапия, а не только «по симптомам».',
      };
    }
    return {
      tone: 'strong',
      title: 'Отличный результат',
      body:
        'Вы хорошо ориентируетесь в основах. Поделитесь квизом с близкими и при необходимости углубитесь в материалы — спокойный, информированный подход помогает детям с астмой жить активно.',
    };
  }

  function setProgress() {
    const value = bindShortWords(`Вопрос ${Math.min(index + 1, TOTAL)} из ${TOTAL}`);
    if (el.progress) el.progress.textContent = value;
  }

  function updateRunnerSegments() {
    if (!el.runnerTrack) return;
    el.runnerTrack.style.setProperty('--quiz-runner-steps', String(Math.max(TOTAL, 1)));
    if (!el.runnerStones) return;

    const stonesCount = Math.max(TOTAL, 1);
    if (el.runnerStones.childElementCount !== stonesCount) {
      el.runnerStones.textContent = '';
      const frag = document.createDocumentFragment();
      for (let i = 0; i < stonesCount; i += 1) {
        const stone = document.createElement('span');
        stone.className = 'quiz-runner__stone';
        const spriteIndex = Math.floor(Math.random() * RUNNER_STONE_SPRITE_COUNT);
        const spriteX =
          RUNNER_STONE_SPRITE_COUNT > 1
            ? (spriteIndex / (RUNNER_STONE_SPRITE_COUNT - 1)) * 100
            : 0;
        stone.style.setProperty('--quiz-runner-stone-sprite-x', `${spriteX}%`);
        frag.appendChild(stone);
      }
      el.runnerStones.appendChild(frag);
    }
  }

  function syncRunnerLayout() {
    updateRunnerSegments();
    layoutRunnerWorld();
  }

  function measureRunnerBasePx() {
    if (!el.runnerTrack || !el.runnerPanda) return;

    const probe = document.createElement('div');
    probe.className = 'quiz-runner__stone';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
    el.runnerTrack.appendChild(probe);
    const sRect = probe.getBoundingClientRect();
    runnerStoneWidthPx = Math.round(sRect.width) || 0;
    el.runnerTrack.removeChild(probe);

    void el.runnerPanda.offsetWidth;
    const pRect = el.runnerPanda.getBoundingClientRect();
    runnerPandaWidthPx = Math.round(pRect.width) || 0;
  }

  function layoutRunnerWorld() {
    if (!el.runnerWorld || !el.runnerTrack || !el.runnerStones || !el.runnerPanda) return;

    void el.runnerTrack.offsetHeight;
    measureRunnerBasePx();

    const n = Math.max(TOTAL, 1);
    let P = runnerPandaWidthPx;
    let S = runnerStoneWidthPx;
    if (P <= 1) P = 48;
    if (S <= 1) S = 40;

    const gapMult = isMobileQuizLayout()
      ? RUNNER_STONE_GAP_MULT_MOBILE
      : RUNNER_STONE_GAP_MULT;
    const gap = gapMult * P;
    const padL = P;
    const padR = P;
    const innerW = padL + n * S + Math.max(0, n - 1) * gap + padR;

    runnerWorldContentWidthPx = innerW;
    el.runnerWorld.style.width = `${Math.round(innerW)}px`;
    el.runnerTrack.style.setProperty('--quiz-runner-world-w', `${Math.round(innerW)}px`);

    runnerStoneBounds = [];
    for (let i = 0; i < n; i += 1) {
      const stone = el.runnerStones.children[i];
      if (!stone) continue;
      const left = padL + i * (S + gap);
      const stoneW = S;
      stone.style.left = `${Math.round(left)}px`;
      stone.style.width = `${Math.round(stoneW)}px`;
      runnerStoneBounds.push({ left, right: left + stoneW });
    }

    const mLeft = [];
    mLeft[0] = Math.max(
      0,
      Math.round(runnerStoneBounds[0].left * 0.5 - P * 0.5 - S * 0.34)
    );
    for (let k = 1; k < n; k += 1) {
      const a = runnerStoneBounds[k - 1];
      const b = runnerStoneBounds[k];
      const gapCenter = (a.right + b.left) * 0.5;
      mLeft[k] = Math.round(gapCenter - P * 0.5);
    }
    const lastStone = runnerStoneBounds[n - 1];
    const endGapCenter = (lastStone.right + innerW) * 0.5;
    mLeft[n] = Math.round(endGapCenter - P * 0.5);
    while (mLeft.length <= TOTAL) {
      mLeft.push(mLeft[mLeft.length - 1]);
    }
    runnerMilestoneLeftPx = mLeft;
  }

  function milestoneLeftAt(completedFloat) {
    if (!runnerMilestoneLeftPx.length) return 0;
    const u = Math.min(TOTAL, Math.max(0, Number(completedFloat) || 0));
    if (TOTAL <= 0) return 0;
    const i = Math.floor(u);
    const f = u - i;
    if (i >= TOTAL) return runnerMilestoneLeftPx[TOTAL];
    const a = runnerMilestoneLeftPx[i];
    const b = runnerMilestoneLeftPx[Math.min(i + 1, TOTAL)];
    return a + (b - a) * f;
  }

  function applyRunnerViewportScroll(pandaLeftEdgePx) {
    if (!el.runnerWorld || !el.runnerTrack || !el.runnerPanda) return;
    const viewW = el.runnerTrack.clientWidth;
    const maxScroll = Math.max(0, runnerWorldContentWidthPx - viewW);
    let P = runnerPandaWidthPx > 1 ? runnerPandaWidthPx : 0;
    if (P <= 1) {
      P = Math.round(el.runnerPanda.getBoundingClientRect().width) || 48;
    }
    const left = Number(pandaLeftEdgePx) || 0;
    const centerWorld = left + P * 0.5;
    const anchorX = RUNNER_CAMERA_PANDA_ANCHOR_X * viewW;
    let scroll = centerWorld - anchorX;
    scroll = Math.min(maxScroll, Math.max(0, scroll));
    runnerViewportScrollPx = scroll;
    const tx = `translate3d(${-Math.round(scroll)}px, 0, 0)`;
    el.runnerWorld.style.transform = tx;
  }

  function applyRunnerPose(leftEdgePx, jumpYPx) {
    applyRunnerViewportScroll(leftEdgePx);
    applyRunnerTransform(leftEdgePx, jumpYPx);
  }

  function resetRunnerTicketsDecor() {
    runnerTicketsPicked = false;
    el.runnerTickets?.classList.remove(
      'quiz-runner__tickets--visible',
      'quiz-runner__tickets--picked',
      'quiz-runner__tickets--pulsing'
    );
  }

  function updateQuizRunnerTicketsUi() {
    if (!el.runnerTickets || !el.quiz || el.quiz.hidden) return;
    const showTickets = !runnerTicketsPicked && !reviewMode;
    const pulseTickets =
      !runnerTicketsPicked &&
      !reviewMode &&
      runnerCompleted < Math.max(TOTAL - 1, 0) &&
      index < Math.max(TOTAL - 1, 0);
    el.runnerTickets.classList.toggle('quiz-runner__tickets--visible', showTickets);
    el.runnerTickets.classList.toggle('quiz-runner__tickets--pulsing', pulseTickets);
  }

  function pickupRunnerTicketsOnFinish() {
    if (runnerTicketsPicked || !el.runnerTickets) return;
    runnerTicketsPicked = true;
    el.runnerTickets.classList.remove('quiz-runner__tickets--visible');
    el.runnerTickets.classList.add('quiz-runner__tickets--picked');
    setRunnerSpriteFrame(RUNNER_TICKETS_POSE_FRAME);
  }

  function isRunnerReducedMotion() {
    return Boolean(reduceMotionMql && reduceMotionMql.matches);
  }

  function clampRunnerRatio(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  function setRunnerSpriteFrame(frameNumber) {
    if (!el.runnerSprite) return;
    const maxFrame = RUNNER_SPRITE_COLS * RUNNER_SPRITE_ROWS;
    const normalized = Math.min(maxFrame, Math.max(1, Math.round(Number(frameNumber) || 1)));
    const index = normalized - 1;
    const col = index % RUNNER_SPRITE_COLS;
    const row = Math.floor(index / RUNNER_SPRITE_COLS);
    const x =
      RUNNER_SPRITE_COLS > 1 ? (col / (RUNNER_SPRITE_COLS - 1)) * 100 : 0;
    const y =
      RUNNER_SPRITE_ROWS > 1 ? (row / (RUNNER_SPRITE_ROWS - 1)) * 100 : 0;
    el.runnerSprite.style.backgroundPosition = `${x}% ${y}%`;
  }

  function applyRunnerTransform(leftEdgePx, jumpYPx) {
    if (!el.runnerPanda) return;
    const x = Math.round((Number(leftEdgePx) || 0) - runnerViewportScrollPx);
    const y = Math.round(Number(jumpYPx) || 0);
    el.runnerPanda.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function stopRunnerAnimation() {
    if (runnerAnimRafId) {
      window.cancelAnimationFrame(runnerAnimRafId);
      runnerAnimRafId = 0;
    }
    runnerAnimToken += 1;
    runnerAnimActiveTarget = null;
  }

  function easeInOutCubic(t) {
    const x = clampRunnerRatio(t);
    if (x < 0.5) return 4 * x * x * x;
    return 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function frameFromSequence(sequence, progress) {
    if (!Array.isArray(sequence) || !sequence.length) return RUNNER_IDLE_FRAME;
    const p = Math.min(0.999, Math.max(0, Number(progress) || 0));
    const i = Math.floor(p * sequence.length);
    return sequence[Math.min(sequence.length - 1, Math.max(0, i))];
  }

  function computeJumpOffset(localProgress, jumpHeight) {
    const local = clampRunnerRatio(localProgress);
    return -jumpHeight * Math.sin(Math.PI * local);
  }

  /** Горизонталь: равномерная скорость на всём шаге, вертикаль задаётся фазой прыжка. */
  function runnerStepLeftAt(moveT, startX, endX) {
    const totalDX = endX - startX;
    if (Math.abs(totalDX) <= 0.5) {
      return startX;
    }
    return startX + totalDX * clampRunnerRatio(moveT);
  }

  function paintRunnerPosition(immediate) {
    if (!el.runnerPanda || !el.runnerSprite) return;
    if (immediate) {
      stopRunnerAnimation();
      runnerPendingTargets.length = 0;
    }
    const left = milestoneLeftAt(runnerCompleted);
    runnerVisualRatio = TOTAL > 0 ? clampRunnerRatio(runnerCompleted / TOTAL) : 0;
    applyRunnerPose(left, 0);
    const settledFrame =
      runnerTicketsPicked && runnerCompleted >= TOTAL
        ? RUNNER_TICKETS_POSE_FRAME
        : RUNNER_IDLE_FRAME;
    setRunnerSpriteFrame(settledFrame);
    updateQuizRunnerTicketsUi();
  }

  function setRunnerProgress(completedCount, immediate) {
    runnerCompleted = Math.min(Math.max(completedCount, 0), TOTAL);
    paintRunnerPosition(Boolean(immediate));
  }

  function beginRunnerAnimationTo(targetCompleted) {
    if (!el.runnerPanda || !el.runnerSprite) return;

    const targetRatio = TOTAL > 0 ? clampRunnerRatio(targetCompleted / TOTAL) : 0;
    const startRatio = TOTAL > 0 ? clampRunnerRatio(runnerCompleted / TOTAL) : 0;
    runnerAnimActiveTarget = targetCompleted;

    if (targetRatio <= startRatio + 0.0005) {
      runnerAnimActiveTarget = null;
      runnerCompleted = targetCompleted;
      runnerVisualRatio = targetRatio;
      applyRunnerPose(milestoneLeftAt(targetCompleted), 0);
      if (targetCompleted >= TOTAL) {
        pickupRunnerTicketsOnFinish();
      } else {
        setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
      }
      updateQuizRunnerTicketsUi();
      while (runnerPendingTargets.length) {
        const nextT = runnerPendingTargets.shift();
        if (nextT > runnerCompleted) {
          runnerAnimToken += 1;
          beginRunnerAnimationTo(nextT);
          return;
        }
      }
      return;
    }

    if (el.runnerTrack) {
      void el.runnerTrack.offsetHeight;
    }
    layoutRunnerWorld();

    const startX = milestoneLeftAt(runnerCompleted);
    const endX = milestoneLeftAt(targetCompleted);
    runnerVisualRatio = startRatio;

    const jumpHeight = Math.max(
      8,
      Math.round((el.runnerPanda.clientHeight || 0) * RUNNER_JUMP_HEIGHT_RATIO)
    );
    const startedAt = performance.now();
    const token = runnerAnimToken;

    const tick = (now) => {
      if (token !== runnerAnimToken) return;

      const elapsed = now - startedAt;
      const t = clampRunnerRatio(elapsed / RUNNER_MOVE_MS);
      const moveT = t;
      const globalR = startRatio + (targetRatio - startRatio) * moveT;
      const left = runnerStepLeftAt(moveT, startX, endX);

      let frame = RUNNER_IDLE_FRAME;
      let jumpY = 0;

      if (moveT < RUNNER_PHASE_WALK1_END) {
        const span = RUNNER_PHASE_WALK1_END;
        const local = span > 1e-6 ? Math.min(1, moveT / span) : 0;
        frame = frameFromSequence(RUNNER_WALK_FRAMES, local);
      } else if (moveT < RUNNER_PHASE_JUMP_END) {
        const span = RUNNER_PHASE_JUMP_END - RUNNER_PHASE_WALK1_END;
        const local = span > 1e-6 ? (moveT - RUNNER_PHASE_WALK1_END) / span : 1;
        frame = frameFromSequence(RUNNER_JUMP_FRAMES, local);
        jumpY = computeJumpOffset(local, jumpHeight);
      } else {
        const span = 1 - RUNNER_PHASE_JUMP_END;
        const local = span > 1e-6 ? Math.min(1, (moveT - RUNNER_PHASE_JUMP_END) / span) : 0;
        frame = frameFromSequence(RUNNER_WALK_FRAMES, local);
      }

      runnerVisualRatio = globalR;
      applyRunnerPose(left, jumpY);
      setRunnerSpriteFrame(frame);

      if (t >= 1) {
        runnerAnimRafId = 0;
        runnerCompleted = targetCompleted;
        runnerAnimActiveTarget = null;
        runnerVisualRatio = targetRatio;
        applyRunnerPose(milestoneLeftAt(targetCompleted), 0);
        if (targetCompleted >= TOTAL) {
          pickupRunnerTicketsOnFinish();
        } else {
          setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
        }
        updateQuizRunnerTicketsUi();
        while (runnerPendingTargets.length) {
          const nextT = runnerPendingTargets.shift();
          if (nextT > runnerCompleted) {
            runnerAnimToken += 1;
            beginRunnerAnimationTo(nextT);
            return;
          }
        }
        return;
      }

      runnerAnimRafId = window.requestAnimationFrame(tick);
    };

    runnerAnimRafId = window.requestAnimationFrame(tick);
  }

  function runRunnerTo(completedCount) {
    const targetCompleted = Math.min(Math.max(completedCount, 0), TOTAL);
    if (!el.runnerPanda || !el.runnerSprite) return;

    const targetRatio = TOTAL > 0 ? clampRunnerRatio(targetCompleted / TOTAL) : 0;
    const startRatio = TOTAL > 0 ? clampRunnerRatio(runnerCompleted / TOTAL) : 0;

    if (targetRatio <= startRatio + 0.0005) {
      runnerCompleted = targetCompleted;
      runnerVisualRatio = targetRatio;
      applyRunnerPose(milestoneLeftAt(targetCompleted), 0);
      if (targetCompleted >= TOTAL) {
        pickupRunnerTicketsOnFinish();
      } else {
        setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
      }
      updateQuizRunnerTicketsUi();
      return;
    }

    if (isRunnerReducedMotion()) {
      stopRunnerAnimation();
      runnerCompleted = targetCompleted;
      runnerVisualRatio = targetRatio;
      applyRunnerPose(milestoneLeftAt(targetCompleted), 0);
      if (targetCompleted >= TOTAL) {
        pickupRunnerTicketsOnFinish();
      } else {
        setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
      }
      updateQuizRunnerTicketsUi();
      return;
    }

    if (runnerAnimRafId) {
      const last =
        runnerPendingTargets.length > 0
          ? runnerPendingTargets[runnerPendingTargets.length - 1]
          : runnerAnimActiveTarget !== null
            ? runnerAnimActiveTarget
            : runnerCompleted;
      if (targetCompleted > last) {
        runnerPendingTargets.push(targetCompleted);
      }
      return;
    }

    stopRunnerAnimation();
    beginRunnerAnimationTo(targetCompleted);
  }

  function setQuizAnsweredState(answered) {
    if (el.quiz) {
      el.quiz.classList.toggle('quiz-screen--answered', answered);
      el.quiz.classList.toggle('quiz-screen--review', reviewMode);
      if (!answered || reviewMode) {
        el.quiz.classList.remove('quiz-screen--answer-settled');
      }
    }
    if (el.card) {
      el.card.style.pointerEvents = answered && !reviewMode ? 'none' : '';
    }
    if (el.answerActions) {
      el.answerActions.setAttribute(
        'aria-hidden',
        answered || reviewMode ? 'true' : 'false'
      );
    }
    if (el.nextActions) {
      el.nextActions.setAttribute(
        'aria-hidden',
        answered && !reviewMode ? 'false' : 'true'
      );
    }
    if (el.reviewActions) {
      el.reviewActions.setAttribute('aria-hidden', reviewMode ? 'false' : 'true');
    }
    if (el.quizHint) {
      el.quizHint.textContent = bindShortWords(
        reviewMode ? REVIEW_QUIZ_HINT : DEFAULT_QUIZ_HINT
      );
      el.quizHint.setAttribute(
        'aria-hidden',
        answered && !reviewMode ? 'true' : reviewMode ? 'true' : 'false'
      );
    }
    if (el.btnQuizRestart) {
      el.btnQuizRestart.hidden = !reviewMode;
    }
    requestQuizCardOverflowHintSync();
  }

  function resetFeedbackCardState() {
    if (!el.feedbackCard) return;
    el.feedbackCard.classList.remove(
      'feedback--myth',
      'feedback--truth',
      'feedback--result-correct',
      'feedback--result-incorrect'
    );
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureInlineNotePopover() {
    if (inlineNotePopoverEl) return inlineNotePopoverEl;
    const pop = document.createElement('div');
    pop.className = 'inline-note-popover';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-live', 'polite');
    pop.addEventListener('mouseenter', () => {
      if (!isDesktopHoverInput()) return;
      clearInlineNoteCloseTimer();
    });
    pop.addEventListener('mouseleave', (event) => {
      if (!isDesktopHoverInput()) return;
      const related = event.relatedTarget;
      if (isPopoverAnchorElement(related)) {
        clearInlineNoteCloseTimer();
        return;
      }
      scheduleInlineNoteClose();
    });
    document.body.appendChild(pop);
    inlineNotePopoverEl = pop;
    return pop;
  }

  function closeInlineNotePopover() {
    clearInlineNoteCloseTimer();
    if (!inlineNotePopoverEl) return;
    inlineNotePopoverEl.hidden = true;
    inlineNotePopoverEl.classList.remove('inline-note-popover--promo');
    inlineNotePopoverEl.innerHTML = '';
    if (inlineNoteAnchorEl) {
      setPopoverAnchorExpanded(inlineNoteAnchorEl, false);
      inlineNoteAnchorEl = null;
    }
  }

  function positionInlineNotePopover(anchor) {
    if (!inlineNotePopoverEl || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const popRect = inlineNotePopoverEl.getBoundingClientRect();
    const isPromoPopover =
      inlineNotePopoverEl.classList.contains('inline-note-popover--promo') ||
      anchor.classList.contains('quiz-runner__tickets');
    let left = isPromoPopover ? rect.right - popRect.width : rect.left;
    let top = isPromoPopover ? rect.top + (rect.height - popRect.height) / 2 : rect.bottom + 8;
    if (left + popRect.width > window.innerWidth - pad) {
      left = window.innerWidth - popRect.width - pad;
    }
    if (left < pad) left = pad;
    if (top + popRect.height > window.innerHeight - pad) {
      top = isPromoPopover ? window.innerHeight - popRect.height - pad : rect.top - popRect.height - 8;
    }
    if (top < pad) top = pad;
    inlineNotePopoverEl.style.left = `${Math.round(left)}px`;
    inlineNotePopoverEl.style.top = `${Math.round(top)}px`;
  }

  function openInlineNotePopover(anchor, noteData) {
    if (!anchor || !noteData) return;
    clearInlineNoteCloseTimer();
    const pop = ensureInlineNotePopover();
    pop.innerHTML = '';
    pop.classList.remove('inline-note-popover--promo');

    const text = document.createElement('p');
    text.className = 'inline-note-popover__text';
    text.textContent = noteData.note || '';
    pop.appendChild(text);

    if (noteData.url) {
      const link = document.createElement('a');
      link.className = 'inline-note-popover__link';
      link.href = noteData.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = noteData.label || 'Открыть источник';
      pop.appendChild(link);
    }

    if (inlineNoteAnchorEl && inlineNoteAnchorEl !== anchor) {
      setPopoverAnchorExpanded(inlineNoteAnchorEl, false);
    }
    inlineNoteAnchorEl = anchor;
    setPopoverAnchorExpanded(anchor, true);

    pop.hidden = false;
    positionInlineNotePopover(anchor);
  }

  function openRunnerTicketsPromoPopover(anchor) {
    if (!anchor || !el.heroPromoTicket) return;
    clearInlineNoteCloseTimer();
    const pop = ensureInlineNotePopover();
    pop.innerHTML = '';
    pop.classList.add('inline-note-popover--promo');
    const promoTicket = el.heroPromoTicket.cloneNode(true);
    promoTicket.classList.add('hero-promo__ticket--popover');
    pop.appendChild(promoTicket);
    if (inlineNoteAnchorEl && inlineNoteAnchorEl !== anchor) {
      setPopoverAnchorExpanded(inlineNoteAnchorEl, false);
    }
    inlineNoteAnchorEl = anchor;
    pop.hidden = false;
    positionInlineNotePopover(anchor);
  }

  function buildExplanationWithInlineNotes(explanation, sources) {
    const sourceList = Array.isArray(sources) ? sources : [];
    inlineNoteStore.clear();

    let baseText = String(explanation || '');
    if (!/\[\d+\]/.test(baseText) && sourceList.length) {
      const trail = sourceList.map((_, i) => `[${i + 1}]`).join(' ');
      baseText = `${baseText} ${trail}`;
    }

    const escaped = escapeHtml(baseText);
    return escaped.replace(/\[(\d+)\]/g, (match, num) => {
      const idx = Number(num) - 1;
      const src = sourceList[idx];
      if (!src || (!src.note && !src.url && !src.label)) return match;
      inlineNoteSeed += 1;
      const key = `inline-note-${inlineNoteSeed}`;
      inlineNoteStore.set(key, {
        note: src.note || '',
        url: src.url || '',
        label: src.label || 'Открыть источник',
      });
      return `<button type="button" class="inline-note-ref" data-inline-note-key="${key}" aria-expanded="false" aria-label="Показать сноску ${num}">[${num}]</button>`;
    });
  }

  function setFeedbackExplanation(explanation, sources) {
    if (!el.feedbackExplain) return;
    el.feedbackExplain.innerHTML = buildExplanationWithInlineNotes(explanation, sources);
    closeInlineNotePopover();
  }

  function getQuestionImageSrc(q) {
    return (
      q.image || (q && typeof q.id !== 'undefined' ? `img/quiz/${q.id}.png` : DEFAULT_QUESTION_IMAGE)
    );
  }

  function preloadImage(src) {
    if (!src) return Promise.resolve();

    const cached = preloadedQuestionImages.get(src);
    if (cached) return cached.promise;

    let resolveDone;
    const img = new Image();
    const entry = {
      img,
      loaded: false,
      promise: new Promise((resolve) => {
        resolveDone = resolve;
      }),
    };

    const finish = () => {
      if (entry.loaded) return;
      entry.loaded = true;
      resolveDone();
    };

    img.decoding = 'async';
    img.loading = 'eager';
    img.onload = finish;
    img.onerror = finish;
    preloadedQuestionImages.set(src, entry);
    img.src = src;

    if (typeof img.decode === 'function') {
      img.decode().then(finish).catch(() => {});
    }

    if (img.complete) finish();

    return entry.promise;
  }

  function warmQuestionImages(fromIndex, count) {
    const safeFrom = Math.max(0, fromIndex || 0);
    const safeCount = Math.max(0, count || 0);

    for (let i = safeFrom; i < Math.min(TOTAL, safeFrom + safeCount); i += 1) {
      preloadImage(getQuestionImageSrc(questions[i]));
    }
  }

  function scheduleRemainingQuestionImageWarmup() {
    const warmRest = () => {
      warmQuestionImages(QUESTION_IMAGE_PRELOAD_AHEAD, TOTAL);
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(warmRest, { timeout: 1500 });
      return;
    }

    window.setTimeout(warmRest, 500);
  }

  function renderQuestionMedia(q) {
    const imageSrc = getQuestionImageSrc(q);
    if (!el.cardImage) return;

    pendingCardImageToken = `${q && typeof q.id !== 'undefined' ? q.id : 'default'}:${imageSrc}`;
    const imageToken = pendingCardImageToken;
    el.cardImage.alt = q.imageAlt || '';

    if (!imageSrc) {
      el.cardImage.hidden = true;
      el.cardImage.removeAttribute('src');
      return;
    }

    const showImage = () => {
      if (!el.cardImage || pendingCardImageToken !== imageToken) return;
      el.cardImage.src = imageSrc;
      el.cardImage.hidden = false;
    };

    const cached = preloadedQuestionImages.get(imageSrc);
    if (cached && cached.loaded) {
      showImage();
      return;
    }

    // If the next image is still downloading, hide the previous frame
    // instead of flashing the old question art for a moment.
    el.cardImage.hidden = true;
    preloadImage(imageSrc).finally(showImage);
  }

  function renderFeedbackMedia() {
    if (!el.feedbackImage || !el.feedbackMediaFrame) return;
    el.feedbackImage.hidden = true;
    el.feedbackImage.removeAttribute('src');
    el.feedbackMediaFrame.hidden = true;
  }

  function renderFeedbackQuestionPreview(q) {
    if (!q || !el.feedbackQuestionText) return;
    el.feedbackQuestionText.textContent = q.text;
  }

  function populateFeedbackSources(sources) {
    if (el.feedbackSources) {
      el.feedbackSources.innerHTML = '';
    }
    if (el.feedbackSourcesBlock) {
      el.feedbackSourcesBlock.hidden = true;
    }
  }

  function renderQuestionCard(q) {
    if (!q) return;
    renderQuestionMedia(q);
    renderFeedbackMedia();
    renderFeedbackQuestionPreview(q);
    warmQuestionImages(index, QUESTION_IMAGE_PRELOAD_AHEAD);
    if (el.cardText) el.cardText.textContent = q.text;
  }

  function primeFeedback(q) {
    if (!q) return;
    if (el.feedbackTitle) el.feedbackTitle.textContent = '';
    setFeedbackExplanation(q.explanation, q.sources);
    resetFeedbackCardState();
    populateFeedbackSources(q.sources);
  }

  function feedbackHeading(q, correct) {
    const suffix = q.correct === 'myth' ? 'это миф' : 'это правда';
    return bindShortWords(correct ? `Да, ${suffix}` : `Не совсем, ${suffix}`);
  }

  function populateFeedback(q, correct) {
    if (!q) return;
    resetFeedbackCardState();
    el.feedbackTitle.textContent = bindShortWords(feedbackHeading(q, correct));
    setFeedbackExplanation(q.explanation, q.sources);
    if (el.feedbackCard) {
      el.feedbackCard.classList.toggle('feedback--result-correct', correct === true);
      el.feedbackCard.classList.toggle('feedback--result-incorrect', correct === false);
    }
    populateFeedbackSources(q.sources);
  }

  function populateResult(correctCount) {
    const tier = tierCopy(correctCount);
    if (el.resultTitle) el.resultTitle.textContent = tier.title;
    if (el.result) {
      el.result.dataset.resultTone = tier.tone || 'mid';
    }
    el.resultTier.innerHTML = `<p>${bindShortWords(tier.body)}</p>`;
    el.resultScore.textContent = bindShortWords(
      `Правильных ответов: ${correctCount} из ${TOTAL}`
    );
  }

  function renderCard() {
    if (index >= TOTAL) {
      finishQuiz();
      return;
    }
    if (cardFlyTimeoutId) {
      window.clearTimeout(cardFlyTimeoutId);
      cardFlyTimeoutId = 0;
    }
    reviewMode = false;
    cardAnimating = false;
    questionAnswered = false;
    syncRunnerLayout();
    const q = questions[index];
    renderQuestionCard(q);
    primeFeedback(q);
    setQuizAnsweredState(false);
    el.cardText.style.color = '';
    el.card.style.transition = '';
    el.card.style.transform = '';
    el.card.style.opacity = '1';
    cardOffsetX = 0;
    if (el.quizCardArea) {
      el.quizCardArea.scrollTop = 0;
    }
    setProgress();
    if (!runnerAnimRafId) {
      paintRunnerPosition(true);
    }
    updateQuizRunnerTicketsUi();
    requestQuizCardOverflowHintSync();
  }

  function renderReviewCard() {
    if (index < 0 || index >= TOTAL) return;
    if (cardFlyTimeoutId) {
      window.clearTimeout(cardFlyTimeoutId);
      cardFlyTimeoutId = 0;
    }
    syncRunnerLayout();
    reviewMode = true;
    cardAnimating = false;
    questionAnswered = true;
    const q = questions[index];
    const answerRecord = answers[index] || {
      choice: q.correct,
      correct: true,
    };
    renderQuestionCard(q);
    primeFeedback(q);
    populateFeedback(q, answerRecord.correct);
    el.cardText.style.color = '';
    el.card.style.transition = '';
    el.card.style.transform = '';
    el.card.style.opacity = '1';
    cardOffsetX = 0;
    if (el.quizCardArea) {
      el.quizCardArea.scrollTop = 0;
    }
    setProgress();
    setQuizAnsweredState(true);
    if (el.btnReviewPrev) {
      el.btnReviewPrev.disabled = index <= 0;
    }
    if (el.btnReviewNext) {
      el.btnReviewNext.disabled = index >= TOTAL - 1;
    }
    paintRunnerPosition(true);
    updateQuizRunnerTicketsUi();
    requestQuizCardOverflowHintSync();
  }

  function answer(choice) {
    if (questionAnswered) return;
    const q = questions[index];
    const correct = q.correct === choice;
    questionAnswered = true;
    if (correct) score += 1;
    answers[index] = { choice, correct };
    warmQuestionImages(index + 1, QUESTION_IMAGE_PRELOAD_AHEAD);
    runRunnerTo(index + 1);

    setProgress();
    populateFeedback(q, correct);
    setQuizAnsweredState(true);
    requestQuizCardOverflowHintSync();
  }

  function finishQuiz() {
    reviewMode = false;
    populateResult(score);
    showScreen(el.result);
  }

  function goNextFromFeedback() {
    index += 1;
    if (index >= TOTAL) {
      finishQuiz();
    } else {
      showScreen(el.quiz);
      renderCard();
    }
  }

  function goReviewPrev() {
    if (!reviewMode || index <= 0) return;
    index -= 1;
    renderReviewCard();
  }

  function goReviewNext() {
    if (!reviewMode || index >= TOTAL - 1) return;
    index += 1;
    renderReviewCard();
  }

  function flyCardOutAndAnswer(choice) {
    if (cardAnimating || questionAnswered || !el.card) return;
    cardAnimating = true;
    const dir = choice === 'myth' ? -1 : 1;
    const startX = Number(cardOffsetX) || 0;
    answer(choice);
    updateCardTextTint(dir * CARD_TINT_MAX);
    const cardWidth = Math.ceil(el.card.getBoundingClientRect().width || 0);
    const travel = Math.max(window.innerWidth * 0.55 + 140, cardWidth + 180);
    const finalX = dir * travel;
    const startRotation = startX * 0.05;
    const endRotation = dir * 14;

    if (cardFlyTimeoutId) {
      window.clearTimeout(cardFlyTimeoutId);
      cardFlyTimeoutId = 0;
    }

    el.card.style.transition = 'none';
    el.card.style.transform = `translate3d(${startX}px, 0, 0) rotate(${startRotation}deg)`;
    el.card.style.opacity = '1';
    el.card.offsetWidth;

    window.requestAnimationFrame(() => {
      if (!cardAnimating) return;
      el.card.style.transition =
        `transform ${FLY_OUT_MS}ms cubic-bezier(0.22, 0.8, 0.2, 1), ` +
        `opacity ${Math.round(FLY_OUT_MS * 0.72)}ms ease ${Math.round(
          FLY_OUT_MS * 0.16
        )}ms`;
      el.card.style.transform = `translate3d(${finalX}px, 0, 0) rotate(${endRotation}deg)`;
      el.card.style.opacity = '0';
    });

    cardFlyTimeoutId = window.setTimeout(() => {
      cardFlyTimeoutId = 0;
      cardAnimating = false;
      cardOffsetX = 0;
      if (!reviewMode && questionAnswered) {
        el.quiz?.classList.add('quiz-screen--answer-settled');
        if (el.cardText) {
          el.cardText.style.color = '';
        }
        el.card.style.transition = 'none';
        el.card.style.transform = '';
        el.card.style.opacity = '1';
        el.card.offsetWidth;
        el.card.style.transition = '';
      }
    }, FLY_OUT_MS);
  }

  function bindSwipe() {
    const card = el.card;
    if (!card) return;
    let touchGestureAxis = '';

    function resetCardSwipeUi() {
      card.style.transform = '';
      card.style.opacity = '1';
      cardOffsetX = 0;
      if (el.cardText) el.cardText.style.color = '';
    }

    function onDown(clientX, clientY) {
      if (cardAnimating || (questionAnswered && !reviewMode)) return;
      touchStartX = clientX;
      touchStartY = clientY;
      cardOffsetX = 0;
      touchGestureAxis = '';
    }

    function onMove(clientX) {
      if (cardAnimating || (questionAnswered && !reviewMode)) return;
      cardOffsetX = clientX - touchStartX;
      const rot = cardOffsetX * 0.05;
      card.style.transform = `translateX(${cardOffsetX}px) rotate(${rot}deg)`;
      if (reviewMode) {
        card.style.opacity = '1';
        return;
      }
      const fade = 1 - Math.min(Math.abs(cardOffsetX) / 300, 0.35);
      card.style.opacity = String(fade);
      updateCardTextTint(cardOffsetX);
    }

    function onUp(clientX) {
      const dx = clientX - touchStartX;
      if (reviewMode) {
        if (dx < -SWIPE_THRESHOLD) {
          goReviewNext();
        } else if (dx > SWIPE_THRESHOLD) {
          goReviewPrev();
        } else {
          resetCardSwipeUi();
        }
        return;
      }
      if (cardAnimating || questionAnswered) return;
      if (dx < -SWIPE_THRESHOLD) {
        flyCardOutAndAnswer('myth');
      } else if (dx > SWIPE_THRESHOLD) {
        flyCardOutAndAnswer('truth');
      } else {
        resetCardSwipeUi();
      }
    }

    card.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );

    card.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (!touchGestureAxis) {
          if (
            Math.abs(dx) < SWIPE_AXIS_LOCK_THRESHOLD &&
            Math.abs(dy) < SWIPE_AXIS_LOCK_THRESHOLD
          ) {
            return;
          }
          touchGestureAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (touchGestureAxis !== 'x') {
          return;
        }
        e.preventDefault();
        onMove(touch.clientX);
      },
      { passive: false }
    );

    card.addEventListener('touchend', (e) => {
      if (e.changedTouches.length !== 1) return;
      const activeAxis = touchGestureAxis;
      touchGestureAxis = '';
      if (activeAxis !== 'x') {
        resetCardSwipeUi();
        return;
      }
      onUp(e.changedTouches[0].clientX);
    });

    card.addEventListener('touchcancel', () => {
      touchGestureAxis = '';
      resetCardSwipeUi();
    });

    let mouseDown = false;
    card.addEventListener('mousedown', (e) => {
      mouseDown = true;
      onDown(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      onMove(e.clientX);
    });
    window.addEventListener('mouseup', (e) => {
      if (!mouseDown) return;
      mouseDown = false;
      onUp(e.clientX);
    });
  }

  function setExperienceState(nextState) {
    if (!el.body) return;
    EXPERIENCE_STATES.forEach((stateName) => {
      el.body.classList.toggle(stateName, stateName === nextState);
    });
  }

  function activateQuizExperience() {
    index = 0;
    score = 0;
    answers = [];
    reviewMode = false;
    if (el.pageContent) {
      el.pageContent.scrollTop = 0;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setExperienceState('experience--quiz-active');
    showScreen(el.quiz);
    syncRunnerLayout();
    resetRunnerTicketsDecor();
    setRunnerProgress(0, true);
    renderCard();
  }

  function startQuiz() {
    var active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
    if (el.body && el.body.classList.contains('experience--transitioning')) return;
    if (el.body && el.body.classList.contains('experience--landing')) {
      if (typeof window.QUIZ_HERO_TRANSITION?.start === 'function') {
        setExperienceState('experience--transitioning');
        window.QUIZ_HERO_TRANSITION.start({
          onComplete: activateQuizExperience,
        });
        return;
      }
    } else {
      activateQuizExperience();
      return;
    }
    if (typeof window.QUIZ_HERO_TRANSITION?.start === 'function') {
      setExperienceState('experience--transitioning');
      window.QUIZ_HERO_TRANSITION.start({
        onComplete: activateQuizExperience,
      });
      return;
    }
    activateQuizExperience();
  }

  window.QUIZ_START_FROM_HERO = startQuiz;

  el.feedbackExplain?.addEventListener('click', (event) => {
    const trigger = event.target.closest('.inline-note-ref');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const noteData = getInlineNoteFromTrigger(trigger);
    if (!noteData) return;
    if (inlineNoteAnchorEl === trigger && inlineNotePopoverEl && !inlineNotePopoverEl.hidden) {
      closeInlineNotePopover();
      return;
    }
    openInlineNotePopover(trigger, noteData);
  });

  el.feedbackExplain?.addEventListener('mouseover', (event) => {
    if (!isDesktopHoverInput()) return;
    const trigger = event.target.closest('.inline-note-ref');
    if (!trigger) return;
    const related = event.relatedTarget;
    if (related instanceof Element && trigger.contains(related)) return;
    const noteData = getInlineNoteFromTrigger(trigger);
    if (!noteData) return;
    openInlineNotePopover(trigger, noteData);
  });

  el.feedbackExplain?.addEventListener('mouseout', (event) => {
    if (!isDesktopHoverInput()) return;
    const trigger = event.target.closest('.inline-note-ref');
    if (!trigger) return;
    const related = event.relatedTarget;
    if (
      related instanceof Element &&
      (trigger.contains(related) || related.closest('.inline-note-popover'))
    ) {
      clearInlineNoteCloseTimer();
      return;
    }
    scheduleInlineNoteClose();
  });

  el.runnerTickets?.addEventListener('mouseover', (event) => {
    if (!isDesktopHoverInput()) return;
    if (!el.runnerTickets?.classList.contains('quiz-runner__tickets--visible')) return;
    const trigger = event.currentTarget;
    const related = event.relatedTarget;
    if (related instanceof Element && trigger.contains(related)) return;
    openRunnerTicketsPromoPopover(trigger);
  });

  el.runnerTickets?.addEventListener('mouseout', (event) => {
    if (!isDesktopHoverInput()) return;
    const trigger = event.currentTarget;
    const related = event.relatedTarget;
    if (related instanceof Element && trigger.contains(related)) {
      clearInlineNoteCloseTimer();
      return;
    }
    closeInlineNotePopover();
  });

  document.addEventListener('click', (event) => {
    if (
      !event.target.closest('.inline-note-ref') &&
      !event.target.closest('.quiz-runner__tickets') &&
      !event.target.closest('.inline-note-popover')
    ) {
      closeInlineNotePopover();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeInlineNotePopover();
  });
  window.addEventListener('resize', () => {
    if (inlineNoteAnchorEl && inlineNotePopoverEl && !inlineNotePopoverEl.hidden) {
      positionInlineNotePopover(inlineNoteAnchorEl);
    }
  });
  window.addEventListener(
    'scroll',
    () => {
      if (inlineNoteAnchorEl && inlineNotePopoverEl && !inlineNotePopoverEl.hidden) {
        closeInlineNotePopover();
      }
    },
    true
  );

  function openSuccessExperience() {
    if (el.pageContent) {
      el.pageContent.scrollTop = 0;
    }
    showScreen(el.result);
    setExperienceState('experience--success-active');
    if (typeof window.QUIZ_HERO_TRANSITION?.rewind === 'function') {
      window.QUIZ_HERO_TRANSITION.rewind();
    } else if (typeof window.QUIZ_HERO_TRANSITION?.reset === 'function') {
      window.QUIZ_HERO_TRANSITION.reset();
    }
  }

  function openReviewExperience() {
    if (el.pageContent) {
      el.pageContent.scrollTop = 0;
    }
    index = 0;
    setExperienceState('experience--quiz-active');
    showScreen(el.quiz);
    syncRunnerLayout();
    resetRunnerTicketsDecor();
    setRunnerProgress(TOTAL, true);
    renderReviewCard();
  }

  el.btnStart?.addEventListener('click', startQuiz);
  el.btnQuizRestart?.addEventListener('click', startQuiz);

  el.btnMyth?.addEventListener('click', () => flyCardOutAndAnswer('myth'));
  el.btnTruth?.addEventListener('click', () => flyCardOutAndAnswer('truth'));
  el.btnNext?.addEventListener('click', goNextFromFeedback);
  el.btnReviewPrev?.addEventListener('click', goReviewPrev);
  el.btnReviewNext?.addEventListener('click', goReviewNext);
  el.btnSuccessReview?.addEventListener('click', openReviewExperience);

  el.formEl?.addEventListener('input', syncLeadFormSubmitReadyState);
  el.formEl?.addEventListener('change', syncLeadFormSubmitReadyState);

  el.formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (typeof el.formEl.reportValidity === 'function' && !el.formEl.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(el.formEl).entries());
    window.console.log('Lead form payload', payload);
    el.formEl?.reset();
    syncLeadFormSubmitReadyState();
    openSuccessExperience();
  });

  bindSwipe();
  el.quizCardArea?.addEventListener('scroll', syncQuizCardOverflowHint, { passive: true });
  syncRunnerLayout();
  setRunnerProgress(0, true);
  window.addEventListener('resize', () => {
    syncRunnerLayout();
    paintRunnerPosition(true);
    requestQuizCardOverflowHintSync();
  });
  warmQuestionImages(0, QUESTION_IMAGE_PRELOAD_AHEAD);
  scheduleRemainingQuestionImageWarmup();
  applyNbspInTree(document.body);
  syncLeadFormSubmitReadyState();
  setExperienceState('experience--landing');
  if (typeof window.QUIZ_HERO_TRANSITION?.reset === 'function') {
    window.QUIZ_HERO_TRANSITION.reset();
  }
})();
