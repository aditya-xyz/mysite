# Personal website

## Local development

Install the locked dependencies with `npm ci`, then run `npm run dev`.
Run `npm run build` for the TypeScript check and production build.

## Public content and images

Projects and technologies are maintained in `src/content.ts`. The five projects
and nine technologies preserve the existing MongoDB records and destination links;
project display titles were added locally. Their recovered images are in
`src/assets/public-content/` and imported into the content file. Vite bundles and
fingerprints the images during the build, including when a non-root base is used.

The public site no longer requests the Railway `/project` or `/experience`
endpoints and needs no MongoDB connection, S3 bucket, or `VITE_API_BASE_URL`.
The contact form still uses its existing external Getform endpoint.

To update content, edit the local arrays and add/import any new images, then
commit and deploy them together. Keep original photo backups separately.

## Netlify

Build command: `npm run build`. Publish directory: `dist`.
No API or database environment variables are required. Any existing
`VITE_API_BASE_URL` setting can be removed; it is no longer read.

The tracked `dist` files are historical generated output. Build from source
when deploying. Backend hosting and database resources can be retired separately
after confirming they have no other consumers.
