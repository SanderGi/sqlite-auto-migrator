import { normalize_sql } from './diff.mjs';
import Database from './database.mjs';

/**
 * Get a map of pragmas to their current values.
 * @param {Database} db the database connection to get pragmas from
 * @returns {Promise<Object>} a map of pragmas to their current values
 */
export async function getPragmas(db) {
    const pragmas = {};
    for await (const { name: pragma } of db.each('pragma pragma_list')) {
        Object.assign(pragmas, await db.get(`PRAGMA ${pragma}`));
    }
    return pragmas;
}

/**
 * Get a map of table names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get tables from
 * @returns {Promise<Map<string, string>>} a map of table names to their normalized `sqlite_master.sql` column used to create them
 */
export async function getTables(db) {
    const rows = await db.all('SELECT name, sql FROM sqlite_master WHERE type="table"');
    const tables = new Map();
    for (const row of rows) {
        tables.set(row.name, normalize_sql(row.sql));
    }
    return tables;
}

// TODO: views, triggers, indexes, virtual tables
