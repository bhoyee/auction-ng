-- Condition colours now drive the buyer badges (web and app). Add light green
-- ("mint") and align the starting colours with the badges buyers already see.
-- Only rows still on their original seeded colour change.
ALTER TABLE "conditions" DROP CONSTRAINT IF EXISTS "conditions_colour_check";
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_colour_check"
  CHECK ("colour" IN ('green', 'mint', 'indigo', 'blue', 'amber', 'red', 'grey'));
UPDATE "conditions" SET "colour" = 'mint' WHERE "key" = 'like_new' AND "colour" = 'indigo';
UPDATE "conditions" SET "colour" = 'indigo' WHERE "key" = 'open_box' AND "colour" = 'blue';
UPDATE "conditions" SET "colour" = 'red' WHERE "key" = 'damaged' AND "colour" = 'amber';
UPDATE "conditions" SET "colour" = 'amber' WHERE "key" = 'untested' AND "colour" = 'grey';
