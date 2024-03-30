/**
 * A class to manage migrations for a SQLite database.
 */
export class Migrator {
    /**
     * You'll be prompted via the commandline for how to proceed.
     * @type {Action}
     */
    static PROMPT: Action;
    /**
     * A {@link ManualMigrationRequired} error is thrown.
     * @type {Action}
     */
    static REQUIRE_MANUAL_MIGRATION: Action;
    /**
     * Automatically respond yes to the prompt.
     * @type {Action}
     */
    static PROCEED: Action;
    /**
     * Automatically respond no to the prompt.
     * @type {Action}
     */
    static SKIP: Action;
    /**
     * @param {MigrationOptions} options the options for the migrator {@link MigrationOptions}
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     */
    constructor(options?: MigrationOptions);
    dbPath: any;
    migrationsPath: any;
    tempPath: any;
    schemaPath: any;
    migrationTable: string;
    /**
     * Creates a new migration file that when applied will bring the latest migration file state to that of the current schema.
     * @param {Action} onRename How to handle autodetected column/table renames. Default is `Migrator.PROMPT`
     * @param {Action} onDestructiveChange How to handle irreversible changes like dropping tables/columns. Default is `Migrator.PROMPT`
     * @param {boolean} createIfNoChanges Whether to create a new migration file even if no changes are needed. Default is `false`
     * @throws an appropriate {@link ValidationError} if the options or prompted input is invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     */
    make(onRename?: Action, onDestructiveChange?: Action, createIfNoChanges?: boolean): Promise<void>;
    /**
     * Migrates the database state to the given target. Automatically figures out if the migrations
     * in the migration folder have changed (e.g. changed git branch) and undoes and reapplies migrations as necessary.
     * @param {string} target The migration to set the database state to, e.g., "0001" (a migration id), "zero" (undo all migrations) or "latest" (default).
     * @param {function} log a function to log messages to. Default is `process.stdout.write`
     * @throws an appropriate {@link ValidationError} if the options or target is invalid.
     * @throws an appropriate {@link RolledBackTransaction} if the migrations failed causing the transaction to be rolled back.
     * @throws an appropriate {@link IntegrityError} if the integrity or foreign key checks fail after the migration.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     * @returns {Promise<void>} a promise that resolves when the migrations are complete or rejects if an error occurs
     */
    migrate(target?: string, log?: Function): Promise<void>;
    #private;
}
/**
 * The action to take when dealing with a detected rename or destructive change.
 */
export type Action = ('PROMPT' | 'REQUIRE_MANUAL_MIGRATION' | 'PROCEED' | 'SKIP');
/**
 * An object representing a migration file.
 */
export type MigrationFile = {
    /**
     * The migration id (should be a unique stringified integer with optional leading zeros, e.g., "0001", "0002", etc., and represents the order of the migrations)
     */
    id: string;
    /**
     * The migration name
     */
    name: string;
    /**
     * The hash of the migration content
     */
    content_hash: string;
    /**
     * The path to a file that contains the migration content
     */
    content_path: string;
};
/**
 * The options for the migrator.
 */
export type MigrationOptions = {
    /**
     * Path to the SQLite database file. Default is `path.join(process.cwd(), 'data.db')`
     */
    dbPath?: string;
    /**
     * Path to the migrations folder. Default is `path.join(process.cwd(), 'migrations')`
     */
    migrationsPath?: string;
    /**
     * Name of the table to store migration information in. Default is `migrations`
     */
    migrationTable?: string;
    /**
     * Path to the schema file. Default is `path.join(process.cwd(), 'schema.sql')`
     */
    schemaPath?: string;
};
