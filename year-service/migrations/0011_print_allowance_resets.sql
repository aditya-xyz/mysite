ALTER TABLE print_orders ADD COLUMN allowance_reset_at INTEGER;
--> statement-breakpoint
DROP INDEX one_print_per_invitation_year;
--> statement-breakpoint
CREATE UNIQUE INDEX one_print_per_invitation_year ON print_orders(invitation_id,year) WHERE allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown');
