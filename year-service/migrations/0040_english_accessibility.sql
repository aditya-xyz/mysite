-- Retire only translated photo descriptions. English alt text and all captions stay intact.
UPDATE edition_translations SET
 draft_json=(SELECT json_group_object(key,json(value)) FROM json_each(edition_translations.draft_json) WHERE key NOT GLOB 'photo:*:alt'),
 published_json=CASE WHEN published_json IS NULL THEN NULL ELSE (SELECT json_group_object(key,json(value)) FROM json_each(edition_translations.published_json) WHERE key NOT GLOB 'photo:*:alt') END,
 version=version+1
WHERE EXISTS(SELECT 1 FROM json_each(draft_json) WHERE key GLOB 'photo:*:alt')
 OR EXISTS(SELECT 1 FROM json_each(coalesce(published_json,'{}')) WHERE key GLOB 'photo:*:alt');
