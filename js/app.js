(function () {
  'use strict';

  const questions = window.QUIZ_QUESTIONS || [];
  const TOTAL = questions.length;
  const DEFAULT_QUESTION_IMAGE = 'img/banners/banner.png';

  const el = {
    stage: document.getElementById('quiz-stage'),
    intro: document.getElementById('screen-intro'),
    quiz: document.getElementById('screen-quiz'),
    result: document.getElementById('screen-result'),

    btnStart: document.getElementById('btn-start'),

    card: document.getElementById('quiz-card'),
    cardImage: document.getElementById('card-question-media'),
    cardText: document.getElementById('card-question-text'),
    progress: document.getElementById('quiz-progress'),
    quizHint: document.getElementById('quiz-swipe-hint'),
    answerActions: document.getElementById('quiz-answer-actions'),
    nextActions: document.getElementById('quiz-next-actions'),
    btnMyth: document.getElementById('btn-myth'),
    btnTruth: document.getElementById('btn-truth'),

    feedbackCard: document.getElementById('feedback-card'),
    feedbackTitle: document.getElementById('feedback-title'),
    feedbackExplain: document.getElementById('feedback-explanation'),
    feedbackSources: document.getElementById('feedback-sources'),
    btnNext: document.getElementById('btn-feedback-next'),

    resultTier: document.getElementById('result-tier-message'),
    resultScore: document.getElementById('result-score'),

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
  const FLY_OUT_MS = 400;
  let stageHeightSyncRaf = 0;
  let stageHeightApplyRaf = 0;
  let stageMode = 'intro';
  let stageAnimateNextSync = false;

  function createLinkOutIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'source-tag__icon');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('aria-hidden', 'true');
    const stroke = {
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '15 3 21 3 21 9');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '10');
    line.setAttribute('y1', '14');
    line.setAttribute('x2', '21');
    line.setAttribute('y2', '3');
    [path, poly, line].forEach((n) => {
      Object.entries(stroke).forEach(([k, v]) => n.setAttribute(k, v));
      svg.appendChild(n);
    });
    return svg;
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

  function getStageModeForScreen(screen) {
    return screen === el.intro ? 'intro' : 'expanded';
  }

  function showScreen(screen, options) {
    [el.intro, el.quiz, el.result].forEach((s) => {
      if (s) s.hidden = s !== screen;
    });
    stageMode = getStageModeForScreen(screen);
    queueStageHeightSync(options);
  }

  function tierCopy(correctCount) {
    if (correctCount < 5) {
      return {
        title: 'Есть куда расти',
        body:
          'Мифов про астму много — это нормально. Соберите информацию у педиатра или пульмонолога и загляните в материалы на тему: так проще ориентироваться в симптомах и терапии.',
      };
    }
    if (correctCount <= 10) {
      return {
        title: 'Хороший уровень',
        body:
          'Вы уже отделяете часть мифов от фактов. Закрепите знания: обсудите с врачом триггеры, план действий при обострении и почему важна регулярная терапия, а не только «по симптомам».',
      };
    }
    return {
      title: 'Отличный результат',
      body:
        'Вы хорошо ориентируетесь в основах. Поделитесь квизом с близкими и при необходимости углубитесь в материалы — спокойный, информированный подход помогает детям с астмой жить активно.',
    };
  }

  function setProgress() {
    const value = `Вопрос ${Math.min(index + 1, TOTAL)} из ${TOTAL}`;
    if (el.progress) el.progress.textContent = value;
  }

  function setQuizAnsweredState(answered) {
    if (el.quiz) {
      el.quiz.classList.toggle('quiz-screen--answered', answered);
    }
    if (el.card) {
      el.card.style.pointerEvents = answered ? 'none' : '';
    }
    if (el.answerActions) {
      el.answerActions.setAttribute('aria-hidden', answered ? 'true' : 'false');
    }
    if (el.nextActions) {
      el.nextActions.setAttribute('aria-hidden', answered ? 'false' : 'true');
    }
    if (el.quizHint) {
      el.quizHint.setAttribute('aria-hidden', answered ? 'true' : 'false');
    }
  }

  function resetFeedbackCardState() {
    if (!el.feedbackCard) return;
    el.feedbackCard.classList.remove('feedback--correct', 'feedback--incorrect');
  }

  function renderQuestionMedia(q) {
    const imageSrc =
      q.image || (q && typeof q.id !== 'undefined' ? `img/quiz/${q.id}.png` : DEFAULT_QUESTION_IMAGE);
    if (!el.cardImage) return;
    el.cardImage.src = imageSrc;
    el.cardImage.alt = q.imageAlt || '';
    el.cardImage.hidden = !imageSrc;
  }

  function populateFeedbackSources(sources) {
    if (!el.feedbackSources) return;
    el.feedbackSources.innerHTML = '';
    (sources || []).forEach((s) => {
      const a = document.createElement('a');
      a.href = s.url;
      a.className = 'source-tag';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const label = document.createElement('span');
      label.className = 'source-tag__text';
      label.textContent = s.label;
      a.appendChild(label);
      a.appendChild(createLinkOutIcon());
      el.feedbackSources.appendChild(a);
    });
  }

  function renderQuestionCard(q) {
    if (!q) return;
    renderQuestionMedia(q);
    if (el.cardText) el.cardText.textContent = q.text;
  }

  function primeFeedback(q) {
    if (!q) return;
    if (el.feedbackTitle) el.feedbackTitle.textContent = '';
    if (el.feedbackExplain) el.feedbackExplain.textContent = q.explanation;
    resetFeedbackCardState();
    populateFeedbackSources(q.sources);
  }

  function populateFeedback(q, correct) {
    if (!q) return;
    el.feedbackTitle.textContent = correct ? 'Верно' : 'Не совсем';
    el.feedbackExplain.textContent = q.explanation;
    if (el.feedbackCard) {
      el.feedbackCard.classList.toggle('feedback--correct', correct);
      el.feedbackCard.classList.toggle('feedback--incorrect', !correct);
    }
    populateFeedbackSources(q.sources);
  }

  function populateResult(correctCount) {
    const tier = tierCopy(correctCount);
    el.resultTier.innerHTML = `<h3>${tier.title}</h3><p>${tier.body}</p>`;
    el.resultScore.textContent = `Правильных ответов: ${correctCount} из ${TOTAL}`;
  }

  function preserveStageState() {
    return {
      hidden: [el.intro, el.quiz, el.result].map((screen) => ({
        screen,
        hidden: screen ? screen.hidden : true,
      })),
      cardText: el.cardText ? el.cardText.textContent : '',
      cardImageSrc: el.cardImage ? el.cardImage.getAttribute('src') || '' : '',
      cardImageAlt: el.cardImage ? el.cardImage.getAttribute('alt') || '' : '',
      cardImageHidden: el.cardImage ? el.cardImage.hidden : true,
      cardColor: el.cardText ? el.cardText.style.color : '',
      cardTransition: el.card ? el.card.style.transition : '',
      cardTransform: el.card ? el.card.style.transform : '',
      cardOpacity: el.card ? el.card.style.opacity : '',
      feedbackTitle: el.feedbackTitle ? el.feedbackTitle.textContent : '',
      feedbackExplain: el.feedbackExplain ? el.feedbackExplain.textContent : '',
      feedbackSources: el.feedbackSources ? el.feedbackSources.innerHTML : '',
      feedbackCorrect: el.feedbackCard
        ? el.feedbackCard.classList.contains('feedback--correct')
        : false,
      feedbackIncorrect: el.feedbackCard
        ? el.feedbackCard.classList.contains('feedback--incorrect')
        : false,
      quizAnswered: el.quiz ? el.quiz.classList.contains('quiz-screen--answered') : false,
      resultTier: el.resultTier ? el.resultTier.innerHTML : '',
      resultScore: el.resultScore ? el.resultScore.textContent : '',
    };
  }

  function restoreStageState(state) {
    state.hidden.forEach(({ screen, hidden }) => {
      if (screen) screen.hidden = hidden;
    });

    if (el.cardText) {
      el.cardText.textContent = state.cardText;
      el.cardText.style.color = state.cardColor;
    }

    if (el.cardImage) {
      if (state.cardImageSrc) el.cardImage.src = state.cardImageSrc;
      el.cardImage.alt = state.cardImageAlt;
      el.cardImage.hidden = state.cardImageHidden;
    }

    if (el.card) {
      el.card.style.transition = state.cardTransition;
      el.card.style.transform = state.cardTransform;
      el.card.style.opacity = state.cardOpacity;
    }

    if (el.feedbackTitle) el.feedbackTitle.textContent = state.feedbackTitle;
    if (el.feedbackExplain) el.feedbackExplain.textContent = state.feedbackExplain;
    if (el.feedbackSources) el.feedbackSources.innerHTML = state.feedbackSources;
    if (el.feedbackCard) {
      el.feedbackCard.classList.toggle('feedback--correct', state.feedbackCorrect);
      el.feedbackCard.classList.toggle('feedback--incorrect', state.feedbackIncorrect);
    }
    setQuizAnsweredState(state.quizAnswered);

    if (el.resultTier) el.resultTier.innerHTML = state.resultTier;
    if (el.resultScore) el.resultScore.textContent = state.resultScore;
  }

  function measureCurrentStageHeight() {
    if (!el.stage) return 0;
    return Math.ceil(el.stage.getBoundingClientRect().height);
  }

  function showOnlyScreen(screen) {
    [el.intro, el.quiz, el.result].forEach((node) => {
      if (node) node.hidden = node !== screen;
    });
  }

  function measureStageLayoutHeights() {
    if (!el.stage) {
      return { introHeight: 0, expandedHeight: 0 };
    }
    const state = preserveStageState();
    const prevHeight = el.stage.style.height;
    const prevTransition = el.stage.style.transition;
    const wasAnimating = el.stage.classList.contains('quiz-stage--animating');
    let introHeight = 0;
    let expandedHeight = 0;

    el.stage.classList.remove('quiz-stage--animating');
    el.stage.style.transition = 'none';
    el.stage.style.height = 'auto';

    showOnlyScreen(el.intro);
    introHeight = Math.max(introHeight, measureCurrentStageHeight());

    questions.forEach((q, questionIndex) => {
      showOnlyScreen(el.quiz);
      renderQuestionCard(q);
      if (el.progress) {
        el.progress.textContent = `Вопрос ${Math.min(questionIndex + 1, TOTAL)} из ${TOTAL}`;
      }
      expandedHeight = Math.max(expandedHeight, measureCurrentStageHeight());
    });

    [0, Math.min(5, TOTAL), TOTAL].forEach((resultScore) => {
      showOnlyScreen(el.result);
      populateResult(resultScore);
      expandedHeight = Math.max(expandedHeight, measureCurrentStageHeight());
    });

    restoreStageState(state);
    el.stage.style.height = prevHeight;
    el.stage.style.transition = prevTransition;
    el.stage.classList.toggle('quiz-stage--animating', wasAnimating);

    return {
      introHeight,
      expandedHeight: Math.max(introHeight, expandedHeight),
    };
  }

  function applyStageHeight(nextHeight, options) {
    if (!el.stage || !nextHeight) return;
    const targetHeight = Math.max(0, Math.ceil(nextHeight));
    const animate = Boolean(options && options.animate);
    const currentHeight = Math.ceil(el.stage.getBoundingClientRect().height);

    if (stageHeightApplyRaf) {
      cancelAnimationFrame(stageHeightApplyRaf);
      stageHeightApplyRaf = 0;
    }

    if (!animate || !currentHeight || Math.abs(currentHeight - targetHeight) < 2) {
      el.stage.classList.remove('quiz-stage--animating');
      el.stage.style.transition = 'none';
      el.stage.style.height = targetHeight + 'px';
      el.stage.offsetHeight;
      el.stage.style.transition = '';
      return;
    }

    el.stage.style.transition = 'none';
    el.stage.style.height = currentHeight + 'px';
    el.stage.offsetHeight;
    el.stage.classList.add('quiz-stage--animating');

    stageHeightApplyRaf = window.requestAnimationFrame(() => {
      stageHeightApplyRaf = 0;
      el.stage.style.transition = '';
      el.stage.style.height = targetHeight + 'px';
    });
  }

  function syncStageHeight() {
    if (!el.stage) return;
    stageAnimateNextSync = false;
    if (stageHeightApplyRaf) {
      cancelAnimationFrame(stageHeightApplyRaf);
      stageHeightApplyRaf = 0;
    }
    el.stage.classList.remove('quiz-stage--animating');
    el.stage.classList.remove('quiz-stage--expanded');
    el.stage.style.height = '';
    el.stage.style.transition = '';
  }

  function queueStageHeightSync(options) {
    if (options && options.animate) {
      stageAnimateNextSync = true;
    }
    if (stageHeightSyncRaf) cancelAnimationFrame(stageHeightSyncRaf);
    stageHeightSyncRaf = window.requestAnimationFrame(() => {
      stageHeightSyncRaf = 0;
      syncStageHeight();
    });
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
    queueStageHeightSync();
  }

  function answer(choice) {
    if (questionAnswered) return;
    const q = questions[index];
    const correct = q.correct === choice;
    questionAnswered = true;
    if (correct) score += 1;

    setProgress();
    populateFeedback(q, correct);
    setQuizAnsweredState(true);
  }

  function finishQuiz() {
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
    }, FLY_OUT_MS);
  }

  function bindSwipe() {
    const card = el.card;
    if (!card) return;

    function onDown(clientX, clientY) {
      if (cardAnimating || questionAnswered) return;
      touchStartX = clientX;
      touchStartY = clientY;
      cardOffsetX = 0;
    }

    function onMove(clientX) {
      if (cardAnimating || questionAnswered) return;
      cardOffsetX = clientX - touchStartX;
      const rot = cardOffsetX * 0.05;
      card.style.transform = `translateX(${cardOffsetX}px) rotate(${rot}deg)`;
      const fade = 1 - Math.min(Math.abs(cardOffsetX) / 300, 0.35);
      card.style.opacity = String(fade);
      updateCardTextTint(cardOffsetX);
    }

    function onUp(clientX) {
      if (cardAnimating || questionAnswered) return;
      const dx = clientX - touchStartX;
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

  function scrollToQuizContent(options) {
    function clamp01(value) {
      return Math.min(1, Math.max(0, value));
    }

    function resolvePageContentScrollY() {
      const parallaxConfig = window.QUIZ_SCROLL_PARALLAX_CONFIG;
      const heroConfig = parallaxConfig && parallaxConfig.hero;
      if (!heroConfig) return null;

      const vh = window.innerHeight || 1;
      const rootPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const minH = Math.max(heroConfig.minHeroRem * rootPx, vh * heroConfig.minHeroFrac);
      const maxShrink = Math.min(vh * heroConfig.maxShrinkFrac, Math.max(0, vh - minH));

      function computeHeroHeight(scrollY) {
        const linearShrink = Math.min(
          Math.max(0, scrollY * heroConfig.shrinkPerScroll),
          maxShrink
        );
        const progress = maxShrink > 0 ? linearShrink / maxShrink : 0;
        const easedProgress = Math.pow(clamp01(progress), heroConfig.easePow);
        const shrink = maxShrink * easedProgress;
        return Math.round(Math.max(minH, vh - shrink));
      }

      let low = 0;
      let high = vh * 2;
      for (let i = 0; i < 20; i += 1) {
        const mid = (low + high) / 2;
        const diff = computeHeroHeight(mid) - mid;
        if (diff > 0) low = mid;
        else high = mid;
      }
      return Math.max(0, Math.round(high));
    }

    var targetSelector = options && options.targetSelector;
    var el =
      (targetSelector ? document.querySelector(targetSelector) : null) ||
      document.querySelector('.page-content') ||
      document.getElementById('screen-quiz') ||
      document.getElementById('quiz-stage') ||
      document.getElementById('page-content-inner');
    if (!el) return;
    if (options && options.instant) {
      var instantOffsetPx = 0;
      if (typeof options.targetTopVh === 'number') {
        instantOffsetPx = ((window.innerHeight || 1) * options.targetTopVh) / 100;
      } else if (typeof options.targetTopPx === 'number') {
        instantOffsetPx = options.targetTopPx;
      }
      var instantY =
        targetSelector === '#page-content'
          ? resolvePageContentScrollY()
          : null;
      if (typeof instantY !== 'number') {
        instantY =
          el.getBoundingClientRect().top +
          (window.scrollY || window.pageYOffset || 0) -
          instantOffsetPx;
      } else {
        instantY -= instantOffsetPx;
      }
      instantY = Math.max(0, Math.round(instantY));
      var instantHtml = document.documentElement;
      var instantPrev = instantHtml.style.scrollBehavior;
      instantHtml.style.scrollBehavior = 'auto';
      window.scrollTo({ left: 0, top: instantY, behavior: 'auto' });
      instantHtml.style.scrollBehavior = instantPrev;
      return;
    }
    if (typeof window.QUIZ_SCROLL_TO_TARGET === 'function') {
      window.QUIZ_SCROLL_TO_TARGET(el, options);
      return;
    }
    var offsetPx = 0;
    if (options && typeof options.targetTopVh === 'number') {
      offsetPx = ((window.innerHeight || 1) * options.targetTopVh) / 100;
    } else if (options && typeof options.targetTopPx === 'number') {
      offsetPx = options.targetTopPx;
    }
    var y =
      el.getBoundingClientRect().top +
      (window.scrollY || window.pageYOffset || 0) -
      offsetPx;
    y = Math.max(0, Math.round(y));
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo({ left: 0, top: y, behavior: 'auto' });
    html.style.scrollBehavior = prev;
  }

  function startQuiz() {
    var active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
    index = 0;
    score = 0;
    showScreen(el.quiz);
    renderCard();
    window.requestAnimationFrame(() => {
      scrollToQuizContent({
        targetSelector: '#page-content',
        targetTopPx: 0,
        instant: true,
      });
    });
  }

  window.QUIZ_START_FROM_HERO = startQuiz;

  el.btnStart?.addEventListener('click', startQuiz);

  el.btnMyth?.addEventListener('click', () => flyCardOutAndAnswer('myth'));
  el.btnTruth?.addEventListener('click', () => flyCardOutAndAnswer('truth'));
  el.btnNext?.addEventListener('click', goNextFromFeedback);

  el.formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const consent = document.getElementById('consent-form-data');
    if (consent && !consent.checked) return;
    const payload = Object.fromEntries(new FormData(el.formEl).entries());
    window.console.log('Lead form payload', payload);
    alert('Заявка отправлена. Данные формы записаны в консоль браузера для проверки прототипа.');
    el.formEl?.reset();
    showScreen(el.intro);
    index = 0;
    score = 0;
  });

  el.stage?.addEventListener('transitionend', (event) => {
    if (event.target !== el.stage || event.propertyName !== 'height') return;
    el.stage.classList.remove('quiz-stage--animating');
  });

  bindSwipe();
  queueStageHeightSync();
  window.addEventListener('resize', queueStageHeightSync, { passive: true });
  window.addEventListener('load', queueStageHeightSync);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(queueStageHeightSync).catch(() => {});
  }
  el.cardImage?.addEventListener('load', () => {
    if (cardAnimating) return;
    queueStageHeightSync();
  });
})();
