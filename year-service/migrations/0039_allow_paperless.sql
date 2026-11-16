ALTER TABLE invites ADD COLUMN allow_paperless INTEGER NOT NULL DEFAULT 1 CHECK(allow_paperless IN (0,1));
--> statement-breakpoint
CREATE TRIGGER digital_postcard_permission BEFORE INSERT ON digital_postcards BEGIN
 SELECT RAISE(ABORT,'Paperless is not enabled for this invitation') WHERE NOT EXISTS(
 SELECT 1 FROM invites i WHERE i.id=NEW.invitation_id AND i.edition_year=NEW.year AND i.allow_paperless=1);
END;
