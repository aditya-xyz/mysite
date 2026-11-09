# Personal website

## Local development

Install the locked dependencies with `npm ci`, then run `npm run dev`.
Run `npm run build` for the TypeScript check and production build.

## Public content and images

Projects and technologies are maintained in `src/content.ts`. The five projects
preserve their original destination links. The editorial homepage presents selected
writing, a compact toolkit, and a personal
About section. Native disclosure controls reveal technology descriptions and older
articles. Three palette options in the footer change the local preview’s colors.
Recovered images are in `src/assets/public-content/`; symbolic icons use the
existing react-icons package. Vite bundles and fingerprints imported images during
the build, including when a non-root base is used.

The public site no longer requests the Railway `/project` or `/experience`
endpoints and needs no MongoDB connection, S3 bucket, or `VITE_API_BASE_URL`.
The social footer links to GitHub, LinkedIn, Medium, and Pixel’s Instagram.
Links are maintained in `src/socials.ts`. There is no contact form or Getform
integration; the Home LinkedIn button uses the same shared URL as the footer.

To update content, edit the local arrays and add/import any new images, then
commit and deploy them together. Keep original photo backups separately.

## Netlify

Build command: `npm run build`. Publish directory: `dist`.
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
configuration. DNS management is moving to Cloudflare while the public website
remains hosted on Netlify. The protected workers.dev admin URL remains a fallback
during DNS/HTTPS activation.
