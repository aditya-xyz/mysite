# Household-scoped live gift ordering

With live fulfillment deployed, **Allow complimentary mug** on an active
invitation enables live mug checkout immediately. Checkout creates a
`live_gift_orders` row with the invitation's verification contact and exact
household membership. Fulfillment checks the flag and that identity again
before contacting Printful. Live postcards still require an unexpired
`live_gift_permissions` grant. The authenticated admin recipient preview
cannot check out.

Limits are fixed in code and constrained in SQLite: one postcard up to $10 and
one mug up to $25 per eligible invitation and edition. Existing admin test-budget
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

Apply `0045_invitation_live_mugs.sql` before deploying this change. It preserves
existing orders and snapshots their mug household identity from the original
grants. Existing simulated orders stay simulated. Continue to manage postcard
grants separately and keep recipient identifiers in private operational files.

To pause a household's future mug submissions, turn off **Allow complimentary
mug**. For postcards, set the grant's `enabled=0`. To pause both live suppliers
at deployment level, disable `LIVE_GIFT_ORDERING` and redeploy. These controls
apply before supplier acceptance. Check `live_gift_orders.state`, `provider_id`, `error` and `quote_json`
for fulfillment state; postcards also retain their existing `print_fulfillment`
audit trail. Cron progresses explicitly queued orders; it does not create them.

Tests use synthetic households, private R2 test buckets and mocked supplier
responses. They cover identity changes, missing grants, exact limits, changed
files/addresses, old simulations, concurrent workers, and ambiguous responses.
No paid order is submitted by tests or deployment verification.
