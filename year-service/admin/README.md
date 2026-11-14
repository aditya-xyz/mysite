# Private dashboard and scrapbook editor

The separate `aditya-private-admin` Worker is the private dashboard. It shares
D1/R2 bindings with the guest service but has no Twilio credentials and no SMS
send endpoint. The public Netlify portfolio is unchanged.

## Access configuration

The owner is `aditya.patil.gverse@gmail.com`. Google is connected to Cloudflare
Access through the team `https://billowing-truth-eac1.cloudflareaccess.com`.
The Google OAuth secret belongs only in Cloudflare's identity-provider setup;
it is never needed by this repository or frontend.

Create one Access application with destination Workers > aditya-private-admin >
production and preview URLs. Use an Allow rule with Include > Emails > the exact
owner email. Disable Accept all identity providers; select Google only. The
application is configured for a 6-hour session. Do not protect all Workers: guests use a different
SMS invitation flow. Copy the application's Audience (AUD) into ACCESS_AUD in
admin/wrangler.jsonc. The tag and team domain are not secrets.

The Worker independently validates the Access JWT's RS256 signature, issuer,
audience, subject, expiry, issued-at, and exact email on every request, including
HTML, JavaScript, stylesheets, and media. Unsigned identity headers are rejected.
Missing configuration denies everyone. There is no production auth bypass,
shared admin password, or locally stored browser API key. Preview URLs are off.
POST requests also require the same Origin. All responses are no-store and
noindex, with a restrictive CSP. Admin actions are recorded without photo bytes,
phone numbers, invitation tokens, or credentials in admin_events.

## Build and deploy

Use Node 22.13 or later. From year-service:

- npm ci
- npm run admin:build
- npm run check
- npm test
- npm run db:remote
- npm run deploy (guest compatibility with per-year publications)
- npm run admin:deploy

Apply migrations through 0008 first, then deploy the guest Worker before the admin Worker.
Migration 0003 adds year indexes. Migration 0004 creates persistent People and
links invitations by phone, without rewriting existing content, tokens, or sessions. If preexisting duplicate
phones block the index, investigate them rather than deleting records.

The generated admin/web/app.js is ignored; the build script bundles the source
from admin/client/app.js. Worker assets always run through the auth gate first.
Do not publish the local React mockup or its private photo imports to Netlify.

The owner successfully signed in through Google and confirmed the live dashboard
on November 8, 2026.

The configured custom address is https://admin.adityapatil.xyz. The original
https://aditya-private-admin.aditya-year-service.workers.dev remains available
as a protected fallback. On November 9, 2026, DNS resolved through Cloudflare,
HTTPS redirected unauthenticated requests to Access, and Chrome's Aditya
profile displayed the signed-in dashboard at the custom address. Both
hostnames invoke the same Worker and are covered
by the existing Worker-wide Access application and exact-email server checks.
No additional Google OAuth callback or application audience is needed.

On November 9, 2026, the owner saved the domain's GoDaddy delegation to
katja.ns.cloudflare.com and venkat.ns.cloudflare.com. Cloudflare zone ID:
bbb14649d5198ec211688746e3bbe15d. Subsequent checks confirmed the Cloudflare
nameservers and working admin HTTPS. Resolver caches can vary during migration.

The public website remains on Netlify. Its Cloudflare records are DNS-only:
- CNAME @ -> apex-loadbalancer.netlify.com (flattened at the apex)
- CNAME www -> adityapatilxyz.netlify.app
The admin record is managed by the Worker's custom-domain binding. The original
Netlify zone is retained for rollback; no original records or hosted content
were deleted. The reviewed source zone had two NETLIFY website aliases and no
mail records. The full pre-change inventory and public DNS/website baselines
are stored locally in .private/domain-setup (ignored by Git). A 300-second
admin CNAME to the protected workers.dev hostname was also added to the retained
Netlify zone, so resolvers still using the previous nameservers can discover
the same admin service during migration. This does not replace the Cloudflare
custom-domain binding or bypass its Access policy.

## Editor behavior

The sidebar contains Overview; Creative > Scrapbooks, Articles, and People; and System >
Home Server. It stays the same inside every workspace. Overview contains only
three summary rows (Scrapbooks, Home server, Articles), each with View workspace.
The Home server row keeps its not-connected state; Articles is a not-set-up
workspace with no editing or publishing backend yet.

The Scrapbooks workspace contains the collection. New scrapbook asks
for a year (2000–2100) and authors, then creates one private draft for that
year. Duplicate years are rejected atomically. It starts with default introductory
text and no photos, stories, or invitations; nothing is copied from another year.
Authors stay editable; the year identifies the scrapbook. Titles are retained
only as compatibility metadata for existing clients and stored editions.

Opening a scrapbook reveals a year selector in the main content area and a guided flow: Write stories,
Manage photos, Sharing, then Review & publish. Save & continue
advances through content steps. The step indicator lets you revisit any step;
people can be added globally or directly from a personal photo. Tasks use URLs
such as `#scrapbooks/2027/photos`. Browser Back/Forward and year switches preserve
unsaved drafts in memory. Reloading discards unsaved edits, with a warning that
also covers changes cached in other years. The phone drawer supports focus
management, close, backdrop dismissal, and Escape.

All scrapbook navigation stays in the main content area, including the collection
link, year switcher, and creation steps. The sidebar highlights Scrapbooks
throughout editing and creation.

The collection shows each year's draft/publication status and content counts.
Review links missing details back to the relevant task. Home server is explicitly
not connected; service health, storage, and backup sections have no simulated data.
Write stories edits the authors, introduction, opening note, shared photo heading,
and up to 20 stories. Manage photos supports original uploads, captions, accessible
image descriptions, reordering, and shared or selected-recipient/group access.
People is a persistent directory with name/phone search and explicit person
creation. Adding someone creates no invitation and sends no message. Global
name edits update their linked invitations. Phone changes atomically end their
sessions and pending codes across all scrapbooks; invitation tokens stay intact.
Person edits use optimistic version checks.

Sharing manages each scrapbook's invitations independently: create an invitation
for an existing person, explicitly replace its link, or revoke its access. It
shows whether a person is invited and how many draft photos are assigned to them.
Invitation changes take effect immediately; photo assignments remain draft-only.
The photo recipient picker searches names/phones, supports multiple chips,
Arrow/Enter selection, Escape dismissal, and keyboard-accessible quick-add.
Quick-add keeps the photo's draft edits and selects the new person, without
inviting them. Uninvited, expired, and revoked recipients are marked on chips;
review links to Sharing and both client/server block publication until every
selected photo recipient has an active invitation for this scrapbook. Saving a
draft with uninvited people remains allowed.


Save draft stays on the content-editing and review pages. Publishing is available
only in Review & publish, with a final confirmation. Unsaved changes or missing
required details disable publishing; the review checklist links back to the
relevant task. Sharing has its own immediate-access actions without
draft/publish buttons. Saving alone never publishes content.

Uploads support JPEG, PNG, and WebP strictly under 100 MB (100,000,000 bytes) each. HEIC and SVG aren't
supported in this first version. The browser generates JPEG grid and viewer previews up to 800 and 2400 pixels
respectively (long edge, without upscaling or EXIF), and uploads the original File unchanged. R2 keeps the
original bytes. Every uploaded image is private; the browser never receives R2
write credentials. Removed draft photos remain in the media library so they
can be added back. Already uploaded also offers confirmed permanent deletion of
unused originals and their previews; saved-draft and published references block deletion.

