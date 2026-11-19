-- Used between prod-schema.sql and prod-data.sql in the restore (step 3.6):
-- triggers and foreign keys off while the data loads, so circular foreign keys
-- (users, reviews, sessions) and row triggers do not get in the way. A file
-- rather than psql -c, because PowerShell 5.1 strips the inner quotes of
-- -c "..." on its way into docker.
SET session_replication_role = replica;
