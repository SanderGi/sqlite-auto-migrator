import { normalize_sql } from './diff.mjs';
import { Database } from './database.mjs';

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
 * Get the body of a CREATE TABLE statement.
 * @param {string} sql the normalized `sqlite_master.sql` column used to create a table
 * @returns {string} the body of the CREATE TABLE statement, e.g. `("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL)`
 */
export function getCreateSQLBody(sql) {
    const parenIX = sql.indexOf('(');
    const quoteIX = sql.indexOf('"');
    if (quoteIX !== -1 && quoteIX < parenIX) {
        sql = sql.slice(quoteIX + 1);
        const quoteIX2 = sql.indexOf('"');
        return sql.slice(quoteIX2 + 1);
    } else {
        return sql.slice(parenIX);
    }
}

/** @typedef {{ type: string, notnull: number, dflt_value: string, pk: number, fk?: { table: string, column: string, on_update: string, on_delete: string, match: string } }} ColumnInfo */
/**
 *
 * @param {string} tableName name of the table to get column info for
 * @param {Database} db the database connection to get column info from
 * @param {boolean} [ignoreCase=false] true if table and column names should be lowercased, false otherwise
 * @returns {Promise<Map<string, ColumnInfo>>} a map of column names to their info
 */
export async function getColumnInfo(tableName, db, ignoreCase = false) {
    const info = await db.all(`PRAGMA table_info("${tableName}")`);
    const foreignKeys = await db.all(`PRAGMA foreign_key_list("${tableName}")`);
    const columnInfo = new Map();
    for (const { name, type, notnull, dflt_value, pk } of info) {
        columnInfo.set(ignoreCase ? name.toLowerCase() : name, { type, notnull, dflt_value, pk });
    }
    for (const { from: column, table, to, on_update, on_delete, match } of foreignKeys) {
        columnInfo.get(ignoreCase ? column.toLowerCase() : column).fk = {
            table: ignoreCase ? table.toLowerCase() : table,
            column: ignoreCase ? to.toLowerCase() : to,
            on_update,
            on_delete,
            match,
        };
    }
    return columnInfo;
}

/**
 * Get the normalized `sqlite_master.sql` column used to create a table.
 * @param {Database} db the database connection to get the table from
 * @param {string} tableName the name of the table to get the SQL for
 * @returns {Promise<string>} the normalized `sqlite_master.sql` column used to create the table
 */
export async function getTableSQL(db, tableName) {
    const { sql } = await db.get(
        'SELECT sql FROM sqlite_master WHERE type="table" AND name = ?',
        tableName,
    );
    return normalize_sql(sql);
}

/**
 * Get a map of table names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get tables from
 * @param {boolean} [ignoreCase=false] true if table names should be lowercased, false otherwise
 * @returns {Promise<Map<string, string>>} a map of table names to their normalized `sqlite_master.sql` column used to create them
 */
export async function getTables(db, ignoreCase = false) {
    const rows = await db.all('SELECT name, sql FROM sqlite_master WHERE type="table"');
    const tables = new Map();
    for (const row of rows) {
        if (row.name.startsWith('sqlite_')) continue; // Skip internal tables
        const lowerCaseName = ignoreCase ? row.name.toLowerCase() : row.name;
        tables.set(lowerCaseName, normalize_sql(row.sql).replace(row.name, lowerCaseName));
    }
    return tables;
}

/**
 * Get a map of view names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get views from
 * @param {boolean} [ignoreCase=false] true if view names should be lowercased, false otherwise
 * @returns {Promise<Map<string, string>>} a map of view names to their normalized `sqlite_master.sql` column used to create them
 */
export async function getViews(db, ignoreCase = false) {
    const rows = await db.all('SELECT name, sql FROM sqlite_master WHERE type="view"');
    const views = new Map();
    for (const row of rows) {
        if (row.name.startsWith('sqlite_')) continue; // Skip internal views
        const lowerCaseName = ignoreCase ? row.name.toLowerCase() : row.name;
        views.set(lowerCaseName, normalize_sql(row.sql).replace(row.name, lowerCaseName));
    }
    return views;
}

/**
 * Get a map of trigger names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get triggers from
 * @param {boolean} [ignoreCase=false] true if trigger names should be lowercased, false otherwise
 * @returns {Promise<Map<string, string>>} a map of trigger names to their normalized `sqlite_master.sql` column used to create them
 */
export async function getTriggers(db, ignoreCase = false) {
    const rows = await db.all('SELECT name, sql FROM sqlite_master WHERE type="trigger"');
    const triggers = new Map();
    for (const row of rows) {
        if (row.name.startsWith('sqlite_')) continue; // Skip internal triggers
        const lowerCaseName = ignoreCase ? row.name.toLowerCase() : row.name;
        triggers.set(lowerCaseName, normalize_sql(row.sql).replace(row.name, lowerCaseName));
    }
    return triggers;
}

/**
 * Get a map of index names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get indices from
 * @param {boolean} [ignoreCase=false] true if index names should be lowercased, false otherwise
 * @returns {Promise<Map<string, string>>} a map of index names to their normalized `sqlite_master.sql` column used to create them
 */
export async function getIndices(db, ignoreCase = false) {
    const rows = await db.all('SELECT name, sql FROM sqlite_master WHERE type="index"');
    const indices = new Map();
    for (const row of rows) {
        if (row.name.startsWith('sqlite_')) continue; // Skip internal indices
        const lowerCaseName = ignoreCase ? row.name.toLowerCase() : row.name;
        indices.set(lowerCaseName, normalize_sql(row.sql).replace(row.name, lowerCaseName));
    }
    return indices;
}

/**
 * Get a map of virtual table names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get virtual tables from
 * @param {boolean} [ignoreCase=false] true if virtual table names should be lowercased, false otherwise
 * @returns {Promise<Map<string, string>>} a map of virtual table names to their normalized `sqlite_master.sql` column used to create them
 */
export async function getVirtualTables(db, ignoreCase = false) {
    const rows = await db.all(
        'SELECT name, sql FROM sqlite_master WHERE type="table" AND sql LIKE "CREATE VIRTUAL TABLE%"',
    );
    const tables = new Map();
    for (const row of rows) {
        if (row.name.startsWith('sqlite_')) continue; // Skip internal tables
        const lowerCaseName = ignoreCase ? row.name.toLowerCase() : row.name;
        tables.set(lowerCaseName, normalize_sql(row.sql).replace(row.name, lowerCaseName));
    }
    return tables;
}
