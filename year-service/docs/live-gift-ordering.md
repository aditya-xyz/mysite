# Household-scoped live gift ordering

Real fulfillment requires `LIVE_GIFT_ORDERING=true`, an unexpired row in
`live_gift_permissions`, and an explicit new checkout creating a matching
`live_gift_orders` row. Grants pin the invitation, edition, mailing contact and
exact household membership. Other invitations retain their previous simulation
behavior. The authenticated admin recipient preview cannot check out.

Limits are fixed in code and constrained in SQLite: one postcard up to $10 and
one mug up to $25 per granted invitation/edition. Existing admin test-budget
approvals cannot raise live limits. Old simulated orders never acquire a live
intent. Resetting an allowance does not authorize a second paid gift.

## Suppliers

* Postcards: `PRINT_ORDER_MODE=handwrytten_live`, connected Handwrytten account
  outside Test Mode, and a default US return address. Prepare the frozen card
  design; call `/outbound/process` for a non-ordering full-price preview; then
  stage only that order in an empty basket. Verify exact identities, quantity,
  destination, full total and funding again before `/basket/send`. Shared basket
  access is serialized and fenced. Automatic fallback jobs are disabled in live
  mode and never create live intents.
* Mugs: freeze the same version-4 full-wrap PNG used by the prepared mockups,
  never the thumbnail or cutout. Obtain a destination-aware USD estimate, create
  an unconfirmed supplier draft with a unique `external_id`, verify the exact
  draft/recipient/variant/quantity/source and full costs, and confirm once below
  $25. Private artwork is served through an expiring, random capability whose
  hash is stored in D1. It remains accessible for seven days for supplier fetches.

An uncertain non-idempotent request is never retried automatically. Inspect its
supplier ID or the unique client metadata/external ID in the supplier dashboard
before taking any recovery action. Never reset an allowance merely to retry an
uncertain paid order. Both suppliers may still require a valid stored payment
method; readiness checks do not create real purchases.

## Operations

Apply `0041_scoped_live_gifts.sql` before deployment. It creates empty tables and
does not enable any household. Populate a grant only after verifying the exact
invitation identity and both unused allowances. Keep recipient identifiers and
grant SQL in private operational files, not in Git.

To pause future submission, set the grant's `enabled=0`, or disable
`LIVE_GIFT_ORDERING` and redeploy. This cannot cancel a supplier order already
accepted. Check `live_gift_orders.state`, `provider_id`, `error` and `quote_json`
for fulfillment state; postcards also retain their existing `print_fulfillment`
audit trail. Cron progresses explicitly queued orders; it does not create them.

Tests use synthetic households, private R2 test buckets and mocked supplier
responses. They cover identity changes, missing grants, exact limits, changed
files/addresses, old simulations, concurrent workers, and ambiguous responses.
No paid order is submitted by tests or deployment verification.
