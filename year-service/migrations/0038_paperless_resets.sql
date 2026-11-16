-- Preserve the complete previous choice when an admin resets paperless preference.
CREATE TABLE digital_postcard_resets (
 id TEXT PRIMARY KEY,
 year INTEGER NOT NULL REFERENCES editions(year),
 invitation_id TEXT NOT NULL,
 reset_invitation_id TEXT NOT NULL,
 reset_by TEXT NOT NULL,
 reset_at INTEGER NOT NULL DEFAULT(unixepoch()),
 claim_json TEXT NOT NULL CHECK(json_valid(claim_json))
);
