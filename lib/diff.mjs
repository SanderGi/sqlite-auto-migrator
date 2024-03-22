// utils for comparing and diffing data

import fs from 'fs';
import crypto from 'crypto';

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
