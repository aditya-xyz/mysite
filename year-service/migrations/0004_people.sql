CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO people(id,name,phone)
SELECT 'contact-' || min(i.id),
  (SELECT j.name FROM invites j WHERE j.phone=i.phone ORDER BY j.edition_year DESC,j.id LIMIT 1),
  i.phone FROM invites i GROUP BY i.phone;
ALTER TABLE invites ADD COLUMN person_id TEXT REFERENCES people(id);
UPDATE invites SET person_id=(SELECT id FROM people WHERE people.phone=invites.phone);
CREATE UNIQUE INDEX invites_edition_person ON invites(edition_year,person_id) WHERE person_id IS NOT NULL;
CREATE INDEX invites_person ON invites(person_id);
CREATE TRIGGER invites_legacy_person AFTER INSERT ON invites WHEN NEW.person_id IS NULL BEGIN
  INSERT INTO people(id,name,phone) VALUES('contact-' || NEW.id,NEW.name,NEW.phone) ON CONFLICT(phone) DO NOTHING;
  UPDATE invites SET person_id=(SELECT id FROM people WHERE phone=NEW.phone) WHERE id=NEW.id;
END;
CREATE TRIGGER people_sync_invitations AFTER UPDATE OF name,phone ON people BEGIN
  DELETE FROM sessions WHERE invite_id IN (SELECT id FROM invites WHERE person_id=NEW.id) AND OLD.phone<>NEW.phone;
  UPDATE invites SET name=NEW.name,phone=NEW.phone,
    challenge_expires_at=CASE WHEN OLD.phone<>NEW.phone THEN 0 ELSE challenge_expires_at END
    WHERE person_id=NEW.id;
END;
