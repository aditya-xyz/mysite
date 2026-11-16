CREATE TABLE digital_postcards (
 id TEXT PRIMARY KEY, year INTEGER NOT NULL REFERENCES editions(year), invitation_id TEXT NOT NULL,
 member_ids TEXT NOT NULL CHECK(json_valid(member_ids)), personalized INTEGER NOT NULL CHECK(personalized IN (0,1)),
 frame TEXT NOT NULL, note TEXT NOT NULL, authors TEXT NOT NULL, frames_json TEXT NOT NULL CHECK(json_valid(frames_json)),
 default_revision TEXT NOT NULL, artwork_key TEXT NOT NULL, recipe_json TEXT NOT NULL CHECK(json_valid(recipe_json)),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), UNIQUE(year,invitation_id)
);
--> statement-breakpoint
CREATE INDEX digital_postcards_year ON digital_postcards(year);
--> statement-breakpoint
CREATE TRIGGER digital_postcard_reservation BEFORE INSERT ON digital_postcards BEGIN
 SELECT RAISE(ABORT,'Digital postcard household already reserved') WHERE EXISTS(
 SELECT 1 FROM digital_postcards d WHERE d.year=NEW.year AND (d.invitation_id=NEW.invitation_id OR EXISTS(SELECT 1 FROM json_each(d.member_ids) a JOIN json_each(NEW.member_ids) b ON a.value=b.value)));
 SELECT RAISE(ABORT,'A mailed postcard is already reserved') WHERE EXISTS(
 SELECT 1 FROM print_orders o JOIN invites i ON i.id=o.invitation_id WHERE o.year=NEW.year AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown') AND
 (i.id=NEW.invitation_id OR i.person_id IN (SELECT value FROM json_each(NEW.member_ids)) OR EXISTS(SELECT 1 FROM json_each(i.member_ids) a JOIN json_each(NEW.member_ids) b ON a.value=b.value)));
END;
--> statement-breakpoint
CREATE TRIGGER digital_postcard_blocks_mailing BEFORE INSERT ON print_orders WHEN NEW.status IN ('preparing','simulated','submitted','unknown') BEGIN
 SELECT RAISE(ABORT,'This household permanently chose a digital postcard') WHERE EXISTS(
 SELECT 1 FROM digital_postcards d JOIN invites i ON i.id=NEW.invitation_id WHERE d.year=NEW.year AND
 (d.invitation_id=i.id OR i.person_id IN (SELECT value FROM json_each(d.member_ids)) OR EXISTS(SELECT 1 FROM json_each(i.member_ids) a JOIN json_each(d.member_ids) b ON a.value=b.value)));
END;
--> statement-breakpoint
CREATE TRIGGER digital_postcard_blocks_mailing_restore BEFORE UPDATE OF status,allowance_reset_at ON print_orders WHEN NEW.status IN ('preparing','simulated','submitted','unknown') AND NEW.allowance_reset_at IS NULL BEGIN
 SELECT RAISE(ABORT,'This household permanently chose a digital postcard') WHERE EXISTS(
 SELECT 1 FROM digital_postcards d JOIN invites i ON i.id=NEW.invitation_id WHERE d.year=NEW.year AND
 (d.invitation_id=i.id OR i.person_id IN (SELECT value FROM json_each(d.member_ids)) OR EXISTS(SELECT 1 FROM json_each(i.member_ids) a JOIN json_each(d.member_ids) b ON a.value=b.value)));
END;
