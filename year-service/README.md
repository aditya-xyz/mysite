# Aditya & Angela · Private scrapbooks

Public portfolio: Netlify, unchanged. This separate Cloudflare Worker hosts a
small invitation flow and sample journal from Aditya & Angela to their friends at:
https://aditya-year-2026.aditya-year-service.workers.dev

## Current state

- Worker, D1 database, and private R2 bucket provisioned.
- Angela invitation bound to the phone stored locally in `.dev.vars`.
- Replacement Twilio restricted API key installed as Worker secrets.
- Production SMS is enabled; opening the invitation alone never sends a message.
  The recipient must tap Text me a code. Local development remains disabled.
- Four illustrative sample previews; two personal sample originals with EXIF.
- No real personal photos uploaded; the old local React mockup is separate.
- Local invitation and QR: `.private/angela-invite.txt`, `.private/angela-qr.svg`.
  These and seed SQL are ignored by Git. Do not publish the `.private` directory.

## Development

Use Node 22 or later. `npm ci`, `npm run check`, `npm test`.
`npm run db:local` initializes the local DB; `npm run dev` starts Wrangler.
The local `.dev.vars` is server-only, ignored by Git, and must never use VITE_
variable names. The example template must remain blank. Production secrets are
installed from this file using `node scripts/provision.mjs secrets`, without
printing their values. `SMS_ENABLED` is a nonsecret deployment switch in
`wrangler.jsonc`; local `.dev.vars` controls only local development.

For this session an isolated Node runtime was downloaded to
`/private/tmp/year-node-runtime/node-v22.23.4-darwin-arm64/bin` to leave the
machine-wide Node 18 installation alone. It is temporary, not a dependency to
commit. Miniflare is pinned to the same version bundled with Wrangler.

## Deploy and administer

Wrangler uses browser OAuth (`npx wrangler login`). No global Cloudflare key.
`npm run db:remote` applies migrations; `npm run deploy` deploys only `web/` and
the Worker. It never includes `../src/year/local-photos` or the public-site build.
A daily scheduled task removes expired sessions and rate-limit entries.

`node scripts/provision.mjs seed --remote` seeds the configured initial recipient and nonpersonal sample
media from `.private/samples`. It is idempotent and does not re-enable revoked
invitations or overwrite the phone on an existing record. Existing invitation
credentials are reused from `.private/angela.json`; the link expires in 90 days.
`node scripts/provision.mjs invitation <https-pilot-url>` writes the local QR.
`node scripts/provision.mjs revoke --remote` revokes the legacy pilot invitation and its sessions.
Phone changes and reissuing invitations need an explicit administrative migration.
There is no remotely accessible admin endpoint.

## Access model

The invitation has 256 random bits and is stored hashed in D1. Its URL uses a
fragment so the token is not included in HTTP paths or Referer headers. The
browser removes the fragment, posts the token to the same origin, and receives
an HttpOnly Secure SameSite=Strict invitation cookie. Sending codes never accepts
a destination from the browser; it uses the approved phone stored in D1.

An atomic 60-second resend lease and five sends/hour per invitation bound SMS
usage. Code checking allows five attempts/challenge and fifteen/hour; all POSTs
also have a hashed-IP limit. Successful checks consume a challenge once and
create a separate opaque session, hashed in D1, lasting at most seven days.
Expired or revoked invitations invalidate sessions on every journal/media fetch.

Global SMS caps additionally allow at most **50 Verify send attempts per UTC day**
and **500 per UTC calendar month**, across all invitations and editions sharing
the database. `SMS_DAILY_LIMIT` and `SMS_MONTHLY_LIMIT` in `wrangler.jsonc` configure
these defaults; zero pauses new sends and invalid values fail closed. Apply
`0031_sms_send_usage.sql` before deploying this gate. One atomic D1 reservation
checks both limits before any Twilio send call, including concurrent requests.
Upstream failures and timeouts retain their reservation because delivery/cost
can be uncertain. A cap rejection returns HTTP 429 with `Retry-After`, leaves
previously issued codes usable, and does not contact Twilio. The normal resend
and code-check limits still apply. Quota resets use UTC day/month boundaries;
usage persists across deployments. These are app-level send-attempt caps, not a
Twilio account-wide dollar cap or a count of carrier segments or provider retries.

R2 has no public URL or custom domain. Media is streamed through the Worker
only after session and recipient authorization. Shared photos have previews
only; personal originals are available only to the corresponding recipient.
Protected responses use no-store and the app has a restrictive CSP, no external
scripts, no analytics, no cross-origin API access, and no request logging.

Opening a photo loads a compressed viewer preview without requesting the original.
The adjacent download button immediately saves the viewer preview. Full resolution
optionally loads and displays the original; the download button then saves/shares
that prepared original, using native file sharing where available. The original bytes
and EXIF are preserved by our service. A phone or receiving app chooses the
save destination and can alter metadata. Preview copies contain no EXIF.
Displaying a shared photo inherently lets a viewer save/capture that preview;
there is no shared original endpoint or explicit save/share button, not DRM.

## Validation and remaining pilot check

`npm test` uses the local Cloudflare runtime, D1, R2 and mocked Twilio responses.
It checks missing sessions, forged origins, invalid invitations, concurrent send
requests, wrong codes/replay, recipient isolation, shared-original denial,
byte-preserving personal originals, and immediate invitation revocation.
Mocks are test-only: production has no fixed-code authentication or bypass.

Production SMS is enabled only on recipient request. The user confirmed Save
photo on iPhone. No automated live SMS was sent during implementation. Twilio trial recipients must already be verified and
trial country/quota/expiration limits apply. Trial testing uses the existing
trial Verify service; creating a custom named service requires upgrading.
Do not distribute invitations widely until that test passes.

Provider references:
- https://www.twilio.com/docs/usage/trials/try-out-verify
- https://www.twilio.com/docs/verify/api
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/


## Private admin dashboard

The 2026 editor has a custom-domain binding at https://admin.adityapatil.xyz,
with https://aditya-private-admin.aditya-year-service.workers.dev as its protected
fallback. DNS, HTTPS, the Access redirect, and the signed-in custom-domain
dashboard were verified on November 9, 2026.
Only aditya.patil.gverse@gmail.com and sevnangels@gmail.com are allowed through Google + Cloudflare Access;
the Worker also verifies the signed Access JWT on every request. The owner
confirmed the live sign-in on November 8, 2026. See admin/README.md for setup,
operations, and validation details.

Story, Photos, People & invitations, and recipient Preview are available. Saves
remain private drafts. Publish explicitly updates the guest edition. No new
content was published during implementation, and the original pilot remains
available. The public portfolio remains hosted on Netlify. On November 9, 2026,
the owner changed the domain delegation to Cloudflare; its root and www records
continue to route directly to Netlify. See admin/README.md for the DNS mapping
and activation details.

## Additional years

The admin editor supports a separate scrapbook per year, including its own draft,
publication, photos, and invitations. Use Scrapbooks > New scrapbook, then follow
Stories, Photos, Sharing, and Review & publish. New years start empty; existing
2026 links and the pre-publication pilot keep working. Guest access derives the
year from the invitation. See admin/README.md for the scoped API and migration
0003/0004 deployment order. The current Worker hostname and D1/R2 resource names retain
2026 for compatibility; new years do not require new infrastructure.

## People directory

People are persistent across scrapbooks. Adding a person never invites them or
sends a message. Photos offers a searchable multiselect with quick-add; assignments
stay in draft. Each scrapbook's Sharing step creates or manages its invitations.
Publication requires active invitations for everyone assigned personal photos.
Migration 0004 preserves existing invitation tokens and published content while
linking invitations to directory people. See admin/README.md for compatibility
and phone-change behavior. Production migration/deployment is separate from the
local design preview.

One invitation/QR can include a couple or household, with one verification contact and a custom greeting. See
admin/README.md for migration 0005 and compatibility and deployment details.

## Guest scrapbook layout

The guest scrapbook is a continuous page, with a compact opening note followed
by a photo-library-style gallery. There are no chapter jump links or repeated
personal-photo heading. Images keep their natural aspect ratio in a staggered
grid: two columns on phones and three on desktop. Captions remain under each
image, with source/keyboard order unchanged. The smaller “Meanwhile, in our camera roll…” heading introduces common photos.

