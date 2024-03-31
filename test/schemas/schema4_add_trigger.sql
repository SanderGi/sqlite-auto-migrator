PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    age INTEGER
);
CREATE TABLE IF NOT EXISTS foreignkeytousers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE VIEW IF NOT EXISTS users_view AS
    SELECT id, name FROM users;
CREATE INDEX IF NOT EXISTS users_name_index ON users (name);
CREATE TRIGGER IF NOT EXISTS users_trigger
    AFTER INSERT ON users
    BEGIN
        INSERT INTO users (name) VALUES ('trigger');
    END;
