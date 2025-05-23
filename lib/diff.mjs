// utils for comparing and diffing data

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';

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
 * Quotes and trims a SQL string.
 * @param {string} sql the SQL string to quote and trim
 * @returns {string} a copy of the sql string with quotes replaced by '\\"' and leading/trailing whitespace removed
 */
export function unquoteSQL(sql) {
    sql = sql.trim();
    sql = sql.replace(/"/g, '\\"');
    return sql;
}

/**
 * Gets the absolute path of a given path.
 * @param {string} pathstr
 * @returns {string}
 */
export function getAbsolutePath(pathstr) {
    if (!pathstr || typeof pathstr !== 'string' || pathstr === ':memory:') {
        return pathstr;
    }
    return path.resolve(pathstr);
}

/**
 * Calculates the hash of a file.
 * @param {string} filename the file to hash
 * @returns {Promise<string>} the hash of the file
 */
export async function fileHash(filename) {
    const hash = crypto.createHash('sha256');
    await finished(
        fs
            .createReadStream(filename)
            .pipe(createLineSplitter()) // strips CR and normalises to LF
            .on('data', line => hash.update(line + '\n')),
    );
    return hash.digest('hex');
}

// OS line ending agnostic line splitter
function createLineSplitter() {
    let leftover = '';
    return new Transform({
        readableObjectMode: true,
        transform(chunk, _encoding, callback) {
            const lines = (leftover + chunk.toString()).split(/\r\n|\n|\r/);
            leftover = lines.pop(); // last item may be incomplete
            for (const line of lines) this.push(line);
            callback();
        },
        flush(callback) {
            if (leftover) this.push(leftover);
            callback();
        },
    });
}
