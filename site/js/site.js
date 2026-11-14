/* my.sh 화면 동작. 문서 머리에서 바로 실행되고, 나머지는 DOM 이 준비된 뒤에 돈다.
   외부 요청이 없고 스크롤을 가로채지 않는다. */
(() => {
  'use strict';

  const root = document.documentElement;
  const SEEN_KEY = 'my.intro';
  const INK = '#16181D';
  const RED = '#E31937';

  /* ---- 인트로를 틀지 정한다. 본문이 그려지기 전에 정해야 깜빡이지 않는다. ---- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 처음 온 것으로 본다 */ }
  const canAnimate = typeof Element.prototype.animate === 'function';
  const play = !reduce && !seen && canAnimate && !location.hash;
  root.dataset.intro = play ? 'play' : 'done';

  const $ = (sel, el = document) => el.querySelector(sel);

  /* ---- 로고 글자 폭을 재서 CSS 변수로 넘긴다. 글꼴이 바뀌어도 접힌 자리가 맞는다. ---- */
  function measureMark() {
    const probe = document.createElement('span');
    probe.className = 'mark';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font-size:100px';
    const cell = (ch) => {
      const el = document.createElement('span');
      el.style.display = 'inline-block';
      el.textContent = ch;
      probe.appendChild(el);
      return el;
    };
    const mid = ['e', 'm', 'o', 'r'].map(cell);
    const ext = ['.', 's', 'h'].map(cell);
    document.body.appendChild(probe);
    const em = (el) => el.getBoundingClientRect().width / 100;
    mid.forEach((el, i) => root.style.setProperty('--w' + i, em(el).toFixed(4) + 'em'));
    root.style.setProperty('--wx', ext.reduce((sum, el) => sum + em(el), 0).toFixed(4) + 'em');
    probe.remove();
  }

  /* ---- 캡처 칸: captures/<이름>.webp 가 있으면 그 그림을, 없으면 뼈대를 보인다. ---- */
  function initCaptures() {
    for (const fig of document.querySelectorAll('[data-capture]')) {
      const img = $('img', fig);
      if (!img) continue;
      const ready = () => { fig.classList.add('is-ready'); fig.classList.remove('is-missing'); };
      const missing = () => { fig.classList.add('is-missing'); };
      if (img.complete && img.currentSrc) {
        if (img.naturalWidth > 0) ready(); else missing();
        continue;
      }
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', missing, { once: true });
    }
  }

  /* ---- 인트로: MemorY → MY → MY.sh → 배너로 ----
     시간은 ms. 로고가 배너에 닿는 때가 약 3.2 초다. */
  const T = {
    fadeIn: 380,
    emphasize: { at: 280, dur: 540 },
    fold: { at: 1150, dur: 660 },
    ext: { at: 1740, dur: 520 },
    travel: { at: 2480, dur: 700 },
    settle: 900,
  };
  const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

  function runIntro() {
    const intro = $('.intro');
    const mark = intro && $('.mark', intro);
    const target = $('.banner .mark');
    if (!mark || !target) { root.dataset.intro = 'done'; return; }

    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* 무시 */ }

    const live = $('.mark-live', mark);
    const moveX = $('.intro-x', intro);
    const moveY = $('.intro-y', intro);
    const bg = $('.intro-bg', intro);
    const anims = [];
    const timers = [];
    let over = false;

    const animate = (el, frames, opts) => {
      const a = el.animate(frames, { fill: 'both', ...opts });
      anims.push(a);
      return a;
    };
    const stopListening = () => {
      for (const type of SKIP_EVENTS) removeEventListener(type, skip, true);
    };
    /* 끝 상태: 덮개가 없고, 배너 로고가 MY.sh 에서 반복을 시작한다 */
    const finish = (state) => {
      root.style.setProperty('--mk-delay', '-3.9s');
      root.dataset.intro = state;
      for (const a of anims) a.cancel();
      anims.length = 0;
    };
    function skip() {
      if (over) return;
      over = true;
      stopListening();
      for (const t of timers) clearTimeout(t);
      finish('done');
    }
    /* 스크롤, 누름, 키 입력이 오면 바로 끝 상태로 간다. 이벤트는 막지 않는다. */
    for (const type of SKIP_EVENTS) addEventListener(type, skip, { capture: true, passive: true });

    function travel() {
      if (over) return;
      const from = $('.mk-m', mark).getBoundingClientRect();
      const to = $('.mk-m', target).getBoundingClientRect();
      const box = moveY.getBoundingClientRect();
      const scale = to.height / from.height;
      const dx = to.left - box.left - scale * (from.left - box.left);
      const dy = to.top - box.top - scale * (from.top - box.top);

      root.dataset.intro = 'reveal';
      animate(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: T.travel.dur * 0.8, easing: 'ease-out' });
      animate(moveX, [{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }],
        { duration: T.travel.dur, easing: 'cubic-bezier(0.7, 0, 0.25, 1)' });
      const last = animate(moveY, [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${dy}px) scale(${scale})` }],
        { duration: T.travel.dur, easing: 'cubic-bezier(0.45, 0, 0.15, 1)' });
      last.finished.then(() => {
        if (over) return;
        over = true;
        stopListening();
        finish('settle');
        timers.push(setTimeout(() => { root.dataset.intro = 'done'; }, T.settle));
      }, () => { /* 건너뛰면 취소된다 */ });
    }

    function start() {
      if (over) return;
      measureMark();
      animate(mark, [{ opacity: 0, transform: 'scale(0.965)' }, { opacity: 1, transform: 'none' }],
        { duration: T.fadeIn, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      /* M 과 Y 만 굵어지고 빨개진다(가변 글꼴의 굵기 축) */
      for (const el of [$('.mk-m', mark), $('.mk-y', mark)]) {
        animate(el, [{ fontWeight: 460, color: INK }, { fontWeight: 900, color: RED }],
          { delay: T.emphasize.at, duration: T.emphasize.dur, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
      }
      animate(live, { '--fold': [0, 1] }, { delay: T.fold.at, duration: T.fold.dur, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
      animate(live, { '--ext': [0, 1] }, { delay: T.ext.at, duration: T.ext.dur, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      timers.push(setTimeout(travel, T.travel.at));
    }

    /* 글꼴을 기다리되 1.5 초를 넘기지 않는다. 가려진 탭에서는 보일 때 시작한다. */
    const fontReady = document.fonts && document.fonts.load
      ? Promise.race([
        document.fonts.load('900 1em "SUIT Variable"', 'MY').catch(() => {}),
        new Promise((resolve) => { timers.push(setTimeout(resolve, 1500)); }),
      ])
      : Promise.resolve();
    const visible = document.hidden
      ? new Promise((resolve) => document.addEventListener('visibilitychange', resolve, { once: true }))
      : Promise.resolve();
    Promise.all([fontReady, visible]).then(start);
  }

  function init() {
    initCaptures();
    measureMark();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMark);
    if (root.dataset.intro === 'play') runIntro();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
