import {policyLinks} from './policy-links.js';
import {esc} from './pixelbook.js';

export function invitationEntryMarkup(invite){
  return `<section class="entry pb-code-entry pb-invite-entry"><figure class="pb-code-photo"><img src="/pixel-code-guard.webp" width="960" height="960" alt="Pixel and a little white dog keeping watch on a snowy park bench" fetchpriority="high"></figure><div class="pb-code-content"><p class="kicker">special delivery. from me.</p><h1 class="invitation-greeting">oh good,<br><em>${esc(invite.name)}</em>.</h1><p class="intro">i made you a scrapbook. there are photos, there are memories, and yes, there is a lot of me.</p><p class="pb-code-fetch">go fetch your code first.</p><p class="pb-code-delivery">We’ll send a code to ${esc(invite.verificationName || invite.name)}’s phone ending in <strong>${esc(invite.phoneHint)}</strong>.</p><button class="button" id="send">Text me a code →</button><p class="error" role="alert" id="error"></p><p class="signoff">love, Pixel</p>${policyLinks()}</div></section>`;
}

const pointingPhoto='<img src="/pixel-code-pointer.webp" width="960" height="960" alt="Pixel looking toward the code field" fetchpriority="high">';

export function codeEntryMarkup(invite){
  return `<form class="entry pb-code-entry pb-code-input-entry"><figure class="pb-code-photo pb-pointing-photo">${pointingPhoto}</figure><div class="pb-code-content"><p class="kicker">one tiny thing first…</p><h1>got your code?</h1><p class="pb-code-fetch">right here, human.</p><p class="pb-code-delivery" id="code-delivery">A text is on its way to ${esc(invite.verificationName || invite.name)}’s phone ending in <strong>${esc(invite.phoneHint)}</strong>.</p><div class="pb-code-input-row"><figure class="pb-code-mobile-pointer" aria-hidden="true">${pointingPhoto}</figure><div class="pb-code-field"><label for="code">Six-digit access code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="code-delivery code-expiry error"/></div></div><p id="error" class="error" role="alert"></p><button class="button" type="submit">Step inside →</button><button class="text-button" id="resend" type="button" disabled>Resend available in 60 seconds</button><p class="hint" id="code-expiry">Your code expires in ten minutes.</p>${policyLinks()}</div></form>`;
}
