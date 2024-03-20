/**
 * Calculates the set difference of setA and setB.
 * @param {Iterable} setA
 * @param {Iterable} setB
 * @returns the subset of setA that is not also in setB
 */
export function setDifference(setA, setB) {
    const difference = new Set(setA);
    for (const elem of setB) {
        difference.delete(elem);
    }
    return difference;
}

/**
 * Normalize SQL for comparison. This removes comments, normalizes whitespace and removes unnecessary quotes.
 * @private
 * @param {string} sql to normalize, assumed to already be the semi-normalized format of sqlite3's `sqlite_master.sql` column (https://www.sqlite.org/schematab.html)
 * @returns {string} normalized sql
 */
export function normalize_sql(sql) {
    // Remove comments:
    sql = sql.replace(/--[^\n]*\n/g, '');
    // Normalize whitespace:
    sql = sql.replace(/\s+/g, ' ');
    sql = sql.replace(/ *([(),]) */g, '$1');
    // Remove unnecessary quotes
    sql = sql.replace(/"(\w+)"/g, '$1');
    return sql.trim();
}
