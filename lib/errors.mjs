'use strict';

/**
 * Prettify sqlite3 error.
 * @param {Error} err sqlite3 error to prettify
 * @param {string} sql sql that caused the error
 * @param {Array|Object} params parameters used in the sql
 * @param {Error} stackReference stack reference to use
 * @effect modifies err to include the sql and params and a stack trace relative to stackReference but not including stackReference's parent function call
 */
export function prettifySqlite3Error(err, sql, params, stackReference) {
    stackReference.message = err.message;
    const stack = stackReference.stack.split('\n');
    stack.splice(1, 1);
    err.stack = stack.join('\n');
    err.sql = sql;
    err.params = params;
}

/**
 * Error to be thrown when a manual migration is required.
 */
export class ManualMigrationRequired extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ManualMigrationRequired);
        }

        this.name = 'ManualMigrationRequired';
        this.message = 'Manual migration required: ' + message;
    }
}

/**
 * Error to be thrown when the options/input is invalid.
 */
export class ValidationError extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }

        this.name = 'ValidationError';
        this.message = 'Invalid migration options: ' + message;
    }
}

/**
 * Error to be thrown when a transaction is rolled back.
 */
export class RolledBackTransaction extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RolledBackTransaction);
        }

        this.name = 'RolledBackTransaction';
        this.message = 'Transaction was rolled back: ' + message;
    }
}
