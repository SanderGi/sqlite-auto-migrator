/**
 * Calculates the set difference of setA and setB.
 * @param {Iterable} setA
 * @param {Iterable} setB
 * @returns the subset of setA that is not also in setB
 */
export function setDifference(setA: Iterable<any>, setB: Iterable<any>): Set<any>;
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
 * @param {map} mapA the map to compare (most efficient if this is the smaller map)
 * @param {map} mapB the map to compare against
 * @param {function} [equal=(a, b) => a === b] the equality function to use
 * @returns a new set of keys in both maps but with different values
 */
export function mapDifference(mapA: map, mapB: map, equal?: Function): Set<any>;
/**
 * Mapping the keys in keysA to the keys in keysB that have mapA.get(keyA) === mapB.get(keyB). Chooses the first match.
 * @param {map} mapA the map to compare
 * @param {iterable} keysA the keys to compare
 * @param {map} mapB the map to compare against
 * @param {iterable} keysB the keys to compare against
 * @param {function} [equal=(a, b) => a === b] the equality function to use
 * @returns a new map of keysA to keysB where the values are equal
 */
export function mappedDifference(mapA: map, keysA: iterable, mapB: map, keysB: iterable, equal?: Function): Map<any, any>;
/**
 * Normalize SQL for comparison. This removes comments, normalizes whitespace and removes unnecessary quotes.
 * @private
 * @param {string} sql to normalize, assumed to already be the semi-normalized format of sqlite3's `sqlite_master.sql` column (https://www.sqlite.org/schematab.html)
 * @returns {string} normalized sql
 */
export function normalize_sql(sql: string): string;
/**
 * Calculates the hash of a file.
 * @param {string} filename the file to hash
 * @returns {Promise<string>} the hash of the file
 */
export function fileHash(filename: string): Promise<string>;
