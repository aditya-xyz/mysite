# Private dashboard and 2026 editor

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
- npm run deploy (guest compatibility with publications)
- npm run admin:deploy

The generated admin/web/app.js is ignored; the build script bundles the source
from admin/client/app.js. Worker assets always run through the auth gate first.
Do not publish the local React mockup or its private photo imports to Netlify.

The owner successfully signed in through Google and confirmed the live dashboard
on November 8, 2026.

The configured custom address is https://admin.adityapatil.xyz. The original
https://aditya-private-admin.aditya-year-service.workers.dev remains available
as a protected fallback. Both hostnames invoke the same Worker and are covered
by the existing Worker-wide Access application and exact-email server checks.
No additional Google OAuth callback or application audience is needed.

On November 9, 2026, the owner saved the domain's GoDaddy delegation to
katja.ns.cloudflare.com and venkat.ns.cloudflare.com. Cloudflare zone ID:
bbb14649d5198ec211688746e3bbe15d. Activation, DNS caches, and HTTPS issuance must
complete before the custom hostname is usable everywhere.

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

Overview shows the 2026 draft and a deliberately unconnected home-server card.
Story edits the title, authors, introduction, opening note, shared chapter title,
and up to 20 stories. Photos supports original uploads, captions, accessible
image descriptions, reordering, and shared or selected-recipient/group access.
People supports adding/correcting names and phones, local QR generation, link
rotation, and revocation. Phone changes, link rotation, and revocation terminate
existing sessions. People/invitation changes take effect immediately; content
and photo-audience changes remain in draft until publication.

Uploads support JPEG, PNG, and WebP up to 25 MB each. HEIC and SVG aren't
supported in this first version. The browser generates a JPEG preview up to
1600 pixels without EXIF and uploads the original File unchanged. R2 keeps the
original bytes. Every uploaded image is private; the browser never receives R2
write credentials. Removed draft photos remain in the media library so they
can be added back. This version does not permanently delete originals.

Shared photos expose previews only to verified invitees. Selected-recipient
photos expose previews and available originals only to those recipients. Group
selection is multiple people on the same photo. Existing shared pilot samples
have no originals; assigning them personally won't invent a missing original.

Saving uses optimistic version checks and never changes published_json.
Publishing validates the saved draft and writes one immutable manifest snapshot
atomically in D1, conditional on the reviewed version. Guests only read that
published snapshot and its allowed media IDs. Before the first publication,
the old pilot gallery remains available. Current pilot media is imported into
the first draft by migration 0002 without changing the published guest view.
Admin Preview filters the saved draft by recipient and never creates a guest
session or sends SMS. Guest text is rendered as plain text, not HTML.

Invitation URLs use 256-bit tokens in the fragment, stored hashed server-side.
Readable links/QRs are returned once; save them immediately. Creating a new link
replaces the old one. No invitation delivery or SMS happens from admin actions.
New phone numbers still need Twilio trial verification until that account is
upgraded; this provider enrollment cannot be bypassed by the dashboard.

## Checks

The integration suite runs real local Workers/D1/R2 with signed test identities
and mocked JWKS/Twilio endpoints. It covers unauthenticated asset/API denial,
forged headers, wrong email/audience/issuer, expired JWTs, CSRF, draft conflicts,
private previews, byte-preserving originals, shared versus personal/group
permissions, publication isolation, phone changes, link rotation, and revocation.
The browser editor was checked at desktop and 390px phone widths using an
isolated fixture with fake people; it never queried production personal data.

A local-only preview harness is in .private/preview-admin.mjs. It creates an
ephemeral test identity and fake in-memory database, binds localhost only, and
refuses external traffic apart from its mocked local issuer. It is ignored and
must never be deployed. Production identity is still Cloudflare Access.
