-- Print permission is an invitation setting, independent of content publication.
ALTER TABLE invites ADD COLUMN allow_print INTEGER NOT NULL DEFAULT 0 CHECK(allow_print IN (0,1));
--> statement-breakpoint
ALTER TABLE invites ADD COLUMN print_address_key TEXT;
--> statement-breakpoint
-- Preserve the owner's most recent saved choices, including unpublished toggles.
UPDATE invites SET allow_print=EXISTS(
 SELECT 1 FROM editions e,json_each(CASE WHEN json_type(e.draft_json,'$.printInvitations')='array' THEN e.draft_json ELSE coalesce(e.published_json,'{}') END,'$.printInvitations') p
 WHERE e.year=invites.edition_year AND p.value=invites.id);
--> statement-breakpoint
UPDATE invites SET print_address_key=(SELECT coalesce(json_extract(e.draft_json,'$.printAddressKeys."'||invites.id||'"'),json_extract(e.published_json,'$.printAddressKeys."'||invites.id||'"')) FROM editions e WHERE e.year=invites.edition_year) WHERE allow_print=1;
