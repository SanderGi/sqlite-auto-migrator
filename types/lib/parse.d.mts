/**
 * Get a map of pragmas to their current values.
 * @param {Database} db the database connection to get pragmas from
 * @returns {Promise<Object>} a map of pragmas to their current values
 */
export function getPragmas(db: Database): Promise<any>;
/**
 * Get a map of table names to their normalized `sqlite_master.sql` column used to create them.
 * @param {Database} db the database connection to get tables from
 * @returns {Promise<Map<string, string>>} a map of table names to their normalized `sqlite_master.sql` column used to create them
 */
export function getTables(db: Database): Promise<Map<string, string>>;
import { Database } from './database.mjs';
