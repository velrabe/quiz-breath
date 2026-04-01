(function () {
  'use strict';

  var sky = document.querySelector('.page-bg__sky');
  var grass = document.querySelector('.page-bg__grass');
  var pandaSlot = document.querySelector('.page-bg__panda-slot');

  if (!sky && !grass && !pandaSlot) return;

  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqlMobile =
    window.matchMedia && window.matchMedia('(max-width: 767px)');

  function pandaTransform(y) {
    if (!pandaSlot) return;
    if (mqlMobile && mqlMobile.matches) {
      pandaSlot.style.transform = 'translate3d(-50%, ' + y + 'px, 0)';
    } else {
      pandaSlot.style.transform = 'translate3d(0,' + y + 'px, 0)';
    }
  }

  function apply() {
    if (reduce) return;
    var y = window.scrollY || window.pageYOffset;
    if (sky) sky.style.transform = 'translate3d(0,' + y * -0.1 + 'px,0)';
    if (grass) grass.style.transform = 'translate3d(0,' + y * 2 + 'px,0)';
    pandaTransform(y * 1);
  }

  var ticking = false;
  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () {
        apply();
        ticking = false;
      });
    }
  }

  if (!reduce) {
    if (sky) sky.style.willChange = 'transform';
    if (grass) grass.style.willChange = 'transform';
    if (pandaSlot) pandaSlot.style.willChange = 'transform';
  }

  if (mqlMobile) {
    if (mqlMobile.addEventListener) {
      mqlMobile.addEventListener('change', apply);
    } else if (mqlMobile.addListener) {
      mqlMobile.addListener(apply);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  apply();

  window.addEventListener(
    'resize',
    function () {
      apply();
    },
    { passive: true }
  );
})();
