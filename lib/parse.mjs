import { normalize_sql } from './diff.mjs';
import Database from './database.mjs';

/**
 * Parses a schema file and returns a list of pragmas that it sets.
 * @private
 * @param {string} schema the schema (string with semi-colon separated DDL SQL statements) to parse pragmas from
 * @returns {string[]} list of pragmas in the schema, e.g. `[ 'PRAGMA foreign_keys = ON;', 'PRAGMA journal_mode = WAL;' ]`
 */
export function parsePragmas(schema) {
    const pragmas = [];
    const pragmaRegex = /PRAGMA\s+(\w+)\s*=\s*(\w+);/g;
    let match;
    while ((match = pragmaRegex.exec(schema)) !== null) {
        pragmas.push(match[0]);
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
