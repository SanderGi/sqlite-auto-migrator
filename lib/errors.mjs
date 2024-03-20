'use strict';

/**
 * Error to be thrown when a manual migration is required.
 */
export class ManualMigrationRequired extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CustomError);
        }

        this.name = 'ManualMigrationRequired';
        this.message = 'Manual migration required: ' + message;
    }
}

/**
 * Error to be thrown when the migrator options are invalid.
 */
export class ValidationError extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CustomError);
        }

        this.name = 'ValidationError';
        this.message = 'Invalid migrator options: ' + message;
    }
}
