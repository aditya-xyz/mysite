ALTER TABLE people ADD COLUMN address_verified_until INTEGER;
--> statement-breakpoint
CREATE TABLE address_verification_challenges (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES people(id), person_version INTEGER NOT NULL,
 address_json TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('google','local_mock')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX address_verification_expiry ON address_verification_challenges(expires_at);
--> statement-breakpoint
CREATE TABLE address_verification_usage (
 provider TEXT NOT NULL, day TEXT NOT NULL, month TEXT NOT NULL,
 requests INTEGER NOT NULL CHECK(requests>0), PRIMARY KEY(provider,day)
);
--> statement-breakpoint
CREATE INDEX address_verification_month ON address_verification_usage(provider,month);
--> statement-breakpoint
DROP TRIGGER mailing_address_invalidates_verification;
--> statement-breakpoint
CREATE TRIGGER mailing_address_invalidates_verification AFTER UPDATE OF mailing_address ON people
WHEN OLD.mailing_address IS NOT NEW.mailing_address BEGIN
 UPDATE people SET address_verified=0,address_verified_at=NULL,address_verifier=NULL,address_verification_key=NULL,address_verified_until=NULL WHERE id=NEW.id;
END;