Shared photos expose previews only to verified invitees. Selected-recipient
photos expose previews and available originals only to those recipients. Group
selection is multiple people on the same photo. Existing shared pilot samples
have no originals; assigning them personally won't invent a missing original.

Saving uses optimistic version checks and never changes published_json.
Publishing validates the saved draft and writes one immutable manifest snapshot
atomically in D1, conditional on the reviewed version. Guests only read that
published snapshot and its allowed media IDs. Before the first 2026 publication,
the old pilot gallery remains available for 2026 only. Current pilot media is imported into
the first draft by migration 0002 without changing the published guest view.
Admin Preview filters the saved draft by recipient and never creates a guest
session or sends SMS. Guest text is rendered as plain text, not HTML.

Invitation URLs use 256-bit tokens in the fragment, stored hashed server-side.
Readable links/QRs are returned once; save them immediately. Creating a new link
replaces the old one. No invitation delivery or SMS happens from admin actions.
New phone numbers still need Twilio trial verification until that account is
upgraded; this provider enrollment cannot be bypassed by the dashboard.

## Multi-year backend

`GET /api/editions` lists scrapbooks. `POST /api/editions` accepts year, title,
and authors. State, draft, publish, preview, upload, people, and media APIs live
under `/api/editions/{year}/...`. Every operation checks that the scrapbook exists.
Draft validation accepts only that year's media and directory person IDs.
Legacy invitation recipient IDs are resolved only within their original year. Uploads use
year-prefixed private R2 keys. A phone may have separate invitations in multiple
years; changing one invitation affects only its own sessions. Original unscoped
admin API URLs remain bound to 2026 for compatibility with older clients.

`GET/POST /api/contacts` lists or creates directory people. Creation returns a
person, never an invitation URL. `POST /api/contacts/{id}/details` requires the
person's version. `POST /api/editions/{year}/invitations` accepts `personId` and
returns a new scrapbook-specific link only when no invitation exists for that
person/year. A duplicate request cannot silently rotate their existing token.
Legacy person/invitation endpoints remain available for older clients.

Migration 0004 groups existing invitations by exact phone, choosing the latest
year's name for the directory. It adds `invites.person_id` while preserving
invitation IDs, hashes, expiry/revocation state, sessions, and draft/publication
JSON. An insert trigger supports existing provisioning scripts; a contact update
trigger keeps invitation contact details and phone-change session invalidation
atomic. Published manifests retain legacy recipient IDs; guest authorization
supports both its own invitation ID and the linked directory person ID, always
inside its invitation's year. New saved drafts/publications use directory IDs.

Guest APIs derive the year from the authenticated invitation, never a browser
parameter. Each year reads its own published manifest. Only 2026 retains the
pre-publication pilot fallback. New unpublished scrapbooks cannot expose pilot
media or send verification texts. Opening an invitation clears any previous guest
session cookie to avoid opening the wrong year. Existing invitation URLs, Worker
hostnames, and storage resource names remain unchanged.

## Checks

The integration suite runs real local Workers/D1/R2 with signed test identities
and mocked JWKS/Twilio endpoints. It covers unauthenticated asset/API denial,
forged headers, wrong email/audience/issuer, expired JWTs, CSRF, draft conflicts,
private previews, byte-preserving originals, shared versus personal/group
permissions, publication isolation, phone changes, link rotation, and revocation.
The browser editor was checked at desktop and 390px phone widths using an
isolated fixture with fake people; it never queried production personal data.
The navigation redesign was also checked at desktop and the 393px iPhone preset,
including draft retention through Back, required-detail publication blockers,
save-and-preview, and the mobile drawer. These browser checks used local test data.

Multi-year checks also cover creating 2027, switching years with unsaved edits,
Save & continue, the collection, and the 393px phone setup page. Integration tests
cover concurrent creation, invalid years, per-year versions and publication,
cross-year media/recipient denial, unpublished guest isolation, original-byte
preservation, and existing 2026 compatibility.

People migration tests additionally verify untouched tokens, sessions, manifests,
and original bytes; deduplication by phone; explicit invitation creation; draft
assignment without invitation; publication blocking; optimistic edits; global
phone-change invalidation; and legacy invitation/recipient compatibility. Browser
checks use fake contacts and cover desktop/iPhone chips, keyboard selection,
quick-add, removal, search, saved assignments, and review warnings.

A local-only preview harness is in .private/preview-admin.mjs. It creates an
ephemeral test identity and fake in-memory database, binds localhost only, and
refuses external traffic apart from its mocked local issuer. It is ignored and
must never be deployed. Production identity is still Cloudflare Access.

## Shared invitations

An invitation may include 1–20 People records (for example, Ben and Jerry), one
included verification contact with a phone, and editable **Addressed to** text.
People may omit their phone unless they are a verification contact. One link and
QR code open the combined audience: personal photos assigned to either included
person, plus shared previews. Personal originals retain their existing byte/EXIF
and Save photo rules. The greeting appears on the invitation and inside the
scrapbook; the verification screen names just the contact and masks their phone.

Sharing lists invitations rather than duplicating a couple's invitation under
each person. Edit invitation changes the people, contact, and greeting without
rotating the token. A change to included people/contact ends this invitation's
sessions and cancels pending codes immediately. Greeting-only changes retain
sessions. Global phone changes still invalidate all invitations verified by that
contact. A verification phone cannot be removed while invitations use it.
Separate existing invitations are retained; a person may be included in multiple
invitations. Each verification contact still has at most one invitation per year.

Every scrapbook task offers invitation previews (combined household access) and
individual-person previews in an on-demand modal. Publication coverage checks everyone included in
active, unexpired invitations. Removing a partner immediately removes their
person-based access from the shared invitation; existing separately issued
invitations are unaffected. Access/greeting changes apply immediately to the
published scrapbook, while photo/content edits still require explicit publishing.

Migration **0005_shared_invitations.sql** adds invitation members, greeting, and
optimistic versions, and allows directory people without a phone. It preserves
invitation IDs/hashes/expiry/revocation, sessions, content JSON, and media. The
populated-table migration temporarily clears and restores directory foreign-key
references inside the migration transaction while rebuilding People; it does not
recreate invitations or sessions. Tests run it as one D1 batch and check foreign
keys afterward. Existing invitations are backfilled with their original contact
as their sole member and retain their original name through a fallback greeting.
Legacy recipient IDs remain scoped to their scrapbook. Before any future rollout,
back up D1, apply migration 0005, deploy the guest Worker, then deploy admin.
The preview fixtures and mocked verification are local-only and must never be deployed.

The new invitation endpoint accepts `memberIds`, `verificationContactId`, and
`addressedTo`; legacy `{personId}` creation remains supported. Updating
`POST /api/editions/{year}/invitations/{id}/details` also requires `version`.
`GET /api/editions/{year}/preview?invitation={id}` previews the combined audience.
Membership is stored as a validated JSON array on the invitation so contact,
greeting, audience, and version can change in one atomic update.

The ignored `.private/preview-admin-couples.mjs` fixture serves local admin on
http://localhost:8794 and guest on http://localhost:8795. It uses fake people,
illustrative samples, ephemeral identity, and mocked SMS (code **123456**), with
external requests blocked. Run the usual check/test build first, then run this
fixture with Node 22. Data resets when the fixture restarts. Never deploy it.


## Drag-and-drop photo uploads

