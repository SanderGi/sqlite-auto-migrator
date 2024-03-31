PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE "uSERs" (id integer PRIMARY KEY AUTOINCREMENT,
                                                                                                        name TEXT,
    age INTEGER);
create table IF NOT EXISTS USERS (
    id INTEGER PRIMARY KEY autoincrement,
    name TEXT,
    age INTEGER
);
CREATE TABLE "foreignkeytousers" (id integer primary key, uSEr_Id INTEGER, foreign key(user_id) REFERENCES useRS(id)
);
CREATE VIEW "UsErs_view" AS SELECT id, name FROM "users";
CREATE INDEX "users_naME_index" ON users (name);
CREATE TRIGGER "userS_Trigger" AFTER INSERT ON "users" BEGIN INSERT INTO "users" (name) VALUES ('trigger'); END;
CREATE VIRTUAL TABLE "users_fts" USING fts5(name);
