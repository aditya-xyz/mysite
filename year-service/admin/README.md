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
HTTPS cannot enable it. Local successes are labeled simulated. Apply migration
0010 before deploying this support. Production print ordering stays off, and
provider verification/fulfillment must be connected before enabling live orders.


Invitation rows are collapsed by default. More details reveals sharing/link
controls and print permissions; only one invitation can be expanded at once.
Reset print allowance appears for a used allowance and requires confirmation.
It grants one additional print without canceling existing orders or deleting their
history. Processing/uncertain orders cannot be reset. Lifetime prints ordered and
current allowance availability are displayed separately. Reset history is marked
on the original order. Apply migration 0011 before deploying reset support.


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
