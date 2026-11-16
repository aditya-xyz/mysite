-- Additive only: existing invitation identities, tokens and content stay intact.
ALTER TABLE invites ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','mr','zh-TW'));
CREATE TABLE edition_translations (
 year INTEGER NOT NULL REFERENCES editions(year),
 language TEXT NOT NULL CHECK(language IN ('mr','zh-TW')),
 draft_json TEXT NOT NULL DEFAULT '{}',
 published_json TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 published_at INTEGER,
 reviewed_by TEXT,
 PRIMARY KEY(year,language)
);
