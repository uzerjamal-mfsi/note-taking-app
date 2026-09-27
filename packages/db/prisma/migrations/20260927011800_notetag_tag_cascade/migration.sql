-- AlterTable
-- `NoteTag.tagId`'s FK to `Tag` was `ON DELETE RESTRICT`, which would make
-- `DELETE /tags/:id` (AB-1006) fail with a foreign-key violation for a tag
-- whose only remaining `NoteTag` rows point to soft-deleted notes. Switch it
-- to `ON DELETE CASCADE` so deleting a `Tag` row also removes its (already
-- orphaned, since deletion is blocked otherwise) `NoteTag` rows.
ALTER TABLE "NoteTag" DROP CONSTRAINT "NoteTag_tagId_fkey";
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
