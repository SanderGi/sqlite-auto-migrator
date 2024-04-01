/**
 * Calculates the set difference of setA and setB.
 * @template T
 * @param {Iterable<T>} setA
 * @param {Iterable<T>} setB
 * @returns {Set<T>} the subset of setA that is not also in setB
 */
export function setDifference<T>(setA: Iterable<T>, setB: Iterable<T>): Set<T>;
/**
 * Compare two objects and return the difference.
 * @param {Object} objA the object to compare
 * @param {Object} objB the object to compare against
 * @param {boolean} [valuesFromA=true] if true, the returned object will contain the values from objA, otherwise the values from objB
 * @returns a new object containing the keys from objA that have different values in objB
 */
export function objectDifference(objA: any, objB: any, valuesFromA?: boolean): {};
/**
 * The keys with different values between two maps.
 * @template K, V
 * @param {Map<K, V>} mapA the map to compare (most efficient if this is the smaller map)
 * @param {Map<K, V>} mapB the map to compare against
 * @param {Function} [equal=(a, b) => a === b] the equality function to use
 * @returns {Set<K>} a new set of keys in both maps but with different values
 */
export function mapDifference<K, V>(mapA: Map<K, V>, mapB: Map<K, V>, equal?: Function): Set<K>;
/**
 * Mapping the keys in keysA to the keys in keysB that have mapA.get(keyA) === mapB.get(keyB). Chooses the first match.
 * @template K, V
 * @param {Map<K, V>} mapA the map to compare
 * @param {Iterable<K>} keysA the keys to compare
 * @param {Map<K, V>} mapB the map to compare against
 * @param {Iterable<K>} keysB the keys to compare against
 * @param {function} [equal=(a, b) => a === b] the equality function to use
 * @returns {Map<K, V>} a new map of keysA to keysB where the values are equal
 */
export function mappedDifference<K, V>(mapA: Map<K, V>, keysA: Iterable<K>, mapB: Map<K, V>, keysB: Iterable<K>, equal?: Function): Map<K, V>;
/**
 * Normalize SQL for comparison. This removes comments, normalizes whitespace and removes unnecessary quotes.
 * @private
 * @param {string} sql to normalize, assumed to already be the semi-normalized format of sqlite3's `sqlite_master.sql` column (https://www.sqlite.org/schematab.html)
 * @returns {string} normalized sql
 */
export function normalize_sql(sql: string): string;
/**
 * Quotes and trims a SQL string.
 * @param {string} sql the SQL string to quote and trim
 * @returns {string} a copy of the sql string with quotes replaced by '\\"' and leading/trailing whitespace removed
 */
export function unquoteSQL(sql: string): string;
/**
 * Gets the absolute path of a given path.
 * @param {string} pathstr
 * @returns {string}
 */
export function getAbsolutePath(pathstr: string): string;
/**
 * Calculates the hash of a file.
 * @param {string} filename the file to hash
 * @returns {Promise<string>} the hash of the file
 */
export function fileHash(filename: string): Promise<string>;
