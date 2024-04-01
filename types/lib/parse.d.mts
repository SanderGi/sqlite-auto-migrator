/**
 * Get a map of pragmas to their current values.
 * @param {Database} db the database connection to get pragmas from
 * @returns {Promise<Object>} a map of pragmas to their current values
 */
export function getPragmas(db: Database): Promise<any>;
/**
 * Parses a schema file and returns a list of pragmas that it sets.
 * @private
 * @param {string} schema the schema (string with semi-colon separated DDL SQL statements) to parse pragmas from
 * @returns {string[]} list of pragmas in the schema, e.g. `[ 'PRAGMA foreign_keys = ON;', 'PRAGMA journal_mode = WAL;' ]`
 */
export function parsePragmas(schema: string): string[];
/**
 * Get the body of a CREATE TABLE statement.
 * @param {string} sql the normalized `sqlite_master.sql` column used to create a table
 * @returns {string} the body of the CREATE TABLE statement, e.g. `("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL)`
 */
export function getCreateSQLBody(sql: string): string;
/** @typedef {{ type: string, notnull: number, dflt_value: string, pk: number, fk?: { table: string, column: string, on_update: string, on_delete: string, match: string } }} ColumnInfo */
/**
 *
 * @param {string} tableName name of the table to get column info for
 * @param {Database} db the database connection to get column info from
 * @returns {Promise<Map<string, ColumnInfo>>} a map of column names to their info
 */
export function getColumnInfo(tableName: string, db: Database): Promise<Map<string, ColumnInfo>>;
/**
 * Get the normalized `sqlite_master.sql` column used to create a table.
 * @param {Database} db the database connection to get the table from
 * @param {string} tableName the name of the table to get the SQL for
 * @returns {Promise<string>} the normalized `sqlite_master.sql` column used to create the table
 */
export function getTableSQL(db: Database, tableName: string): Promise<string>;
/**
 * Get a map of table names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get tables from
 * @returns {Promise<Map<string, string>>} a map of table names to their normalized `sqlite_master.sql` column used to create them
 */
export function getTables(db: Database): Promise<Map<string, string>>;
/**
 * Get a map of view names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get views from
 * @returns {Promise<Map<string, string>>} a map of view names to their normalized `sqlite_master.sql` column used to create them
 */
export function getViews(db: Database): Promise<Map<string, string>>;
/**
 * Get a map of trigger names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get triggers from
 * @returns {Promise<Map<string, string>>} a map of trigger names to their normalized `sqlite_master.sql` column used to create them
 */
export function getTriggers(db: Database): Promise<Map<string, string>>;
/**
 * Get a map of index names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get indices from
 * @returns {Promise<Map<string, string>>} a map of index names to their normalized `sqlite_master.sql` column used to create them
 */
export function getIndices(db: Database): Promise<Map<string, string>>;
/**
 * Get a map of virtual table names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get virtual tables from
 * @returns {Promise<Map<string, string>>} a map of virtual table names to their normalized `sqlite_master.sql` column used to create them
 */
export function getVirtualTables(db: Database): Promise<Map<string, string>>;
export type ColumnInfo = {
    type: string;
    notnull: number;
    dflt_value: string;
    pk: number;
    fk?: {
        table: string;
        column: string;
        on_update: string;
        on_delete: string;
        match: string;
    };
};
import { Database } from './database.mjs';
