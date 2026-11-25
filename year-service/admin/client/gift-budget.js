import {livePostcardLimitCents,liveMugLimitCents,livePostcardLimitLabel} from '../../src/live-gift-limits.ts';

// Planning rates from the household sample orders, including shipping and tax.
export const giftBudgetRates={mugCents:1760,postcardCents:486,mugLimitCents:liveMugLimitCents,postcardLimitCents:livePostcardLimitCents};
export function invitationGiftBudget(invitations,at=Date.now()/1000){
 const active=invitations.filter(invite=>!invite.revoked_at&&invite.expires_at>at);
 const mugs=active.filter(invite=>invite.allow_mug).length,postcards=active.filter(invite=>invite.allow_print&&!invite.paperlessId).length;
 const mugCents=mugs*giftBudgetRates.mugCents,postcardCents=postcards*giftBudgetRates.postcardCents;
 return {mugs,postcards,mugCents,postcardCents,totalCents:mugCents+postcardCents,ceilingCents:mugs*giftBudgetRates.mugLimitCents+postcards*giftBudgetRates.postcardLimitCents};
}
const dollars=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function giftBudgetMarkup(invitations){
 const budget=invitationGiftBudget(invitations);
 return `<section class="gift-budget" aria-label="Gift budget" aria-live="polite"><div class="gift-budget-cards"><div><span>Mug households</span><strong>${budget.mugs}</strong><span>${dollars(budget.mugCents)} estimated</span></div><div><span>Mailed postcard households</span><strong>${budget.postcards}</strong><span>${dollars(budget.postcardCents)} estimated</span></div><div class="gift-budget-total"><span>Estimated total</span><strong>${dollars(budget.totalCents)}</strong><span>If every eligible household orders</span></div></div><p class="hint">Planning estimate: ${dollars(giftBudgetRates.mugCents)} per mug + ${dollars(giftBudgetRates.postcardCents)} per postcard, based on your sample orders including shipping and tax. Actual costs vary by mug and destination. At the $25 mug / ${livePostcardLimitLabel} card limits: ${dollars(budget.ceilingCents)}.</p><p class="hint">Counts cover all active invitations, regardless of list filters or whether ordering is paused. Paperless postcards are excluded. Updates when you save invitation permissions.</p></section>`;
}
