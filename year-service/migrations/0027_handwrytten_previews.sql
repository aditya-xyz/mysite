CREATE TABLE handwrytten_previews (
 id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invites(id) ON DELETE CASCADE, year INTEGER NOT NULL REFERENCES editions(year) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('preparing','ready','failed')), card_id INTEGER,
 front_key TEXT, inside_key TEXT, back_key TEXT,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
--> statement-breakpoint
CREATE TABLE handwrytten_preview_assets (id TEXT PRIMARY KEY, image_id INTEGER NOT NULL);
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN handwrytten_preview_id TEXT;
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN handwrytten_order_json TEXT;
