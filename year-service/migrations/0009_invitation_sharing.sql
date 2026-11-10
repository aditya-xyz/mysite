ALTER TABLE invites ADD COLUMN share_socials INTEGER NOT NULL DEFAULT 0 CHECK(share_socials IN (0,1));
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN token_encrypted TEXT;
--> statement-breakpoint
ALTER TABLE editions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1));
--> statement-breakpoint
UPDATE editions SET is_active=1 WHERE year=coalesce((SELECT year FROM editions WHERE published_json IS NOT NULL ORDER BY published_at DESC,year DESC LIMIT 1),2026);
--> statement-breakpoint
CREATE UNIQUE INDEX editions_one_active ON editions(is_active) WHERE is_active=1;
--> statement-breakpoint
CREATE TRIGGER editions_activate BEFORE UPDATE OF is_active ON editions WHEN NEW.is_active=1 AND OLD.is_active=0 BEGIN
  UPDATE editions SET is_active=0 WHERE year<>NEW.year AND is_active=1;
END;
