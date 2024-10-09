/**
 * Error to be thrown when a manual migration is required.
 */
export class ManualMigrationRequired extends Error {
    constructor(...params: any[]);
}
/**
 * Error to be thrown when the migrator options/input is invalid.
 */
export class ValidationError extends Error {
    constructor(message: any, ...params: any[]);
}
/**
 * Error to be thrown when a transaction is rolled back.
 */
export class RolledBackTransaction extends Error {
    constructor(message: any, ...params: any[]);
}
/**
 * Error to be thrown when the database integrity or foreignkey constraints are violated.
 */
export class IntegrityError extends Error {
    constructor(message: any, ...params: any[]);
}
/**
 * Returned by the up() method of a migration to indicate that to apply the migration, a declarative diffing should be performed.
 */
export class SchemaSnapshot {
    /**
     * @param {string[]} schema list of SQL create statements
     * @param {import('./migrator.mjs').SchemaSnapshot} actions specifies how to handle renames, destructive changes, etc.
     */
    constructor(schema: string[], actions: any);
    name: string;
    schema: string[];
    actions: any;
}
