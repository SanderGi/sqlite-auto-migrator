// Automatically created by 'sqlite auto migrator (SAM)' on 2021-08-15 20:00:00

import { Database } from 'sqlite-auto-migrator';

// Pragmas can't be changed in transactions, so they are tracked separately.
// Note that most pragmas are not persisted in the database file and will have to be set on each new connection.
export const PRAGMAS = { foreign_keys: 1, journal_mode: 'wal' };

/**
 * Runs the necessary SQL commands to migrate the database up to this version from the previous version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function up(db) {
    await db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            age INTEGER
        )
    `);
    await db.run(`
        CREATE TABLE IF NOT EXISTS foreignkeytousers (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);
}

/**
 * Runs the necessary SQL commands to migrate the database down to the previous version from this version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function down(db) {
    await db.run('DROP TABLE IF EXISTS foreignkeytousers');
    await db.run('DROP TABLE IF EXISTS users');
}
