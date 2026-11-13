-- Existing proofs retain their original flat-card layout. card_count records artwork count.
ALTER TABLE print_orders ADD COLUMN format TEXT NOT NULL DEFAULT 'legacy' CHECK(format IN ('legacy','folded'));
--> statement-breakpoint
ALTER TABLE print_orders ADD COLUMN back_text TEXT;
