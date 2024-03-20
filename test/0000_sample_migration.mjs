// Automatically created by 'sqlite auto migrator (SAM)' on 2021-08-15 20:00:00

import { ManualMigrationRequired } from '../lib/errors.mjs';
import Database from '../lib/database.mjs';

/**
 * Runs the necessary SQL commands to migrate the database up to this version from the previous version.
 * @param {Database} db database instance to run SQL commands on
 */
export async function up(db) {
    await db.run('BEGIN TRANSACTION');
    await db.run('PRAGMA defer_foreign_keys = TRUE'); // disable foreign key checks while migrating; automatically re-enabled at the end of the transaction
    await db.run('COMMIT TRANSACTION');
    // throw new ManualMigrationRequired('Migration 0000 is not yet implemented');
}

/**
 * Runs the necessary SQL commands to migrate the database down to the previous version from this version.
 * @param {import('sqlite3').sqlite3} db database instance to run SQL commands on
 */
export async function down(db) {
    throw new ManualMigrationRequired('Migration 0000 is not reversible');
}