JPEG preview dimensions are read from a bounded 64 KiB header range when taking
a publication snapshot and stored in the manifest. Older publications and the
pilot resolve missing dimensions read-only for authorized photos. This requires
no new schema migration or rewriting published content. Width/height reserve
correct space before lazy loading, and grid spans recalculate on resize or image
load. Original bytes and EXIF remain untouched. Previews are queued within 1200px of the viewport, with four requests in flight
at most and visible images prioritized. A single observer owns lazy loading;
native loading does not add a second delay. Distant photos stay deferred. Images
decode asynchronously before a 480ms opacity/8px entrance; reduced motion skips
the effect. Grid measurements and span writes are batched to avoid repeated layout
flushes as previews finish.

Opening a photo shows an image-only floating viewer with a transparent container,
a blurred, dimmed page backdrop, and no card, glass panel, border, or shadow. Close sits on the image in a 44px touch target. Previous/count/next and
Full resolution/Download sit below it, with download actions aligned to the
image’s right edge; narrow images can wrap the controls onto two rows. Download appears only
for authorized personal originals; mobile file sharing/download behavior and
original-byte preservation are unchanged. Captions/status float below the photo.
The guest-facing Close my edition button is removed; session expiry/revocation
and the server logout endpoint remain available.

The ignored aspect-ratio fixture includes synthetic 4:5 Instagram portrait,
9:16 Story, 3:4 iPhone portrait, and 4:3 landscape images with diagnostic edge
markers. Browser checks cover mixed-ratio scrolling, mobile resizing, and the
floating viewer at 440px and 375px phone widths. The suite also covers JPEG
header parsing, legacy dimension resolution, snapshot dimensions, and unchanged
personal/shared authorization. All 45 tests pass. Run the ignored preview fixture
with ASPECT_PREVIEW=1 to use these test images. The fixture remains local-only; no real personal photos are used.

The viewer enters with a 280ms zoom/fade and closes with a 180ms retreat/fade;
the background blur/dimming animates with it. Close icon, tap outside, and Escape
all use the same dismissal path and restore focus to the thumbnail. A fallback
handles suppressed animation events. Reduced-motion settings remove the motion
and close immediately; reduced-transparency settings use dimming without blur.
These paths were checked in the local iPhone preview, including temporary
reduced-motion emulation (restored afterward). These checks used local test data.

The local LONG_PREVIEW=1 fixture now has 5 personalized photos for Ben & Jerry
(including assignments to either partner and to both) plus 20 common previews.
It cycles through 4:5, 9:16, 3:4, and 4:3 synthetic images with unique photo IDs.
Common photos have no original/download action. The fixture’s localhost-only
/__preview/metrics endpoint counts unique guest preview requests without tokens
or contact data. At 440px mobile width, the top requested 5 personal previews and
0 common previews; approaching the common section increased this to 5 personal
and 6 common, leaving 14 common previews deferred. The common viewer was checked
without a download icon. The preview remains running locally for user review.


The guest scrapbook now uses the fixed moss-and-cream palette (`#ecf0e5`
background, `#20392f` text). Its footer palette controls, alternative palette CSS,
and theme/localStorage script have been removed. Saved guest palette preferences
no longer affect first paint or later rendering. The theme-color meta matches
the moss background. This change is confined to year-service/web; the public
portfolio’s palette controls and theme handling remain untouched.


Scrapbook footer Instagram URLs live in `web/config.js`, separate from the public
portfolio’s `src/socials.ts`. All three credit names link to their configured
profiles in a new tab. An unset/invalid URL leaves that name as plain text. This
is shared scrapbook presentation config; it does not need Worker vars or D1.

## Photo renditions and original limits

The admin accepts JPEG, PNG, and WebP originals strictly under 100 MB
(100,000,000 bytes). Originals upload in 8 MiB pieces, with compressed grid/viewer
previews sent separately and per-photo progress shown in the editor. Their bytes
and EXIF stay unchanged. Migration 0007 adds temporary private upload sessions;
apply it before deploying this admin update. See admin/README.md for failure
cleanup, expiry, compatibility, and validation details. HEIC remains unsupported.

Migration 0008 adds exact-original reuse, recovery without stale upload locks,
Retry remaining for interrupted batches, and confirmed deletion of unused library
photos. Existing saved-draft/published photos stay protected. See admin/README.md
for the fingerprint and deletion behavior; uploading or deleting unused media
does not publish scrapbook content.

New uploads generate 800px grid and 2400px viewer JPEG previews (maximum long
edge, without upscaling). Only Full resolution requests the original. Each
invitation can request each personal original five times per rolling 24-hour
window, starting with its first request. Household members share this allowance.
Preview browsing and repeated saves of an already loaded file do not count.
Sessions and link rotation do not reset it. Blocked requests return 429 and
Retry-After. Missing originals and storage failures before delivery release the
reservation; interrupted transfers count.

Sharing offers Reset download limits without changing links or sessions. Older
photos use their existing preview until Generate lighter previews, Save draft,
and Publish update their derivatives. Originals retain their bytes and EXIF, and
older published snapshots retain their original derivative keys until publishing.

Rollout requires migration 0006 before deploying
the guest Worker, then build and deploy admin. Local integration tests cover
renditions, concurrent quota enforcement, reset/expiry, legacy fallback, and
publication isolation using synthetic images and mocked verification.

## Scrapbook icon

The guest scrapbook uses an original open-album icon in moss and cream with a
peach heart. `web/favicon.svg` is scalable, `web/favicon-32.png` is the browser
fallback, and `web/apple-touch-icon.png` is the 180px iOS home-screen icon. It
contains no photos or personal data. Admin and the public portfolio keep their
own distinct icons.

The opening greeting is a personal dedication: a larger serif “Hey [addressed
to],” with emphasized names, a soft moss rule, and the welcome on its own line.
The admin preview uses matching treatment. Names remain escaped plain text,
including custom household greetings, and long names wrap on phones.

The personalized greeting is now the scrapbook’s main heading. The previous
large edition title is no longer rendered in the scrapbook or invitation entry.
The admin preview matches, and its title input is removed. The default shared
photo heading is “Meanwhile, in our camera roll…”, with the former standard
wording mapped at display time for compatibility. Custom shared headings remain
unchanged. Existing invitation tokens, publications, and photos are not rewritten.

## Footer and photo navigation

The scrapbook ends with a full-width deep-moss footer, cream text, peach profile
links, and “That’s our year. Glad you were in it.” The admin preview includes the
same closing treatment and reads profile URLs from the shared scrapbook config.

Opening a photo lets recipients move through their complete authorized gallery
in page order: personal photos, then shared photos. Swipe/drag horizontally,
use a horizontal trackpad gesture, click Previous/Next, or use Left/Right arrows.
A counter announces the position, and navigation stops at either end. Vertical
gestures and pinch zoom remain native. Motion respects reduced-motion settings.

Each move loads only compressed previews, resets the original/download state,
revokes the previous original’s object URL, and aborts an in-flight original
request. Only photos already returned by the authenticated journal are included.
Full resolution and download controls follow the current photo’s canSave flag;
shared photos still have no download/original action. Loading an original remains
explicit and subject to the existing per-invitation quota. Closing restores
focus to the thumbnail that opened the viewer.

Synthetic desktop/440px-phone checks cover keyboard and swipe navigation across
personal/shared photos, both gallery boundaries, original-state reset, and footer
contrast. Navigation helper tests cover gallery ordering, gesture intent, and
trackpad momentum.

## Winter edition accents

The winter presentation adds a small static Christmas-light string beside the
opening note, a transparent Santa-hat portrait of Pixel in the header, and a
round-tipped snowflake in the footer. Its closing line is
“Here’s to the next chapter—and having you in it.” The original decorative SVGs
live in `web/seasonal.js`, are hidden from assistive technology, and introduce
no animation, external requests, or gallery/viewer changes. Pixel’s owner-approved
cutout is `web/pixel-santa.png`, with a matching admin preview copy; the raw
source photo stays outside the repository. No other private photos are included.
The admin preview mirrors these opening/closing touches. The gallery and photo
viewer remain unchanged from the pre-seasonal checkpoint, commit 48abe58.

