(function () {
  'use strict';

  const questions = window.QUIZ_QUESTIONS || [];
  const TOTAL = questions.length;

  const el = {
    intro: document.getElementById('screen-intro'),
    quiz: document.getElementById('screen-quiz'),
    feedback: document.getElementById('screen-feedback'),
    result: document.getElementById('screen-result'),
    form: document.getElementById('screen-form'),

    btnStart: document.getElementById('btn-start'),

    card: document.getElementById('quiz-card'),
    cardText: document.getElementById('card-question-text'),
    progress: document.getElementById('quiz-progress'),
    btnMyth: document.getElementById('btn-myth'),
    btnTruth: document.getElementById('btn-truth'),

    feedbackTitle: document.getElementById('feedback-title'),
    feedbackExplain: document.getElementById('feedback-explanation'),
    feedbackSources: document.getElementById('feedback-sources'),
    btnNext: document.getElementById('btn-feedback-next'),
    feedbackSwipeHint: document.getElementById('feedback-swipe-hint'),

    resultTier: document.getElementById('result-tier-message'),
    resultScore: document.getElementById('result-score'),

    formEl: document.getElementById('lead-form'),
    formSkip: document.getElementById('btn-skip-form'),
  };

  let index = 0;
  let score = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let cardOffsetX = 0;
  const SWIPE_THRESHOLD = 80;
  let cardAnimating = false;
  const FLY_OUT_MS = 400;
  const FEEDBACK_HINT_SWIPE = 56;

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
    [el.intro, el.quiz, el.feedback, el.result, el.form].forEach((s) => {
      if (s) s.hidden = s !== screen;
    });
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
    if (el.progress) {
      el.progress.textContent = `Вопрос ${Math.min(index + 1, TOTAL)} из ${TOTAL}`;
    }
  }

  function renderCard() {
    if (index >= TOTAL) {
      finishQuiz();
      return;
    }
    const q = questions[index];
    el.cardText.textContent = q.text;
    el.cardText.style.color = '';
    el.card.style.transition = '';
    el.card.style.transform = '';
    el.card.style.opacity = '1';
    cardOffsetX = 0;
    setProgress();
  }

  function answer(choice) {
    const q = questions[index];
    const correct = q.correct === choice;
    if (correct) score += 1;

    el.feedbackTitle.textContent = correct ? 'Верно' : 'Не совсем';
    el.feedbackExplain.textContent = q.explanation;
    el.feedback.classList.toggle('feedback--correct', correct);
    el.feedback.classList.toggle('feedback--incorrect', !correct);

    el.feedbackSources.innerHTML = '';
    (q.sources || []).forEach((s) => {
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

    showScreen(el.feedback);
  }

  function finishQuiz() {
    const tier = tierCopy(score);
    el.resultTier.innerHTML = `<h3>${tier.title}</h3><p>${tier.body}</p>`;
    el.resultScore.textContent = `Правильных ответов: ${score} из ${TOTAL}`;
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
    if (cardAnimating || !el.card) return;
    cardAnimating = true;
    const dir = choice === 'myth' ? -1 : 1;
    updateCardTextTint(dir * CARD_TINT_MAX);
    const dist = window.innerWidth * 0.55 + 140;
    el.card.style.transition = `transform ${FLY_OUT_MS}ms cubic-bezier(0.33, 0, 0.2, 1), opacity ${FLY_OUT_MS}ms ease`;
    el.card.style.transform = `translateX(${dir * dist}px) rotate(${dir * 14}deg)`;
    el.card.style.opacity = '0';
    window.setTimeout(() => {
      cardAnimating = false;
      answer(choice);
    }, FLY_OUT_MS);
  }

  function bindFeedbackSwipeHint() {
    const hint = el.feedbackSwipeHint;
    if (!hint) return;

    let startX = 0;
    let startY = 0;
    let active = false;

    function onDown(clientX, clientY) {
      startX = clientX;
      startY = clientY;
      active = true;
    }

    function onUp(clientX, clientY) {
      if (!active) return;
      active = false;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (
        Math.abs(dx) > FEEDBACK_HINT_SWIPE &&
        Math.abs(dx) > Math.abs(dy) * 0.7
      ) {
        goNextFromFeedback();
      }
    }

    hint.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );

    hint.addEventListener(
      'touchend',
      (e) => {
        if (e.changedTouches.length !== 1) return;
        onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      },
      { passive: true }
    );

    let mouseOnHint = false;
    hint.addEventListener('mousedown', (e) => {
      mouseOnHint = true;
      onDown(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', (e) => {
      if (!mouseOnHint) return;
      mouseOnHint = false;
      onUp(e.clientX, e.clientY);
    });
  }

  function bindSwipe() {
    const card = el.card;
    if (!card) return;

    function onDown(clientX, clientY) {
      if (cardAnimating) return;
      touchStartX = clientX;
      touchStartY = clientY;
      cardOffsetX = 0;
    }

    function onMove(clientX) {
      if (cardAnimating) return;
      cardOffsetX = clientX - touchStartX;
      const rot = cardOffsetX * 0.05;
      card.style.transform = `translateX(${cardOffsetX}px) rotate(${rot}deg)`;
      const fade = 1 - Math.min(Math.abs(cardOffsetX) / 300, 0.35);
      card.style.opacity = String(fade);
      updateCardTextTint(cardOffsetX);
    }

    function onUp(clientX) {
      if (cardAnimating) return;
      const dx = clientX - touchStartX;
      if (dx < -SWIPE_THRESHOLD) {
        answer('myth');
      } else if (dx > SWIPE_THRESHOLD) {
        answer('truth');
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

  function scrollToQuizContent() {
    var el = document.getElementById('page-content-inner');
    if (!el) return;
    var y =
      el.getBoundingClientRect().top +
      (window.scrollY || window.pageYOffset || 0);
    y = Math.max(0, Math.round(y));
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo({ left: 0, top: y, behavior: 'auto' });
    html.style.scrollBehavior = prev;
  }

  el.btnStart?.addEventListener('click', () => {
    index = 0;
    score = 0;
    showScreen(el.quiz);
    renderCard();
    scrollToQuizContent();
  });

  el.btnMyth?.addEventListener('click', () => flyCardOutAndAnswer('myth'));
  el.btnTruth?.addEventListener('click', () => flyCardOutAndAnswer('truth'));
  el.btnNext?.addEventListener('click', goNextFromFeedback);

  document.getElementById('btn-to-form')?.addEventListener('click', () => {
    showScreen(el.form);
  });

  el.formSkip?.addEventListener('click', () => {
    window.location.href = 'https://kartazhizni.ru/ba-u-detey/';
  });

  el.formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const consent = document.getElementById('consent-form-data');
    if (consent && !consent.checked) return;
    alert('Прототип: данные формы не отправляются. Подключите бэкенд или CRM.');
    el.formEl?.reset();
    showScreen(el.intro);
    index = 0;
    score = 0;
  });

  bindSwipe();
  bindFeedbackSwipeHint();
})();
