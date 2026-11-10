-- Private, temporary state for bounded multipart original uploads.
CREATE TABLE photo_uploads (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL REFERENCES editions(year),
  actor TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes < 100000000),
  upload_id TEXT NOT NULL,
  parts_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','working','completing','aborting')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX photo_uploads_created ON photo_uploads(created_at);