## Invitation presentation and the active year

The guest Worker also serves `scrapbook.adityapatil.xyz`. All invitation links use that custom domain. Share our socials in admin controls
only Instagram footer links. Existing copied workers.dev links route to the custom
domain when opened. The
Cloudflare and custom origins retain the same phone verification and private media
checks; cookies remain specific to each host.

Only one scrapbook is active for guests. Publishing activates the chosen year and
closes older invitation/session access while retaining their content in admin.
Migration 0009 and the private-admin encrypted link recovery setup are documented
in admin/README.md. No scrapbook is published by a code deployment.

## Reader colors and Safari Adaptive Dark Mode

The guest scrapbook declares `color-scheme: light dark` in HTML before styles load,
matching the portfolio's Safari fix. Moss and cream remain the default even when
the operating system prefers dark colors. The header's sun/moon icon button is an
explicit opt-in to a dark moss palette, and remembers the reader's choice on that
browser/hostname. The small same-origin theme.js runs before CSS to restore that
choice before paint; blocked local storage falls back safely to the default.
Both palette rules keep `light dark` support declared on the root; overriding
that declaration with light-only colors may let Safari beta transform the
light palette again. Inputs select their native scheme separately. The original
light colors remain #ecf0e5 paper and #20392f ink. Pixel sits to the left of the
sun/moon button on phones and desktop. Photos and the viewer are not recolored.

WebKit's Safari 27.3 Adaptive Dark Mode documentation says declaring support for
both schemes opts the page out of its automatic recoloring. Verify the beta's
actual behavior on the iOS device; desktop checks cannot reproduce that engine
feature. Reference: https://webkit.org/blog/18541/introducing-adaptive-dark-mode/

The photo viewer uses a 90% dark backdrop (96% with reduced transparency), with
white captions and dark native controls in both palettes. The enter/exit animation
uses the same opacity so it never settles on the older brighter overlay.


## Gallery loading and viewer toolbar

The header wordmark has no trailing period, and the year sits directly beneath
it on desktop and mobile, without “A private edition”. Preview loading now starts
1200px ahead instead of 200px, with a four-request queue ordered by distance from
the visible viewport. Only compressed grid previews are prefetched; viewer previews
and originals retain their existing explicit access behavior. A decoded image
fades/moves into its reserved space, inspired by the soft transitions observed on
america.gov. Reduced motion removes that effect. Layout reads precede writes, and
image-completion updates coalesce into one frame per affected grid.

These changes address late requests and repeated layout work found in the client.
They do not establish the exact production latency split: private media still
requires live authorization and R2 retrieval on every request, with no-store
responses. No shared/public photo cache or relaxed access gate is introduced.

The viewer toolbar stays below the image: navigation at left, Full resolution and
Download snapped to its right edge. Shared photos have navigation only. Small
images can wrap the two groups without shrinking the 44px touch targets. Original
quotas, cancellation, download behavior, keyboard and swipe controls are unchanged.

## Keepsake builder

Guests with at least three authorized personal photos can choose Make a keepsake
above their personalized gallery. The full-screen phone flow selects exactly
three distinct personal photos, offers Moss, Classic and Candy cane paper swatches
below the preview, and exports one 1200×1500 JPEG (4:5 including the paper border/footer).
Santa Pixel uses the existing approved cutout and is part of the saved image.
Shared photos are excluded from this picker.

Drag vertically within a card photo to reframe it, or drop it onto another photo
to swap their positions. Crops follow their photos; dropping outside the photo
slots cancels the move. Keyboard users pick up with Space, choose a slot with
arrows, and confirm with Space/Enter or cancel with Escape.
Photo taps stay on the card; there is no separate crop screen. Up/down arrow
keys adjust vertical framing without picking up a photo. Crops stay inside
source bounds. Gesture announcements are available to screen readers without
adding visible swap messages.

