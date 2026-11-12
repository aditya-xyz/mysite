ALTER TABLE invites ADD COLUMN print_order_count INTEGER NOT NULL DEFAULT 0 CHECK(print_order_count BETWEEN 0 AND 1);
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN mug_order_count INTEGER NOT NULL DEFAULT 0 CHECK(mug_order_count BETWEEN 0 AND 1);
--> statement-breakpoint
UPDATE invites SET print_order_count=EXISTS(SELECT 1 FROM print_orders o WHERE o.invitation_id=invites.id AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown'));
--> statement-breakpoint
CREATE TABLE mug_orders (
 id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invites(id), year INTEGER NOT NULL REFERENCES editions(year),
 request_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('preparing','simulated','submitted','unknown','failed','canceled')),
 design_id TEXT NOT NULL, caption TEXT NOT NULL, alt TEXT NOT NULL, artwork_key TEXT NOT NULL,
 address_json TEXT NOT NULL, recipient_name TEXT NOT NULL, save_address INTEGER NOT NULL CHECK(save_address IN (0,1)),
 published_version INTEGER NOT NULL, allowance_reset_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 UNIQUE(invitation_id,year,request_key)
);
--> statement-breakpoint
CREATE UNIQUE INDEX one_mug_per_invitation_year ON mug_orders(invitation_id,year) WHERE allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown');
--> statement-breakpoint
CREATE TRIGGER count_print_order AFTER INSERT ON print_orders WHEN NEW.allowance_reset_at IS NULL AND NEW.status IN ('preparing','simulated','submitted','unknown') BEGIN
 UPDATE invites SET print_order_count=1 WHERE id=NEW.invitation_id;
END;
--> statement-breakpoint
CREATE TRIGGER release_print_allowance AFTER UPDATE OF allowance_reset_at,status ON print_orders WHEN NEW.allowance_reset_at IS NOT NULL OR NEW.status IN ('failed','canceled') BEGIN
 UPDATE invites SET print_order_count=EXISTS(SELECT 1 FROM print_orders o WHERE o.invitation_id=NEW.invitation_id AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown')) WHERE id=NEW.invitation_id;
END;
--> statement-breakpoint
CREATE TRIGGER count_mug_order AFTER INSERT ON mug_orders WHEN NEW.allowance_reset_at IS NULL AND NEW.status IN ('preparing','simulated','submitted','unknown') BEGIN
 UPDATE invites SET mug_order_count=1 WHERE id=NEW.invitation_id;
END;
--> statement-breakpoint
CREATE TRIGGER release_mug_allowance AFTER UPDATE OF allowance_reset_at,status ON mug_orders WHEN NEW.allowance_reset_at IS NOT NULL OR NEW.status IN ('failed','canceled') BEGIN
 UPDATE invites SET mug_order_count=EXISTS(SELECT 1 FROM mug_orders o WHERE o.invitation_id=NEW.invitation_id AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown')) WHERE id=NEW.invitation_id;
END;
--> statement-breakpoint
CREATE TRIGGER delete_print_order_count AFTER DELETE ON print_orders BEGIN
 UPDATE invites SET print_order_count=EXISTS(SELECT 1 FROM print_orders o WHERE o.invitation_id=OLD.invitation_id AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown')) WHERE id=OLD.invitation_id;
END;
--> statement-breakpoint
CREATE TRIGGER delete_mug_order_count AFTER DELETE ON mug_orders BEGIN
 UPDATE invites SET mug_order_count=EXISTS(SELECT 1 FROM mug_orders o WHERE o.invitation_id=OLD.invitation_id AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown')) WHERE id=OLD.invitation_id;
END;
