PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS useRs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    age INTEGER
);
CREATE TABLE IF NOT EXISTS foreignkeytousers (
    id INTEGER PRIMARY KEY,
    uSer_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE VIEW IF NOT EXISTS users_View AS
    SELECT id, name FROM useRs;
CREATE INDEX IF NOT EXISTS users_Name_index ON useRs (name);
CREATE TRIGGER IF NOT EXISTS userS_trigger
    AFTER INSERT ON useRs
    BEGIN
        INSERT INTO useRs (name) VALUES ('trigger');
    END;
CREATE VIRTUAL TABLE IF NOT EXISTS uSErs_fts USING fts5(name);
