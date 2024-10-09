-- Table: users
CREATE TABLE users (id BLOB PRIMARY KEY, mail TEXT, password TEXT) WITHOUT ROWID;

-- Index: mail
CREATE INDEX mail ON users (mail);
