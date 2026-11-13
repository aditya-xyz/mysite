CREATE TABLE mug_preview_sources (
 id TEXT PRIMARY KEY, year INTEGER NOT NULL, design_id TEXT NOT NULL,
 cutout_version TEXT NOT NULL, caption TEXT NOT NULL, font TEXT NOT NULL,
 ink TEXT NOT NULL, artwork_key TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE mug_preview_jobs (
 id TEXT PRIMARY KEY, year INTEGER NOT NULL, source_id TEXT NOT NULL REFERENCES mug_preview_sources(id),
 product_id INTEGER NOT NULL, print_width INTEGER NOT NULL, print_height INTEGER NOT NULL,
 mockup_group TEXT, priority INTEGER NOT NULL DEFAULT 100, variants_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
 task_key TEXT, source_token TEXT, source_expires_at INTEGER NOT NULL DEFAULT 0,
 next_check_at INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 result_key TEXT, created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX mug_preview_job_work ON mug_preview_jobs(status,next_check_at,created_at);
CREATE UNIQUE INDEX mug_preview_source_token ON mug_preview_jobs(source_token) WHERE source_token IS NOT NULL;
CREATE TABLE mug_preview_images (
 id TEXT PRIMARY KEY, year INTEGER NOT NULL, source_id TEXT NOT NULL REFERENCES mug_preview_sources(id),
 design_id TEXT NOT NULL, cutout_version TEXT NOT NULL, caption TEXT NOT NULL,
 font TEXT NOT NULL, style TEXT NOT NULL, size TEXT NOT NULL, color TEXT NOT NULL,
 variant_id INTEGER NOT NULL, image_key TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX mug_preview_image_catalog ON mug_preview_images(year,design_id,cutout_version,font,variant_id);
CREATE TABLE mug_preview_sync (
 year INTEGER PRIMARY KEY, catalog_json TEXT, manifest_json TEXT,
 desired_count INTEGER NOT NULL DEFAULT 0, ready_count INTEGER NOT NULL DEFAULT 0,
 requested INTEGER NOT NULL DEFAULT 1, synced_at INTEGER NOT NULL DEFAULT 0,
 sync_lease_until INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE mug_orders ADD COLUMN prepared_preview_id TEXT;
