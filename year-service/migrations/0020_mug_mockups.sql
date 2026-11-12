CREATE TABLE mug_mockups (
 id TEXT PRIMARY KEY,
 invitation_id TEXT NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
 year INTEGER NOT NULL,
 recipe_key TEXT NOT NULL,
 design_id TEXT NOT NULL,
 configuration_json TEXT NOT NULL,
 caption TEXT NOT NULL,
 cutout_version TEXT NOT NULL,
 source_key TEXT NOT NULL,
 image_key TEXT,
 task_key TEXT,
 status TEXT NOT NULL DEFAULT 'preparing',
 source_expires_at INTEGER NOT NULL,
 next_poll_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 UNIQUE(invitation_id,recipe_key)
);
ALTER TABLE mug_orders ADD COLUMN mockup_id TEXT;
