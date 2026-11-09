CREATE INDEX invites_edition_year ON invites(edition_year);
CREATE INDEX media_objects_year ON media_objects(year);
CREATE UNIQUE INDEX invites_edition_phone ON invites(edition_year,phone);
