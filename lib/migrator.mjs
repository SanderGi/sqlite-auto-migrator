import path from 'node:path';
import readline from 'node:readline';

import {
    accessAsync,
    accessSync,
    existsSync,
    statSync,
    readFileAsync,
    rmAsync,
    mkdirAsync,
    writeFileAsync,
    readdirAsync,
    fsConstants,
    statAsync,
    readFileSync,
} from './files.mjs';
import { pathToFileURL } from 'url';

import { colors, symbols } from './colors.mjs';

import {
    ManualMigrationRequired,
    ValidationError,
    RolledBackTransaction,
    IntegrityError,
} from './errors.mjs';
import {
    setDifference,
    objectDifference,
    mapDifference,
    mappedDifference,
    fileHash,
    unquoteSQL,
    getAbsolutePath,
} from './diff.mjs';
import {
    parsePragmas,
    getPragmas,
    getColumnInfo,
    getTables,
    getTableSQL,
    getCreateSQLBody,
    getTriggers,
    getViews,
    getIndices,
    getVirtualTables,
} from './parse.mjs';
import { Database } from './database.mjs';

/**
 * The action to take when dealing with a detected rename or destructive change.
 * @typedef {('PROMPT'|'REQUIRE_MANUAL_MIGRATION'|'PROCEED'|'SKIP')} Action
 */

/**
 * An object representing a migration file.
 * @typedef {Object} MigrationFile
 * @property {string} id The migration id (should be a unique stringified integer with optional leading zeros, e.g., "0001", "0002", etc., and represents the order of the migrations)
 * @property {string} name The migration name
 * @property {string} content_hash The hash of the migration content
 * @property {string} content_path The path to a file that contains the migration content
 */

/**
 * The options for the migrator.
 * @typedef {Object} MigrationOptions
 * @property {string} [dbPath] Path to the SQLite database file. Default is `process.env.SAM_DB_PATH` if provided, otherwise `path.join(process.cwd(), 'data.db')`
 * @property {string} [migrationsPath] Path to the migrations folder. Default is `process.env.SAM_MIGRATION_PATH` if provided, otherwise `path.join(process.cwd(), 'migrations')`
 * @property {string} [migrationsTable] Name of the table to store migration information in. Default is `process.env.SAM_MIGRATIONS_TABLE` if provided, otherwise `migrations`
 * @property {string} [schemaPath] Path to the schema file. Default is `process.env.SAM_SCHEMA_PATH` if provided, otherwise `path.join(process.cwd(), 'schema.sql')`
 * @property {boolean} [createDBIfMissing] Whether to create a new database file instead of throwing an error if it is missing. Default is true if `process.env.SAM_CREATE_DB_IF_MISSING === 'true'` and false otherwise
 * @property {boolean} [onlyTrackAmbiguousState] True if only renames (not creates+deletes) should be tracked in migration files, false otherwise. Default is true if `process.env.SAM_ONLY_TRACK_AMBIGUOUS_STATE === 'true'` and false otherwise
 * @property {boolean} [hideWarnings] True if warnings should be hidden, false otherwise. Default is true if `process.env.SAM_HIDE_WARNINGS === 'true'` and false otherwise
 * @property {boolean} [ignoreNameCase] True if table, column, index, virtual table, trigger, and view names should be case insensitive, false otherwise. Default is true if `process.env.SAM_IGNORE_NAME_CASE === 'true'` and false otherwise
 * @property {string} [configPath] Path to the configuration file. Default is `process.env.SAM_CONFIG_PATH` if provided, otherwise `path.join(process.cwd(), '.samrc')`. The config file is a json file where the object keys are the same as the environment variables minus the SAM_ prefix. The provided keys act as defaults and are overridden by the environment variables if they exist.
 */

/**
 * The options for the migrator.make() method.
 * @typedef {Object} MakeOptions
 * @property {Action} [onRename] How to handle autodetected column/table renames. Default is `process.env.SAM_ON_RENAME` if provided, otherwise `Migrator.PROMPT`
 * @property {Action} [onDestructiveChange] How to handle irreversible changes like dropping tables/columns. Default is `process.env.SAM_ON_DESTRUCTIVE_CHANGE` if provided, otherwise `Migrator.PROMPT`
 * @property {Action} [onChangedView] How to handle dropped/changed views. Default is `process.env.SAM_ON_CHANGED_VIEW` if provided, otherwise `Migrator.PROCEED`
 * @property {Action} [onChangedIndex] How to handle dropped/changed indices. Default is `process.env.SAM_ON_CHANGED_INDEX` if provided, otherwise `Migrator.PROCEED`
 * @property {Action} [onChangedTrigger] How to handle dropped/changed triggers. Default is `process.env.SAM_ON_CHANGED_TRIGGER` if provided, otherwise `Migrator.PROCEED`
 * @property {boolean} [createIfNoChanges] Whether to create a new migration file even if no changes are needed. Default is true if `process.env.SAM_CREATE_IF_NO_CHANGES === 'true'` and false otherwise
 * @property {boolean} [createOnManualMigration] Whether to create a new migration file if a manual migration is required. Default is true if `process.env.SAM_CREATE_ON_MANUAL_MIGRATION === 'true'` and false otherwise
 */

/**
 * The options for the migrator.migrate() method when onlyTrackAmbiguousState is true.
 * @typedef {Object} MigrateUntrackedStateOptions
 * @property {Action} [onRename] How to handle autodetected column/table renames. Default is `Migrator.REQUIRE_MANUAL_MIGRATION`
 * @property {Action} [onDestructiveChange] How to handle irreversible changes like dropping tables/columns. Default is `Migrator.REQUIRE_MANUAL_MIGRATION`
 * @property {Action} [onChangedView] How to handle dropped/changed views. Default is `Migrator.PROCEED`
 * @property {Action} [onChangedIndex] How to handle dropped/changed indices. Default is `Migrator.PROCEED`
 * @property {Action} [onChangedTrigger] How to handle dropped/changed triggers. Default is `Migrator.PROCEED`
 */

/**
 * The migration status of the database.
 * @typedef {Object} Status
 * @property {string} current_id The current migration id
 * @property {string} current_name The current migration name
 * @property {Object} pragmas All the pragmas of the database, includes non-persisted pragmas that need to be set on each new connection
 * @property {Array<{id: string, name: string}>} extra_migrations The extra migrations that have been applied but are not in the migrations folder
 * @property {Array<{id: string, name: string}>} missing_migrations The migrations that are in the migrations folder but have not been applied
 * @property {boolean} has_schema_changes True if there are any changes between the schema file and migration files, false otherwise
 * @property {Error} [schema_diff_error] The error that occurred while diffing the schema file and migration files if any
 * @property {boolean} has_tampered_data True if the database state has been tampered with and no longer matches the applied migrations, false otherwise
 */

/** Compares two {@link MigrationFile} objects by their `id` property in ascending order. */
const ASCENDING_BY_ID = (a, b) => {
    return a.id - b.id;
};

/** Compares two objects for JSON equality. */
const IS_JSON_EQUAL = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Maximum length of auto generated migration filenames */
const MAX_FILE_NAME_LENGTH = 40;

/** Keep track of the migrator instances so warn if multiple share the same migrationPath but different dbPaths */
let migrationPath_to_dbPath = new Map();

/**
 * A class to manage migrations for a SQLite database.
 */
export class Migrator {
    /**
     * You'll be prompted via the commandline for how to proceed.
     * @type {Action}
     */
    static PROMPT = 'PROMPT';
    /**
     * A {@link ManualMigrationRequired} error is thrown.
     * @type {Action}
     */
    static REQUIRE_MANUAL_MIGRATION = 'REQUIRE_MANUAL_MIGRATION';
    /**
     * Automatically respond yes to the prompt.
     * @type {Action}
     */
    static PROCEED = 'PROCEED';
    /**
     * Automatically respond no to the prompt.
     * @type {Action}
     */
    static SKIP = 'SKIP';

