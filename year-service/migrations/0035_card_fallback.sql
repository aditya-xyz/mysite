CREATE TABLE card_fallback_policies (
 year INTEGER PRIMARY KEY REFERENCES editions(year),
 international_cutoff INTEGER NOT NULL, international_run_at INTEGER NOT NULL,
 us_cutoff INTEGER NOT NULL, us_run_at INTEGER NOT NULL,
 CHECK(international_run_at>=international_cutoff AND us_run_at>=us_cutoff)
);
--> statement-breakpoint
-- Midnight and 6 a.m. America/Los_Angeles, following each recipient deadline.
INSERT INTO card_fallback_policies VALUES(2026,1796025600,1796047200,1796630400,1796652000);
--> statement-breakpoint
CREATE TABLE card_fallback_exclusions (
 year INTEGER NOT NULL REFERENCES editions(year), invitation_id TEXT NOT NULL REFERENCES invites(id),
 actor TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 PRIMARY KEY(year,invitation_id)
);
--> statement-breakpoint
CREATE TABLE card_fallback_jobs (
 invitation_id TEXT NOT NULL REFERENCES invites(id), year INTEGER NOT NULL REFERENCES editions(year),
 household_key TEXT NOT NULL, cutoff_at INTEGER NOT NULL, run_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','preparing','saved','skipped','failed')),
 reason TEXT NOT NULL DEFAULT '', order_id TEXT UNIQUE REFERENCES print_orders(id),
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 PRIMARY KEY(year,invitation_id)
);
--> statement-breakpoint
CREATE INDEX due_card_fallback_jobs ON card_fallback_jobs(state,next_at,run_at);
