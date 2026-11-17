import {loadingPaw} from './loading.js';
// Indeterminate feedback: the server response, never a timer, confirms the order.
export function mugSubmissionMarkup(){
 return `<div class="pb-mug-submission" role="status" aria-live="polite" aria-atomic="true"><span class="pb-filling-paw" aria-hidden="true"><span>${loadingPaw()}</span><span class="pb-paw-fill">${loadingPaw()}</span></span><p>Saving your household’s gift…</p><p class="hint">Hang tight. Pixel’s on it.</p></div>`;
}
