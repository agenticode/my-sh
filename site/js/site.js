/* my.sh 화면 동작. 외부 요청 없이 이 파일 하나로 끝난다. */
(() => {
  'use strict';

  /* 캡처 칸: captures/<이름>.webp 가 있으면 그 그림을, 없으면 뼈대를 보인다. */
  function initCaptures() {
    for (const fig of document.querySelectorAll('[data-capture]')) {
      const img = fig.querySelector('img');
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCaptures, { once: true });
  else initCaptures();
})();
