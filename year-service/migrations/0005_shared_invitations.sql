-- Preserve contact links while rebuilding People: D1 cannot drop a referenced parent table.
-- The migration transaction restores every original person_id before returning.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
DROP TRIGGER people_sync_invitations;
--> statement-breakpoint
DROP TRIGGER invites_legacy_person;
--> statement-breakpoint
CREATE TABLE people_next (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
INSERT INTO people_next SELECT * FROM people;
--> statement-breakpoint
CREATE TABLE migration_invite_contacts AS SELECT id,person_id FROM invites;
--> statement-breakpoint
UPDATE invites SET person_id=NULL;
--> statement-breakpoint
DROP TABLE people;
--> statement-breakpoint
ALTER TABLE people_next RENAME TO people;
--> statement-breakpoint
UPDATE invites SET person_id=(SELECT person_id FROM migration_invite_contacts old WHERE old.id=invites.id);
--> statement-breakpoint
DROP TABLE migration_invite_contacts;
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN addressed_to TEXT;
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN member_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(member_ids) AND json_type(member_ids)='array');
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE invites SET member_ids=json_array(person_id);
--> statement-breakpoint
CREATE TRIGGER invites_legacy_person AFTER INSERT ON invites BEGIN
  INSERT INTO people(id,name,phone) SELECT 'contact-' || NEW.id,NEW.name,NEW.phone WHERE NEW.person_id IS NULL ON CONFLICT(phone) DO NOTHING;
  UPDATE invites SET person_id=COALESCE(NEW.person_id,(SELECT id FROM people WHERE phone=NEW.phone)),
    member_ids=CASE WHEN json_array_length(NEW.member_ids)=0 THEN json_array(COALESCE(NEW.person_id,(SELECT id FROM people WHERE phone=NEW.phone))) ELSE NEW.member_ids END WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER people_require_verification_phone BEFORE UPDATE OF phone ON people
WHEN NEW.phone IS NULL AND EXISTS(SELECT 1 FROM invites WHERE person_id=NEW.id) BEGIN
  SELECT RAISE(ABORT,'verification contact needs a phone');
END;
--> statement-breakpoint
CREATE TRIGGER people_sync_invitations AFTER UPDATE OF name,phone ON people BEGIN
  DELETE FROM sessions WHERE invite_id IN (SELECT id FROM invites WHERE person_id=NEW.id) AND OLD.phone IS NOT NEW.phone;
  UPDATE invites SET name=NEW.name,phone=NEW.phone,version=version+1,
    challenge_expires_at=CASE WHEN OLD.phone IS NOT NEW.phone THEN 0 ELSE challenge_expires_at END WHERE person_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER invitations_audience_changed AFTER UPDATE OF member_ids,person_id ON invites
WHEN OLD.member_ids<>NEW.member_ids OR OLD.person_id IS NOT NEW.person_id BEGIN
  DELETE FROM sessions WHERE invite_id=NEW.id;
END;
