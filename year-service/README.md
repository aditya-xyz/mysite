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

`node scripts/provision.mjs seed --remote` seeds Angela and nonpersonal sample
media from `.private/samples`. It is idempotent and does not re-enable revoked
invitations or overwrite the phone on an existing record. Existing invitation
credentials are reused from `.private/angela.json`; the link expires in 90 days.
`node scripts/provision.mjs invitation <https-pilot-url>` writes the local QR.
`node scripts/provision.mjs revoke --remote` revokes Angela and her sessions.
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
load. Original bytes and EXIF remain untouched. Previews are requested within
200px of the viewport, using native lazy loading and async decoding.

Opening a photo shows an image-only floating viewer with a transparent container,
a blurred, dimmed page backdrop, and no card, glass panel, border, or shadow. Close
and download icons sit on the image in 44px touch targets. Download appears only
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
