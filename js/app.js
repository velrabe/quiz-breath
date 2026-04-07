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
    cardImage: document.getElementById('card-question-media'),
    cardText: document.getElementById('card-question-text'),
    progress: document.getElementById('quiz-progress'),
    runnerTrack: document.getElementById('quiz-runner-track'),
    runnerStones: document.getElementById('quiz-runner-stones'),
    runnerPanda: document.getElementById('quiz-runner-panda'),
    runnerSprite: document.getElementById('quiz-runner-sprite'),
    quizHint: document.getElementById('quiz-swipe-hint'),
    answerActions: document.getElementById('quiz-answer-actions'),
    nextActions: document.getElementById('quiz-next-actions'),
    reviewActions: document.getElementById('quiz-review-actions'),
    btnMyth: document.getElementById('btn-myth'),
    btnTruth: document.getElementById('btn-truth'),

    feedbackCard: document.getElementById('feedback-card'),
    feedbackTitle: document.getElementById('feedback-title'),
    feedbackExplain: document.getElementById('feedback-explanation'),
    feedbackSources: document.getElementById('feedback-sources'),
    feedbackSourcesBlock: document.querySelector('#feedback-card .sources-block'),
    feedbackQuestionInline: document.getElementById('feedback-question-inline'),
    feedbackQuestionMedia: document.getElementById('feedback-question-media'),
    feedbackQuestionText: document.getElementById('feedback-question-text'),
    btnNext: document.getElementById('btn-feedback-next'),

    resultTier: document.getElementById('result-tier-message'),
    resultScore: document.getElementById('result-score'),
    resultTitle: document.getElementById('result-title'),

    formEl: document.getElementById('lead-form'),
  };

  let index = 0;
  let score = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let cardOffsetX = 0;
  const SWIPE_THRESHOLD = 80;
  let cardAnimating = false;
  let cardFlyTimeoutId = 0;
  let questionAnswered = false;
  let reviewMode = false;
  let answers = [];
  const FLY_OUT_MS = 400;
  const RUNNER_MOVE_MS = 980;
  const RUNNER_SPRITE_COLS = 5;
  const RUNNER_SPRITE_ROWS = 2;
  const RUNNER_IDLE_FRAME = 1;
  const RUNNER_WALK_IN_FRAMES = [2, 3, 4, 5, 6];
  const RUNNER_WALK_LOOP_FRAMES = [4, 3, 4, 5, 6];
  const RUNNER_JUMP_FRAMES = [2, 7, 8, 8, 8, 9, 2];
  const RUNNER_JUMP_HEIGHT_RATIO = 0.48;
  const RUNNER_STONE_VISIBLE_WIDTH_RATIO = 0.3;
  const INLINE_NOTE_HOVER_CLOSE_DELAY = 300;
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
  let pendingFeedbackImageToken = '';
  let runnerCompleted = 0;
  let runnerVisualRatio = 0;
  let runnerAnimRafId = 0;
  let runnerAnimToken = 0;
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
  const RGB_MYTH = { r: 220, g: 38, b: 38 };
  const RGB_TRUTH = { r: 22, g: 163, b: 74 };

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
    if (el.runnerStones.childElementCount === stonesCount) return;

    el.runnerStones.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= stonesCount; i += 1) {
      const stone = document.createElement('span');
      stone.className = 'quiz-runner__stone';
      stone.style.setProperty('--stone-index', String(i));
      stone.style.setProperty('--stone-path-ratio', String(i / stonesCount));
      frag.appendChild(stone);
    }
    el.runnerStones.appendChild(frag);
  }

  function isRunnerReducedMotion() {
    return Boolean(reduceMotionMql && reduceMotionMql.matches);
  }

  function clampRunnerRatio(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  function getRunnerTravelPx() {
    if (!el.runnerTrack || !el.runnerPanda) return 0;
    return Math.max(0, el.runnerTrack.clientWidth - el.runnerPanda.clientWidth);
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

  function applyRunnerTransform(ratio, jumpYPx) {
    if (!el.runnerPanda) return;
    const x = Math.round(getRunnerTravelPx() * clampRunnerRatio(ratio));
    const y = Math.round(Number(jumpYPx) || 0);
    el.runnerPanda.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function stopRunnerAnimation() {
    if (runnerAnimRafId) {
      window.cancelAnimationFrame(runnerAnimRafId);
      runnerAnimRafId = 0;
    }
    runnerAnimToken += 1;
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
    const apexStart = 0.42;
    const apexEnd = 0.6;

    if (local <= apexStart) {
      const rise = local / apexStart;
      return -jumpHeight * Math.sin((Math.PI / 2) * rise);
    }
    if (local <= apexEnd) {
      return -jumpHeight;
    }
    const fall = (local - apexEnd) / (1 - apexEnd);
    return -jumpHeight * Math.cos((Math.PI / 2) * fall);
  }

  function runnerMoveProgress(t, walkInEnd, jumpEnd, walkOutEnd) {
    const x = clampRunnerRatio(t);
    if (x < walkInEnd) {
      const local = x / walkInEnd;
      return 0.34 * easeInOutCubic(local);
    }
    if (x < jumpEnd) {
      const local = (x - walkInEnd) / (jumpEnd - walkInEnd);
      return 0.34 + 0.46 * easeInOutCubic(local);
    }
    if (x < walkOutEnd) {
      const local = (x - jumpEnd) / (walkOutEnd - jumpEnd);
      return 0.8 + 0.17 * easeInOutCubic(local);
    }
    const local = (x - walkOutEnd) / (1 - walkOutEnd);
    return 0.97 + 0.03 * easeInOutCubic(local);
  }

  function getRunnerJumpWindow(startRatio, targetRatio, targetCompleted) {
    if (!el.runnerTrack || !el.runnerPanda || !el.runnerStones) return null;
    const stoneIndex = Math.max(0, Math.min(el.runnerStones.children.length - 1, targetCompleted - 1));
    const stoneEl = el.runnerStones.children[stoneIndex];
    if (!stoneEl) return null;

    const ratioSpan = targetRatio - startRatio;
    if (ratioSpan <= 0.0001) return null;

    const travel = getRunnerTravelPx();
    const pandaW = el.runnerPanda.clientWidth || 0;
    if (travel <= 0 || pandaW <= 0) return null;

    const trackRect = el.runnerTrack.getBoundingClientRect();
    const stoneRect = stoneEl.getBoundingClientRect();
    if (!trackRect.width || !stoneRect.width) return null;

    const stoneCenterX = stoneRect.left - trackRect.left + stoneRect.width * 0.5;
    const visibleHalf = stoneRect.width * RUNNER_STONE_VISIBLE_WIDTH_RATIO * 0.5;
    const pandaCenterOffset = pandaW * 0.5;

    let startGlobal = (stoneCenterX - visibleHalf - pandaCenterOffset) / travel;
    let endGlobal = (stoneCenterX + visibleHalf - pandaCenterOffset) / travel;

    startGlobal = Math.max(startRatio, Math.min(targetRatio, startGlobal));
    endGlobal = Math.max(startRatio, Math.min(targetRatio, endGlobal));

    if (endGlobal < startGlobal) {
      const swap = startGlobal;
      startGlobal = endGlobal;
      endGlobal = swap;
    }

    const minWindow = Math.max(ratioSpan * 0.16, 0.01);
    if (endGlobal - startGlobal < minWindow) {
      const center = (startGlobal + endGlobal) * 0.5;
      startGlobal = Math.max(startRatio, center - minWindow * 0.5);
      endGlobal = Math.min(targetRatio, center + minWindow * 0.5);
    }

    let startT = (startGlobal - startRatio) / ratioSpan;
    let endT = (endGlobal - startRatio) / ratioSpan;
    startT = Math.max(0.06, Math.min(0.88, startT));
    endT = Math.max(startT + 0.06, Math.min(0.95, endT));
    return { startT, endT };
  }

  function paintRunnerPosition(immediate) {
    if (!el.runnerPanda || !el.runnerSprite) return;
    if (immediate) {
      stopRunnerAnimation();
    }
    const ratio = TOTAL > 0 ? clampRunnerRatio(runnerCompleted / TOTAL) : 0;
    runnerVisualRatio = ratio;
    applyRunnerTransform(ratio, 0);
    setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
  }

  function setRunnerProgress(completedCount, immediate) {
    runnerCompleted = Math.min(Math.max(completedCount, 0), TOTAL);
    paintRunnerPosition(Boolean(immediate));
  }

  function runRunnerTo(completedCount) {
    const targetCompleted = Math.min(Math.max(completedCount, 0), TOTAL);
    const targetRatio = TOTAL > 0 ? clampRunnerRatio(targetCompleted / TOTAL) : 0;
    const startRatio = clampRunnerRatio(runnerVisualRatio);
    runnerCompleted = targetCompleted;

    if (!el.runnerPanda || !el.runnerSprite || targetRatio <= startRatio + 0.0005) {
      runnerVisualRatio = targetRatio;
      applyRunnerTransform(targetRatio, 0);
      setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
      return;
    }

    if (isRunnerReducedMotion()) {
      runnerVisualRatio = targetRatio;
      applyRunnerTransform(targetRatio, 0);
      setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
      return;
    }

    stopRunnerAnimation();

    const defaultJumpStart = 0.24;
    const defaultJumpEnd = 0.62;
    const jumpWindow = getRunnerJumpWindow(startRatio, targetRatio, targetCompleted);
    const walkInEnd = jumpWindow ? jumpWindow.startT : defaultJumpStart;
    const jumpEnd = jumpWindow ? jumpWindow.endT : defaultJumpEnd;
    const walkOutEnd = 0.92;
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
      const moveT = runnerMoveProgress(t, walkInEnd, jumpEnd, walkOutEnd);
      const ratio = startRatio + (targetRatio - startRatio) * moveT;

      let frame = RUNNER_IDLE_FRAME;
      let jumpY = 0;

      if (t < walkInEnd) {
        const local = t / walkInEnd;
        frame = frameFromSequence(RUNNER_WALK_IN_FRAMES, local);
      } else if (t < jumpEnd) {
        const local = (t - walkInEnd) / (jumpEnd - walkInEnd);
        frame = frameFromSequence(RUNNER_JUMP_FRAMES, local);
        jumpY = computeJumpOffset(local, jumpHeight);
      } else if (t < walkOutEnd) {
        const local = (t - jumpEnd) / (walkOutEnd - jumpEnd);
        frame = frameFromSequence(RUNNER_WALK_LOOP_FRAMES, local);
      }

      runnerVisualRatio = ratio;
      applyRunnerTransform(ratio, jumpY);
      setRunnerSpriteFrame(frame);

      if (t >= 1) {
        runnerAnimRafId = 0;
        runnerVisualRatio = targetRatio;
        applyRunnerTransform(targetRatio, 0);
        setRunnerSpriteFrame(RUNNER_IDLE_FRAME);
        return;
      }

      runnerAnimRafId = window.requestAnimationFrame(tick);
    };

    runnerAnimRafId = window.requestAnimationFrame(tick);
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
  }

  function resetFeedbackCardState() {
    if (!el.feedbackCard) return;
    el.feedbackCard.classList.remove('feedback--myth', 'feedback--truth');
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
      if (related instanceof Element && related.closest('.inline-note-ref')) {
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
    inlineNotePopoverEl.innerHTML = '';
    if (inlineNoteAnchorEl) {
      inlineNoteAnchorEl.setAttribute('aria-expanded', 'false');
      inlineNoteAnchorEl = null;
    }
  }

  function positionInlineNotePopover(anchor) {
    if (!inlineNotePopoverEl || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const popRect = inlineNotePopoverEl.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + popRect.width > window.innerWidth - pad) {
      left = window.innerWidth - popRect.width - pad;
    }
    if (left < pad) left = pad;
    if (top + popRect.height > window.innerHeight - pad) {
      top = rect.top - popRect.height - 8;
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
      inlineNoteAnchorEl.setAttribute('aria-expanded', 'false');
    }
    inlineNoteAnchorEl = anchor;
    anchor.setAttribute('aria-expanded', 'true');

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

  function renderFeedbackQuestionPreview(q) {
    if (!q || !el.feedbackQuestionText || !el.feedbackQuestionMedia) return;
    el.feedbackQuestionText.textContent = q.text;

    const imageSrc = getQuestionImageSrc(q);
    pendingFeedbackImageToken = `${q && typeof q.id !== 'undefined' ? q.id : 'default'}:${imageSrc}`;
    const imageToken = pendingFeedbackImageToken;
    el.feedbackQuestionMedia.alt = q.imageAlt || '';

    if (!imageSrc) {
      el.feedbackQuestionMedia.hidden = true;
      el.feedbackQuestionMedia.removeAttribute('src');
      return;
    }

    const showImage = () => {
      if (!el.feedbackQuestionMedia || pendingFeedbackImageToken !== imageToken) return;
      el.feedbackQuestionMedia.src = imageSrc;
      el.feedbackQuestionMedia.hidden = false;
    };

    const cached = preloadedQuestionImages.get(imageSrc);
    if (cached && cached.loaded) {
      showImage();
      return;
    }

    el.feedbackQuestionMedia.hidden = true;
    preloadImage(imageSrc).finally(showImage);
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
    renderFeedbackQuestionPreview(q);
    warmQuestionImages(index, QUESTION_IMAGE_PRELOAD_AHEAD);
    if (el.cardText) el.cardText.textContent = q.text;
  }

  function primeFeedback(q) {
    if (!q) return;
    if (el.feedbackTitle) el.feedbackTitle.textContent = '';
    setFeedbackExplanation(q.explanation, q.sources);
    resetFeedbackCardState();
    if (el.feedbackCard) {
      el.feedbackCard.classList.add(
        q.correct === 'myth' ? 'feedback--myth' : 'feedback--truth'
      );
    }
    populateFeedbackSources(q.sources);
  }

  function feedbackHeading(q, correct) {
    const suffix = q.correct === 'myth' ? 'это миф' : 'это правда';
    return bindShortWords(correct ? `Да, ${suffix}` : `Не совсем, ${suffix}`);
  }

  function populateFeedback(q, correct) {
    if (!q) return;
    el.feedbackTitle.textContent = bindShortWords(feedbackHeading(q, correct));
    setFeedbackExplanation(q.explanation, q.sources);
    if (el.feedbackCard) {
      el.feedbackCard.classList.toggle('feedback--myth', q.correct === 'myth');
      el.feedbackCard.classList.toggle('feedback--truth', q.correct === 'truth');
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
    const q = questions[index];
    renderQuestionCard(q);
    primeFeedback(q);
    setQuizAnsweredState(false);
    el.cardText.style.color = '';
    el.card.style.transition = '';
    el.card.style.transform = '';
    el.card.style.opacity = '1';
    cardOffsetX = 0;
    setProgress();
    paintRunnerPosition(true);
  }

  function renderReviewCard() {
    if (index < 0 || index >= TOTAL) return;
    if (cardFlyTimeoutId) {
      window.clearTimeout(cardFlyTimeoutId);
      cardFlyTimeoutId = 0;
    }
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
    setProgress();
    setQuizAnsweredState(true);
    if (el.btnReviewPrev) {
      el.btnReviewPrev.disabled = index <= 0;
    }
    if (el.btnReviewNext) {
      el.btnReviewNext.disabled = index >= TOTAL - 1;
    }
    paintRunnerPosition(true);
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

    function onDown(clientX, clientY) {
      if (cardAnimating || (questionAnswered && !reviewMode)) return;
      touchStartX = clientX;
      touchStartY = clientY;
      cardOffsetX = 0;
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
          card.style.transform = '';
          card.style.opacity = '1';
          if (el.cardText) el.cardText.style.color = '';
        }
        return;
      }
      if (cardAnimating || questionAnswered) return;
      if (dx < -SWIPE_THRESHOLD) {
        flyCardOutAndAnswer('myth');
      } else if (dx > SWIPE_THRESHOLD) {
        flyCardOutAndAnswer('truth');
      } else {
        card.style.transform = '';
        card.style.opacity = '1';
        if (el.cardText) el.cardText.style.color = '';
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
        onMove(e.touches[0].clientX);
      },
      { passive: true }
    );

    card.addEventListener('touchend', (e) => {
      if (e.changedTouches.length !== 1) return;
      onUp(e.changedTouches[0].clientX);
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
    setRunnerProgress(0, true);
    if (el.pageContent) {
      el.pageContent.scrollTop = 0;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setExperienceState('experience--quiz-active');
    showScreen(el.quiz);
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

  document.addEventListener('click', (event) => {
    if (
      !event.target.closest('.inline-note-ref') &&
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
    setRunnerProgress(TOTAL, true);
    setExperienceState('experience--quiz-active');
    showScreen(el.quiz);
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

  el.formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (typeof el.formEl.reportValidity === 'function' && !el.formEl.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(el.formEl).entries());
    window.console.log('Lead form payload', payload);
    el.formEl?.reset();
    openSuccessExperience();
  });

  bindSwipe();
  updateRunnerSegments();
  setRunnerProgress(0, true);
  window.addEventListener('resize', () => {
    paintRunnerPosition(true);
  });
  warmQuestionImages(0, QUESTION_IMAGE_PRELOAD_AHEAD);
  scheduleRemainingQuestionImageWarmup();
  applyNbspInTree(document.body);
  setExperienceState('experience--landing');
  if (typeof window.QUIZ_HERO_TRANSITION?.reset === 'function') {
    window.QUIZ_HERO_TRANSITION.reset();
  }
})();
