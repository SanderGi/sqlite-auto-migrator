/**
 * Error to be thrown when a manual migration is required.
 */
export class ManualMigrationRequired extends Error {
    constructor(...params) {
        super(...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ManualMigrationRequired);
        }

        this.name = 'ManualMigrationRequired';
    }
}

/**
 * Error to be thrown when the migrator options/input is invalid.
 */
export class ValidationError extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }

        this.name = 'ValidationError';
        this.message = 'Invalid migration options/input: ' + message;
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

/**
 * Error to be thrown when the database integrity or foreignkey constraints are violated.
 */
export class IntegrityError extends Error {
    constructor(message, ...params) {
        super(message, ...params);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, IntegrityError);
        }

        this.name = 'IntegrityError';
        this.message = 'Invalid database state: ' + message;
    }
}

/**
 * Returned by the up() method of a migration to indicate that to apply the migration, a declarative diffing should be performed.
 */
export class SchemaSnapshot {
    /**
     * @param {string[]} schema list of SQL create statements
     * @param {import('./migrator.mjs').MakeOptions} actions specifies how to handle renames, destructive changes, etc.
     */
    constructor(schema, actions) {
        this.name = 'SchemaSnapshot'; // we use this property to identify the object type because instanceof breaks with bun build --compile
        this.schema = schema;
        this.actions = actions;
    }
}
