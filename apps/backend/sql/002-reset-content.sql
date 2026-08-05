-- The reset remains separate from demo data so future configuration and
-- administrator bootstrap tables can be restored here deterministically.
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE exercises;
SET FOREIGN_KEY_CHECKS = 1;