    /**
     * @param {MigrationOptions} [options={}] the options for the migrator {@link MigrationOptions}
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     */
    constructor(options = {}) {
        this.configPath =
            getAbsolutePath(options.configPath ?? process.env.SAM_CONFIG_PATH) ??
            path.join(process.cwd(), '.samrc');

        // load config into environment variables for this process (don't persist to the shell)
        if (existsSync(this.configPath)) {
            const config = JSON.parse(readFileSync(this.configPath, 'utf8'));
            for (const [key, value] of Object.entries(config)) {
                const envKey = 'SAM_' + key.toUpperCase();
                if (!process.env[envKey]) {
                    process.env[envKey] = value;
                }
            }
        }

        this.dbPath =
            getAbsolutePath(options.dbPath ?? process.env.SAM_DB_PATH) ??
            path.join(process.cwd(), 'data.db');
        this.migrationsPath =
            getAbsolutePath(options.migrationsPath ?? process.env.SAM_MIGRATIONS_PATH) ??
            path.join(process.cwd(), 'migrations');
        this.tempPath = path.join(this.migrationsPath, '/temp');
        this.schemaPath =
            getAbsolutePath(options.schemaPath ?? process.env.SAM_SCHEMA_PATH) ??
            path.join(process.cwd(), 'schema.sql');
        this.migrationsTable =
            options.migrationsTable ?? process.env.SAM_MIGRATIONS_TABLE ?? 'migrations';
        this.createDBIfMissing =
            options.createDBIfMissing ?? process.env.SAM_CREATE_DB_IF_MISSING === 'true';
        this.onlyTrackAmbiguousState =
            options.onlyTrackAmbiguousState ??
            process.env.SAM_ONLY_TRACK_AMBIGUOUS_STATE === 'true';
        this.ignoreNameCase = options.ignoreNameCase ?? process.env.SAM_IGNORE_NAME_CASE === 'true';
        this.hideWarnings = options.hideWarnings ?? process.env.SAM_HIDE_WARNINGS === 'true';

        if (!this.hideWarnings) {
            const dbPaths = migrationPath_to_dbPath.get(this.migrationsPath) ?? new Set();
            dbPaths.add(this.dbPath);
            migrationPath_to_dbPath.set(this.migrationsPath, dbPaths);
            if (dbPaths.size > 1) {
                console.warn(
                    colors.FgYellow('Warning: ') +
                        `This migrations path '${this.migrationsPath}' is already used with a different database. This may cause unexpected behavior. If this is intented (e.g., you are not tracking ANY migration state, suppress with the 'hideWarnings' option).`,
                );
            }
        }

        this.#validateOptions();
    }

