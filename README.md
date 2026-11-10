# Personal website

## Local development

Install the locked dependencies with `npm ci`, then run `npm run dev`.
Run `npm run build` for the TypeScript check and production build.

## Public content and images

Articles and technologies are maintained in `src/content.ts`. The three articles
appear in order: the private scrapbook, congressional data synchronization, then
Code App/model-driven app integration. Their public, AI-generated cover images
have optimized copies in `src/assets/public-content/`. Only the scrapbook
links to public source code. The editorial homepage presents selected
writing, a compact toolkit, and a personal
About section. Native disclosure controls reveal technology descriptions. The older article
collection has been removed. Three palette options in the footer change the local preview’s colors.
Recovered images are in `src/assets/public-content/`; symbolic icons use the
existing react-icons package. Vite bundles and fingerprints imported images during
the build, including when a non-root base is used.

The public site no longer requests the Railway `/project` or `/experience`
endpoints and needs no MongoDB connection, S3 bucket, or `VITE_API_BASE_URL`.
The social footer links to GitHub, LinkedIn, and Medium. Links are maintained
in `src/socials.ts`. The hero contains only Explore my work; its LinkedIn button
has been removed. The header contains the wordmark and Work/Toolkit/About navigation,
with no Let’s connect link. There is no contact form or Getform integration.

To update content, edit the local arrays and add/import any new images, then
commit and deploy them together. Keep original photo backups separately.

## Netlify

Build command: `npm run build`. Publish directory: `dist`.
Netlify's dependency settings use Node 22. The November 9, 2026 rebuild of
`803a2fd` published successfully with Node 22.23.4; an isolated local build of
the same committed source also passed. Local prototype files were excluded.
No API or database environment variables are required. Any existing
`VITE_API_BASE_URL` setting can be removed; it is no longer read.

The tracked `dist` files are historical generated output. Build from source
when deploying. Backend hosting and database resources can be retired separately
after confirming they have no other consumers.

## Private scrapbook and admin dashboard

The private 2026 scrapbook and owner-only dashboard run on Cloudflare Workers,
separately from the Netlify portfolio. Their source, setup, and deployment
commands are in [year-service/README.md](year-service/README.md) and
[year-service/admin/README.md](year-service/admin/README.md).

The scrapbook uses phone-bound invitations, Twilio SMS verification, D1 sessions,
and private R2 media. The admin editor uses Google through Cloudflare Access,
with independent server-side identity checks. It supports stories, photo uploads,
recipient/group assignments, QR invitations, previews, and explicit draft/publish.

Deploy the portfolio from the repository root. Deploy the Cloudflare services
from year-service using its separate scripts. Never upload local .dev.vars,
.private, .wrangler, or personal mockup photos. Build the admin client before
its deployment. Guestbook and home-server monitoring are future additions.

The original local React design prototype is not part of the public release.
The live private services enforce access on the backend and do not use the
prototype's sample-code authentication. The admin custom hostname is
`admin.adityapatil.xyz`; its Cloudflare routing is declared in the admin Worker
configuration. Cloudflare DNS delegation and the admin hostname's HTTPS were
verified on November 9, 2026, including the Access redirect and the signed-in
dashboard. The public website remains hosted on Netlify. The protected
workers.dev admin URL remains a fallback.

## Browser color schemes

The HTML declares `color-scheme: light dark` before React loads so Safari can
recognize the existing native palette support. CSS selects a light color scheme
for Paper/Moss and dark for After hours through the portfolio’s palette attribute.
Light palettes also specify `only light` to discourage automatic recoloring in
supporting browsers. Safari 27.3 beta 1 does not yet support that keyword; its
Adaptive Dark Mode documentation says the light/dark support declaration skips
automatic transformation. Verify on the actual beta device after deployment;
desktop previews do not reproduce that feature.
