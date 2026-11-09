CREATE TABLE editions (
  year INTEGER PRIMARY KEY,
  draft_json TEXT NOT NULL,
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_json TEXT,
  published_version INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);
CREATE TABLE media_objects (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL REFERENCES editions(year),
  preview_key TEXT NOT NULL,
  original_key TEXT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
ALTER TABLE invites ADD COLUMN edition_year INTEGER NOT NULL DEFAULT 2026;
INSERT INTO editions(year,draft_json) VALUES(2026,json_object(
  'title','A year in little moments.',
  'authors','Aditya & Angela',
  'intro','A few places, some familiar faces, and the everyday things worth keeping. We’d love to share them with you.',
  'note','We wanted to make a little space for the photos with a story behind them, the ordinary days worth remembering, and the people who make it all feel like home.',
  'sharedTitle','A little of our year',
  'stories',json('[]'),
  'photos',json((SELECT coalesce(json_group_array(json_object('id',id,'caption',caption,'alt',alt,'recipients',json(CASE WHEN invite_id IS NULL THEN '[]' ELSE json_array(invite_id) END))),'[]') FROM (SELECT * FROM photos ORDER BY invite_id IS NULL,sort_order,id)))
));
INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes)
  SELECT id,2026,preview_key,original_key,coalesce(filename,id||'.jpg'),'image/jpeg',0 FROM photos;
CREATE TABLE admin_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
