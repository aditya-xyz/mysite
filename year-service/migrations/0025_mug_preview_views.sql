ALTER TABLE mug_preview_images ADD COLUMN view TEXT NOT NULL DEFAULT 'front' CHECK(view IN ('front','handle-right'));
--> statement-breakpoint
UPDATE mug_preview_sync SET requested=1;
