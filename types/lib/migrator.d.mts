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
     * @param {MigrationOptions} [options={}] the options for the migrator {@link MigrationOptions}
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     */
    constructor(options?: MigrationOptions);
    configPath: any;
    dbPath: any;
    migrationsPath: any;
    tempPath: any;
    schemaPath: any;
    migrationsTable: string;
    createDBIfMissing: boolean;
    onlyTrackAmbiguousState: boolean;
    hideWarnings: boolean;
    /**
     * Creates a new migration file that when applied will bring the latest migration file state to that of the current schema.
     * @param {MakeOptions} [keyargs={}] specifies how to handle renames/destructive changes and more {@link MakeOptions}
     * @param {function} log a function to log messages through. Default is `process.stdout.write`
     * @throws an appropriate {@link ValidationError} if the options or prompted input is invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     * @effects writes a new migration file to the migrations folder if no unexpected/validation errors occur and keyargs.createIfNoChanges is true or there are changes to be made
     */
    make(keyargs?: MakeOptions, log?: Function): Promise<void>;
    /**
     * Migrates the database state to the given target. Automatically figures out if the migrations
     * in the migration folder have changed (e.g. changed git branch) and undoes and reapplies migrations as necessary.
     * @param {string} target the migration to set the database state to, e.g., "0001" (a migration id), "zero" (undo all migrations) or "latest" (default)
     * @param {MigrateUntrackedStateOptions} [diffargs={}] specifies how to handle renames/destructive changes and more if onlyTrackAmbiguousState is true {@link MigrateUntrackedStateOptions}
     * @param {function} log a function to log messages through. Default is `process.stdout.write`
     * @throws an appropriate {@link ValidationError} if the options or target is invalid.
     * @throws an appropriate {@link RolledBackTransaction} if the migrations failed causing the transaction to be rolled back.
     * @throws an appropriate {@link IntegrityError} if the integrity or foreign key checks fail after the migration.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     * @returns {Promise<void>} a promise that resolves when the migrations are complete or rejects if an error occurs
     */
    migrate(target?: string, diffargs?: MigrateUntrackedStateOptions, log?: Function): Promise<void>;
    /**
     * Gets the current migration state of the database.
     * @returns {Promise<Status>} the current migration state of the database as a {@link Status} object
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     */
    status(): Promise<Status>;
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
     * Path to the SQLite database file. Default is `process.env.SAM_DB_PATH` if provided, otherwise `path.join(process.cwd(), 'data.db')`
     */
    dbPath?: string;
    /**
     * Path to the migrations folder. Default is `process.env.SAM_MIGRATION_PATH` if provided, otherwise `path.join(process.cwd(), 'migrations')`
     */
    migrationsPath?: string;
    /**
     * Name of the table to store migration information in. Default is `process.env.SAM_MIGRATIONS_TABLE` if provided, otherwise `migrations`
     */
    migrationsTable?: string;
    /**
     * Path to the schema file. Default is `process.env.SAM_SCHEMA_PATH` if provided, otherwise `path.join(process.cwd(), 'schema.sql')`
     */
    schemaPath?: string;
    /**
     * Whether to create a new database file instead of throwing an error if it is missing. Default is true if `process.env.SAM_CREATE_DB_IF_MISSING === 'true'` and false otherwise
     */
    createDBIfMissing?: boolean;
    /**
     * True if only renames (not creates+deletes) should be tracked in migration files, false otherwise. Default is true if `process.env.SAM_ONLY_TRACK_AMBIGUOUS_STATE === 'true'` and false otherwise
     */
    onlyTrackAmbiguousState?: boolean;
    /**
     * True if warnings should be hidden, false otherwise. Default is true if `process.env.SAM_HIDE_WARNINGS === 'true'` and false otherwise
     */
    hideWarnings?: boolean;
    /**
     * Path to the configuration file. Default is `process.env.SAM_CONFIG_PATH` if provided, otherwise `path.join(process.cwd(), '.samrc')`. The config file is a json file where the object keys are the same as the environment variables minus the SAM_ prefix. The provided keys act as defaults and are overridden by the environment variables if they exist.
     */
    configPath?: string;
};
/**
 * The options for the migrator.make() method.
 */
export type MakeOptions = {
    /**
     * How to handle autodetected column/table renames. Default is `process.env.SAM_ON_RENAME` if provided, otherwise `Migrator.PROMPT`
     */
    onRename?: Action;
    /**
     * How to handle irreversible changes like dropping tables/columns. Default is `process.env.SAM_ON_DESTRUCTIVE_CHANGE` if provided, otherwise `Migrator.PROMPT`
     */
    onDestructiveChange?: Action;
    /**
     * How to handle dropped/changed views. Default is `process.env.SAM_ON_CHANGED_VIEW` if provided, otherwise `Migrator.PROCEED`
     */
    onChangedView?: Action;
    /**
     * How to handle dropped/changed indices. Default is `process.env.SAM_ON_CHANGED_INDEX` if provided, otherwise `Migrator.PROCEED`
     */
    onChangedIndex?: Action;
    /**
     * How to handle dropped/changed triggers. Default is `process.env.SAM_ON_CHANGED_TRIGGER` if provided, otherwise `Migrator.PROCEED`
     */
    onChangedTrigger?: Action;
    /**
     * Whether to create a new migration file even if no changes are needed. Default is true if `process.env.SAM_CREATE_IF_NO_CHANGES === 'true'` and false otherwise
     */
    createIfNoChanges?: boolean;
    /**
     * Whether to create a new migration file if a manual migration is required. Default is true if `process.env.SAM_CREATE_ON_MANUAL_MIGRATION === 'true'` and false otherwise
     */
    createOnManualMigration?: boolean;
};
/**
 * The options for the migrator.migrate() method when onlyTrackAmbiguousState is true.
 */
export type MigrateUntrackedStateOptions = {
    /**
     * How to handle autodetected column/table renames. Default is `Migrator.REQUIRE_MANUAL_MIGRATION`
     */
    onRename?: Action;
    /**
     * How to handle irreversible changes like dropping tables/columns. Default is `Migrator.REQUIRE_MANUAL_MIGRATION`
     */
    onDestructiveChange?: Action;
    /**
     * How to handle dropped/changed views. Default is `Migrator.PROCEED`
     */
    onChangedView?: Action;
    /**
     * How to handle dropped/changed indices. Default is `Migrator.PROCEED`
     */
    onChangedIndex?: Action;
    /**
     * How to handle dropped/changed triggers. Default is `Migrator.PROCEED`
     */
    onChangedTrigger?: Action;
};
/**
 * The migration status of the database.
 */
export type Status = {
    /**
     * The current migration id
     */
    current_id: string;
    /**
     * The current migration name
     */
    current_name: string;
    /**
     * All the pragmas of the database, includes non-persisted pragmas that need to be set on each new connection
     */
    pragmas: any;
    /**
     * The extra migrations that have been applied but are not in the migrations folder
     */
    extra_migrations: Array<{
        id: string;
        name: string;
    }>;
    /**
     * The migrations that are in the migrations folder but have not been applied
     */
    missing_migrations: Array<{
        id: string;
        name: string;
    }>;
    /**
     * True if there are any changes between the schema file and migration files, false otherwise
     */
    has_schema_changes: boolean;
    /**
     * The error that occurred while diffing the schema file and migration files if any
     */
    schema_diff_error?: Error;
    /**
     * True if the database state has been tampered with and no longer matches the applied migrations, false otherwise
     */
    has_tampered_data: boolean;
};
