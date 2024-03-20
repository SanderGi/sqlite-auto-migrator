/* eslint-disable */
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const files = fs.readdirSync('./');
console.log(files);

const db = new sqlite3.Database('');

const schema = `
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

CREATE VIRTUAL TABLE IF NOT EXISTS users_fts USING fts5(name);
`;

db.serialize(() => {
    db.exec(schema);

    db.run('BEGIN TRANSACTION');

    db.get('PRAGMA foreign_keys', (err, row) => {
        console.log(err, row);
    });

    db.all('SELECT * FROM sqlite_master', (err, rows) => {
        console.log(err, rows);
    });

    db.run('COMMIT TRANSACTION');

    // disables foreign key constraint
    db.run('PRAGMA foreign_keys = OFF', err => {
        console.log(err);
    });
    // violates foreign key constraint
    db.run('INSERT INTO foreignkeytousers (user_id) VALUES (1)', err => {
        console.log(err);
    });

    db.get('PRAGMA foreign_key_check', (err, row) => {
        console.log(err, row);
    });

    const schemaPragmas = [];
    const pragmaRegex = /PRAGMA\s+(\w+)\s*=\s*(\w+);/g;
    let match;
    while ((match = pragmaRegex.exec(schema)) !== null) {
        schemaPragmas.push(match[0]);
    }
    console.log(schemaPragmas);
});
