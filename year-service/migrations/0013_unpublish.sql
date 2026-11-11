ALTER TABLE editions ADD COLUMN taken_offline_at INTEGER;
--> statement-breakpoint
ALTER TABLE editions ADD COLUMN publication_revision INTEGER NOT NULL DEFAULT 0;