Manage photos accepts multiple JPEG, PNG, or WebP files dropped onto the upload
area, with a highlighted drop state. The native file picker remains available
for keyboard, phone, and tablet use. Both entry points use the same sequential
upload flow: preview generation strips metadata, while the original File goes
unchanged into the existing protected upload endpoint. Uploading never publishes.

Batch validation rejects unsupported/empty/oversize files before any upload
starts, enforces the 300-photo draft limit, and rejects folders. Busy-state guards
prevent overlapping uploads; dropping files outside the upload area on Photos
cannot navigate the editor away. Partial network failures retain successful
uploads and report how many completed. Tests cover validation and drop-event
behavior; the local UI also completed a two-file synthetic upload. No production
photos or invitations were changed for this work.

## Larger original uploads

The current client starts a private upload session, sends the unchanged original
in sequential 8 MiB pieces, then submits the 800px grid and 2400px viewer JPEGs
separately. Per-photo progress is shown while uploading. No request contains the
whole large original and previews. The runtime-known-length request body passes
directly to R2 without a JavaScript reader, copying loop, or TransformStream.
Unknown-length pieces are rejected; browser File/Blob uploads supply the length.
Preview requests require a bounded known length and use native multipart parsing.
JPEG, PNG, and WebP must be strictly smaller than 100,000,000 bytes; HEIC remains
unsupported. The legacy `/api/upload` endpoint retains its 25 MiB limit for older
clients. Picker and drop uploads use the new path at every size.

Migration **0007_photo_uploads.sql** adds temporary upload state, scoped to the
authenticated owner and scrapbook year. It does not modify invitations, photos,
publications, or download counters. Apply it before deploying the updated admin.
Each piece is size-checked on the server and R2 assembles only the recorded pieces.
Before registration, the actual stored original's image type is checked with a
12-byte range read. Invalid or mismatched originals are discarded without creating
a library item. The original becomes a media
library item only after both validated previews are stored and the D1 transaction
commits. Saving and publishing remain separate actions.

Failed client uploads attempt to abort their private multipart session. Interrupted
finalization retains private pending objects so it can resume. Sessions idle for 24 hours are cleaned up
when another upload starts or an expired session is accessed; R2 also expires
incomplete multipart uploads after seven days. Retrying a completed finalization
returns the same media item. An interrupted upload must be selected again; there
is no cross-reload resume feature.

Temporary connection failures, HTTP 408/429, and server errors are retried up to
three times with backoff. A reasonable Retry-After is honored; longer waits are
shown as errors instead of silently retrying early. Recorded original pieces are
immutable and can be acknowledged again if their success response was lost.
Finalization retries return the existing media item if it already committed.
Retries apply to upload requests only; draft, publication and invitation actions
are not automatically repeated. HTML/empty edge error responses report their
HTTP status rather than claiming the admin session expired. Actual Access
redirects/401/403 ask the owner to sign in in another tab, preserving current edits.

Synthetic tests upload a 99,999,999-byte original and verify SHA-256 and its EXIF
marker, distinct previews, and unchanged publication. They also check limits,
authentication, request origin, part ordering/concurrency, invalid previews,
expiry, recovery after failed D1 commits, and browser-helper chunk/progress behavior.

### Reuse, interrupted requests, and deletion

Migration **0008_media_library.sql** adds private content fingerprints, per-upload
physical-part counters, and guarded deletion state. Apply it before this admin
update. It does not rewrite current drafts, publications, originals, or invitations.

Selecting a photo computes its SHA-256 in the owner's browser and looks for the
same original bytes in this scrapbook. Matching originals return to the draft;
already-present photos are skipped without resetting captions, descriptions or
recipients. A different filename can reuse identical bytes; equal filenames and
sizes alone never count as a match. Older uploads without fingerprints are checked
by downloading same-size candidate originals through the protected admin API and
hashing them in the browser once. These private fingerprints are reuse metadata,
not guest access credentials. No production originals are hashed inside the Worker.

Each original-piece attempt uses a new physical R2 part number. Only the first
successfully recorded attempt is selected for assembly, so interrupted requests
cannot leave a busy lock or overwrite a successful retry. Finalization can resume
from a completed private R2 original after a transient D1/R2 failure. A failed batch
retains the remaining File references in the current tab and offers Retry remaining;
refreshing still discards those selections. Upload results distinguish new uploads,
reused originals, and photos already in the draft. The 300-photo limit applies to
unique photos added to the draft; a single selection may contain at most 300 files.

Already uploaded has a Delete permanently action with an explicit confirmation.
It deletes the original, current previews and historical generated renditions.
The server refuses deletion while any saved draft or published edition references
the photo, with an error identifying the draft/publication and year. Obsolete
sample-gallery references are removed atomically when deletion is confirmed; they
do not count as a current publication or force the owner to publish first.
Remove/save the draft first; if published, remove
and explicitly publish that change before deleting. Database guards also prevent
another tab from adding a photo after deletion starts. Shared legacy storage keys
still referenced by another photo/publication are retained. Failed deletions remain
unavailable for reuse and offer Retry deletion until cleanup finishes. There is no
automatic deletion of duplicate photos and no bulk erasure of production content.

The native body-transfer path replaces an earlier JavaScript stream pump that
exceeded the production Worker's CPU-time limit during real bulk uploads. Local
integration tests do not emulate that platform CPU limit; they verify byte
preservation, native body forwarding, length/type enforcement, and retry behavior.

## Rendition maintenance and original limits

Migration 0006 adds viewer keys and atomic original-request counters. Older photos offer Generate lighter previews;
this preserves original bytes and requires Save draft and Publish before guests
see the new derivatives. Existing publications retain their derivative keys.

Sharing offers Reset download limits for an invitation without changing its
links or sessions. Guests may request each personal original five times per
invitation per rolling 24-hour window. Household members share the allowance.
The guest viewer groups Full resolution and download side by side. Download
immediately saves the viewer preview, or saves/shares the original after Full
resolution loads it. Loading the original consumes a request; saving the prepared
file requires no extra request.
Compressed preview browsing does not consume the allowance.

## Workspace icon

The admin has its own mint-and-amber workspace tile favicon on charcoal.
`web/favicon.svg` is the scalable version; `web/favicon-32.png` is the tab
fallback, and `web/apple-touch-icon.png` is the 180px iOS home-screen icon.
All are original geometric artwork with no private content. These assets use
the same Access/JWT gate as other admin assets. The guest scrapbook has a separate moss-and-cream album icon; the public
portfolio retains its own favicon.

## On-demand scrapbook preview

Stories, Photos, Sharing, and Review & publish all offer Preview in their task
header. With unsaved edits, the action reads Save & preview and saves the private
draft before opening; validation failures preserve the editor and show the error.
Publishing remains a separate, explicit action on Review & publish.

Preview floats above the current task with a blurred, dimmed backdrop. Its
recipient selector refreshes automatically for shared-only, whole-invitation,
or individual-person views. Only the latest request can update the dialog;
switching recipients or closing cancels obsolete requests. The desktop modal uses almost the full viewport with three photo columns on
wide screens; phones retain two columns. The constrained content wrapper lets
the body scroll independently, and close, Escape, or a backdrop click returns to the editor with
focus restored. Motion and blur respect reduced-motion/transparency preferences.
The existing authenticated saved-draft endpoint is unchanged; no SMS, guest
session, original-file request, or publication is triggered by previewing.

Browser validation used the local synthetic fixture at desktop and 440px phone
widths, including save-before-preview, household switching, all four entry points,
and Escape/focus return. Three unit tests cover recipient races, close/abort,
and errors/retry.