    /**
     * Creates a new migration file that when applied will bring the latest migration file state to that of the current schema.
     * @param {MakeOptions} [keyargs={}] specifies how to handle renames/destructive changes and more {@link MakeOptions}
     * @param {function} log a function to log messages through. Default is `process.stdout.write`
     * @throws an appropriate {@link ValidationError} if the options or prompted input is invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     * @effects writes a new migration file to the migrations folder if no unexpected/validation errors occur and keyargs.createIfNoChanges is true or there are changes to be made
     */
    async make(keyargs = {}, log = s => process.stdout.write(s)) {
        this.#validateOptions();
        const createIfNoChanges =
            keyargs.createIfNoChanges ?? process.env.SAM_CREATE_IF_NO_CHANGES === 'true';
        const createOnManualMigration =
            keyargs.createOnManualMigration ??
            process.env.SAM_CREATE_ON_MANUAL_MIGRATION === 'true';

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const prompt = query => new Promise(resolve => rl.question(query, resolve));

        if (this.onlyTrackAmbiguousState) {
            // when we are not tracking unambiguous state, if there are renames
            // relative to the database state, we need to create a migration file
            // saving the currently untracked schema changes before we can create
            // a file to track the renames
            log(
                colors.FgCyan(
                    'Checking if the schema contains ambiguous state relative to the database...\n',
                ),
            );
            const db = await Database.connect(this.dbPath);
            const copyDB = await Database.connect('');
            const schemaDB = await Database.connect('');
            try {
                const schema = await readFileAsync(this.schemaPath, 'utf8');
                await schemaDB.exec(schema);
                const dbSchema = await this.#copySchema(db, copyDB);
                const diff = await this.#diff(
                    {
                        onRename: keyargs.onRename,
                        onDestructiveChange: Migrator.PROCEED,
                        onChangedIndex: Migrator.PROCEED,
                        onChangedView: Migrator.PROCEED,
                        onChangedTrigger: Migrator.PROCEED,
                    },
                    copyDB,
                    schemaDB,
                    prompt,
                );
                const dbContainsRenames = diff.containsRenames;
                if (dbContainsRenames) {
                    log(colors.FgCyan('Ambiguity found.') + ' Saving current schema.\n');
                    await this.#createMigrationTable(db);
                    await this.#createMigrationDirectory();

                    const migrationFiles = await this.#getMigrationFiles();
                    const appliedMigrations = await this.#getAppliedMigrationFiles(db);
                    this.#removeCommonMigrations(migrationFiles, appliedMigrations);
                    if (migrationFiles.length !== 0 || appliedMigrations.length !== 0) {
                        throw new ValidationError(
                            "Database is not in the 'latest' state, cannot reconcile with onlyTrackAmbiguousState='true'. Please migrate to the latest migration or disable onlyTrackAmbiguousState mode.",
                        );
                    }

                    const { id } = await db.get(
                        `SELECT MAX(id) AS id FROM "${this.migrationsTable}"`,
                    );
                    const nextId = (Number(id ?? -1) + 1).toString().padStart(4, '0');

                    const migration_file = await this.#writeMigrationFile(
                        nextId,
                        'schema_snapshot',
                        await getPragmas(db),
                        [
                            `const schema = ${JSON.stringify(dbSchema)};`,
                            "const SchemaSnapshot = await import('sqlite-auto-migrator').then(m => m.Errors.SchemaSnapshot);",
                            `return new SchemaSnapshot(schema, ${JSON.stringify(keyargs)})`,
                        ],
                        [
                            'throw new Error("Cannot undo schema snapshots created in onlyTrackAmbiguousState mode. Manual migration required.")',
                        ],
                    );
                    await db.run(
                        `INSERT INTO "${this.migrationsTable}" (id, name, content_hash, content) VALUES (?, ?, ?, ?)`,
                        [
                            migration_file.id,
                            migration_file.name,
                            migration_file.content_hash,
                            await readFileAsync(migration_file.content_path, 'utf8'),
                        ],
                    );
                } else {
                    log(
                        colors.FgCyan('No ambiguity.') +
                            ' Proceeding to diff against the existing migration files if any.\n',
                    );
                }
            } catch (e) {
                rl.close();
                throw e;
            } finally {
                db.close();
                copyDB.close();
                schemaDB.close();
                await rmAsync(this.tempPath, { recursive: true, force: true });
            }
        }

        const [oldDB, newDB] = await Promise.all([Database.connect(''), Database.connect('')]);

        try {
            const schema = await readFileAsync(this.schemaPath, 'utf8');
            const migrationFiles = await this.#getMigrationFiles();
            await Promise.all([this.#applyMigrations(oldDB, migrationFiles), newDB.exec(schema)]);
            for (const pragma of parsePragmas(schema)) {
                await Promise.all([oldDB.run(pragma), newDB.run(pragma)]);
            }

            const {
                nameParts,
                pragmas,
                upStatements,
                downStatements,
                manualMigrationReasons,
                containsRenames,
            } = await this.#diff(keyargs, oldDB, newDB, prompt, this.onlyTrackAmbiguousState, log);

            const containsTrackedDifferences = this.onlyTrackAmbiguousState
                ? containsRenames
                : upStatements.length !== 0;
            if (containsTrackedDifferences || createIfNoChanges) {
                if (manualMigrationReasons.length > 0 && !createOnManualMigration) {
                    log(
                        colors.FgRed('Manual migration required.') +
                            ' No migration file created.\n',
                    );
                } else {
                    log(colors.FgCyan('Creating migration file...'));
                    const nextId = Number(migrationFiles.length).toString().padStart(4, '0');
                    await this.#writeMigrationFile(
                        nextId,
                        nameParts.join('__').substring(0, MAX_FILE_NAME_LENGTH) ||
                            'not_implemented',
                        pragmas,
                        upStatements,
                        downStatements,
                    );
                    log(colors.FgGreen(' Migration file created!\n'));
                }
            } else {
                log(colors.FgCyan('No changes detected.') + ' No migration file created.\n');
            }

            if (manualMigrationReasons.length > 0) {
                throw new ManualMigrationRequired(
                    manualMigrationReasons.map(s => '\n  ' + symbols.bullet + ' ' + s).join(''),
                    {
                        cause: manualMigrationReasons,
                    },
                );
            }
        } finally {
            rl.close();
            await oldDB.close();
            await newDB.close();
        }
    }

    /**
     * Diffs the migration files against the schema.
     * @private
     * @param {MakeOptions} [keyargs={}] specifies how to handle renames/destructive changes and more.
     * @param {Database} oldDB the old database state to diff against (this should be an empty database that will be modified)
     * @param {Database} newDB the new database state to diff against (this should be an empty database that will be modified)
     * @param {(s: string) => Promise<string>} prompt a function to prompt the user for input
     * @param {boolean} [onlyAmbiguousChanges=false] true if only renames (not creates+deletes) should be handled, false otherwise
     * @param {function} log a function to log messages through. Default is `() => {}`
     * @returns {Promise<{nameParts: string[], pragmas: Object, upStatements: string[], downStatements: string[], manualMigrationReasons: string[], containsRenames: boolean}>} the diff results
     * @throws an appropriate {@link ValidationError} if the prompted input is invalid.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g. a SQLError.
     */
    async #diff(keyargs = {}, oldDB, newDB, prompt, onlyAmbiguousChanges = false, log = () => {}) {
        const onRename = keyargs.onRename ?? process.env.SAM_ON_RENAME ?? Migrator.PROMPT;
        const onDestructiveChange =
            keyargs.onDestructiveChange ?? process.env.SAM_ON_DESTRUCTIVE_CHANGE ?? Migrator.PROMPT;
        const onChangedIndex =
            keyargs.onChangedIndex ?? process.env.SAM_ON_CHANGED_INDEX ?? Migrator.PROCEED;
        const onChangedView =
            keyargs.onChangedView ?? process.env.SAM_ON_CHANGED_VIEW ?? Migrator.PROCEED;
        const onChangedTrigger =
            keyargs.onChangedTrigger ?? process.env.SAM_ON_CHANGED_TRIGGER ?? Migrator.PROCEED;

        log(colors.FgCyan('Diffing schema:\n'));
        const manualMigrationReasons = []; // if we detect a rename/destructive change that we can't handle automatically, we'll append the reason(s) here
        const upStatements = [];
        const reversedDownStatements = [];

        log(`  ${symbols.bullet} Capturing pragmas...`);
        const pragmas = onlyAmbiguousChanges ? {} : await getPragmas(newDB);
        log(colors.FgGreen(' ' + symbols.success + '\n'));

        await oldDB.run('PRAGMA foreign_keys = 0'); // we don't want to enforce foreign keys while operating on the schema
        await newDB.run('PRAGMA foreign_keys = 0');
        await oldDB.run('PRAGMA writable_schema = 1'); // we need to be able to modify the schema
        await newDB.run('PRAGMA writable_schema = 1');

        // must run before tables to remove shadow tables
        log(`  ${symbols.bullet} Diffing virtual tables...`);
        const virtualDownStatements = [];
        const { addedVirtualTables, removedVirtualTables } = await this.#makeVirtualTables(
            oldDB,
            newDB,
            onDestructiveChange,
            upStatements,
            virtualDownStatements,
            manualMigrationReasons,
            prompt,
        );
        if (onlyAmbiguousChanges) {
            addedVirtualTables.clear();
            removedVirtualTables.clear();
            upStatements.length = 0;
        } else {
            reversedDownStatements.push(...virtualDownStatements.reverse());
        }
        log(colors.FgGreen(' ' + symbols.success + '\n'));

        // has the sideeffect of dropping/renaming certain views, triggers, and indices
        log(`  ${symbols.bullet} Diffing tables...`);
        const tableDownStatements = [];
        const {
            addedTableNames,
            removedTableNames,
            modifiedTableNames,
            renamedTableNames,
            containsRenamedColumns,
        } = await this.#makeTables(
            oldDB,
            newDB,
            upStatements,
            tableDownStatements,
            manualMigrationReasons,
            onRename,
            onDestructiveChange,
            prompt,
            onlyAmbiguousChanges,
        );
        reversedDownStatements.push(...tableDownStatements.reverse());
        log(' ' + colors.FgGreen(symbols.success + '\n'));

        // indices, triggers, and views must be diffed after tables since they depend on them
        log(`  ${symbols.bullet} Diffing views...`);
        const unalterableDownStatements = [];
        const [oldViews, newViews] = await Promise.all([
            getViews(oldDB, this.ignoreNameCase),
            getViews(newDB, this.ignoreNameCase),
        ]);
        const { added: addedViews, removed: removedViews } = await this.#makeUnalterable(
            'views',
            'DROP VIEW',
            oldViews,
            newViews,
            onChangedView,
            onlyAmbiguousChanges ? [] : upStatements,
            unalterableDownStatements,
            manualMigrationReasons,
            prompt,
        );
        log(' ' + colors.FgGreen(symbols.success + '\n'));
        log(`  ${symbols.bullet} Diffing triggers...`);
        const [oldTriggers, newTriggers] = await Promise.all([
            getTriggers(oldDB, this.ignoreNameCase),
            getTriggers(newDB, this.ignoreNameCase),
        ]);
        const { added: addedTriggers, removed: removedTriggers } = await this.#makeUnalterable(
            'triggers',
            'DROP TRIGGER',
            oldTriggers,
            newTriggers,
            onChangedTrigger,
            onlyAmbiguousChanges ? [] : upStatements,
            unalterableDownStatements,
            manualMigrationReasons,
            prompt,
        );
        log(' ' + colors.FgGreen(symbols.success + '\n'));
        log(`  ${symbols.bullet} Diffing indices...`);
        const [oldIndices, newIndices] = await Promise.all([
            getIndices(oldDB, this.ignoreNameCase),
            getIndices(newDB, this.ignoreNameCase),
        ]);
        const { added: addedIndices, removed: removedIndices } = await this.#makeUnalterable(
            'views',
            'DROP INDEX',
            oldIndices,
            newIndices,
            onChangedIndex,
            onlyAmbiguousChanges ? [] : upStatements,
            unalterableDownStatements,
            manualMigrationReasons,
            prompt,
        );
        log(' ' + colors.FgGreen(symbols.success + '\n'));
        if (onlyAmbiguousChanges) {
            addedViews.clear();
            removedViews.clear();
            addedTriggers.clear();
            removedTriggers.clear();
            addedIndices.clear();
            removedIndices.clear();
        } else {
            reversedDownStatements.push(...unalterableDownStatements.reverse());
        }

        const nameParts = this.#getNameSegments(
            addedTableNames,
            removedTableNames,
            modifiedTableNames,
            renamedTableNames,
            addedVirtualTables,
            removedVirtualTables,
            addedViews,
            removedViews,
            addedTriggers,
            removedTriggers,
            addedIndices,
            removedIndices,
        );

        return {
            nameParts, // an array containing a short description of each change, empty if no changes are needed
            pragmas, // all the pragmas of the final database
            upStatements, // the statements to apply the changes
            downStatements: reversedDownStatements.reverse(), // the statements to undo the changes
            manualMigrationReasons, // the reasons why a manual migration is required, empty if no manual migration is required
            containsRenames: renamedTableNames.size > 0 || containsRenamedColumns, // true if a table or column has been renamed
        };
    }

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
    async migrate(target = 'latest', diffargs = {}, log = s => process.stdout.write(s)) {
        this.#validateOptions();

        const db = await Database.connect(this.dbPath);
        try {
            const migrationFiles = await this.#getMigrationFiles();
            const appliedMigrations = await this.#getAppliedMigrationFiles(db);

            const applyUntracked = target === 'latest' && this.onlyTrackAmbiguousState;
            if (target === 'latest') {
                target =
                    migrationFiles.length > 0
                        ? migrationFiles[migrationFiles.length - 1].id
                        : 'zero';
            }

            if (target === 'zero') {
                migrationFiles.splice(0);
            } else {
                const ix = migrationFiles.findIndex(m => m.id === target);
                if (ix === -1) {
                    throw new ValidationError(`Migration not found: ${target}`);
                }
                migrationFiles.splice(ix + 1);
            }

            // leave only the migrations that need to be undone in appliedMigrations and the ones that need to be applied in migrationFiles
            this.#removeCommonMigrations(migrationFiles, appliedMigrations);
            appliedMigrations.reverse();

            if (migrationFiles.length === 0 && appliedMigrations.length === 0 && !applyUntracked) {
                log(
                    colors.FgCyan('No migrations to apply.') +
                        ` Database state already matches the migrations up to and including ${target}. Run 'make' to create a new migration.\n`,
                );
                return;
            }

            let pragmas = {};
            try {
                await db.run('BEGIN TRANSACTION');

                if (appliedMigrations.length !== 0 || migrationFiles.length !== 0) {
                    await this.#createMigrationTable(db);
                }

                if (appliedMigrations.length !== 0) {
                    log(colors.FgCyan('Undoing migrations:\n'));

                    pragmas = await this.#undoMigrations(db, appliedMigrations, log);

                    await db.run(
                        `DELETE FROM "${this.migrationsTable}" WHERE id IN (${appliedMigrations
                            .map(m => `'${m.id}'`)
                            .join(',')})`,
                    );
                }

                if (migrationFiles.length !== 0) {
                    log(colors.FgCyan('Applying migrations:\n'));

                    pragmas = await this.#applyMigrations(db, migrationFiles, log);

                    const stmt = await db.prepare(
                        `INSERT INTO "${this.migrationsTable}" (id, name, content_hash, content) VALUES (?, ?, ?, ?)`,
                    );
                    for (const migration of migrationFiles) {
                        const content = await readFileAsync(migration.content_path, 'utf8');
                        await stmt.run(
                            migration.id,
                            migration.name,
                            migration.content_hash,
                            content,
                        );
                    }
                    await stmt.finalize();
                }

                if (applyUntracked) {
                    // there might be untracked changes to the schema to apply
                    const [schemaDB, actualDB] = await Promise.all([
                        Database.connect(''),
                        Database.connect(''),
                    ]);
                    let diff;
                    try {
                        const schema = await readFileAsync(this.schemaPath, 'utf8');
                        await schemaDB.exec(schema);
                        await this.#copySchema(db, actualDB);

                        diff = await this.#diff(
                            {
                                onRename: diffargs.onRename ?? Migrator.REQUIRE_MANUAL_MIGRATION,
                                onDestructiveChange:
                                    diffargs.onDestructiveChange ??
                                    Migrator.REQUIRE_MANUAL_MIGRATION,
                                onChangedIndex: diffargs.onChangedIndex ?? Migrator.PROCEED,
                                onChangedView: diffargs.onChangedView ?? Migrator.PROCEED,
                                onChangedTrigger: diffargs.onChangedTrigger ?? Migrator.PROCEED,
                            },
                            actualDB,
                            schemaDB,
                            () => Promise.resolve('m'),
                        );
                    } finally {
                        await Promise.all([schemaDB.close(), actualDB.close()]);
                    }

                    if (diff.manualMigrationReasons.length > 0) {
                        throw new ManualMigrationRequired(
                            diff.manualMigrationReasons
                                .map(s => '\n  ' + symbols.bullet + ' ' + s)
                                .join(''),
                            {
                                cause: diff.manualMigrationReasons,
                            },
                        );
                    }
                    pragmas = diff.pragmas;
                    if (diff.upStatements.length > 0) {
                        log(colors.FgCyan('Applying untracked schema changes to the database:\n'));
                        const AsyncFunction = async function () {}.constructor;
                        for (const js of diff.upStatements) {
                            await AsyncFunction('db', js)(db);
                        }
                        for (const namedChange of diff.nameParts) {
                            log(
                                `  ${symbols.bullet} ${namedChange} ${colors.FgGreen(
                                    symbols.success,
                                )}\n`,
                            );
                        }
                    } else if (migrationFiles.length === 0 && appliedMigrations.length === 0) {
                        log(
                            colors.FgCyan('No migrations to apply.') +
                                ' Database state already matches the schema.\n',
                        );
                        await db.run('ROLLBACK TRANSACTION');
                        return;
                    }
                }

                await db.run('COMMIT TRANSACTION');
            } catch (err) {
                log(colors.FgRed('Error occured.') + ' Rolling back transaction...\n');
                await db.run('ROLLBACK TRANSACTION');
                throw new RolledBackTransaction('Database state has not been migrated.', {
                    cause: err,
                });
            }

            await this.#applyPragmas(db, pragmas, log);

            await this.#verifyIntegrityAndForeignKeys(db, log);

            const message = applyUntracked
                ? '  Database state now matches the schema.\n'
                : `  Database state now matches the migrations up to and including ${target}.\n`;
            log(colors.FgCyan('Migrations complete!\n') + message);
            // TODO: show warning if the schema file has changed since the last make()
        } finally {
            await db.run('VACUUM');
            await db.close();
            await rmAsync(this.tempPath, { recursive: true, force: true });
        }
    }

    /**
     * Gets the current migration state of the database.
     * @returns {Promise<Status>} the current migration state of the database as a {@link Status} object
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     */
    async status() {
        this.#validateOptions();

        /** @type {Status} */
        const status = {
            current_id: '',
            current_name: '',
            pragmas: {},
            extra_migrations: [],
            missing_migrations: [],
            has_schema_changes: false,
            has_tampered_data: false,
        };

        const db = await Database.connect(this.dbPath);
        const [oldDB, newDB] = await Promise.all([Database.connect(''), Database.connect('')]);
        try {
            const schema = await readFileAsync(this.schemaPath, 'utf8');
            const migrationFiles = await this.#getMigrationFiles();
            const appliedMigrations = await this.#getAppliedMigrationFiles(db);

            // identify the pragmas and the current migration state
            if (appliedMigrations.length !== 0) {
                const latest = appliedMigrations[appliedMigrations.length - 1];
                status.current_id = latest.id;
                status.current_name = latest.name;
                const { PRAGMAS } = await import(pathToFileURL(latest.content_path));
                status.pragmas = PRAGMAS;
            } else {
                status.current_id = 'zero';
                status.current_name = 'no migrations applied';
            }

            // determine if there are changes between the schema file and the migration files
            try {
                await Promise.all([
                    this.#applyMigrations(oldDB, migrationFiles),
                    newDB.exec(schema),
                ]);
                for (const pragma of parsePragmas(schema)) {
                    await Promise.all([oldDB.run(pragma), newDB.run(pragma)]);
                }

                const { upStatements } = await this.#diff(
                    {
                        onRename: Migrator.PROCEED,
                        onDestructiveChange: Migrator.PROCEED,
                        onChangedIndex: Migrator.PROCEED,
                        onChangedView: Migrator.PROCEED,
                        onChangedTrigger: Migrator.PROCEED,
                    },
                    oldDB,
                    newDB,
                    () => Promise.resolve('y'),
                );
                status.has_schema_changes = upStatements.length > 0;
            } catch (err) {
                status.schema_diff_error = err;
            }

            // determine if the database state has been tampered with and no longer matches the applied migrations
            const [appliedDB, actualDB] = await Promise.all([
                Database.connect(''),
                Database.connect(''),
            ]);
            try {
                await this.#applyMigrations(appliedDB, appliedMigrations);
                await this.#copySchema(db, actualDB);

                const { upStatements } = await this.#diff(
                    {
                        onRename: Migrator.PROCEED,
                        onDestructiveChange: Migrator.PROCEED,
                        onChangedIndex: Migrator.PROCEED,
                        onChangedView: Migrator.PROCEED,
                        onChangedTrigger: Migrator.PROCEED,
                    },
                    appliedDB,
                    actualDB,
                    () => Promise.resolve('y'),
                );
                status.has_tampered_data = upStatements.length > 0;
            } catch (err) {
                status.has_tampered_data = true;
            } finally {
                await Promise.all([appliedDB.close(), actualDB.close()]);
            }

            // identify the applied migrations that have been removed from the migration folder and the unapplied migrations that have been add to the migration folder
            this.#removeCommonMigrations(migrationFiles, appliedMigrations);
            status.extra_migrations = appliedMigrations;
            status.missing_migrations = migrationFiles;
        } finally {
            await Promise.all([db.close(), oldDB.close(), newDB.close()]);
            await rmAsync(this.tempPath, { recursive: true, force: true });
        }

        return status;
    }

    /**
     * Applies the schema of the source database to the target database.
     * @param {Database} srcDB the source database
     * @param {Database} targetDB the target database (should be empty)
     * @effects applies the schema of srcDB to targetdb
     */
    async #copySchema(srcDB, targetDB) {
        const sqlLines = [];

        // to make targetdb match the schema of srcDB, we must first take care of virtual tables since they introduce shadow tables
        const virtualTables = await getVirtualTables(srcDB, this.ignoreNameCase);
        for (const [_, sql] of virtualTables.entries()) {
            sqlLines.push(sql);
            await targetDB.run(sql);
        }
        const tablenames = await getTables(targetDB, this.ignoreNameCase);
        for await (const { name, sql } of srcDB.each(
            'SELECT name, sql FROM sqlite_master ORDER BY rowid',
        )) {
            if (
                sql &&
                name !== this.migrationsTable &&
                !name.startsWith('sqlite_') &&
                !tablenames.has(name)
            ) {
                sqlLines.push(sql);
                await targetDB.run(sql);
            }
        }

        return sqlLines;
    }

    /**
     * Removes the migration files that are in the migrations folder and have been applied.
     * @private
     * @param {MigrationFile[]} migrationFiles the migration files in the migration folder
     * @param {MigrationFile[]} appliedMigrations the migration files that have been applied
     * @effects removes the migration files that have been applied from the two arrays
     */
    #removeCommonMigrations(migrationFiles, appliedMigrations) {
        while (migrationFiles.length > 0 && appliedMigrations.length > 0) {
            const nextMigration = migrationFiles.shift();
            const appliedMigration = appliedMigrations.shift();
            if (nextMigration.content_hash !== appliedMigration.content_hash) {
                migrationFiles.unshift(nextMigration);
                appliedMigrations.unshift(appliedMigration);
                break;
            }
        }
    }

    /**
     * For each (oldname, newname) pair in renames, prompts the user for an action to take until a valid non-Migrator.PROMPT action is given. Updates addedNames, removedNames, and renames accordingly.
     * @param {Set<string>} addedNames the set of added names (newname will be removed if the rename is accepted)
     * @param {Set<string>} removedNames the set of removed names (oldname will be removed if the rename is accepted)
     * @param {Map<string, string>} renames the map of old names to new names (oldname will be removed if the rename is declined)
     * @param {Action} action the default action to take
     * @param {(s: string) => Promise<string>} prompt a function to prompt the user for input
     * @param {Array<string>} manualMigrationReasons an array to append manual migration reasons to
     * @param {string} unit the unit being renamed (e.g., 'table', 'column of table')
     */
    async #resolveRenames(
        addedNames,
        removedNames,
        renames,
        action,
        prompt,
        manualMigrationReasons,
        unit = 'table',
    ) {
        for (const [oldname, newname] of renames) {
            const capitalizedUnit = unit.charAt(0).toUpperCase() + unit.slice(1);
            action = await this.#promptForAction(
                prompt,
                action,
                `${capitalizedUnit} "${oldname}" seems to have been renamed to "${newname}". Type "y" to rename, "n" to remove and add a new ${unit} instead, or "m" to require manual migration: `,
            );
            if (action === Migrator.PROCEED) {
                addedNames.delete(newname);
                removedNames.delete(oldname);
            } else if (action === Migrator.REQUIRE_MANUAL_MIGRATION) {
                manualMigrationReasons.push(
                    `${capitalizedUnit} "${oldname}" was renamed to "${newname}"`,
                );
                addedNames.delete(newname);
                removedNames.delete(oldname);
            } else if (action === Migrator.SKIP) {
                renames.delete(oldname);
            } else {
                throw new ValidationError(`Invalid action: ${action}`);
            }
        }
    }

    /**
     * Prompts the user for an action to take until a valid non-Migrator.PROMPT action is given.
     * @private
     * @param {(s: string) => Promise<string>} prompt a function to prompt the user for input
     * @param {Action} action the default action to take
     * @param {string} message the message to display to the user
     * @returns {Promise<Action>} the action to take
     */
    async #promptForAction(
        prompt,
        action = Migrator.PROMPT,
        message = 'Type "y" to proceed, "n" to skip, or "m" to require manual migration:',
    ) {
        while (action === Migrator.PROMPT) {
            const answer = await prompt(message);
            if (answer.toLowerCase() === 'y') {
                action = Migrator.PROCEED;
            } else if (answer.toLowerCase() === 'n') {
                action = Migrator.SKIP;
            } else if (answer.toLowerCase() === 'm') {
                action = Migrator.REQUIRE_MANUAL_MIGRATION;
            }
        }
        return action;
    }

    /**
     * Gets the current migration state of the database.
     * @param {Database} db the database connection to fetch the applied migrations from
     * @private
     * @returns {Promise<MigrationFile[]>} the list of currently applied migrations sorted by id in ascending order
     * @effects creates the migration table and temp folder if they don't exist
     */
    async #getAppliedMigrationFiles(db) {
        // if the migration table does not exist, there are no migrations
        const tableExists = await db.get(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [this.migrationsTable],
        );
        if (!tableExists) {
            return [];
        }

        await mkdirAsync(this.tempPath).catch(e => {
            if (e.code !== 'EEXIST') throw e;
        });
        const migrations = [];
        for await (const row of db.each(
            `SELECT id, name, content_hash, content FROM "${this.migrationsTable}"`,
        )) {
            const content_path = path.join(this.tempPath, `${row.id}_${row.name}.mjs`);
            await writeFileAsync(content_path, row.content);
            migrations.push({
                id: row.id,
                name: row.name,
                content_hash: row.content_hash,
                content_path: content_path,
            });
        }
        return migrations.sort(ASCENDING_BY_ID);
    }

    /**
     * Gets the migration files from the migrations folder.
     * @private
     * @returns {Promise<MigrationFile[]>} the list of migration files sorted by id in ascending order
     */
    async #getMigrationFiles() {
        // if the migration folder does not exist, there are no migrations
        try {
            await accessAsync(this.migrationsPath);
        } catch {
            return [];
        }

        const filenames = await readdirAsync(this.migrationsPath);
        const migrationFilenames = filenames.filter(
            filename => filename.endsWith('.mjs') && filename.includes('_'),
        );
        const migrationFiles = await Promise.all(
            migrationFilenames.map(async filename => {
                const filepath = path.join(this.migrationsPath, filename);
                return {
                    id: filename.split('_')[0],
                    name: filename.split('_').slice(1).join('_').replace('.mjs', ''),
                    content_hash: await fileHash(filepath),
                    content_path: filepath,
                };
            }),
        );
        return migrationFiles.sort(ASCENDING_BY_ID);
    }

    /**
     * Creates the migration directory if it does not exist and ensures it is readable and writable.
     * @private
     */
    async #createMigrationDirectory() {
        await mkdirAsync(this.migrationsPath).catch(e => {
            if (e.code !== 'EEXIST') throw e;
        });
        // ensure it is readable and writable
        await accessAsync(this.migrationsPath, fsConstants.R_OK | fsConstants.W_OK);
    }

    /**
     * Creates the migration table if it does not exist.
     * @param {Database} db the database connection to create the migration table in
     * @private
     */
    async #createMigrationTable(db) {
        await db.run(
            `CREATE TABLE IF NOT EXISTS "${this.migrationsTable}" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
                content_hash TEXT NOT NULL,
                content TEXT NOT NULL
            )`,
        );
    }

    /**
     * Apply the migrations to the given database.
     * @private
     * @param {Database} db the database connection to run the migrations on
     * @param {MigrationFile[]} migrationFiles the migration files to run
     * @param {function} log a function to log messages to
     * @effects defers foreign key checks
     * @throws an appropriate {@link Error} if an error occurs while applying the migrations
     * @returns {Promise<Object>} a promise that resolves with the pragmas of the final database state
     */
    async #applyMigrations(db, migrationFiles, log = () => {}) {
        await db.run('PRAGMA defer_foreign_keys = TRUE'); // disable foreign key checks while migrating; automatically re-enabled at the end of the transaction

        let pragmas = {};
        for (const migration of migrationFiles) {
            log(`  ${symbols.bullet} Applying ${migration.id}_${migration.name}...`);
            try {
                const lastModified = (await statAsync(migration.content_path)).mtimeMs; // es6 does not allow uncaching imports, so reimport the module everytime it changes
                const { up, PRAGMAS } = await import(
                    pathToFileURL(migration.content_path) + '?t=' + lastModified
                );
                pragmas = PRAGMAS;
                const snapshot = await up(db);
                if (snapshot && snapshot.name === 'SchemaSnapshot') {
                    const [schemaDB, actualDB] = await Promise.all([
                        Database.connect(''),
                        Database.connect(''),
                    ]);
                    let diff;
                    try {
                        for (const sql of snapshot.schema) {
                            await schemaDB.run(sql);
                        }
                        await this.#copySchema(db, actualDB);

                        diff = await this.#diff(
                            {
                                onRename: snapshot.actions.onRename,
                                onDestructiveChange: snapshot.actions.onDestructiveChange,
                                onChangedIndex: snapshot.actions.onChangedIndex,
                                onChangedView: snapshot.actions.onChangedView,
                                onChangedTrigger: snapshot.actions.onChangedTrigger,
                            },
                            actualDB,
                            schemaDB,
                            () => Promise.resolve('m'),
                        );
                    } finally {
                        await Promise.all([schemaDB.close(), actualDB.close()]);
                    }
                    const AsyncFunction = async function () {}.constructor;
                    for (const js of diff.upStatements) {
                        await AsyncFunction('db', js)(db);
                    }
                }
            } catch (err) {
                log(` ${symbols.error}\n`);
                throw err;
            }
            log(` ${symbols.success}\n`);
        }

        return pragmas;
    }

    /**
     * Undo the migrations on the given database.
     * @private
     * @param {Database} db the database connection to undo the migrations on
     * @param {MigrationFile[]} migrationFiles the migration files to undo
     * @param {function} log a function to log messages to
     * @effects defers foreign key checks
     * @throws an appropriate {@link Error} if an error occurs while undoing the migrations
     * @returns {Promise<Object>} a promise that resolves with the pragmas of the final database state
     */
    async #undoMigrations(db, migrationFiles, log = () => {}) {
        await db.run('PRAGMA defer_foreign_keys = TRUE'); // disable foreign key checks while migrating; automatically re-enabled at the end of the transaction

        let pragmas = {};
        for (const migration of migrationFiles) {
            log(`  ${symbols.bullet} Undoing ${migration.id}_${migration.name}...`);
            try {
                const lastModified = (await statAsync(migration.content_path)).mtimeMs; // es6 does not allow uncaching imports, so reimport the module everytime it changes
                const { down, PRAGMAS } = await import(
                    pathToFileURL(migration.content_path) + '?t=' + lastModified
                );
                pragmas = PRAGMAS;
                await down(db);
            } catch (err) {
                log(` ${symbols.error}\n`);
                throw err;
            }
            log(` ${symbols.success}\n`);
        }

        return pragmas;
    }

    /**
     * Apply the pragmas to the given database. Must not be run in a transaction.
     * @private
     * @param {Database} db the database connection to run the pragmas on
     * @param {Object} pragmas the pragmas to apply
     * @param {function} log a function to log messages to
     * @throws an appropriate {@link Error} if an error occurs while applying the pragmas
     */
    async #applyPragmas(db, pragmas, log = () => {}) {
        const pragmasToSet = objectDifference(pragmas, await getPragmas(db));
        if (Object.keys(pragmasToSet).length === 0) {
            return;
        }
        log(colors.FgCyan('Setting pragmas:\n'));
        for (const [pragma, value] of Object.entries(pragmasToSet)) {
            if (['file'].includes(pragma)) continue;
            log(`  ${symbols.bullet} Setting PRAGMA ${pragma} = ${JSON.stringify(value)}...`);
            try {
                await db.run(`PRAGMA ${pragma} = ${JSON.stringify(value)}`);
            } catch (err) {
                log(` ${symbols.error}\n`);
                throw err;
            }
            const otherDB = await Database.connect(this.dbPath);
            try {
                const res = await otherDB.get(`PRAGMA ${pragma}`);
                if (res && res[pragma] === value) log(` ${symbols.success}\n`);
                else log(` ${symbols.warning} (not persistent)\n`);
            } catch (err) {
                log(` ${symbols.error}\n`);
                throw err;
            } finally {
                await otherDB.close();
            }
        }
    }

    async #writeMigrationFile(id, name, pragmas, upStatements, downStatements) {
        await this.#createMigrationDirectory();

        if (upStatements.length === 0) {
            const errorStatement = `throw new Error('Migration ${id} is not yet implemented');`;
            upStatements.push(errorStatement);
            downStatements.push(errorStatement);
        }

        const filepath = path.join(this.migrationsPath, `${id}_${name}.mjs`);
        const content = `
// Automatically created by 'sqlite auto migrator (SAM)' on ${new Date().toISOString()}

import { Database } from 'sqlite-auto-migrator';

// Pragmas can't be changed in transactions, so they are tracked separately.
// Note that most pragmas are not persisted in the database file and will have to be set on each new connection.
export const PRAGMAS = ${JSON.stringify(pragmas)};

/**
 * Runs the necessary SQL commands to migrate the database up to this version from the previous version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function up(db) {
${upStatements.map(s => '    ' + s.trim() + ';').join('\n')}
}

/**
 * Runs the necessary SQL commands to migrate the database down to the previous version from this version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function down(db) {
${downStatements.map(s => '    ' + s.trim() + ';').join('\n')}
}
        `.trim();
        await writeFileAsync(filepath, content);

        /** @type {MigrationFile} */
        const migration_file = {
            id,
            name,
            content_hash: await fileHash(filepath),
            content_path: filepath,
        };
        return migration_file;
    }

    /**
     * Takes the migration changes and comes up with a name for the migration file.
     * @private
     * @returns {string[]} the migration name segments to be joined together
     */
    #getNameSegments(
        addedTableNames,
        removedTableNames,
        modifiedTableNames,
        renamedTableNames,
        addedVirtualTables,
        removedVirtualTables,
        addedViews,
        removedViews,
        addedTriggers,
        removedTriggers,
        addedIndices,
        removedIndices,
    ) {
        const name = [];
        if (addedTableNames.size > 0) {
            name.push(`create_${[...addedTableNames].join('_')}`);
        }
        if (removedTableNames.size > 0) {
            name.push(`remove_${[...removedTableNames].join('_')}`);
        }
        if (modifiedTableNames.size > 0) {
            name.push(`modify_${[...modifiedTableNames].join('_')}`);
        }
        if (renamedTableNames.size > 0) {
            name.push(
                `rename_${[...renamedTableNames.entries()]
                    .map(([old, added]) => `${old}-${added}`)
                    .join('_')}`,
            );
        }
        if (addedVirtualTables.size > 0) {
            name.push(`create-virtual_${[...addedVirtualTables].join('_')}`);
        }
        if (removedVirtualTables.size > 0) {
            name.push(`remove-virtual_${[...removedVirtualTables].join('_')}`);
        }
        if (addedViews.size > 0) {
            name.push(`create-view_${[...addedViews].join('_')}`);
        }
        if (removedViews.size > 0) {
            name.push(`remove-view_${[...removedViews].join('_')}`);
        }
        if (addedTriggers.size > 0) {
            name.push(`create-trigger_${[...addedTriggers].join('_')}`);
        }
        if (removedTriggers.size > 0) {
            name.push(`remove-trigger_${[...removedTriggers].join('_')}`);
        }
        if (addedIndices.size > 0) {
            name.push(`create-index_${[...addedIndices].join('_')}`);
        }
        if (removedIndices.size > 0) {
            name.push(`remove-index_${[...removedIndices].join('_')}`);
        }
        return name;
    }

    /**
     * Verifies the integrity and foreign keys of the database.
     * @private
     * @param {Database} db the database connection to run the checks on
     * @param {function} log a function to log messages to
     * @throws a {@link IntegrityError} if the integrity or foreign key checks fail
     * @returns {Promise<void>} a promise that resolves when the checks are complete or rejects if an error occurs
     */
    async #verifyIntegrityAndForeignKeys(db, log = () => {}) {
        log(colors.FgCyan('Running integrity and foreignkey checks:\n'));
        const violations = await db.all('PRAGMA integrity_check');
        if (violations.length > 0 && violations[0].integrity_check !== 'ok') {
            log(colors.FgRed('Integrity check failed:') + '\n');
            for (const violation of violations) {
                log(`  ${symbols.bullet} ${violation.integrity_check}\n`);
            }
            throw new IntegrityError('Integrity check failed: ' + violations);
        }
        log(`  ${symbols.bullet} Integrity check passed ${symbols.success}\n`);
        const foreignKeyCheck = await db.all('PRAGMA foreign_key_check');
        if (foreignKeyCheck.length > 0) {
            log(colors.FgRed('Foreign key check failed:') + '\n');
            for (const violation of foreignKeyCheck) {
                log(
                    `  ${symbols.bullet} ${Object.entries(violation)
                        .map(([type, val]) => `${type}: ${val}`)
                        .join('; ')}\n`,
                );
            }
            throw new IntegrityError('Foreign key check failed: ' + foreignKeyCheck);
        }
        log(`  ${symbols.bullet} Foreign key check passed ${symbols.success}\n`);
    }

    /**
     * Ensures the database path, migrations path, temp path, and schema path are valid and accessible.
     * @private
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @effects creates the migrations folder if it doesn't exist
     */
    #validateOptions() {
        if (this.dbPath === '') {
            throw new ValidationError(
                'Database path is empty. Anonymous disk databases are not supported.',
            );
        }
        if (this.dbPath === ':memory:') {
            throw new ValidationError(
                'Database path is ":memory:". In-memory databases are not supported.',
            );
        }
        if (!this.createDBIfMissing) {
            if (!existsSync(this.dbPath)) {
                throw new ValidationError(`Database file not found: ${this.dbPath}`);
            } else {
                if (!statSync(this.dbPath).isFile()) {
                    throw new ValidationError(`Database path is not a file: ${this.dbPath}`);
                }
                try {
                    accessSync(this.dbPath, fsConstants.R_OK | fsConstants.W_OK);
                } catch (err) {
                    throw new ValidationError(
                        `Database file is not readable/writable: ${this.dbPath}`,
                        { cause: err },
                    );
                }
            }
        }
        if (!existsSync(this.schemaPath)) {
            throw new ValidationError(`Schema file not found: ${this.schemaPath}`);
        } else {
            try {
                accessSync(this.schemaPath, fsConstants.R_OK);
            } catch (err) {
                throw new ValidationError(`Schema file is not readable: ${this.schemaPath}`, {
                    cause: err,
                });
            }
        }
    }

    /**
     * Takes two databases and migrates the tables from the old database to the new database.
     * @private
     * @param {Database} oldDB the old database to migrate from (will be modified in place)
     * @param {Database} newDB the new database to migrate to
     * @param {string[]} upStatements the steps to migrate the database up are appended to this array
     * @param {string[]} downStatements the steps to migrate the database down are appended to this array
     * @param {string[]} manualMigrationReasons an array to append manual migration reasons to
     * @param {Action} onRename how to handle autodetected column/table renames
     * @param {Action} onDestructiveChange how to handle irreversible changes like dropping tables/columns
     * @param {(s: string) => Promise<string>} prompt a function to prompt the user for input
     * @param {boolean} [onlyAmbiguousChanges=false] true if only renames (not creates, deletes or modifies) should be reflected in upStatements/downStatements and output, false otherwise
     * @returns {Promise<{ addedTableNames: Set<string>, removedTableNames: Set<string>, modifiedTableNames: Set<string>, renamedTableNames: Map<string, string>, containsRenamedColumns: boolean }>}
     * @effects modifies the upStatements, downStatements, and manualMigrationReasons arrays; applies the upStatements to the oldDB
     */
    async #makeTables(
        oldDB,
        newDB,
        upStatements,
        downStatements,
        manualMigrationReasons,
        onRename,
        onDestructiveChange,
        prompt,
        onlyAmbiguousChanges = false,
    ) {
        const [oldTables, newTables] = await Promise.all([
            getTables(oldDB, this.ignoreNameCase),
            getTables(newDB, this.ignoreNameCase),
        ]);

        if (newTables.has(this.migrationsTable)) {
            throw new ValidationError(
                `Table "${this.migrationsTable}" is reserved for migration metadata and not allowed in the schema file.`,
            );
        }

        const addedTableNames = setDifference(newTables.keys(), oldTables.keys());
        const removedTableNames = setDifference(oldTables.keys(), newTables.keys());
        const modifiedTableNames = mapDifference(oldTables, newTables);
        const renamedTableNames = mappedDifference(
            oldTables,
            removedTableNames,
            newTables,
            addedTableNames,
            (a, b) => getCreateSQLBody(a) === getCreateSQLBody(b),
        );

        await this.#resolveRenames(
            addedTableNames,
            removedTableNames,
            renamedTableNames,
            onRename,
            prompt,
            manualMigrationReasons,
            'table',
        );

        for (const [oldTableName, newTableName] of renamedTableNames) {
            if (oldTableName.toLowerCase() !== newTableName.toLowerCase()) {
                upStatements.push(
                    `await db.run("ALTER TABLE \\"${oldTableName}\\" RENAME TO \\"${newTableName}\\"")`,
                );
                downStatements.push(
                    `await db.run("ALTER TABLE \\"${newTableName}\\" RENAME TO \\"${oldTableName}\\"")`,
                );
                await oldDB.run(`ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`);
            } else {
                const usedTableNames = new Set([...newTables.keys(), ...oldTables.keys()]);
                let tempTableName;
                do {
                    tempTableName = `temp_${Math.random().toString(36).substring(2)}`;
                } while (usedTableNames.has(tempTableName));

                upStatements.push(
                    `await db.run("ALTER TABLE \\"${oldTableName}\\" RENAME TO \\"${tempTableName}\\"")`,
                    `await db.run("ALTER TABLE \\"${tempTableName}\\" RENAME TO \\"${newTableName}\\"")`,
                );
                downStatements.push(
                    `await db.run("ALTER TABLE \\"${newTableName}\\" RENAME TO \\"${tempTableName}\\"")`,
                    `await db.run("ALTER TABLE \\"${tempTableName}\\" RENAME TO \\"${oldTableName}\\"")`,
                );
                await oldDB.run(`ALTER TABLE "${oldTableName}" RENAME TO "${tempTableName}"`);
                await oldDB.run(`ALTER TABLE "${tempTableName}" RENAME TO "${newTableName}"`);
            }
        }

        for (const tableName of addedTableNames) {
            const sql = newTables.get(tableName);
            if (!onlyAmbiguousChanges) upStatements.push(`await db.run("${unquoteSQL(sql)}")`);
            if (!onlyAmbiguousChanges)
                downStatements.push(`await db.run("DROP TABLE \\"${tableName}\\"")`);
            await oldDB.run(sql);
        }

        for (const tableName of removedTableNames) {
            const action = await this.#promptForAction(
                prompt,
                onDestructiveChange,
                `Table "${tableName}" seems to have been removed. Type "y" to drop, "n" to keep, or "m" to require manual migration: `,
            );
            if (action === Migrator.REQUIRE_MANUAL_MIGRATION) {
                manualMigrationReasons.push(`Table "${tableName}" was removed`);
            }
            if (action === Migrator.PROCEED || action === Migrator.REQUIRE_MANUAL_MIGRATION) {
                const sql = oldTables.get(tableName);
                if (!onlyAmbiguousChanges)
                    upStatements.push(`await db.run("DROP TABLE \\"${tableName}\\"")`);
                if (!onlyAmbiguousChanges)
                    downStatements.push(`await db.run("${unquoteSQL(sql)}")`);
                await oldDB.run(`DROP TABLE "${tableName}"`);
            } else if (action === Migrator.SKIP) {
                if (!onlyAmbiguousChanges)
                    upStatements.push(`// Skipped removing table "${tableName}"`);
                if (!onlyAmbiguousChanges)
                    downStatements.push(`// Skipped adding table "${tableName}"`);
                removedTableNames.delete(tableName);
            } else {
                throw new ValidationError(`Invalid action: ${action}`);
            }
        }

        let containsRenamedColumns = false;
        for (const tableName of modifiedTableNames) {
            const [oldColumns, newColumns] = await Promise.all([
                getColumnInfo(tableName, oldDB, this.ignoreNameCase),
                getColumnInfo(tableName, newDB, this.ignoreNameCase),
            ]);

            const addedColumns = setDifference(newColumns.keys(), oldColumns.keys());
            const removedColumns = setDifference(oldColumns.keys(), newColumns.keys());
            const modifiedColumns = mapDifference(oldColumns, newColumns, IS_JSON_EQUAL);
            const renamedColumns = mappedDifference(
                oldColumns,
                removedColumns,
                newColumns,
                addedColumns,
                IS_JSON_EQUAL,
            );

            await this.#resolveRenames(
                addedColumns,
                removedColumns,
                renamedColumns,
                onRename,
                prompt,
                manualMigrationReasons,
                `table "${tableName}": column`,
            );

            for (const [oldColumnName, newColumnName] of renamedColumns) {
                containsRenamedColumns = true;
                const sql = `ALTER TABLE "${tableName}" RENAME COLUMN "${oldColumnName}" TO "${newColumnName}"`;
                upStatements.push(`await db.run("${unquoteSQL(sql)}")`);
                downStatements.push(
                    `await db.run("ALTER TABLE \\"${tableName}\\" RENAME COLUMN \\"${newColumnName}\\" TO \\"${oldColumnName}\\"")`,
                );
                await oldDB.run(sql);
            }

            for (const columnName of removedColumns) {
                const action = await this.#promptForAction(
                    prompt,
                    onDestructiveChange,
                    `Column "${columnName}" of table "${tableName}" seems to have been removed. Type "y" to drop, "n" to keep, or "m" to require manual migration: `,
                );
                if (action === Migrator.REQUIRE_MANUAL_MIGRATION) {
                    manualMigrationReasons.push(
                        `Column "${columnName}" of table "${tableName}" was removed`,
                    );
                } else if (action === Migrator.SKIP) {
                    if (!onlyAmbiguousChanges)
                        upStatements.push(
                            `// Skipped removing column "${columnName}" of "${tableName}"`,
                        );
                    if (!onlyAmbiguousChanges)
                        downStatements.push(
                            `// Skipped adding column "${columnName}" of "${tableName}"`,
                        );
                    removedColumns.delete(columnName);
                } else if (action !== Migrator.PROCEED) {
                    throw new ValidationError(`Invalid action: ${action}`);
                }
            }

            for (const columnName of addedColumns) {
                const { notnull, dflt_value } = newColumns.get(columnName);
                if (notnull && !dflt_value) {
                    manualMigrationReasons.push(
                        `Column "${columnName}" of table "${tableName}" has NOT NULL constraint without a default value`,
                    );
                }
            }

            let canUseAlterTable = modifiedColumns.size === 0; // if we can't, we'll have to use the 12 step process here: https://www.sqlite.org/lang_altertable.html
            for (const columnName of addedColumns) {
                const { fk } = newColumns.get(columnName);
                canUseAlterTable = canUseAlterTable && !fk;
            }
            for (const columnName of removedColumns) {
                const { fk } = oldColumns.get(columnName);
                canUseAlterTable = canUseAlterTable && !fk;
            }

            if (onlyAmbiguousChanges) {
                // don't need to track the changes in the up and down statements
            } else if (canUseAlterTable) {
                for (const columnName of addedColumns) {
                    const { type, notnull, dflt_value, pk } = newColumns.get(columnName);
                    const sql = `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${type} ${
                        notnull ? 'NOT NULL' : ''
                    } ${dflt_value ? `DEFAULT ${dflt_value}` : ''} ${pk ? 'PRIMARY KEY' : ''}`;
                    upStatements.push(`await db.run("${unquoteSQL(sql)}")`);
                    downStatements.push(
                        `await db.run("ALTER TABLE \\"${tableName}\\" DROP COLUMN \\"${columnName}\\"")`,
                    );
                    await oldDB.run(sql);
                }

                for (const columnName of removedColumns) {
                    const sql = `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`;
                    upStatements.push(`await db.run("${unquoteSQL(sql)}")`);
                    const { type, notnull, dflt_value, pk } = oldColumns.get(columnName);
                    downStatements.push(
                        `await db.run("ALTER TABLE \\"${tableName}\\" ADD COLUMN \\"${columnName}\\" ${type} ${
                            notnull ? 'NOT NULL' : ''
                        } ${dflt_value ? `DEFAULT ${dflt_value}` : ''} ${
                            pk ? 'PRIMARY KEY' : ''
                        }")`,
                    );
                    await oldDB.run(sql);
                }
            } else {
                const targetSQL = newTables.get(tableName);
                const currentSQL = await getTableSQL(oldDB, tableName);

                const usedTableNames = new Set([...newTables.keys(), ...oldTables.keys()]);
                let tempTableName;
                do {
                    tempTableName = `temp_${Math.random().toString(36).substring(2)}`;
                } while (usedTableNames.has(tempTableName));

                // === UP ===
                {
                    const createTempSQL = targetSQL.replace(tableName, tempTableName);
                    const transferColumns = [...setDifference(newColumns.keys(), removedColumns)]
                        .map(s => `"${s}"`)
                        .join(', ');
                    const transferContentSQL = `INSERT INTO ${tempTableName} (${transferColumns}) SELECT ${transferColumns} FROM "${tableName}"`;
                    const dropOldSQL = `DROP TABLE "${tableName}"`;
                    const renameTempSQL = `ALTER TABLE ${tempTableName} RENAME TO "${tableName}"`;

                    upStatements.push(`await db.run("${unquoteSQL(createTempSQL)}")`);
                    upStatements.push(`await db.run("${unquoteSQL(transferContentSQL)}")`);
                    upStatements.push(`await db.run("${unquoteSQL(dropOldSQL)}")`);
                    upStatements.push(`await db.run("${unquoteSQL(renameTempSQL)}")`);

                    await oldDB.run(createTempSQL);
                    await oldDB.run(transferContentSQL);
                    await oldDB.run(dropOldSQL);
                    await oldDB.run(renameTempSQL);
                }

                // === DOWN ===
                {
                    const createTempSQL = currentSQL.replace(tableName, tempTableName);
                    const transferColumns = [...setDifference(oldColumns.keys(), addedColumns)]
                        .map(s => `"${s}"`)
                        .join(', ');
                    const transferContentSQL = `INSERT INTO ${tempTableName} (${transferColumns}) SELECT ${transferColumns} FROM "${tableName}"`;
                    const dropOldSQL = `DROP TABLE "${tableName}"`;
                    const renameTempSQL = `ALTER TABLE ${tempTableName} RENAME TO "${tableName}"`;

                    downStatements.push(`await db.run("${unquoteSQL(createTempSQL)}")`);
                    downStatements.push(`await db.run("${unquoteSQL(transferContentSQL)}")`);
                    downStatements.push(`await db.run("${unquoteSQL(dropOldSQL)}")`);
                    downStatements.push(`await db.run("${unquoteSQL(renameTempSQL)}")`);
                }
            }

            // If the table was falsely detected as modified (e.g. its sql changed case, or the user skipped the change), remove it from the modified set
            if (
                addedColumns.size === 0 &&
                removedColumns.size === 0 &&
                modifiedColumns.size === 0 &&
                renamedColumns.size === 0
            ) {
                modifiedTableNames.delete(tableName);
            }
        }

        return {
            addedTableNames: onlyAmbiguousChanges ? new Set() : addedTableNames,
            removedTableNames: onlyAmbiguousChanges ? new Set() : removedTableNames,
            modifiedTableNames: onlyAmbiguousChanges ? new Set() : modifiedTableNames,
            renamedTableNames,
            containsRenamedColumns,
        };
    }

    /**
     * Takes two databases and determines the statements needed to migrate the virtual tables from the old database to the new database.
     * @private
     * @param {Database} oldDB the old database to migrate from
     * @param {Database} newDB the new database to migrate to
     * @param {Action} onChange how to handle dropped/changed virtual tables
     * @param {string[]} upStatements the steps to migrate the database up are appended to this array
     * @param {string[]} downStatements the steps to migrate the database down are appended to this array
     * @param {string[]} manualMigrationReasons an array to append manual migration reasons to
     * @param {(s: string) => Promise<string>} prompt a function to prompt the user for input
     * @returns {Promise<{ addedVirtualTables: string[], removedVirtualTables: string[] }>} the added and removed virtual tables
     * @effects drops all virtual tables from the old database and new database; modifies the upStatements, downStatements, and manualMigrationReasons arrays
     */
    async #makeVirtualTables(
        oldDB,
        newDB,
        onChange,
        upStatements,
        downStatements,
        manualMigrationReasons,
        prompt,
    ) {
        const [oldVirtualTables, newVirtualTables] = await Promise.all([
            getVirtualTables(oldDB, this.ignoreNameCase),
            getVirtualTables(newDB, this.ignoreNameCase),
        ]);
        const { added: addedVirtualTables, removed: removedVirtualTables } =
            await this.#makeUnalterable(
                'virtual tables',
                'DROP TABLE',
                oldVirtualTables,
                newVirtualTables,
                onChange,
                upStatements,
                downStatements,
                manualMigrationReasons,
                prompt,
            );

        // virtual tables have extra shadow tables, so we drop them before diffing the tables
        for (const tableName of oldVirtualTables.keys()) {
            await oldDB.run(`DROP TABLE IF EXISTS "${tableName}"`);
        }
        for (const tableName of newVirtualTables.keys()) {
            await newDB.run(`DROP TABLE IF EXISTS "${tableName}"`);
        }

        return { addedVirtualTables, removedVirtualTables };
    }

    /**
     * Takes two databases and determines the statements needed to migrate the "unalterable" from the old database to the new database.
     * @private
     * @param {"virtual tables"|"views"|"triggers"|"indices"} unalterables the type of unalterable to migrate
     * @param {"DROP TABLE"|"DROP VIEW"|"DROP TRIGGER"|"DROP INDEX"} dropSQL the SQL command to drop the unalterable
     * @param {Map<string, string>} oldUnalterables the unalterables in the old database; map from name to normalized SQL
     * @param {Map<string, string>} newUnalterables the unalterables in the new database; map from name to normalized SQL
     * @param {Action} onChange how to handle dropped/changed unalterables
     * @param {string[]} upStatements the steps to migrate the database up are appended to this array
     * @param {string[]} downStatements the steps to migrate the database down are appended to this array
     * @param {string[]} manualMigrationReasons an array to append manual migration reasons to
     * @param {(s: string) => Promise<string>} prompt a function to prompt the user for input
     * @returns {Promise<{ added: string[], removed: string[] }>} the added and removed unalterables
     * @effects modifies the upStatements, downStatements, and manualMigrationReasons arrays
     */
    async #makeUnalterable(
        unalterables,
        dropSQL,
        oldUnalterables,
        newUnalterables,
        onChange,
        upStatements,
        downStatements,
        manualMigrationReasons,
        prompt,
    ) {
        const added = setDifference(newUnalterables.keys(), oldUnalterables.keys());
        const removed = setDifference(oldUnalterables.keys(), newUnalterables.keys());
        const modified = mapDifference(oldUnalterables, newUnalterables);
        for (const name of modified) {
            added.add(name);
            removed.add(name);
            modified.delete(name);
        }
        if (removed.size > 0) {
            const action = await this.#promptForAction(
                prompt,
                onChange,
                'The following ' +
                    unalterables +
                    ' have been removed: ' +
                    [...removed].join(', ') +
                    ". Type 'y' to proceed, 'n' to skip, or 'm' to require manual migration: ",
            );
            if (action === Migrator.REQUIRE_MANUAL_MIGRATION) {
                manualMigrationReasons.push(`Removed ${unalterables}: ${[...removed].join(', ')}`);
            }
            if (action === Migrator.PROCEED || action === Migrator.REQUIRE_MANUAL_MIGRATION) {
                for (const name of removed) {
                    upStatements.push(`await db.run("${dropSQL} \\"${name}\\"")`);
                    downStatements.push(`await db.run("${unquoteSQL(oldUnalterables.get(name))}")`);
                }
            } else if (action === Migrator.SKIP) {
                removed.clear();
            } else {
                throw new ValidationError(`Invalid action: ${action}`);
            }
        }
        for (const name of added) {
            upStatements.push(`await db.run("${unquoteSQL(newUnalterables.get(name))}")`);
            downStatements.push(`await db.run("${dropSQL} \\"${name}\\"")`);
        }

        return { added, removed };
    }
}
