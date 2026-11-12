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
Only aditya.patil.gverse@gmail.com is allowed through Google + Cloudflare Access;
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
three distinct personal photos, offers Moss/Classic frames and main/bottom-photo
ordering, and exports one 1200×1500 JPEG (4:5 including the paper border/footer).
Santa Pixel uses the existing approved cutout and is part of the saved image.
Shared photos are excluded from this picker.

Tap an image in the card to reframe it. Drag pans, a two-finger pinch zooms on
touchscreens, and a grab cursor/drag icon with wheel zoom serves desktop. Crops
stay inside source bounds and follow the pinch/cursor focal point. Reset and
arrow/plus/minus keyboard controls are available; there are no sliders.

Only authorized viewer previews (grid fallback) are fetched. Originals and their
quotas are untouched. Canvas assembly and JPEG encoding happen in the browser;
there is no AI or external upload for digital exports. On mobile, Share opens
native file sharing when supported. Unsupported or failed sharing offers an
explicit Save file instead action; canceling the share sheet does not download.
Desktop offers Save image in the same position. The complimentary-print action
sits to its left with a gift icon and Christmas gift styling. Moss uses a soft
green paper tone (#e3e8d5), with Classic remaining white.
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
| Twilio Verify | Add global 50 sends/day and500/month guards; $5/$10 monthly usage alerts; Fraud Guard on; geo-permissions only for actual guest countries (US/India/Netherlands discussed) | Per-invitation5 sends/hour,60sec resend lease,5 checks/challenge,15 checks/hour, hashed-IP limits; no global daily/monthly send cap in code |
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