The large scrapbook title is removed from guest pages, invitation entry, and
admin preview. The editor and creation flow no longer offer a title field;
collections and selectors identify scrapbooks by year/authors. Existing stored
titles remain as compatibility metadata, and new clients supply an internal
year-based label when creating an edition. No content migration is required.
The default shared heading is “Meanwhile, in our camera roll…”. Existing standard
“A little of our year” headings render with the new wording, while custom
headings remain editable and unchanged.

The preview includes the scrapbook’s deep-moss closing footer, cream/peach
credits, and links from `year-service/web/config.js`; the public portfolio’s
footer remains separate.

## Finding missing photo descriptions

Manage photos numbers each card and lists photos missing accessibility descriptions
by number and caption (falling back to the filename). Each entry jumps to and focuses
the exact field. Empty descriptions have an inline error and `aria-invalid`; the
list clears as descriptions are entered. Save errors identify the first incomplete
photo and the remaining count, retaining all edits. Captions can be playful;
accessibility descriptions should explain the visible scene.

## Hide photos while preparing a scrapbook

Hide all photos lets you start a small test, then unhide just the photos to include.
Each photo has Hide photo / Unhide photo. Hidden photos stay in their exact draft
position with captions, descriptions, and recipients intact, including after save
and reload. They can have an unfinished description or Selected people with no
assignments yet. The editor preserves that audience choice across reloads.
Unhide requires a description and at least one person for a personal photo before
saving. Hidden photos remain protected from library deletion.

Hidden photos are omitted server-side from saved-draft recipient previews and
publication manifests. Guest authorization also rejects hidden photos and
unassigned personal photos defensively. Hidden assignments do not require active
invitations for publication. At least one included photo is required to publish.
Save and Publish are separate: hiding a previously published photo changes guest
access only after publishing again. A code deployment never changes photo flags
or publishes the owner's draft.

## Invitation domains, socials, and reopening QR codes

Share our socials is a per-invitation checkbox on Create/Edit invitation. It only
controls Instagram footer links in the guest page and invitation preview. All
created, reopened, and refreshed invitation links use `scrapbook.adityapatil.xyz`.
Existing workers.dev links route to the custom domain with the same token in the
fragment, never an HTTP path/query. Invalid/inactive invitations do not redirect.
Host-only cookies remain separate, so moving origins may require phone verification
again. Editing the socials preference keeps the token and takes effect without
publishing. Both origins retain the same phone verification and private media checks.

View link & QR reopens saved invitations without rotating links or ending sessions.
Tokens remain hashed for verification; the admin additionally stores an AES-256-GCM
encrypted copy, using the INVITATION_LINK_KEY Worker secret (64 hex characters).
Ciphertext is bound to the invitation ID and year. This key must stay stable and
private; it is not exposed to guests, static assets, state responses, or source
control. Back it up securely before rotating it. Existing hash-only invitations
show Restore link & QR: paste the original once, validate its hash, and store it
encrypted. No old invitation is rotated automatically. Create fresh link remains
an explicit replacement and invalidates the previous token/sessions.

Migration 0009 adds the preference and encrypted-token columns. Existing
invitations default to socials off, retaining tokens, expiry, and memberships.
Provision the admin secret before using recoverable links. The two public guest
origins are declared in both Worker configurations; admin Access is unchanged.

## One active scrapbook

Migration 0009 adds editions.is_active, a partial unique index, and an activation
trigger. The most recently published edition starts active (2026 pilot fallback
if none is published). The collection displays Active/Inactive guest-access status.
Publishing a year atomically activates it and closes access to every other year.
A stale or failed publication cannot deactivate the current year. Older content,
people, and invitation records stay in admin; no tokens or stored originals are
removed. Guest opening, verification, journals, previews, and originals check the
invitation’s year on every request and reject inactive editions with an explicit
message. Older invitations never open a newer year’s content. Admin draft previews
remain available for inactive years. Deployment itself publishes no content.

## Compact photo recipient picker

Photo cards keep recipient assignments in a fixed-height summary: selected count,
the first two names and a remaining count, plus an invitation-status warning when
needed. Edit opens a bounded panel with name/phone search, All people and Selected
filters, a scrollable multiselect list, quick-add, and Done. Selection changes are
part of the private draft, saved by the usual Save draft action. Done, Escape,
clicking outside, or moving focus away closes the panel; Escape/Done restore focus
to its summary. Reopening clears the search. The invitation creation picker keeps
its existing chip layout. No audience rules or saved assignments change in this
UI update.


## Print flow — disabled until a provider is connected

People has a Mailing address editor for structured US addresses. Save unverified
stores an address; Verify & save locally simulates validation only in the local
fixture. Address edits invalidate verification. The phone verification contact
supplies the invitation's mailing name/address; this avoids a second contact
selector for households.

Stories includes a generic printed note (350 characters maximum), saved and
published with the scrapbook, plus a back-of-postcard proof. Sharing includes an
immediate Allow print orders switch, default off. Each invitation has a separate
print permission gated by a verified address and three distinct included personal
photos across the household. Hidden/shared photos do not count. Permission clears
when eligibility is lost and must be enabled explicitly after it is restored.
Save draft and publish to make invitation permission/note changes visible to
guests. Changing an address or the verification contact requires approval again.

The invitation counter and order history preserve the one-print allowance across
permission changes. Disabling printing blocks new orders and keeps submitted
snapshots intact. The history offers a private saved-artwork proof. Counts query
the full ledger independently of the recent-history display limit.

No live USPS verification, Lob submission, payment, or mailing is connected.
`PRINT_PROVIDER=local_mock` is accepted only on explicit HTTP loopback/test hosts;
HTTPS cannot enable that legacy mock. `ORDER_MODE=simulation` separately enables
persisted simulated orders on HTTPS without calling any fulfillment API. Successes
are labeled simulated. Apply migration
0010 before deploying this support. Production print ordering stays off, and
provider verification/fulfillment must be connected before enabling live orders.


Invitation rows are collapsed by default. More details reveals sharing/link
controls and print permissions; only one invitation can be expanded at once.
Print allowance reset grants one additional print while retaining every previous
order, saved design, note, address, quote, fulfillment record and proof. It stamps
`print_orders.allowance_reset_at`; existing triggers release the 0/1 allowance
marker, so no new boolean or migration is needed. History counts include released
orders. Reset targets the exact current order and cannot release a newer one on
retry. Completed simulations and confirmed submitted test orders can be reset;
processing/uncertain jobs and review jobs with a staged basket item are blocked.
Reset never cancels or resends an order. Mug reset still deletes only its completed
simulation and saved artwork, as before. Apply migration 0015 before deploying
either Worker.


## Google address verification and autocomplete

Google Address Validation replaces the simulated verifier when configured. Lob
remains the future fulfillment provider; enabling Google never enables prints.
Apply migration `0012_google_address_verification.sql` before deploying either
Worker. It adds one-use suggestion challenges, request counters, and verification
expiry. The admin deployment config enables Google and the request guards; install
`GOOGLE_ADDRESS_VALIDATION_API_KEY` as an admin Worker secret. An optional
`GOOGLE_PLACES_API_KEY` secret overrides the shared key. Never bulk-upload the
local fixture settings or enable a print provider during this rollout.

Google Cloud setup:

1. Use the scrapbook's Google Cloud project and enable billing. The OAuth client
   used for admin sign-in is separate; do not change its credentials or consent.
