ALTER TABLE print_fulfillment ADD COLUMN quote_only INTEGER NOT NULL DEFAULT 0 CHECK(quote_only IN (0,1));
