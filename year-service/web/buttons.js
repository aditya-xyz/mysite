export const arrow='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
export const giftBackContent=`${arrow}<span class="pb-gift-back-label">back</span>`;

// Touch browsers can defer :active until after a tap has finished.
export function installButtonPressFeedback() {
  const minimumPressMs = 100;
  let press;
  let releaseTimer;

  function clearPress() {
    clearTimeout(releaseTimer);
    press?.button.removeAttribute('data-button-pressed');
    press = undefined;
  }

  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    clearPress();
    const button = event.target.closest('button, a.button');
    if (!button || button.matches(':disabled,[aria-disabled="true"],[data-crop]')) return;
    press = { button, pointerId: event.pointerId, started: performance.now() };
    button.setAttribute('data-button-pressed', '');
  }, { capture: true, passive: true });

  window.addEventListener('pointerup', event => {
    if (press?.pointerId !== event.pointerId) return;
    releaseTimer = setTimeout(clearPress, Math.max(0, minimumPressMs - (performance.now() - press.started)));
  }, { capture: true, passive: true });
  window.addEventListener('pointercancel', event => {
    if (press?.pointerId === event.pointerId) clearPress();
  }, { capture: true, passive: true });
  window.addEventListener('blur', clearPress);
}