2. Enable **Address Validation API** and **Places API (New)**.
3. Create a server-side API key restricted to those two APIs. A separate
   Places-only key is also supported. Keep the key out of chat, client JavaScript,
   URLs, logs, Git, and VITE variables. HTTP-referrer restrictions are for browser
   keys, not this server-side integration. Local IP restrictions can use your
   stable public outbound IP; Cloudflare production egress needs a separate plan
   before applying an IP restriction there.
4. Copy `admin/.dev.vars.example` to the ignored `admin/.dev.vars`. Set
   `ADDRESS_VERIFICATION_PROVIDER="google"`, `GOOGLE_ADDRESS_VALIDATION_API_KEY`
   to your key, and `GOOGLE_PLACES_ENABLED="true"`. Optionally set a separate
   `GOOGLE_PLACES_API_KEY`; otherwise the validation key must allow both APIs.
5. Review quotas and billing alerts before real requests. Application
   guards are 50 validation attempts/day and 1,000/month, plus 200 combined Places
   search/details attempts/day and 2,000/month. Zero pauses the corresponding
   service. The guards count attempts conservatively, including provider failures;
   they reset by UTC day/calendar month. These guards are enforced by the admin Worker, separately from account
   quotas and billing alerts.

The ignored `.private/preview-google-address.mjs` runs admin localhost:8812 and
synthetic guest localhost:8813. By default suggestions/verification are simulated,
Google traffic is blocked, and print orders are off. Real Google checks require an
explicit local provider/key configuration. To use an owner-supplied key locally,
from year-service with Node22: `LONG_PREVIEW=1 node --env-file=admin/.dev.vars
.private/preview-google-address.mjs` (one shell line). In real mode enter a genuine
address manually; never submit the synthetic sample addresses to Google. Nothing
calls Google on page load. Never deploy this fixture or its mock authentication.

Street suggestions start after three characters and a350ms debounce. Keyboard
arrows/Enter select, Escape dismisses suggestions, and manual entry works if the
service is disabled or fails. Selection requests only `id,addressComponents` from
Place Details Essentials and fills the form; it does not verify or save a contact.
Suggestions float over the form in a bounded scrolling list, keeping the modal
size and position stable; keyboard selection scrolls the active option into view.
Autocomplete uses a session terminating at Place Details, while address validation
is a separate request without that session token. No map, photos, coordinates, or
higher-tier Places fields are fetched. The API key stays in the admin Worker.

**Verify & review** sends only the address to Google, with US CASS enabled. Complete
US premise/subpremise results with USPS DPV confirmation Y are eligible for review.
Missing/incorrect units, unconfirmed components, vacant/no-stat addresses, and
incomplete/malformed results remain unverified. **Use address & save** accepts a
server-stored suggestion bound to that contact/version and a15-minute lifetime.
The suggestion is consumed once; the client cannot replace its verified address.
A stale contact or expired suggestion requires another check. Save unverified
remains available and clears any previous verification.

Only the admin-confirmed address becomes permanent contact input. Raw Google
responses/coordinates are never stored. Temporary suggestions are deleted on use,
expired on access, and swept daily; verification metadata expires after28days and
is cleared by the existing daily Worker sweep. Expired checks cannot grant print
permission even before the sweep. Address edits still invalidate verification and
print approval. The short lifetime is a conservative implementation choice around
Google's data handling rules, not a guarantee of delivery or a USPS endorsement.

