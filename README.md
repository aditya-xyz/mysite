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
