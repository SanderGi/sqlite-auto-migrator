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