Official references: [Google setup](https://developers.google.com/maps/documentation/address-validation/get-api-key),
[pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
[autocomplete sessions](https://developers.google.com/maps/documentation/places/web-service/session-pricing),
[validation data storage](https://cloud.google.com/maps-platform/terms/maps-service-terms).

## Scrapbook studio interface

The studio opens in light mode, with a persistent dark toggle and an explicit
Safari color-scheme declaration. Scrapbooks open on Photos. Filters separate all,
selected-person, shared, hidden, and attention-needed photos; selecting a tile
opens its editor, with a dedicated editing view on small screens. Missing
accessibility descriptions highlight their field. Review & publish lists missing
items in a dialog with links to the corresponding photo or task. Saving and
publishing remain separate actions.

People show phone and mailing address together. Deleting an unused person requires
a confirmation and the current record version. Saved drafts (including hidden
photos), publications from any year, and invitation memberships block deletion;
existing invitation and print history are preserved. Invitation rows expand one
at a time, while print-order history starts collapsed. Save print permissions to
draft saves the draft; publish separately to apply those invitation permissions.

People's **Where used** action lists saved-draft photo numbers (including hidden
photos), published references, and invitation status across all years. Items link
to the relevant photo editor or invitation. The person filter beside Photos' tabs
shows direct assignments only; All includes hidden assignments, while shared
photos are not counted as individual assignments. Tab counts follow that filter.

Revocation closes access but keeps the invitation. A revoked invitation now offers
**Delete invitation** with confirmation and a current-version check. It removes
the old link, sessions and download counters; it keeps People and photos. Any
print-order history (including canceled/failed orders), legacy photo ownership or
stored manifest references block deletion. After deleting an otherwise unused
revoked invitation, its person can be explicitly deleted from People. No migration
is required, and no deletion happens automatically on revocation.

## Unpublishing

Review & publish has an explicit **Unpublish…** confirmation. It closes guest
access without deleting drafts, publication snapshots, photos, invitations,
sessions, or print history. Unsaved editor changes stay in memory. The collection
and review screen show Offline; publishing again reopens the same links. No other
year is activated automatically. Apply migration `0013_unpublish.sql` first.

`POST /api/editions/{year}/unpublish` requires `confirm: true` and the current
`publicationRevision` from state. Publication transitions advance that revision,
so stale confirmations cannot take a newer publication offline. The client also
sends it when publishing. Draft versions remain independent. Existing Access,
server identity, same-origin, and audit protections apply.

Valid invitations see a plain offline message before phone verification, including
when their verification session has expired. No SMS or new session is required to
read that message. Republishing does not extend expired verification sessions or
change invitation expiry/revocation. Guest media and printing remain inaccessible
while offline; admin saved-draft previews remain available.

## Bulk photo selection

Photos has independent selection checkboxes beside the existing photo editor.
Select all applies to the current photo/person filter; changing filters, tasks,
or years clears the selection. Hide selected, Unhide selected, and Remove from
draft change only the private draft until it is saved and published. Removed
photos retain their draft metadata for re-adding from Already uploaded.

Already uploaded has a separate selection and Delete selected confirmation listing
the exact batch. Deletion uses the existing protected per-photo endpoint: any
saved-draft or published reference blocks that item. Independent eligible items
can complete; failures display their reasons and remain selected for retry. An
unsaved draft removal must be saved before the server can allow deletion.

## Pixelbook Studio and configurable mugs

The sidebar now uses a pawprint and Pixelbook Studio branding. Each edition has
Mugs alongside Photos, Story, Invitations, and Review & publish. Select up to 12
uploaded photos, edit captions/descriptions, reorder/remove designs, or upload
mug-only photos without adding them to the scrapbook gallery. These choices are
stored as `mugDesigns` in the existing draft and published JSON with the usual
version checks. Blank captions are allowed while writing; the visibility rule
counts selected photos, with a minimum of four. The tab shows whether the next
publication will show or hide the gift section. Mug designs are explicitly shared
with every invitee regardless of the source photo's gallery audience.

Guest journals expose only published designs when at least four distinct usable
photos exist. Authenticated `/api/mugs/:id` serves their compressed preview;
this never grants a gallery original or personal-photo download. The admin draft
preview includes the configured designs at the same threshold. Fulfillment is not
connected: production can browse the designs but cannot submit a gift order.
The local fixture separately enables clearly labeled simulated claims.

Apply migration `0014_mug_designs.sql` before deploying the changed guest/admin
Workers. It adds race guards for mug references. Media deletion also checks saved
and published mug designs, including selections below the visibility threshold.
No production migration or deployment was performed during local implementation.

## Browser-local mug cutouts

Mugs now extracts a transparent PNG automatically when a photo is selected or
uploaded there. Extraction uses a self-hosted U2Netp model and ONNX Runtime Web
in a dedicated browser worker. No OpenAI/background-removal API, credentials,
or paid inference service is used. Images stay within the authenticated admin
and private R2. Keep the admin tab open while processing. Failures show a retry;
previously saved artwork is retained if regeneration fails. Original photos and
gallery previews are untouched. Each selection can also accept a prepared RGBA
PNG, and automatic cutouts offer restore/erase brushes plus one-stroke undo to
keep a bowl, couch, or another supporting detail. Prepared artwork can have a
different crop, so it is replaced by upload rather than brushed against an
unaligned source.

After `npm ci`, run `npm run admin:model` once. It downloads the 4.6 MB U2Netp
ONNX export from rembg's release and checks a pinned SHA-256. `admin:build` verifies
that checksum again, builds the worker, and copies the matching WASM runtime
and licenses into admin-only assets. All runtime/model requests are same-origin;
there is no CDN fallback. The admin CSP allows WASM compilation and same-origin
workers; guest CSP is unchanged. The initial runtime/model load is roughly 16 MB.
Licenses are in `admin/vendor/`. Generated binaries remain ignored by Git.
Sources: https://github.com/xuebinqin/U-2-Net and
https://onnxruntime.ai/docs/tutorials/web/deploy.html.

Cutouts use immutable, media/year-scoped R2 keys. Drafts pin `cutoutVersion`;
saving or regenerating a PNG does not change a publication. Publish requires all
selected mug cutouts to be ready (the guest section still requires at least four).
The authenticated guest mug route streams only the published PNG. Prepared PNGs
are limited to 12 MB / 4096px per side and RGBA; media deletion removes their
version history with the media prefix. No additional D1 migration is needed for
cutouts beyond the mug-selection race guards in 0014.

The guest review and Pixel perfect receipt share a deterministic ceramic-mug
illustration containing the selected artwork and exact caption. This is an
illustrative preview, not a supplier print proof. Live fulfillment remains separate; neither the app nor its fixture can place physical orders.

Successful simulated mug orders now show “text dad if you need a second one.
just don’t mention i told you this” on Pixel perfect, alongside a no-order/no-charge
notice. Preview-only claims do not show it. Admin Invitations shows separate mug
and postcard order histories and counters; view their saved proofs before reset.

Migration 0015 adds `mug_orders` and `invites.print_order_count` /
`invites.mug_order_count`. Atomic order reservations and database triggers keep
these independent allowance markers at 0 or 1. Print reset preserves prior orders
and proofs by releasing their allowance timestamp; mug reset deletes the completed
simulated mug order and its private artwork. `ORDER_MODE=simulation` is set in both Worker configs;
normal same-origin backend requests are used. Fulfillment remains simulated;
address autocomplete and USPS verification through Google are live. Approved
verified addresses are saved to the invitation verification contact in People.

## Mug permission gates

Migration `0016_mug_permissions.sql` adds two independent, default-off flags:
`editions.allow_mug_orders` and `invites.allow_mug`. All existing invitations and
scrapbooks are opted out on migration; new records also default off. Enable
**Allow mug orders** on Mugs or Invitations, then **Allow complimentary mug** on
eligible invitation rows (also offered in create/edit invitation). These settings
apply immediately without content publication. At least four published mugshots
are still required. Delivery remains US-only; do not enable invitations that need
unsupported international delivery. No country is inferred from phone numbers.

Both gates hide the guest gift section/catalog and are rechecked on the order
endpoint and atomic reservation, so a previously opened picker cannot bypass a
revocation. Disabling either flag preserves any existing order, allowance count,
and frozen proof. Admin generic design previews remain available for editing;
invitation-specific previews respect the flags. Orders remain simulated.


Bulk deletion results group photos by their blocking reason instead of repeating
one error per file. The dialog has a single scrolling body, expandable filename
lists and persistent actions on desktop/mobile. Review & publish is a navigation
shortcut only. The last publication continues to protect its photos while offline;
saving draft removals alone does not replace that snapshot. Publishing the updated
draft replaces it and reopens guest access. No deletion or publication happens
through the review shortcut.


Invitation create/edit is the single place for Share our socials, Allow
complimentary mug and Allow complimentary print. The detail pane retains order
counts, proofs and allowance reset actions without duplicate permission toggles.
Print eligibility still requires three personal photos and a current verified US
mailing contact, and is recalculated as members/contact change. Saving a changed
print permission also saves the current draft through the standard validation and
version checks; publication remains separate. If that draft save fails, invitation
details remain saved, the print change stays visibly unsaved and can be retried.
Socials and mug permissions continue to apply on saving the invitation.


## Current fixed mug collection (supersedes browser cutout editing)

Mugs manages captions and display order for the six approved photos. Uploads,
selection, regeneration, touch-up and descriptions remain locked. Mug-order
permissions remain in Invitations. The approved catalog is guarded server-side
against changes to the selected photos or artwork, including uploads from old clients. Prepared PNGs
are private, versioned R2 objects; old artwork and frozen order proofs remain.
The current build no longer requires or deploys a segmentation model/runtime.
Earlier browser-model setup instructions are historical. The repeated simulated
receipt sentence is removed; earlier simulation notices and behavior remain.


## Immediate print permissions (current behavior)

Migration 0017 moves household print permission into `invites.allow_print` and
`print_address_key`. It preserves the most recent saved draft choice (including
pending enables/disables), falling back to the publication only for legacy drafts
without permission fields. Edit invitation saves socials, mug and print settings
immediately with the invitation's optimistic version check. It never saves or
publishes scrapbook content. Verified US address binding remains mandatory;
changing the verification contact clears permission unless explicitly re-enabled.
Guest status and atomic order reservation check the live flag/address binding,
so stale checkout pages cannot bypass revocation. Published photos and postcard
note are still required; historical draft/publication permission JSON is ignored
for order authorization. Order counts and existing proofs are unchanged.

Dialog openings focus a neutral heading instead of a button. Shared pointer /
keyboard modality tracking suppresses lingering pointer-button rings while
preserving keyboard focus. The guest decorative stars are inline SVGs to avoid
Apple's emoji rendering.

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

## Drag-and-drop ordering

Photos has a Reorder button in the bulk-actions row; Mugs has one in the
collection header. The mode shows a separate Done/Cancel toolbar and drag handles,
locks ordinary editors, and offers Done reordering or Cancel (restores the order
from when the mode opened). Photos shows the whole collection, including hidden
photos, while arranging; prior filters return when the mode closes. Mouse, pen
and touch use the same handles. Keyboard users pick up with Space/Enter, move
with arrow keys or Home/End, drop with Space/Enter, and cancel a move with Escape.
Dragging outside the grid, pointer cancellation or window blur cancels the move.

Moves change only the current draft. Save draft persists the order; publication
is still separate. Curated mugs permit order and caption changes while retaining
the exact approved IDs, accessibility descriptions and versioned artwork. The
photo inspector no longer has move-up/down buttons. No migrations are required.

Invitation print and mug allowance rows use the same count-left, reset-right
layout and matching reset button dimensions. Existing confirmations still apply.

Mug order history includes the saved style, size, color and caption font; proof
previews use the same configuration as the guest receipt. Migration 0018 must be
applied before deploying. Options are provisional simulation choices until the
Printful account/catalog and delivered prices are connected and verified.


Mug history now shows the delivered Printful estimate saved with each new
simulated claim (mug, shipping, tax, fees/discounts, timestamp and total). Apply
0019/0020 before deploying. Only the guest Worker needs the Printful secret;
admin reads saved metadata from D1. Real catalog/estimates/mockups do not enable
fulfillment: `ORDER_MODE=simulation` remains in both configurations. Read the
current Printful section in the service README for token expiry and privacy.


The live mug catalog now discovers all Printful MUG styles/size/color combinations
and filters them only by the conservative delivered budget. Color Inside /Dark
Blue /15oz is Pixel recommended. Enamel is eligible with an explicit hand-wash,
not-dishwasher-safe note. New defaults never rewrite stored order configurations.
Guest cache lookups and decoded image reuse remove the illustration swap;0021
adds the lookup index. Fulfillment remains simulated.

## Shared prepared mug previews

Mugs now has a Saved mug previews panel. **Prepare previews** saves36 canonical
artwork files for the current six published photos, all three caption fonts and
two caption ink colors. Keep the owner tab open while artwork is being saved;
Printful generation then continues in the guest Worker’s background queue without
an open browser. The panel shows saved/desired preview counts. Publishing updated
captions prepares new immutable sources. Nightly catalog additions reuse existing
sources, and only budget-eligible variants are queued. Apply0022 before deployment.
No Printful secret is needed in admin, and no orders are created by preparation.

Fixed keepsakes now cover invitations with0–2 visible personal photos;3+ receives
a personalized card plus the fixed default in the same border. Both immediate
invitation and scrapbook print permissions remain enforced. Default templates
must be provisioned privately per year (migration0023); no photo-count restriction
is used to prune permission. History shows both pinned proofs and one allowance.

Print settings also report the owner-only Handwrytten connection and Test Mode.
The approved key is an encrypted admin Worker secret, installed with
`node scripts/provision.mjs handwrytten-secret`; never put it into browser assets.
Only diagnostics and test card-design preparation are implemented. Guest orders
remain local simulations with no Handwrytten submission or payment requests.

## Address removal and separate keepsake notes

People > Edit address now offers Delete address with confirmation. It clears the
saved address, all verification metadata and pending address approvals using the
person's current version. Guest delivery requires a new verified address; saved
order shipping snapshots and permissions are retained.

Story has separate Personalized keepsake note and Default keepsake note fields,
each limited to 350 characters and 10 line breaks. A blank default note reuses
the personalized note. Save and publish applies changes to future orders only.
Migration `0024_default_keepsake_note.sql` must be applied before deploying either
Worker: new orders freeze both notes and history displays the fixed card's note
separately for two-card orders. Existing history falls back to its original note.
Emoji text is retained and rendered by the browser in previews; physical vendor
rendering remains unverified because guest fulfillment is still simulated.

Guest keepsakes start with Candy cane selected. Default-only guests can order the
gift without Save/Share actions; personalized keepsakes retain digital export.

## Saved mug angles

Migration `0025_mug_preview_views.sql` tags existing saved images as `front` and
requests a library sync. The queue reuses source artwork and backfills
`handle-right` images without rewriting existing front image IDs or order proofs.
Saved preview counts now include both views. Guests start with Handle on right
when it is ready and can switch to Front; front-only combinations remain usable
while backfill runs. Both views depict the same existing print placement.

## Folded keepsakes

Apply `0026_folded_cards.sql` before deploying either Worker. New simulated orders
use one A2 portrait folded card (closed 4.25 × 5.5 inches): personalized artwork on
the front, the matching default artwork inside left, the personalized note inside
right, and a small `pixelbook ’26` signature on the back (year follows the edition).
Default-only cards use the default artwork on the front, leave inside left blank,
and use the default note inside right, falling back to the personalized note.
There is one note per folded card. Front/Inside/Back previews are available in
checkout, admin order history, and the default-only view-only receipt.

Recipients with both designs can use **Swap pictures** in checkout to exchange
the front and inside-left artwork. Local previews update immediately for each
placement. Admin can prepare a vendor proof from the saved order after confirmation.
`recipe_json.frontDesign` freezes the
choice (`personal` or `default`), so no schema migration is needed. Historical
orders without this field retain their original placement. The legacy
`default_artwork_key` column holds the inside-left image for folded orders, even
when that image is personalized. The note still follows recipient eligibility,
independently of picture placement. Default-only recipients cannot swap.
The personal editor omits the extra default thumbnail; checkout shows both designs.

The database `card_count` retains its historical artwork-count meaning (1 default,
2 personalized); API `cardCount` is 1 for folded orders. The `format` column keeps
historical flat-card orders as `legacy`. Notes, authors, back signature, and artwork
are frozen per order. Preview typography is illustrative; fulfillment is never
requested. `ORDER_MODE=simulation` stays enabled in both Workers.

Guest previews and receipts use Pixel’s playful placeholder message; the real
printed note is not returned by guest print APIs. Admin proofs retain the actual
frozen note for future fulfillment. Compact mobile checkout omits the layout
paragraph and view caption and scales the card to the available viewport height.

## Handwrytten picture proofs and simulated print payloads

Apply `0027_handwrytten_previews.sql` before deploying either Worker. Enable
`HANDWRYTTEN_PREVIEWS_ENABLED=true` and provision the existing API credential to
both server Workers with `node scripts/provision.mjs handwrytten-secret`.
`ORDER_MODE=simulation` remains for local gift simulations; the separate
`PRINT_ORDER_MODE=handwrytten_test` flag enables the gated test adapter described below. The API allowlist only adds card details and handwriting-font reads.

Guest Front/Inside/Back previews render locally, using A2 portrait proportions,
a 90% cover inset, the matching inside-left artwork inset, the enlarged placeholder
note, and the Pixelbook back signature. Swapping pictures and changing borders do
not call Handwrytten. Guest receipts also use saved local artwork, including older
orders that have vendor proofs. The old guest preview-generation POST returns 410;
authenticated reads of existing proofs remain compatible with older clients.

Simulated confirmation saves the arranged artwork, real note, authors, address,
and print font settings (`hwMadeline`, Merry Madeline, size 13, automatic fitting) immediately. The
stored `handwrytten_order_json.card_id` starts as null. No provider call is made on
the synchronous guest order path. The automatic test worker may later submit it
when explicitly enabled, as described below.

In admin order history, **Prepare Handwrytten proof** calls the authenticated,
year-scoped `POST /api/editions/:year/print-orders/:id/prepare-proof` for a saved
simulated folded order. It uses immutable saved front/inside-left files, never the
current defaults or current scrapbook. The design has blank writing space inside
right and the 2026 back asset. Design names use opaque digests. No real note or
address is sent for picture proof generation. The admin note remains illustrated
locally; it is not a vendor handwriting proof.

Proofs are copied to private R2. Cached ready proofs are reused; failed renders
retry the same vendor card ID. A ready proof attaches to the saved order and fills
only its stored payload's card ID, preserving the original note/font/address.
Proof preparation requires Test Mode and does not submit orders. The separate
automatic test worker owns the gated checkout/submission calls.
Existing saved vendor proofs remain available in admin. No schema migration is
needed. Prepare a new back asset before enabling another edition year.

The blinking paw is shared through `web/loading.js` and `web/loading.css`, used for
the initial scrapbook opening state, mug mockup loading and admin proof preparation.
Reduced-motion preferences disable
the blink. Guest card previews have no provider-loading animation to wait for.

Default keepsake artwork uses the greeting and signature in
`scripts/keepsake-default-copy.mjs` (Angela & Aditya). Re-render all three private
border variants with that copy included in the revision digest before publishing.
The publisher checks the manifest copy against this shared configuration. Publish
new immutable R2 keys, then switch the `keepsake_defaults` revision; never overwrite
saved order proofs or an existing artwork revision.

## Handwrytten checkout pricing previews

Apply `0028_handwrytten_quotes.sql` before deploying the admin Worker. In a saved
simulated folded order, **Get checkout total** prepares/reuses its immutable card
proof, then calls Handwrytten's documented `POST /outbound/process` pricing preview
for one card, standard US mail, and the frozen note plus closing. It selects the
enforced/default sender, or the sole saved sender if no default flag is present.
With several senders and no default, the quote stops and asks for a default.
The chosen return address is shown with the quote. No payment details are needed.

The admin-only `POST /api/editions/:year/print-orders/:id/quote` ignores client
pricing inputs and reads the saved order. The response includes card cost,
postage, shipping, inserts/bundles if applicable, tax, subtotal and total in USD
cents. Missing tax, negative/nonfinite values, a quantity other than one or
inconsistent arithmetic rejects the quote. The latest valid quote, sender and
timestamp are saved in `handwrytten_quote_json`, available only in admin history.
A failed refresh never overwrites a previous valid quote. Guest APIs omit it.

This is the provider's domestic pricing preview, documented under Prospecting,
not a submitted checkout. Final checkout pricing may change. Test Mode is required;
`/outbound/addToBasket`, order submission, basket mutations and payment endpoints
are unavailable to this quote-only route; automatic test fulfillment uses a
separate Test Mode gate. A Test Mode submission can authorize a
payment even though it is not captured, so this integration never submits one.

Official references: https://www.handwrytten.com/api/preview-order/ and
https://www.handwrytten.com/api-redoc/ .

## Printed note greetings and handwriting

New folded orders use Merry Madeline (`hwMadeline`), 13 pt with automatic fitting.
The personalized and default notes are complete shared messages, including their
closing. New orders do not append an automatic signoff or `wishes` field. At confirmation,
`Dear {invitation addressed to},` and a blank line are prepended to either body.
If `addressed_to` is empty, the invitation name is used; whitespace in the greeting
name is normalized. The envelope still uses the mailing contact's name/address
(the contact whose phone verifies the invitation), so a household greeting does
not overwrite a deliverable recipient name.

The composed note and font settings are frozen in the existing order fields and
provider payload. Invitation-version checks reject stale confirmations after a
greeting edit. Later edits do not rewrite saved orders or quotes. Admin order
history labels the font from each saved payload, including older Casual David
orders. Draft previews illustrate a placeholder greeting; guest previews keep the
real message hidden. No schema migration or live-order mode change is required.

Admin folded-card proofs are larger (up to 1100px modal and 800px inside spread).
On mobile the inside pages stack at full width so the note stays readable. Draft
and new-order proofs omit the automatic signature; older saved orders with a
frozen `wishes` field keep their original signoff in the historical proof.

## Automatic Handwrytten Test Mode fulfillment

Apply `0029_handwrytten_fulfillment.sql` before deploying either Worker. Keep
`ORDER_MODE=simulation` for the other gift flows and set
`PRINT_ORDER_MODE=handwrytten_test` in guest/admin Workers. Only newly confirmed
print orders get a `print_fulfillment` job; existing local simulations are never
backfilled or submitted. Confirmation stores the immutable artwork/message and
returns promptly. `waitUntil` starts fulfillment; the existing minute cron retries
safe preparation failures (up to three attempts).

The worker serializes the shared vendor basket through a D1 lease. It requires
account Test Mode before mutations, checks that the basket is empty, prepares the
saved folded design, and stages exactly one household with its destination country
ID and selected return-address ID on every address row. It reads `/basket/allNew`
for actual destination postage, shipping, tax, funding breakdown and total.
Missing/inconsistent fields, wrong country/quantity or unrelated items stop the
flow. The hard limit is **1000 USD cents including postage and tax**. An over-limit
draft is removed by its verified basket-item ID and held for review; unrelated
items are never removed or sent. Do not use the account basket manually while
automatic jobs are staging; vendor basket APIs have no atomic item-version token.
The worker checks basket identity again immediately before sending and passes the
exact `price_structure` to reject changed checkout pricing.

`/basket/send` is called with `test_mode:1` after a fresh account Test Mode check.
The known parent order is then read through `/orders/details`; acceptance requires
matching ID/reference, quantity one, `status=test`, `test_mode=1`, and a payment
amount within the cap. An unusual/lost response is reconciled with this read,
never by repeating the submit. A non-idempotent call is durably marked before it
starts; a unique lease token fences stale preparation workers before staging; uncertain staging/submission stops automatic retries and holds the account
for review. Do not clear a hold or requeue an uncertain job without checking its
known Handwrytten order ID/basket first. Test Mode may authorize payment but does
not capture it or fulfill mail. No live-order path is enabled.

Addresses now support US, India (`IN`) and Netherlands (`NL`). Country-aware
Google suggestions/validation use the selected region; USPS DPV/CASS remains
required for US addresses only. PIN/postcode validation is country-specific.
Google currently labels India validation as preview; it may fail addresses it
cannot confirm. Incomplete/unconfirmed addresses never become verified silently.
The account sender remains the approved US return address.

Admin history shows fulfillment state, errors, vendor reference and the actual
saved checkout quote. Guest picture previews remain local. A no-cost international
pricing smoke check found 375 cents card + 185 postage + 29 tax = 589 cents for both
India and Netherlands; one synthetic US Test Mode order was accepted for 486 cents
with Merry Madeline, 13 pt, automatic fitting. These were checks, not fixed prices.
Handwrytten's prospecting `/outbound/process` can return domestic postage for other
country strings, so its older domestic estimates are never used as the automatic
submission limit check.


Mug layout v3 uses one full wraparound PNG: the selected cutout and caption at
the official handle-left guide, Santa Pixel and “pixelbook ’26” at the handle-right
guide. `web/mug-placement-guides.js` records the per-product/per-size calibration
from Printful’s official API template images, including narrow black mugs. Each print area gets its own correctly proportioned 2400px-wide source;
`web/mug-layout.js` and `web/mug-print.js` define the shared sizing and rendering.
Previews request Handle left / Handle right. New source and proof IDs prevent
reuse of the previous one-sided artwork, while historical proofs remain available.
Migration 0030 preserves all existing preview rows and permits handle-left views.
New Printful-enabled simulated mug orders freeze `print.png` plus layout version
3 independently of the cutout used in the picker. Mug allowance reset continues
to delete its simulated order and both private artwork files. Actual mug ordering
remains disabled. Admin Prepare previews must prepare the new versioned sources;
Printful mockups then fill in under the existing background rate limits.
