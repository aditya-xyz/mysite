-- Mug selections live in the edition JSON; these guards prevent saving or
-- publishing a design while the referenced upload is being deleted.
CREATE TRIGGER draft_mug_media_available BEFORE UPDATE OF draft_json ON editions
WHEN EXISTS(SELECT 1 FROM json_each(NEW.draft_json,'$.mugDesigns') p
  WHERE NOT EXISTS(SELECT 1 FROM media_objects m WHERE m.id=json_extract(p.value,'$.id') AND m.year=NEW.year AND m.deleting=0))
BEGIN SELECT RAISE(ABORT,'mug photo is no longer available'); END;
--> statement-breakpoint
CREATE TRIGGER published_mug_media_available BEFORE UPDATE OF published_json ON editions
WHEN NEW.published_json IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(NEW.published_json,'$.mugDesigns') p
  WHERE NOT EXISTS(SELECT 1 FROM media_objects m WHERE m.id=json_extract(p.value,'$.id') AND m.year=NEW.year AND m.deleting=0))
BEGIN SELECT RAISE(ABORT,'mug photo is no longer available'); END;
