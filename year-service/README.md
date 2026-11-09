# Aditya & Angela · Private 2026 pilot

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

The single Save photo action prepares the original before tapping, uses native
file sharing where available, and otherwise downloads it. The original bytes
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

The 2026 editor is deployed separately at
https://aditya-private-admin.aditya-year-service.workers.dev
Only aditya.patil.gverse@gmail.com is allowed through Google + Cloudflare Access;
the Worker also verifies the signed Access JWT on every request. The owner
confirmed the live sign-in on November 8, 2026. See admin/README.md for setup,
operations, and validation details.

Story, Photos, People & invitations, and recipient Preview are available. Saves
remain private drafts. Publish explicitly updates the guest edition. No new
content was published during implementation, and the original pilot remains
available. The public Netlify portfolio and DNS were not changed. The eventual
admin.adityapatil.xyz custom domain remains a separate DNS setup step.
