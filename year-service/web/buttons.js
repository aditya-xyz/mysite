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
