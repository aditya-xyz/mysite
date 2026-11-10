ALTER TABLE photo_uploads ADD COLUMN part_counter INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE photo_uploads ADD COLUMN content_hash TEXT;
--> statement-breakpoint
ALTER TABLE media_objects ADD COLUMN content_hash TEXT;
--> statement-breakpoint
ALTER TABLE media_objects ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0 CHECK(deleting IN (0,1));
--> statement-breakpoint
CREATE UNIQUE INDEX media_content_hash ON media_objects(year,content_hash) WHERE content_hash IS NOT NULL AND deleting=0;
--> statement-breakpoint

-- Close the race between deleting unused media and saving/publishing a draft
-- that was validated just before deletion began.
CREATE TRIGGER draft_media_available BEFORE UPDATE OF draft_json ON editions
WHEN EXISTS(SELECT 1 FROM json_each(NEW.draft_json,'$.photos') p
  WHERE NOT EXISTS(SELECT 1 FROM media_objects m WHERE m.id=json_extract(p.value,'$.id') AND m.year=NEW.year AND m.deleting=0))
BEGIN SELECT RAISE(ABORT,'photo is no longer available'); END;
--> statement-breakpoint
CREATE TRIGGER published_media_available BEFORE UPDATE OF published_json ON editions
WHEN NEW.published_json IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(NEW.published_json,'$.photos') p
  WHERE NOT EXISTS(SELECT 1 FROM media_objects m WHERE m.id=json_extract(p.value,'$.id') AND m.year=NEW.year AND m.deleting=0))
BEGIN SELECT RAISE(ABORT,'photo is no longer available'); END;
