ALTER TABLE people ADD COLUMN mailing_address TEXT;
--> statement-breakpoint
ALTER TABLE people ADD COLUMN address_verified INTEGER NOT NULL DEFAULT 0 CHECK(address_verified IN (0,1));
--> statement-breakpoint
ALTER TABLE people ADD COLUMN address_verified_at INTEGER;
--> statement-breakpoint
ALTER TABLE people ADD COLUMN address_verifier TEXT;
--> statement-breakpoint
ALTER TABLE people ADD COLUMN address_verification_key TEXT;
--> statement-breakpoint
ALTER TABLE editions ADD COLUMN allow_print_orders INTEGER NOT NULL DEFAULT 0 CHECK(allow_print_orders IN (0,1));
--> statement-breakpoint
CREATE TABLE print_orders (
 id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invites(id), year INTEGER NOT NULL REFERENCES editions(year),
 request_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('preparing','simulated','submitted','unknown','failed','canceled')),
 address_json TEXT NOT NULL, recipient_name TEXT NOT NULL, note TEXT NOT NULL, authors TEXT NOT NULL,
 recipe_json TEXT NOT NULL, artwork_key TEXT NOT NULL, published_version INTEGER NOT NULL, provider_id TEXT,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 UNIQUE(invitation_id,year,request_key)
);
--> statement-breakpoint
CREATE UNIQUE INDEX one_print_per_invitation_year ON print_orders(invitation_id,year) WHERE status IN ('preparing','simulated','submitted','unknown');
--> statement-breakpoint
CREATE TRIGGER mailing_address_invalidates_verification AFTER UPDATE OF mailing_address ON people
WHEN OLD.mailing_address IS NOT NEW.mailing_address BEGIN
 UPDATE people SET address_verified=0,address_verified_at=NULL,address_verifier=NULL,address_verification_key=NULL WHERE id=NEW.id;
END;
