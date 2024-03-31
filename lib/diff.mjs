// utils for comparing and diffing data

import fs from 'node:fs';
import crypto from 'node:crypto';

/**
 * Calculates the set difference of setA and setB.
 * @template T
 * @param {Iterable<T>} setA
 * @param {Iterable<T>} setB
 * @returns {Set<T>} the subset of setA that is not also in setB
 */
export function setDifference(setA, setB) {
    const difference = new Set(setA);
    for (const elem of setB) {
        difference.delete(elem);
    }
    return difference;
}

/**
 * Compare two objects and return the difference.
 * @param {Object} objA the object to compare
 * @param {Object} objB the object to compare against
 * @param {boolean} [valuesFromA=true] if true, the returned object will contain the values from objA, otherwise the values from objB
 * @returns a new object containing the keys from objA that have different values in objB
 */
export function objectDifference(objA, objB, valuesFromA = true) {
    const difference = {};
    for (const key of Object.keys(objA)) {
        if (objA[key] !== objB[key]) {
            difference[key] = valuesFromA ? objA[key] : objB[key];
        }
    }
    return difference;
}

/**
 * The keys with different values between two maps.
 * @template K, V
 * @param {Map<K, V>} mapA the map to compare (most efficient if this is the smaller map)
 * @param {Map<K, V>} mapB the map to compare against
 * @param {Function} [equal=(a, b) => a === b] the equality function to use
 * @returns {Set<K>} a new set of keys in both maps but with different values
 */
export function mapDifference(mapA, mapB, equal = (a, b) => a === b) {
    const difference = new Set();
    for (const [key, valA] of mapA.entries()) {
        const valB = mapB.get(key);
        if (valB === undefined) continue;
        if (!equal(valA, valB)) {
            difference.add(key);
        }
    }
    return difference;
}

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
export function mappedDifference(mapA, keysA, mapB, keysB, equal = (a, b) => a === b) {
    const difference = new Map();
    for (const keyA of keysA) {
        const valA = mapA.get(keyA);
        for (const keyB of keysB) {
            const valB = mapB.get(keyB);
            if (equal(valA, valB)) {
                difference.set(keyA, keyB);
            }
        }
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

/**
 * Calculates the hash of a file.
 * @param {string} filename the file to hash
 * @returns {Promise<string>} the hash of the file
 */
export async function fileHash(filename) {
    const hash = crypto.createHash('sha256');
    hash.setEncoding('hex');
    const stream = fs.createReadStream(filename);
    stream.pipe(hash);
    return new Promise((resolve, reject) => {
        stream.on('end', () => {
            hash.end();
            resolve(hash.read());
        });
        stream.on('error', reject);
    });
}