Only authorized viewer previews (grid fallback) are fetched. Originals and their
quotas are untouched. Canvas assembly and JPEG encoding happen in the browser;
there is no AI or external upload for digital exports. On mobile, Share opens
native file sharing when supported. Unsupported or failed sharing offers an
explicit Save file instead action; canceling the share sheet does not download.
Save/Share filenames include the scrapbook year, paper name and a fresh UTC
timestamp (including milliseconds) for each export. Desktop offers Save image
in the same position. The complimentary-print action
sits to its left with a gift icon and Christmas gift styling. Moss uses a soft
green paper tone (#e3e8d5), with Classic remaining white. Candy cane has red and
cream striped trim included in the exported artwork; print recipes retain it as `santa`.
Selection/crops live only in memory, and closing aborts pending requests and
releases decoded images. No backend migrations, auth changes, or publication
operations are involved.

The ignored .private/preview-keepsake.mjs harness serves synthetic local guest
content on localhost:8809 (admin8808), with fake people and mocked verification.
Never deploy this fixture. Device-size browser checks are not a substitute for
checking real iOS pinch and native sharing on an iPhone.


## Print flow — disabled until a provider is connected

Migration `0010_print_orders.sql` adds global contact mailing/verification fields,
a scrapbook `allow_print_orders` switch (default false), and a private order
ledger. Apply it before deploying the print-aware Workers. Existing and new
scrapbooks default to printing disabled.

The scrapbook note is draft content, published with the photos. Its back-of-card
proof includes the authors' signature and the phone verification contact's
mailing address. The 4:5 keepsake is retained as the front artwork master.
Guests order from their prepared keepsake with one confirmation dialog. The note
and mailing address are not shown or sent to the guest; owners manage those in
admin. One complimentary print is allowed per invitation/year. Saved orders freeze the note, address,
artwork, selected-photo recipe, and publication version.

Printing requires an active invitation/year, the immediate scrapbook switch,
published invitation permission, at least three distinct included personal photos
across its people, and the verification contact's verified US address. Shared and
hidden photos do not count. Losing eligibility clears draft permission; restoring
eligibility requires explicitly enabling it again. Permission is tied to the
verified address, so changing the mailing contact/address blocks new orders until
reverified and approved. Disabling the scrapbook switch immediately blocks new
orders while preserving existing ones and their allowance usage.

The deployed print release has **no live Lob fulfillment adapter**. Google address
verification and autocomplete run in the admin Worker; see its README. `ORDER_MODE=simulation` enables persisted test orders on either HTTP or HTTPS,
without any fulfillment/address API call during ordering. `PRINT_PROVIDER=local_mock`
remains restricted to explicit HTTP test hosts; its address mock cannot run on HTTPS. No
mailing provider secrets are configured, and live printing cannot be enabled. Production
fulfillment still needs address-validation/provider integration, provider-safe
idempotency/reconciliation, and a bleed-safe final print render. The current
proof and JPEG master are for local review, not a claim of print-ready delivery.

Authenticated endpoints are `/api/print/status` and `/api/print/orders`. The server
rechecks published authorization and a snapshot confirmation key, validates the exact
three-photo recipe and JPEG dimensions/size, and atomically reserves one order.
Concurrent retries return the existing reservation; uncertain orders keep the
allowance reserved rather than risking a second print. Artwork stays in private
R2 and is available only through the authenticated, year-scoped admin proof route.

The ignored `.private/preview-print-flow.mjs` fixture serves synthetic admin on
`localhost:8810` and guest on `localhost:8811`; use mocked code `123456`. It seeds
a fictional locally verified US address and eligible household, but leaves the
scrapbook switch off. External provider traffic is blocked. Never deploy this
fixture or treat its verification badge as real USPS verification.


### Print allowance resets

The current simulation flow uses migration `0015_simulated_mug_orders.sql`.
Each invitation has independent postcard and mug counters (0 or 1). Admin reset
requires the exact current completed simulated order and explicit confirmation;
it deletes that order and private proof, sets the counter to 0, and removes its
history row. Processing/uncertain or real submitted orders cannot be cleared by
this simulation-only action. A stale reset cannot clear a newer order.

When real fulfillment is implemented, allowance resets must preserve old orders
and frozen designs, allowing a household's history to contain multiple orders.
That future behavior is intentionally different from today's disposable test data.

Guests see no print action or exhausted-allowance message once it is used. Opening
the keepsake again refreshes eligibility after an admin reset. Apply migration
0015 before deploying the current simulation/reset support.

A successful order closes its confirmation dialog automatically and shows a
centered, accessible mailbox toast for eight seconds. It requires no extra Done
step. Local simulation has a separate “nothing mailed” note.


## Usage controls and remaining recommendations (2026-11-10)

Account audit: Google has a $1 monthly alert at 50%, 90%, and 100%; Cloudflare
has $5 and $10 spending alerts. These notify rather than stop spending. Google
request quota editing was unavailable in the console. Twilio trial restrictions
and an empty usage-category selector prevented alert setup. Netlify remains on
Free Legacy with no saved payment card; credit auto-recharge does not apply.
No Lob account exists yet. No plans were upgraded or payment methods added.

| Service | Proposed controls | What is currently in this app |
| --- | --- | --- |
| Google Maps | 50 validations/day, 1,000/month; 200 combined autocomplete/details calls/day, 2,000/month; low per-minute provider quotas and a $1 budget alert | Admin Worker atomic request guards; server-only key; $1 monthly budget alert |
| Twilio Verify | $5/$10 monthly usage alerts; Fraud Guard on; geo-permissions only for actual guest countries (US/India/Netherlands discussed) | Global 50 send attempts/day and 500/month in UTC; per-invitation 5 sends/hour, 60sec resend lease, 5 checks/challenge, 15 checks/hour, hashed-IP limits |
| Cloudflare Workers/D1/R2 | Usage alerts at $5/$10; consider a1,000ms CPU request cap after checking large-upload CPU; watch R2 storage at5GB/8GB | Private/authenticated media, bounded uploads and per-photo downloads; no overall dollar hard cap or configured CPU override; $5/$10 alerts saved |
| Lob | Keep print orders off; later pilot:5 cards/day,20/month and a separate approved postal budget | Live mailing not connected; scrapbook defaultoff and one active allowance/invitation with owner reset |
| Netlify | Keep the present plan, disable credit auto-recharge if available; usage notifications at50/80/100% | Static portfolio. Free Legacy plan; no credit auto-recharge or saved card; custom percentage alerts unavailable |
| GitHub / domain | $0 paid Actions/Packages budget if unused; review domain renewal separately | Manual Worker deployments; domain renewal is an annual expense, not a usage quota |

Google's budget alerts and Cloudflare's budget alerts are notifications, not hard
spending brakes. Twilio usage triggers likewise need application enforcement to
stop sends. Netlify credit-plan sites can pause when credits run out with recharge
off; this may affect all sites on the team. Do not change plans or shut down
resources to enforce these recommendations without owner review. Railway is no
longer used; older MongoDB/backend resources should be checked separately for any
remaining subscriptions, rather than assuming an old browser tab means active use.

References: [Google quotas](https://developers.google.com/maps/documentation/address-validation/usage-and-billing),
[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/),
[Workers CPU limits](https://developers.cloudflare.com/workers/platform/limits/),
[Twilio Verify rate limits](https://www.twilio.com/docs/verify/api/programmable-rate-limits),
[Twilio usage triggers](https://www.twilio.com/docs/usage/api/usage-trigger),
[Netlify credit/recharge controls](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/configure-auto-recharge/).

### Local typography refresh

The current local scrapbook/admin refresh self-hosts the Google Fonts OFL version
of Manrope (`web/fonts/Manrope-OFL.txt` and the admin copy). Headings and body copy
share this family; Caveat remains only for the guest's handwritten sign-off.
The keepsake export waits for Manrope before drawing its title and credit.

The refreshed guest view keeps Christmas lights and diagonally placed footer
snowflakes, with Pixel's curator card and a compact centered footer. Handwriting
is reserved for the sign-off. The keepsake picker uses selection borders inside
each tile and scrolls selected photos clear of its action bar. The exported card
reads “a few of our favorite humans” without a period. Missing or slow font loads
fall back without preventing image creation or download. Print ordering remains
disabled by default and is controlled independently of presentation changes.

The legacy provisioning helper uses generic `INITIAL_RECIPIENT_NAME` and
`INITIAL_RECIPIENT_PHONE_E164` placeholders. Real values stay in ignored local
configuration. Existing live people and invitations are managed in admin; changing
this example does not change production records or require reseeding.

The viewer places previous/next arrows outside the image at its vertical center.
Subtle pagination dots sit inside the bottom edge, with at most seven visible;
the exact “Photo x of y” counter remains available to screen readers. Full res and
download controls sit below authorized personal photos, with the caption below.
Shared photos retain preview-only access and no original/download controls.

On touch screens, a deliberate downward drag on an unzoomed viewer photo dismisses
it; shorter drags return to place. Horizontal swipes still navigate, and a second
pointer or zoomed viewport cancels dismissal so pinch zoom remains available.
The close icon is visually quieter while retaining a 44px tap target.

## Taking a scrapbook offline

Admin's Review & publish offers **Unpublish…**, followed by confirmation. This
closes guest access immediately while retaining drafts, the last published
snapshot, photos, invitations, sessions, and print history. It does not activate
another year. Publishing again reopens the same invitation links. Apply migration
`0013_unpublish.sql` before deploying the updated guest and admin Workers.

A valid invitation to an explicitly unpublished scrapbook displays “This scrapbook
has been taken offline” before SMS verification, even if the guest's verification
session has expired. The offline page hides author branding and footer credits.
Refreshing keeps the invitation context; no SMS is sent and no expired session is
extended. Invalid, expired, and revoked invitations still receive generic invitation
errors. Journals, previews/originals, and print requests remain blocked server-side
while offline. Admin draft previews remain available. Once republished, an expired
verification session must be verified normally before viewing private content.

## Pixelbook local preview

The guest presentation now uses Pixelbook branding and Pixel's voice, a Santa
cover, personal/shared gallery headings, and an optional household gift picker.
The existing phone verification, private media access, photo viewer, downloads,
and keepsake/postcard flow remain in place. Gift eligibility is independent of
whether an invitation has personal photos.

`web/pixelbook.js`, `web/pixelbook.css`, and `web/pixelbook-gift.js` contain the
presentation. The authorized journal may supply same-origin `themeAssets` and
an explicit `gift` capability with six design choices. Without that capability,
the gift picker is not shown. No live gift endpoints or supplier submission have
been connected. Preserve the exact household gift copy exported by pixelbook.js.

The ignored local Pixelbook fixture serves optimized private photo previews and
an ephemeral, shared household gift claim. It uses no real SMS, address validation,
payments, production data, or fulfillment. Address entry, next-year storage consent,
review, and repeat-claim behavior are demonstrable locally; production address
persistence/verification, durable gift allowances, supplier catalog validation,
print-ready mug proofs, and delivery tracking still need implementation. New photo
derivatives remain outside the deployed asset directory. Production thematic media
must be served through authenticated media routes before release. The current
preview does not publish or modify any scrapbook draft.

Mug configuration is now persisted through the admin Mugs tab and edition
publication. Four selected, published photos are required to show the guest gift
section; this is independent of personal gallery photos. Captions may remain blank
while being drafted. Mug-only uploads do not enter the gallery, and saved/published
mug media is protected from deletion. Production gift submission remains off; local
preview claims are simulated. See admin/README.md for migration 0014 and rollout.

Mug artwork now supports browser-local transparent extraction and private,
versioned PNGs. See admin/README.md for model preparation. Guests see the saved
cutout in the chooser and an illustrative mug with its caption before confirmation
and on Pixel perfect. No image-processing API is called by either website.

## Simulated mug orders

Both Worker configurations currently opt into `ORDER_MODE=simulation`; this never
selects a live fulfillment adapter. Normal app-to-Worker requests still persist
test orders in D1/private R2. Mug orders need an active publication with at least
four ready mugshots; postcards retain their personal-photo/address/permission
checks and per-edition switch. No provider key is required.

`/api/gift/status` and `/api/gift/claim` are authenticated and household-scoped.
Mug artwork and captions are copied into a frozen order proof, accessible only
to that household or authenticated admin. Duplicate/concurrent claims use one
allowance. Admin Invitations offers mug history, its illustrative saved design,
and Reset mug allowance alongside the postcard controls. Successful simulated
mug orders show “text dad if you need a second one. just don’t mention i told you
this.” and explicitly state that no physical order or charge occurred.

Apply 0015 to D1 before deploying either Worker. This change was tested locally;
no production migration, reset, publication, provider submission or deployment
was performed. The local `.private/preview-pixelbook-orders.mjs` fixture serves
admin 8848 and guest 8849 with fake household/address and blocked provider traffic.

Typography reference for Pixelbook: https://m.dk/en/ (Copenhagen Metro), supplied
by Aditya. The site uses its own `metroFont`; Pixelbook keeps self-hosted Manrope
and takes inspiration from the strong headings, clear hierarchy and readable
supporting copy. UI scale: 16px reading text, 14px supporting text/controls, 12px
small labels, without mobile reductions below that scale. The illustrative mug's
printed caption is artwork at preview scale, with normal-size caption nearby.
The household joke appears in the mug chooser, not again in the review step.

Complimentary mugs require explicit opt-in at both scrapbook and invitation
levels. Apply migration 0016 before deploying these gates; existing records start
off. See admin/README.md for controls. This is independent of postcard permission
and existing mug order history/reset behavior.


## Private Pixelbook theme photos

The opening note, gift panel and footer use the private R2 keys
`{year}/theme/welcome.jpg`, `gift.jpg` and `closing.jpg`. Only existing assets are
included in the authenticated journal manifest. The guest routes
`/api/theme/{welcome|gift|closing}` require a verified, active invitation and always
scope storage to its edition; admin Preview uses authenticated edition-scoped
routes. These are shared decorative previews, separate from gallery photos,
original-download permissions and mug selections. Never place these photos in
static Worker asset directories or Git. Restoring these theme assets does not
publish a saved draft or change ordering settings.


Print permission is now an immediate invitation setting, matching mugs. After
migration 0017, publishing only applies content such as photos and the postcard
note; it never re-enables or revokes household print permission from old JSON.

### Shared guest delivery address

Mugs and prints reuse the phone-verification contact’s current USPS-verified US
address read-only. Missing or expired addresses use US Google Places suggestions,
Address Validation with USPS CASS, a canonical-address review, and explicit
“Use address & save” approval. The server derives the contact from the session;
clients cannot select another person or replace the verified result. The approved
address is saved to People for future visits/years; verification metadata lasts
28 days. Guests contact dad to change an already verified address.

Address handling is live and shares the admin’s provider budgets. Only fulfillment
is simulated (`ORDER_MODE=simulation`); no supplier, mail, or charge is initiated.
Both Workers require server-side Google keys. Print permission can be enabled
before an address exists; the guest completes verification before ordering. Order
confirmation checks contact/invitation versions and freezes the verified shipping
address with the design. Existing proofs are unchanged.


## Guest presentation and motion

Photo prints settle as they enter view. The keepsake preview assembles from the
finished export, and both gift cards reveal once on scroll after initial gallery
sizing. A separate gift observer waits until cards are well inside the viewport,
so the short mobile keepsake entrance is not spent at the screen edge. Reduced
motion skips decorative animation; the mugshot stack still supports instant
manual changes. Tap advances the stack, and opening the picker preselects that
preview at the time of the click. Existing gift receipts take precedence.

The personal gallery is titled “dad’s friends ⇄ my friends.” Both galleries use
01/02 when present together; recipients with only shared photos see an unnumbered
“the group project.” No personal gallery or keepsake is shown for those recipients.


### Guest typography

The scrapbook uses a self-hosted Asap variable WOFF2, with its width fixed at 95
and weights 100–900 retained. Regular body text, bold headings and more open
heading spacing match the approved Metro-inspired preview. The same face is used
in the generated keepsake; Caveat remains the handwritten signoff. Font license,
source checksum and reproducible conversion instructions are in `web/fonts/`.

The authenticated journal includes a household-scoped `gift.hasOrder` flag, so
the gift button says “view your household’s gift” on its first render when an
active mug order already exists. Opening it still refreshes order status,
including allowance resets made since the page loaded. Receipt/address details
remain behind the dedicated authenticated gift status request.

## Printful mug customization (simulation)

The flow is photo picker → details/customization → address/confirm → receipt.
The first published mugshot is initially selected with classic white 11oz/Clean.
Details show the chosen photo and caption without an address. Customize mug reveals
provisional classic/color-inside/latte styles, dependent sizes/colors, and
Clean/Bookish/Handwritten fonts; it never changes the photo. Restore Pixel’s style
resets only the physical/font choices. Back to the picker can change the photo
while retaining customization. Address confirmation submits the simulated order. Shared simulation catalog:
web/mug-options.js. These choices are not live Printful variants or price quotes;
connect the account and verify availability, templates, delivered cost and font
rendering before enabling physical fulfillment. Preview is illustrative.

Migration 0018 stores the validated configuration alongside each simulated order;
legacy receipts default to classic white 11oz/Clean. Guest review/receipt and Studio
history retain it. Artwork remains the saved cutout plus caption/configuration,
not a rendered Printful print-ready proof. Existing household allowance, publication,
address and simulation gates remain in force. No provider calls or charges occur.
Apply migration 0018 before deploying this change. Nothing connects a Printful
account or enables actual fulfillment automatically.

Printful documents uncharged draft orders and estimates, then a separate charged
fulfillment confirmation. No payment/refund sandbox was found in its public API
docs. Sample orders are real discounted purchases, subject to account eligibility.

Customization opens a nested task dialog over Details, containing only the mug,
short illustrative disclaimer and four custom dropdowns. Done retains choices;
Restore Pixel’s Style resets to the preferred style and closes, preserving the
chosen photo. No close icon/backdrop/Escape dismissal. Dropdowns use shared styled
buttons/listboxes with chevrons, selected indicators, arrow/Home/End navigation,
Enter/Space selection and Escape-to-close-list. Focus returns to Customize.


## Printful catalog, estimates and mockups

The guest Worker reads the curated Printful catalog using a store-scoped private
`orders/read` token. Enable `PRINTFUL_ENABLED` and set `PRINTFUL_STORE_ID` in
Worker vars; keep `PRINTFUL_API_TOKEN` only in the ignored `.dev.vars` and encrypted
Worker secrets. `node scripts/provision.mjs printful-secret` installs only that
secret without printing it. The current token expires January 15, 2027. Renew or
disable this integration before then; token expiry does not unpublish an edition.

The catalog discovers every Printful MUG product and every in-stock US size/color
combination. Price is the only owner filter: enamel remains eligible with
“Not dishwasher safe · hand wash only” shown in customization. The current
recommended default is Enamel, White, 12 oz, with Clean caption font. The main
details modal says “not dishwasher safe. good thing i lick all my bowls.” Classic11oz remains the historical fallback for legacy receipts.
Each variant must fit $25 minus its conservative shipping reserve and a $4 tax
reserve. Shipping reserves use the highest STANDARD rate measured across mainland
US/Alaska/Hawaii, plus the $0.40 holiday surcharge and a $0.50 buffer, rounded up
to whole dollars; unknown combinations use an $11 reserve until reviewed. These
are planning assumptions, not a promise of the maximum tax or shipping charge.
US checkout uses this budget-filtered saved catalog. India and Netherlands checkout also requires a destination-specific estimate before consuming the allowance.
The current filtered catalog has five styles /23 variants; travel mugs fail price
filtering. All Printful colors/sizes that pass the budget are included. Font
choices are our rendered caption artwork, not catalog variants. An unavailable
preferred variant falls back to the first available curated mug.

Authenticated catalog and quote endpoints never create orders. Estimates use the
saved verified street, city, region and postal code for US, India or Netherlands;
no name, phone, email or artwork is sent. India uses `state_name`; Netherlands
omits state. International availability includes fulfillment outside the US and
uses `/shipping/rates` to select an available method before `/orders/estimate-costs`.
The complete USD total includes shipping, tax/VAT and reported fees. International
claims over $25 save the exact chosen mug and address as a simulation awaiting
admin budget approval, reserving the household allowance to prevent duplicates.
Unavailable delivery, incomplete prices and provider failures leave allowance intact.
Import duties may be additional; the estimate is not a guarantee of landed cost.
US claims retain the catalog planning-reserve check. Admin mug history can obtain
or refresh the estimate for the immutable saved destination/configuration. Guest
and admin estimates share household/global rate limits. No physical order or
payment is created. Admin requires the same server-only Printful token; install it
with `node scripts/provision.mjs printful-secret --admin`.
Apply migrations 0019 and 0020 before deploying both Workers.

Printful mockups compose the selected published cutout and caption/font into a
transparent PNG in the guest browser. No original photo or guest identity is sent.
A cryptographically random, 30-minute source URL exposes only that rendered file;
it closes immediately when the completed mockup is stored privately in R2. R2 and
the photo library remain private. Finished mockup images require the invitation
session and mug permissions. Cache keys include the rendered PNG hash, published
artwork version, caption, font and exact mug variant; identical renders can reuse
a finished image through separate household authorizations. Printful's temporary
output URLs are never returned to guests. Polling waits at least ten seconds,
and a global persistent 31-second task lease respects new-store generation limits.
Expired unfinished source files are swept daily. Generated images are previews,
not a guarantee of final printing. Live checkout shows a loading indicator until the actual provider image has
loaded and decoded, then paints it without an illustrated placeholder. Private
catalog caching across isolates reduces cold starts. The authenticated mockup
lookup resumes this household's existing ready/pending render before composing
or uploading pixels; exact-byte cross-household cache protections are preserved.
Completed images use private in-memory blob URLs across control redraws and are
revoked on teardown. Queue retries follow the actual remaining lease rather than
always adding a minute. Brand-new renders still follow Printful's ten-second
minimum polling interval. Apply0021 for the cache lookup index. Generic offline
admin illustrations and historical proofs remain supported.

`ORDER_MODE=simulation` remains enforced independently of live catalog, estimate
and mockup calls. There is no order creation/confirmation endpoint in the adapter,
no shop connection, and no automatic payment or fulfillment. Connecting billing
or approving live fulfillment is separate work. Do not add write-order scope for
catalog, estimates or mockups: all three were verified with `orders/read` only.

## Prepared mug preview library

Migration0022 adds a shared, invitation-independent preview library. The owner’s
Mugs screen offers **Prepare previews** and shows artwork/preview progress. It
renders each published cutout + exact caption in Clean, Bookish and Handwritten,
with light/dark caption ink, into36 immutable1200px transparent PNG source files
for the current six photos. Font pixels are embedded; private source files stay
in R2, and no font file or original photo is sent to Printful. Source preparation
uses the authenticated owner browser once; keep that tab open until artwork is
saved. Publishing caption/artwork changes starts new source preparation. Ordinary
nightly additions of mug styles/sizes/colors reuse the stored source artwork and
need no open browser.

The guest Worker has a nightly09:23UTC catalog sync and a once-per-minute queue
processor. Sync discovers eligible, in-stock US variants using the conservative
$25 budget, queues only missing images, and retires obsolete work after caption
or artwork changes. A mockup task groups compatible colors sharing a print area.
The persistent31-second lease is shared with the legacy generator. Background
processing respects provider retry limits, stores completed PNGs privately, and
closes each temporary source URL. Failed/interrupted tasks retry without placing
orders; unchanged nightly runs preserve completed images. R2 holds binary images;
D1 stores source/job/configuration metadata. Printful temporary URLs are never
served to guests. Current target:414 preview images (six photos ×23 variants ×
three fonts), prepared gradually under the provider’s generation rate limit.

The guest catalog includes saved previews as each combination finishes, without
waiting for every photo/font on a variant. Customize marks unsaved combinations
as preparing and disables those choices until their saved image exists. The open
picker refreshes readiness every30 seconds. No live mockup creation or provider
polling is started while the shared library fills. Saved images are authenticated
and publication-scoped; simulated receipts retain their exact prepared proof even
after publication edits. Historical proofs keep the legacy cache.
The new default and enamel care note are unchanged.

The picker opens immediately, with status/catalog checks in the background instead
of disabling the launch button (which caused the wait cursor). Saved catalog and
likely images warm on idle/hover/focus. Image fetching uses at most three parallel
requests and32 retained private blob URLs; inactive image buffers are evicted and
all URLs are revoked on teardown. Choosing a photo keeps that selection while
background setup completes. Confirmation saves the simulated order directly without a delivered-price check.
Both Workers must remain `ORDER_MODE=simulation`; this adds no fulfillment adapter.

Signed-in mug/address POST actions use a separate authenticated network budget
(600/hour), after session validation, rather than consuming the60/hour login
budget. Invalid sessions retain the login limit. Existing household/address and
Printful estimate limits remain in force. Rate-limit responses include the
remaining wait via Retry-After and a user-readable retry time.

## Fixed and paired keepsake gifts

The keepsake section requires both the invitation’s immediate `allow_print`
permission and the scrapbook’s `allow_print_orders` switch. Photo count controls
its experience:0–2 authorized visible personal photos gets the fixed default with
border controls only;3+ keeps the personal photo editor and includes the default
as a second card in the same border. Shared/hidden photos do not count. These are
one household gift and one allowance, with one address confirmation.

Approved default templates are private R2 JPEGs referenced by the per-year
`keepsake_defaults` record. They use the fixed landscape/top, dogs/bottom-left,
family/bottom-right arrangement and “from our little pack to yours” footer.
The guest default route checks both permissions and current template revision;
it exposes neither originals nor a photo editor. Default orders use server-owned
artwork even if a client uploads a substitute. Personal orders pin both proofs
and the chosen border/default revision; later template edits do not change them.
Owner history shows both cards, and resetting a simulated gift clears both proofs.

Apply0023 before deployment. `node scripts/provision-keepsake-default.mjs 2026
--remote` uploads only the three approved pre-rendered JPEGs and manifest from
ignored `.private/keepsake-defaults/`; it never changes permissions or publishes
a draft. The current renderer/input originals also remain private and untracked.
All print orders remain local simulations; no provider order or payment occurs.

## Handwrytten test connection

An owner-approved API key lives only in ignored `.dev.vars` and the admin Worker’s
encrypted `HANDWRYTTEN_API_KEY` secret. Install with
`node scripts/provision.mjs handwrytten-secret`. The owner’s Print settings show
connection and account Test Mode status. No key is delivered to guest/admin JS.
The server client allows diagnostics and custom-card preparation only; there is
no order, basket mutation, payment or mode-toggle endpoint in its allowlist.
Card preparation requires confirmed account Test Mode and print-size image data.
Guest checkout never calls Handwrytten, including simulated guest confirmations.

Live synthetic-artwork testing verified account Test Mode, supported5×7 portrait
flat cards and upload/create-design APIs. No private photographs, addresses,
orders or payment authorizations were used. The documented image-quality call
rejected both documented JSON and multipart input, so print dimensions are
validated locally. Two distinct cards in one envelope remains unconfirmed with
the provider; a successful design API call does not establish packaging support.
The existing1200×1500 digital keepsakes also need approved padding/formatting for
5×7 production artwork before any future physical fulfillment.

## International quotes and shared country selector

Apply `0033_handwrytten_quote_only.sql` before deploying either Worker. Saved
India and Netherlands print simulations can request a destination-aware Handwrytten
quote. The domestic `/outbound/process` preview is not used for these countries.
Instead, an isolated Test Mode basket supplies the actual checkout breakdown;
the worker then removes its own unsent draft and verifies removal. The durable
`quote_only` flag prevents both the request and later cron retries from sending it.
Uncertain mutations hold the basket for review. Existing automatic test jobs keep
their original behavior and budget gate. Keep `PRINT_ORDER_MODE=handwrytten_test`
and `ORDER_MODE=simulation`; no live order adapter is enabled.

Guest delivery country and mug customization share `web/custom-select.js`,
including the same styling, selected tick, keyboard navigation and Escape behavior.
The address form preserves each country's draft when switching US/India/Netherlands.

The admin Preview recipient selector also offers **Open full Pixelbook**. The full
guest UI runs behind existing admin authentication, using a fresh gift flow and
preview-only address state. Final order buttons and server-side order requests
are disabled. No test SMS code or guest authentication bypass is installed; see
admin/README.md for recipient, prepared-proof and verification behavior.

## Admin-managed international delivery addresses

Order-page address entry is US-only, without a country selector. Existing accepted
India/Netherlands addresses are displayed read-only; incomplete international
records direct the recipient to contact the admins. Guest APIs reject attempts to
enter or replace international addresses, including older foreign verification
challenges. International destinations are never relabeled as US.

Admin India address creation/editing uses manual confirmation, without Google
validation or Places requests. Required fields are the two mailing lines, city,
state and PIN; landmark/district/post-office extras are removed. Saving marks the
address as admin-confirmed, not Google-verified, and both gift flows accept that
India-only status. Address edits still invalidate the prior permission binding.
US and Netherlands verification are unchanged. Existing unverified records need
an explicit admin save/check; this release does not rewrite stored contacts.

## Winter keepsake frames and matched folded artwork

The frame picker now offers **Starry Night** (default), **Evergreen**, then
**Winterlight**. Versioned public assets in `web/frames` contain only frame art;
original photos, captions and Pixel are composed separately. Evergreen has small
pinecone clusters only at upper right and lower left. New IDs are recorded in
recipes; legacy Moss/Classic/Candy cane IDs and frozen order artwork are retained.

The default keepsake renderer is `scripts/render-keepsake-defaults.mjs`. Supply
three approved local photo paths/crops in ignored `.private/keepsake-defaults/inputs.json`
and set `PIXELBOOK_CANVAS_MODULE` to an installed `@napi-rs/canvas` module path.
Its immutable revision hashes the inputs, frame assets, layout and approved copy.
The provisioner uploads the three new variants and retains legacy R2 references;
it does not change edition publication, gift permissions or existing orders.

The earlier Handwrytten folded design v4 used cover size 74 / inside logo size 100. Their
percentages refer to different placement areas. A real Test Mode preview with
identical Starry Night artwork measured 320×400px on the cover and 321×402px on the
inside left, on 408×528px panel proofs. The local folded-card preview uses the same
approximately 78.5% panel width. Back signature and note settings are unchanged.
Existing ready vendor proofs are not overwritten. The calibration used only
image upload, custom-design and picture-proof endpoints: no order, basket, payment
or mailing request was made. Both Worker order modes remain test/simulation.

### Automatic 2026 fallback cards

Migration `0035_card_fallback.sql` installs the 2026 policy. India and Netherlands
gifts close after November 29 at 11:59 p.m. Pacific (November 30 00:00 PST);
the US and households without an address close after December 6 at 11:59 p.m.
Pacific (December 7 00:00 PST). Automatic runs start at 06:00 PST on November 30
and December 7 respectively. The minute cron records each cutoff decision, then
prepares one due household per tick. Other editions have no implicit cutoff.

Eligible, active invitations with published card permission, a complete saved
US/IN/NL address, approved Starry Night artwork and a published default note get
one default A2 folded card, even if they qualified for personalized artwork.
The published default note falls back to the published personalized note when
blank. No new Google verification is required for the admin-owned address.
Missing/incomplete addresses, inactive invitations, disabled cards
and existing household orders are skipped. Existing submitted, uncertain,
approval-pending and allowance-reset order history prevents duplicate fallback
mailings. Skipped cutoff decisions are final; adding an address afterward does
not reopen gifts. Household membership changes after a recorded cutoff require
review rather than silently changing the mailing audience.

The authenticated admin Invitations view contains **Automatic cards**. Set the
**Last day to choose gifts** for India/Netherlands and the US, then select
**Save cutoff dates**. Dates mean the end of the selected day in Pacific time;
the next morning's 06:00 run is calculated automatically, including daylight
saving changes. Optimistic updates reject a stale schedule from another admin.
Dates lock once a cutoff starts or a decision is recorded, preventing reopening
old gifts or re-sending a card. This saves only the policy row and audit event;
people, addresses, invitations, published content and existing orders are unchanged.

The admin section shows only the cutoff controls and brief sending rules.
Eligibility is evaluated automatically; no-address households are skipped
without an additional review step. The old exclusion table is retained as
historical data but no longer affects eligibility. The read-only diagnostic
endpoint remains available for development and support.

Test the behavior with `npm run test:card-fallback` using Node 22+. It creates
isolated local D1/R2 fixtures and advances a simulated clock through each
cutoff. It checks eligible default/custom recipients, missing addresses,
existing orders, duplicate household invitations, retries after crashes,
manual budget approval, Pacific dates, and gift closure. Vendor authentication
in the approval test is mocked; no real contacts, dates or vendor orders are
changed. No production deadline needs to be moved for testing.

Existing orders remain in print history, tagged Automatic fallback; their saved
proofs and normal budget approval controls remain available. Safe preparation
errors retry three times and can be retried through the authenticated preparation-retry endpoint after fixing the cause.
Vendor submission uncertainty is handled by the existing fulfillment review flow
and is never automatically re-submitted.

Preparation requires `ORDER_MODE=simulation` and
`PRINT_ORDER_MODE=handwrytten_test`. It queues the same test-only fulfillment
worker as recipient orders; totals above $10 still require manual approval of
the exact quote. This feature does not enable live mailing. Future production
mailing needs a separate live adapter; upgrading a vendor account alone does
not turn these simulations into physical shipments.

Both card and mug claims enforce the cutoff in the server reservation. The gift
section disappears at cutoff, including open pages and pages restored from a
background tab. Open pages refresh saved deadline changes at least every minute
and at the current deadline; reservation SQL also rechecks the current policy. Mugs are never ordered by this automation. Mug catalogs, styles,
SMS settings, published content and existing orders are preserved.

Recipient language is selected per invitation (English default, Marathi, Traditional Chinese/Taiwan). Translation drafts and published translations live separately in `edition_translations`; migration 0036 only adds that table and an English-defaulted invitation column. Photos shows Marathi and Traditional Chinese zinger fields below each English caption; Story shows both scripts below the introduction, opening note, shared heading, and individual story titles/bodies. Save draft keeps edits private. Supplied translations publish with the scrapbook; separate language approval is not required. Recipient payloads filter photo audiences before localization, and never expose other recipients’ translation entries. Changed English passages fall back to English until reviewed again. Gift artwork, mug captions and physical card notes remain English; order modes are unaffected.

Recipient and admin copy calls the gift a **postcard**. The existing `format: 'folded'` vendor configuration, immutable order recipes, internal `keepsake` API/asset names, frames and mug catalog are preserved. Copy reviews update translation drafts only; renamed English UI sources use English until their translations are explicitly approved in Review & publish.

## Display performance

The guest starts from generated `web/app.bundle.js`; edit `web/app.js` and its modules, then run `npm run guest:build`. Development, deploy and admin-build scripts generate the bundle automatically. The admin preview builds its own bundled entry.

Mug display images use an authenticated `/display` route and versioned private R2 WebP objects (`{year}/{id}/mugs/{version}-display.webp`). Their `printSrc` always points at the unchanged full-resolution PNG; canonical artwork and provider proofs also retain that source. Missing display copies fall back to the original for compatibility. Prepare display renditions when installing new mug cutouts. Mug supplier mockups load when the selected design reaches review; alternate style/font images load on demand. No private-media caching or authorization rules were relaxed.

## Digital-only postcards

Before the gift cutoff, postcard-eligible households can choose **Keep it digital**. The full JPG preview uses their selected border: 1080×1920 (9:16) for personalized photos, or 1080×1440 (3:4) for the default card. Both include the full authored postcard note. Save copy downloads a JPEG; supported mobile browsers offer native file sharing so recipients can save it in their photo library.

Confirmation permanently gives up the mailed postcard for the whole household. Migration 0037 records the household members, full note, default artwork revision, border and initial JPG. A household cannot reserve both digital and mailed postcards, including concurrent requests, replacement invitations and the unclaimed-postcard batch. Recipients cannot reverse their choice themselves. Admins can use Reset paperless preference in Invitations → More details. Existing mailed reservations cannot switch to digital.

Default-only households keep one frozen JPG and see **view your postcard**, with repeat downloads. Personalized households can make unlimited local JPG variants from their currently assigned photos. Digital status, artwork and controls close at the same country-specific gift cutoff. Studio recipient preview supports read-only previews and disables the permanent confirmation. New controls, confirmations, statuses and errors include Marathi and Traditional Chinese; the artwork and full note retain the author’s original text.

Paperless confirmation uses a short fan-club message in English, Marathi and Traditional Chinese. At the invitation level, admins can reset the household preference. Migration 0038 preserves the full old choice and actor in `digital_postcard_resets`; saved artwork stays private. A reset removes only digital-related fallback skips, preserves orders, and leaves the cutoff and permissions in force. Stale invitation versions or preference IDs cannot reset a newer choice.

Mobile paperless confirmation opens native file sharing directly in the confirmation tap using the already-prepared JPG; the preference request saves alongside it. A failed preference save remains visible and does not report a successful opt-out. Repeat Share remains available. Guest startup runs independent metadata checks concurrently and reuses its deadline result; image authentication checks the active edition in the same query as the session. Studio snapshots read photo headers in batches of eight and check mug cutouts concurrently, preserving photo order. No media or authorization caching is added.

The guest build also bundles its five CSS sources into ignored `web/app.styles.css` and stamps content versions onto the shell JS, theme, stylesheet and font URLs. Only this exact versioned public-shell allowlist is browser-cacheable; the HTML stays fresh and all API/private-media responses remain `no-store, private`. Studio assets remain behind Access and private-cache restrictions.

After the first personalized paperless confirmation, the editor shows the complete 9:16 JPG with its full note and inside photos. Border changes regenerate that same complete preview. Subsequent “make another postcard” runs use photo selection → crop adjustment → Preview postcard, followed by the full preview, border controls and Share/Save copy. Back returns to cropping without losing the selected photos or crops. Default-only saved cards remain frozen. Preview controls include Marathi and Traditional Chinese copy.

Postcard selection is paginated in groups of six rather than a scrolling grid. Selection persists across pages. Crop and full-preview artwork scale to the available dialog height, and paperless confirmation fits its image, short copy and controls within the viewport. The scrollbar-free layout applies to postcard creation screens; the scrapbook itself remains a scrollable gallery.

Guest GETs used by startup and postcard preparation have an eight-second whole-response timeout and one retry for transient failures. Authentication/permission/quota failures are not replayed. Temporary journal errors show recovery instead of sending verified guests back to login. Gallery slots also recover from stalled native image loads; the viewer offers its retry action after a bounded wait. Postcard crop rendering reuses decoded grid previews immediately, then builds the final export from the larger viewing renditions and original-quality frame. Only the selected small frame warms on opening; alternate full frames and all chooser supplier mockups no longer preload. Export source quality and all private-media cache restrictions are preserved. Server-Timing exposes aggregate Worker handling time for diagnostics, without recipient data. Desktop crop dialogs are 780px maximum and complete previews 640px, with compact desktop Preview controls.

Small authorized grid/viewer renditions and mug display cutouts now share a tab-memory cache (32 MB target, 64 entries, least-recently-used eviction). Reopening a gallery, photo viewer or mug picker reuses completed Blob reads and object URLs; concurrent readers share one fetch. Full-resolution originals bypass it. The allowlist and opaque scope come from the authenticated journal, including session, invitation and publication identity; expiry, permission failures, invitation changes and leaving the page clear cached bytes and revoke URLs. Nothing is persisted to browser storage; all private HTTP responses remain private/no-store.

Invitations have an **Allow paperless** toggle, enabled by default for existing and new invitations (migration 0039). Disabling it hides the paperless action and rejects new digital opt-outs server-side, including stale submissions; mailed requests and unclaimed mailing eligibility are unchanged. Existing saved paperless choices remain until an admin resets them separately.

US recipients can use **Edit address** in the shared mug/postcard address step. The current address prefills the existing form; Google verification and explicit suggestion approval are required before saving. Cancel leaves the prior verified address intact. Country restrictions and frozen order snapshots are preserved. Address validation's configured shared daily cap is 100 requests, with the monthly cap unchanged at 1,000; counters are not reset. Places autocomplete debounces at 200 ms. Mug chooser images use all available inner space with contain sizing, preserving the complete cutouts.

Supplied source-matched recipient translations publish in the same transaction as the English scrapbook, without a separate language approval. Save draft remains private; missing or outdated translations fall back to English. Hidden/removed photo drafts are excluded. Accessibility descriptions always use English.

Migration 0040 retires Marathi and Traditional Chinese photo accessibility descriptions, removing only `photo:*:alt` entries from translation drafts and publications. Original English descriptions, captions, invitations and photos remain intact. Translation settings is an optional editor with no approval checkbox or language-publish action. Its blank fields use English; all supplied, source-matched translations publish with the scrapbook.

Approved maximum postcard placement (November 16): new Handwrytten folded designs use front 100%, inside-left 100%, with preview version v5. The front fills the trim and the inside retains the provider’s fixed logo inset. Ordinary folded-card previews use the measured corresponding geometry; ready vendor proofs and frozen existing orders remain unchanged.

The four-design mug chooser uses a compact two-by-two grid on desktop and mobile.
Its desktop dialog is capped at 720px, with full-width tiles inside the available
body space. Shared guest styles also apply to Studio’s recipient preview.

Mug details omit the repeated visible heading and recommendation suffix. On mobile,
the supplier preview flexes to the remaining dialog height while angle controls,
care notes and navigation remain visible. The dialog retains its accessible name.

Mobile postcard selection and editing follow the dynamic viewport height and use
the mug picker’s rounded styling and outer margins. Saved US addresses place Edit
address beside the mailing label in both gift flows. Postcard address entry and
editing use a separate form step; accepting the verified address restores the
postcard preview and mailing controls without losing the chosen artwork.

Mug selection and customization also fit the dynamic mobile viewport below 700px
height, so expanding browser bars do not disable their fitted layouts. Gift-flow
buttons display in lowercase through scoped styling, preserving translated copy
and option values across English, Marathi and Traditional Chinese.

Guest actions share `web/buttons.css`: softly rounded rectangles, moss gradients
and a static inset highlight, with quieter secondary actions and dark-theme support.
Photo selection tiles retain their own styling. The guest bundle and Studio’s
recipient preview use the same button treatment.

One-choice border, card-view and mug-angle controls use a shared sliding highlight;
photo grids remain independent choices. Mug angles crossfade already-decoded
supplier previews while preserving the mounted controls. Reduced-motion users
get immediate changes. Mobile actions are shorter, and the print action shows
only “A Christmas gift” using its existing translations.

The mug-angle transition now combines directional perspective motion with the
supplier-image blend; it approximates a turn from the two saved angle proofs.
Glass-inspired selectors use a translucent tint and backdrop blur, with an opaque
reduced-transparency fallback. Mobile actions are 38px visibly and top modal icons
34px, with expanded hit areas; desktop actions are 40px. The Christmas gift action
has a red gradient. The crop hint is shorter in English, Marathi and Chinese;
keyboard controls remain functional without the visible keyboard-instructions line.

Border changes hold a temporary display snapshot until the next artwork is ready,
then fade it out. This covers canvas, default-image and complete digital previews;
snapshots are canceled on replacement/close and skipped for reduced motion. Exported
artwork is unchanged. All × controls use circular outlines; the photo viewer keeps
its quiet translucent inner circle and full tap target without the square action face.

Front/inside/back preview changes use hinged opening/closing and cover-turn motion.
An inert outgoing panel preserves note-canvas pixels while the selected real panel
becomes visible. Rapid choices cancel the prior turn and release its temporary
canvases; reduced-motion users switch immediately. Supplier proofs, artwork and
mailing data remain unchanged.
