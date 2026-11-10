ALTER TABLE media_objects ADD COLUMN viewer_key TEXT;
CREATE TABLE original_downloads (
  invite_id TEXT NOT NULL REFERENCES invites(id),
  photo_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  requests INTEGER NOT NULL CHECK(requests BETWEEN 0 AND 5),
  PRIMARY KEY(invite_id,photo_id)
);
