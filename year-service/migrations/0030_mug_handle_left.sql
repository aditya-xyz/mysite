-- Preserve every historical proof while allowing explicit handle-left views.
CREATE TABLE mug_preview_images_v2 (
 id TEXT PRIMARY KEY, year INTEGER NOT NULL, source_id TEXT NOT NULL REFERENCES mug_preview_sources(id),
 design_id TEXT NOT NULL, cutout_version TEXT NOT NULL, caption TEXT NOT NULL,
 font TEXT NOT NULL, style TEXT NOT NULL, size TEXT NOT NULL, color TEXT NOT NULL,
 variant_id INTEGER NOT NULL, image_key TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 view TEXT NOT NULL DEFAULT 'front' CHECK(view IN ('front','handle-left','handle-right'))
);
--> statement-breakpoint
INSERT INTO mug_preview_images_v2 SELECT * FROM mug_preview_images;
--> statement-breakpoint
DROP TABLE mug_preview_images;
--> statement-breakpoint
ALTER TABLE mug_preview_images_v2 RENAME TO mug_preview_images;
--> statement-breakpoint
CREATE INDEX mug_preview_image_catalog ON mug_preview_images(year,design_id,cutout_version,font,variant_id);
--> statement-breakpoint
ALTER TABLE mug_orders ADD COLUMN print_artwork_key TEXT;
--> statement-breakpoint
ALTER TABLE mug_orders ADD COLUMN print_layout_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE mug_mockups ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 1;
