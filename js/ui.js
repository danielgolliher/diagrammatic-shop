// Diagrammatic & Co. — small touches shared by every page: the masthead's
// shadow once the page scrolls, and sections that ease into view.

export function enhance() {
  const root = document.documentElement;
  root.classList.add('js');
  const mast = document.querySelector('.masthead');
  if (mast) {
    const measure = () => root.style.setProperty('--mast-h', mast.offsetHeight + 'px');
    const onScroll = () => mast.classList.toggle('scrolled', window.scrollY > 8);
    measure(); onScroll();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  reveal();
}

let io = null;
function arrive(el) {
  el.classList.add('in');
  // once everything has arrived, hand the children back their own transitions
  if (el.classList.contains('stagger')) setTimeout(() => el.classList.add('done'), 1500);
}
export function reveal(scope = document) {
  const els = scope.querySelectorAll('.reveal:not(.in), .stagger:not(.in)');
  if (!('IntersectionObserver' in window)) { els.forEach(arrive); return; }
  io = io || new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); arrive(en.target); }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
  els.forEach(el => io.observe(el));
  // insurance for views that never report intersections: anything already
  // on screen or scrolled past is shown regardless
  setTimeout(() => els.forEach(el => { if (!el.classList.contains('in') && el.getBoundingClientRect().top < window.innerHeight) { io.unobserve(el); arrive(el); } }), 2500);
}
