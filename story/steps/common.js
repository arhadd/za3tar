// shared by the four step films: draws the mascot, the end card and the render hook
const MARK = (n, bars, leaf, eye) => `<defs><clipPath id="ct${n}"><path d="M0 0H190V14C147.2 88 102 128 56 148L0 200Z"/></clipPath><clipPath id="cb${n}"><path d="M56 148C150 140 195.4 96 190 14H200V200H56Z"/></clipPath></defs>`
  + `<rect class="bars" x="56" y="14" width="134" height="44" fill="${bars}" clip-path="url(#ct${n})"/><rect class="bars" x="56" y="104" width="134" height="44" fill="${bars}" clip-path="url(#cb${n})"/>`
  + `<path class="leaf" d="M190 14C195.4 96 150 140 56 148C102 128 147.2 88 190 14Z" fill="${leaf}"/>${eye}`;
let n = 0;
document.querySelectorAll('[data-mascot]').forEach(el => {
  n++;
  el.innerHTML = `<div class="body"><svg viewBox="56 14 134 134">${MARK(n, '#0B1710', '#0B1710',
    '<g class="eye"><circle cx="126" cy="36" r="13" fill="#F2EEE2" stroke="#0B1710" stroke-width="3"/><circle cx="126" cy="36" r="6" fill="#0B1710"/></g>')}</svg></div>`;
});

// end card: <div data-end="01 · Set up|Set up.|A teammate that knows your company." style="--o:20"></div>
document.querySelectorAll('[data-end]').forEach(el => {
  const [num, title, line] = el.dataset.end.split('|'), o = el.style.getPropertyValue('--o');
  n++;
  el.outerHTML = `<div class="veil" style="--o:${o}"></div>
    <div class="end"><div class="n rise" style="--o:${+o + .2}">${num}</div><h1 class="rise" style="--o:${+o + .3}">${title}</h1><p class="rise" style="--o:${+o + .6}">${line}</p></div>
    <div class="sign fade" style="--o:${+o + 1}"><svg viewBox="56 14 134 134">${MARK(n, '#F2EEE2', '#C6DE3E', '<circle cx="126" cy="36" r="11" fill="#C6DE3E"/>')}</svg><span>za3tar<em>.ai</em></span></div>`;
});

// render hook: freeze every animation at time t (seconds); ?t=12 freezes on one moment
window.DURATION = 24;
window.seek = t => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; } };
const qt = new URLSearchParams(location.search).get('t');
if (qt !== null) document.fonts.ready.then(() => window.seek(+qt));
