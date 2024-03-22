// Automatically created by 'sqlite auto migrator (SAM)' on 2021-08-15 20:00:00

import { Errors } from 'sqlite-auto-migrator';
import { Database } from 'sqlite-auto-migrator';

/**
 * Runs the necessary SQL commands to migrate the database up to this version from the previous version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function up(db) {
    await db.run(
        'CREATE TABLE IF NOT EXISTS sample_table (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)',
    );
}

/**
 * Runs the necessary SQL commands to migrate the database down to the previous version from this version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function down(db) {
    await db.run('DROP TABLE IF EXISTS sample_table');
}
