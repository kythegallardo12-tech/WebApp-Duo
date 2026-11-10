import gsap from 'gsap';

// ── Page entrance animation ──
export const animatePageIn = (container) => {
  if (!container) return;
  gsap.fromTo(
    container,
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
  );
};

// ── Stagger children animation (for lists/grids) ──
export const animateStaggerIn = (elements, options = {}) => {
  if (!elements || elements.length === 0) return;
  const { delay = 0, stagger = 0.08, duration = 0.4 } = options;
  gsap.fromTo(
    elements,
    { opacity: 0, y: 16, scale: 0.97 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration,
      stagger,
      delay,
      ease: 'power2.out',
    }
  );
};

// ── Card hover effect ──
export const animateCardHover = (card, isEntering) => {
  if (!card) return;
  gsap.to(card, {
    scale: isEntering ? 1.02 : 1,
    y: isEntering ? -4 : 0,
    duration: 0.25,
    ease: 'power2.out',
  });
};

// ── Modal entrance ──
export const animateModalIn = (overlay, modal) => {
  const tl = gsap.timeline();
  tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2 });
  tl.fromTo(
    modal,
    { opacity: 0, scale: 0.95, y: 10 },
    { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.2)' },
    '-=0.1'
  );
  return tl;
};

// ── Modal exit ──
export const animateModalOut = (overlay, modal) => {
  const tl = gsap.timeline();
  tl.to(modal, { opacity: 0, scale: 0.95, y: 10, duration: 0.2, ease: 'power2.in' });
  tl.to(overlay, { opacity: 0, duration: 0.15 }, '-=0.1');
  return tl;
};

// ── Sheet slide in from right ──
export const animateSheetIn = (overlay, sheet) => {
  const tl = gsap.timeline();
  tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2 });
  tl.fromTo(
    sheet,
    { x: '100%' },
    { x: '0%', duration: 0.35, ease: 'power3.out' },
    '-=0.1'
  );
  return tl;
};

// ── Sheet slide out ──
export const animateSheetOut = (overlay, sheet) => {
  const tl = gsap.timeline();
  tl.to(sheet, { x: '100%', duration: 0.25, ease: 'power3.in' });
  tl.to(overlay, { opacity: 0, duration: 0.15 }, '-=0.1');
  return tl;
};

// ── Counter animation for stats ──
export const animateCounter = (element, endValue, options = {}) => {
  if (!element) return;
  const { duration = 1, prefix = '', suffix = '', decimals = 0 } = options;
  const obj = { value: 0 };
  gsap.to(obj, {
    value: endValue,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      element.textContent = prefix + obj.value.toFixed(decimals) + suffix;
    },
  });
};

// ── Notification pop ──
export const animateNotification = (element) => {
  if (!element) return;
  gsap.fromTo(
    element,
    { opacity: 0, y: 20, scale: 0.9 },
    { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(2)' }
  );
};

// ── Pulse effect for feedback ──
export const animatePulse = (element) => {
  if (!element) return;
  gsap.fromTo(
    element,
    { scale: 1 },
    {
      scale: 1.05,
      duration: 0.15,
      yoyo: true,
      repeat: 1,
      ease: 'power2.inOut',
    }
  );
};

// ── Sidebar item animation ──
export const animateSidebarItems = (items) => {
  if (!items || items.length === 0) return;
  gsap.fromTo(
    items,
    { opacity: 0, x: -20 },
    {
      opacity: 1,
      x: 0,
      duration: 0.3,
      stagger: 0.05,
      ease: 'power2.out',
    }
  );
};
