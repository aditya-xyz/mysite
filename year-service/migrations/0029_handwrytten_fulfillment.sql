CREATE TABLE print_fulfillment (
 order_id TEXT PRIMARY KEY REFERENCES print_orders(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('pending','preparing','staging','staged','submitting','submitted','review','unknown')),
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT(unixepoch()),
 vendor_order_id INTEGER, basket_item_id INTEGER, error TEXT,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
--> statement-breakpoint
CREATE TABLE print_fulfillment_lock (
 id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, lease_until INTEGER NOT NULL, blocked INTEGER NOT NULL DEFAULT 0
);
