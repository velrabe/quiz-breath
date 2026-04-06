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
  const DEFAULT_QUIZ_HINT = 'Смахните карточку или нажмите кнопку';
  const REVIEW_QUIZ_HINT = 'Смахните карточку или используйте кнопки для перехода между ответами';
  const QUESTION_IMAGE_PRELOAD_AHEAD = 3;
  const EXPERIENCE_STATES = [
    'experience--landing',
    'experience--transitioning',
    'experience--quiz-active',
    'experience--success-active',
  ];
  const preloadedQuestionImages = new Map();
  let pendingCardImageToken = '';

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

  function showScreen(screen) {
    [el.intro, el.quiz, el.result].forEach((s) => {
      if (s) s.hidden = s !== screen;
    });
    if (el.body) {
      el.body.classList.toggle('experience--result-view', screen === el.result);
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
    const value = `Вопрос ${Math.min(index + 1, TOTAL)} из ${TOTAL}`;
    if (el.progress) el.progress.textContent = value;
  }

  function setQuizAnsweredState(answered) {
    if (el.quiz) {
      el.quiz.classList.toggle('quiz-screen--answered', answered);
      el.quiz.classList.toggle('quiz-screen--review', reviewMode);
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
      el.quizHint.textContent = reviewMode ? REVIEW_QUIZ_HINT : DEFAULT_QUIZ_HINT;
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
    el.feedbackCard.classList.remove('feedback--correct', 'feedback--incorrect');
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
    warmQuestionImages(index, QUESTION_IMAGE_PRELOAD_AHEAD);
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
    if (el.resultTitle) el.resultTitle.textContent = tier.title;
    if (el.result) {
      el.result.dataset.resultTone = tier.tone || 'mid';
    }
    el.resultTier.innerHTML = `<p>${tier.body}</p>`;
    el.resultScore.textContent = `Правильных ответов: ${correctCount} из ${TOTAL}`;
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
  }

  function answer(choice) {
    if (questionAnswered) return;
    const q = questions[index];
    const correct = q.correct === choice;
    questionAnswered = true;
    if (correct) score += 1;
    answers[index] = { choice, correct };
    warmQuestionImages(index + 1, QUESTION_IMAGE_PRELOAD_AHEAD);

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
    const consent = document.getElementById('consent-form-data');
    if (consent && !consent.checked) return;
    const payload = Object.fromEntries(new FormData(el.formEl).entries());
    window.console.log('Lead form payload', payload);
    el.formEl?.reset();
    openSuccessExperience();
  });

  bindSwipe();
  warmQuestionImages(0, QUESTION_IMAGE_PRELOAD_AHEAD);
  scheduleRemainingQuestionImageWarmup();
  setExperienceState('experience--landing');
  if (typeof window.QUIZ_HERO_TRANSITION?.reset === 'function') {
    window.QUIZ_HERO_TRANSITION.reset();
  }
})();
