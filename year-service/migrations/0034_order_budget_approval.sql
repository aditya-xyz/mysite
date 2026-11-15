ALTER TABLE mug_orders ADD COLUMN budget_review_required INTEGER NOT NULL DEFAULT 0 CHECK(budget_review_required IN (0,1));
--> statement-breakpoint
ALTER TABLE mug_orders ADD COLUMN budget_approved_cents INTEGER CHECK(budget_approved_cents>0);
--> statement-breakpoint
ALTER TABLE mug_orders ADD COLUMN budget_approved_by TEXT;
--> statement-breakpoint
ALTER TABLE mug_orders ADD COLUMN budget_approved_at INTEGER;
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN budget_review_required INTEGER NOT NULL DEFAULT 0 CHECK(budget_review_required IN (0,1));
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN budget_approved_cents INTEGER CHECK(budget_approved_cents>0);
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN budget_approved_by TEXT;
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN budget_approved_at INTEGER;
--> statement-breakpoint
UPDATE mug_orders SET budget_review_required=1 WHERE status='simulated' AND allowance_reset_at IS NULL AND json_valid(quote_json) AND json_extract(quote_json,'$.totalCents')>2500;
--> statement-breakpoint
UPDATE print_orders SET budget_review_required=1 WHERE status='simulated' AND allowance_reset_at IS NULL AND id IN (SELECT order_id FROM print_fulfillment WHERE state='review' AND quote_only=0 AND basket_item_id IS NULL) AND json_valid(handwrytten_quote_json) AND json_extract(handwrytten_quote_json,'$.amounts.total')>1000;
