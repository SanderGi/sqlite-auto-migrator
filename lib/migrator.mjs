import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { colors, symbols } from './colors.mjs';

import {
    ManualMigrationRequired,
    ValidationError,
    RolledBackTransaction,
    IntegrityError,
} from './errors.mjs';
import { setDifference, objectDifference, fileHash } from './diff.mjs';
import { getPragmas, getTables } from './parse.mjs';
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
 * @property {string} [dbPath] Path to the SQLite database file. Default is `path.join(process.cwd(), 'data.db')`
 * @property {string} [migrationsPath] Path to the migrations folder. Default is `path.join(process.cwd(), 'migrations')`
 * @property {string} [migrationTable] Name of the table to store migration information in. Default is `migrations`
 * @property {string} [schemaPath] Path to the schema file. Default is `path.join(process.cwd(), 'schema.sql')`
 */

/**
 * The migration status of the database.
 * @typedef {Object} Status
 * @property {string} current_id The current migration id
 * @property {string} current_name The current migration name
 * @property {MigrationOptions} options The options used to create the migrator
 * @property {Object} pragmas All the pragmas of the database, includes non-persisted pragmas that need to be set on each new connection
 */

/** Compares two {@link MigrationFile} objects by their `id` property in ascending order. */
const ASCENDING_BY_ID = (a, b) => {
    a.id - b.id;
};

/** Maximum length of auto generated migration filenames */
const MAX_FILE_NAME_LENGTH = 40;

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
     * @param {MigrationOptions} options the options for the migrator {@link MigrationOptions}
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     */
    constructor(options = {}) {
        this.dbPath = options.dbPath ?? path.join(process.cwd(), 'data.db');
        this.migrationsPath = options.migrationsPath ?? path.join(process.cwd(), 'migrations');
        this.tempPath = path.join(this.migrationsPath, '/temp');
        this.schemaPath = options.schemaPath ?? path.join(process.cwd(), 'schema.sql');
        this.migrationTable = options.migrationTable ?? 'migrations';

        this.#validateOptions();
    }

    /**
     * Creates a new migration file that when applied will bring the latest migration file state to that of the current schema.
     * @param {Action} onRename How to handle autodetected column/table renames. Default is `Migrator.PROMPT`
     * @param {Action} onDestructiveChange How to handle irreversible changes like dropping tables/columns. Default is `Migrator.PROMPT`
     * @param {boolean} createIfNoChanges Whether to create a new migration file even if no changes are needed. Default is `false`
     * @throws an appropriate {@link ValidationError} if the options or prompted input is invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     */
    async make(
        onRename = this.PROMPT,
        onDestructiveChange = this.PROMPT,
        createIfNoChanges = false,
    ) {
        this.#validateOptions();

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const prompt = query => new Promise(resolve => rl.question(query, resolve));

        const [oldDB, newDB] = await Promise.all([
            Database.connect(''),
            Database.connect(''),
        ]).catch(err => {
            throw new ManualMigrationRequired(
                'Failed to open two anonymous disk databases for schema comparison',
                {
                    cause: err,
                },
            );
        });

        let manualMigrationReasons = []; // if we detect a rename/destructive change that we can't handle automatically, we'll append the reason(s) here
        try {
            const migrationFiles = await this.#getMigrationFiles();
            const schema = await fs.readFile(this.schemaPath, 'utf8');
            await Promise.all([this.#applyMigrations(oldDB, migrationFiles), newDB.exec(schema)]);

            const [oldPragmas, newPragmas] = await Promise.all([
                getPragmas(oldDB),
                getPragmas(newDB),
            ]);
            const upPragmas = objectDifference(newPragmas, oldPragmas); // pragmas that need to be set in the up migration
            const downPragmas = objectDifference(newPragmas, oldPragmas, false); // pragmas that need to be set in the down migration

            const [oldTables, newTables] = await Promise.all([getTables(oldDB), getTables(newDB)]);

            if (this.migrationTable in newTables) {
                throw new ValidationError(
                    `Table "${this.migrationTable}" is reserved for migration metadata and not allowed in the schema file.`,
                );
            }

            const addedTableNames = setDifference(newTables.keys(), oldTables.keys());
            const removedTableNames = setDifference(oldTables.keys(), newTables.keys());
            const modifiedTableNames = new Set();
            const renamedTableNames = new Map();

            for (const [tableName, oldSql] of oldTables.entries()) {
                const newSql = newTables.get(tableName);
                if (newSql === undefined) {
                    continue;
                }
                if (oldSql !== newSql) {
                    modifiedTableNames.add(tableName);
                }
            }

            for (const addedTableName of addedTableNames) {
                const addedSql = newTables.get(addedTableName);
                for (const oldTableName of removedTableNames) {
                    const oldSql = oldTables.get(oldTableName);
                    if (addedSql === oldSql) {
                        let action = onRename;
                        if (onRename === this.PROMPT) {
                            const answer = await prompt(
                                `Table "${oldTableName}" seems to have been renamed to "${addedTableName}". Type "y" to rename, "n" to remove and add a new table instead, or "m" to require manual migration:`,
                            );
                            if (answer.toLowerCase() === 'y') {
                                action = this.PROCEED;
                            } else if (answer.toLowerCase() === 'n') {
                                action = this.SKIP;
                            } else if (answer.toLowerCase() === 'm') {
                                action = this.REQUIRE_MANUAL_MIGRATION;
                            } else {
                                throw new ValidationError(`Invalid answer: ${answer}`);
                            }
                        }
                        if (action === this.PROCEED) {
                            renamedTableNames.set(oldTableName, addedTableName);
                            addedTableNames.delete(addedTableName);
                            removedTableNames.delete(oldTableName);
                        } else if (action === this.REQUIRE_MANUAL_MIGRATION) {
                            const reason = `Table "${oldTableName}" was potentially renamed to "${addedTableName}"`;
                            console.log(`${reason}. Manual migration required.`);
                            manualMigrationReasons.push(reason);
                        } else if (action === this.SKIP) {
                            console.log(
                                `Table "${oldTableName}" was potentially renamed to "${addedTableName}". Removing old table and adding a new table instead.`,
                            );
                        } else {
                            throw new ValidationError(`Invalid action: ${onRename}`);
                        }
                    }
                }
            }

            const nextId = Number(migrationFiles.length).toString().padStart(4, '0');
            const name = upPragmas ? ['change_pragmas'] : [''];
            if (addedTableNames.size > 0) {
                name.push(`add_${[...addedTableNames].join('_')}`);
            }
            if (removedTableNames.size > 0) {
                name.push(`remove_${[...removedTableNames].join('_')}`);
            }
            if (modifiedTableNames.size > 0) {
                name.push(`modify_${[...modifiedTableNames].join('_')}`);
            }
            if (renamedTableNames.size > 0) {
                name.push(
                    `rename_${Object.entries(renamedTableNames)
                        .map(([old, added]) => `${old}-${added}`)
                        .join('_')}`,
                );
            }
            this.#writeMigrationFile(
                nextId,
                name.join('__').substring(0, MAX_FILE_NAME_LENGTH) || 'auto_migration',
                upPragmas,
                downPragmas,
            );

            if (manualMigrationReasons.length > 0) {
                throw new ManualMigrationRequired(manualMigrationReasons.join('\n\n'), {
                    cause: manualMigrationReasons,
                });
            }
        } finally {
            rl.close();
            oldDB.close();
            newDB.close();
        }
    }

    /**
     * Migrates the database state to the given target. Automatically figures out if the migrations
     * in the migration folder have changed (e.g. changed git branch) and undoes and reapplies migrations as necessary.
     * @param {string} target The migration to set the database state to, e.g., "0001" (a migration id), "zero" (undo all migrations) or "latest" (default).
     * @param {function} log a function to log messages through. Default is `process.stdout.write`
     * @throws an appropriate {@link ValidationError} if the options or target is invalid.
     * @throws an appropriate {@link RolledBackTransaction} if the migrations failed causing the transaction to be rolled back.
     * @throws an appropriate {@link IntegrityError} if the integrity or foreign key checks fail after the migration.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     * @returns {Promise<void>} a promise that resolves when the migrations are complete or rejects if an error occurs
     */
    async migrate(target = 'latest', log = s => process.stdout.write(s)) {
        this.#validateOptions();

        const db = await Database.connect(this.dbPath);
        try {
            const migrationFiles = await this.#getMigrationFiles();
            const appliedMigrations = await this.#getAppliedMigrationFiles(db);

            if (target === 'latest') {
                target = migrationFiles[migrationFiles.length - 1].id;
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
            while (migrationFiles.length > 0 && appliedMigrations.length > 0) {
                const nextMigration = migrationFiles.shift();
                const appliedMigration = appliedMigrations.shift();
                if (nextMigration.content_hash !== appliedMigration.content_hash) {
                    migrationFiles.unshift(nextMigration);
                    appliedMigrations.unshift(appliedMigration);
                    break;
                }
            }
            appliedMigrations.reverse();

            if (migrationFiles.length === 0 && appliedMigrations.length === 0) {
                log(
                    colors.FgCyan('No migrations to apply.') +
                        ` Database state already matches the migrations up to and including ${target}. Run 'make' to create a new migration.\n`,
                );
                return;
            }

            let pragmas = {};
            try {
                await db.run('BEGIN TRANSACTION');

                if (appliedMigrations.length !== 0) {
                    log(colors.FgCyan('Undoing migrations:\n'));

                    pragmas = await this.#undoMigrations(db, appliedMigrations, log);

                    await db.run(
                        `DELETE FROM "${this.migrationTable}" WHERE id IN (${appliedMigrations
                            .map(m => `'${m.id}'`)
                            .join(',')})`,
                    );
                }

                if (migrationFiles.length !== 0) {
                    log(colors.FgCyan('Applying migrations:\n'));

                    pragmas = await this.#applyMigrations(db, migrationFiles, log);

                    const stmt = await db.prepare(
                        `INSERT INTO "${this.migrationTable}" (id, name, content_hash, content) VALUES (?, ?, ?, ?)`,
                    );
                    for (const migration of migrationFiles) {
                        const content = await fs.readFile(migration.content_path, 'utf8');
                        await stmt.run(
                            migration.id,
                            migration.name,
                            migration.content_hash,
                            content,
                        );
                    }
                    await stmt.finalize();
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

            log(
                colors.FgCyan('Migrations complete!\n') +
                    `  Database state now matches the migrations up to and including ${target}.\n`,
            );
            // TODO: show warning if the schema file has changed since the last migration
        } finally {
            await db.run('VACUUM');
            await db.close();
            await fs.rm(this.tempPath, { recursive: true, force: true });
        }
    }

    /**
     * Gets the current migration state of the database.
     * @returns {Promise<Status>} the current migration state of the database
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @throws an appropriate {@link Error} if an unexpected error occurs, e.g., not being able to connect to the database, close the database, or remove temporary files.
     */
    async status() {
        this.#validateOptions();

        const status = {
            current_id: '',
            current_name: '',
            options: {
                dbPath: this.dbPath,
                migrationsPath: this.migrationsPath,
                migrationTable: this.migrationTable,
                schemaPath: this.schemaPath,
            },
            pragmas: {},
        };

        const db = await Database.connect(this.dbPath);
        try {
            const appliedMigrations = await this.#getAppliedMigrationFiles(db);

            const latest = appliedMigrations[appliedMigrations.length - 1];
            status.current_id = latest.id;
            status.current_name = latest.name;
            const { PRAGMAS } = await import(latest.content_path);
            status.pragmas = PRAGMAS;
        } finally {
            await db.close();
            await fs.rm(this.tempPath, { recursive: true, force: true });
        }

        return status;
    }

    /**
     * Gets the current migration state of the database.
     * @private
     * @returns {Promise<MigrationFile[]>} the list of currently applied migrations sorted by id in ascending order
     * @effects creates the migration table and temp folder if they don't exist
     */
    async #getAppliedMigrationFiles(db) {
        await fs.mkdir(this.tempPath).catch(e => {
            if (e.code !== 'EEXIST') throw e;
        });
        await db.run(
            `CREATE TABLE IF NOT EXISTS "${this.migrationTable}" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
                content_hash TEXT NOT NULL,
                content TEXT NOT NULL
            )`,
        );
        const migrations = [];
        for await (const row of db.each(
            `SELECT id, name, content_hash, content FROM "${this.migrationTable}"`,
        )) {
            const content_path = path.join(this.tempPath, `${row.id}_${row.name}.mjs`);
            await fs.writeFile(content_path, row.content);
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
        const filenames = await fs.readdir(this.migrationsPath);
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
                const { up, PRAGMAS } = await import(migration.content_path);
                pragmas = PRAGMAS;
                await up(db);
            } catch (err) {
                log(`  ${symbols.error}\n`);
                throw err;
            }
            log(`  ${symbols.success}\n`);
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
                const { down, PRAGMAS } = await import(migration.content_path);
                pragmas = PRAGMAS;
                await down(db);
            } catch (err) {
                log(`  ${symbols.error}\n`);
                throw err;
            }
            log(`  ${symbols.success}\n`);
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
            log(`  ${symbols.bullet} Setting PRAGMA ${pragma} = ${value}...`);
            const otherDB = await Database.connect(this.dbPath);
            try {
                await db.run(`PRAGMA ${pragma} = ${value}`);
                const { [pragma]: newValue } = await otherDB.get(`PRAGMA ${pragma}`);
                if (newValue === value) log(`  ${symbols.success}\n`);
                else log(`  ${symbols.warning} (not persistent)\n`);
            } catch (err) {
                log(`  ${symbols.error}\n`);
                throw err;
            } finally {
                await otherDB.close();
            }
        }
    }

    async #writeMigrationFile(id, name, pragmas) {
        const upStatements = [];
        const downStatements = [];

        if (upStatements.length === 0) {
            const errorStatement = `\tthrow new Error('Migration ${id} is not yet implemented');`;
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
${upStatements.join('\n')}
}

/**
 * Runs the necessary SQL commands to migrate the database down to the previous version from this version.
 * Automatically runs in a transaction with deferred foreign keys.
 * @param {Database} db database instance to run SQL commands on
 */
export async function down(db) {
${downStatements.join('\n')}
}
        `.trim();
        await fs.writeFile(filepath, content);
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
        if (!fsSync.existsSync(this.dbPath)) {
            throw new ValidationError(`Database file not found: ${this.dbPath}`);
        } else {
            try {
                fsSync.accessSync(this.dbPath, fs.constants.R_OK | fs.constants.W_OK);
            } catch (err) {
                throw new ValidationError(
                    `Database file is not readable/writable: ${this.dbPath}`,
                    { cause: err },
                );
            }
        }
        if (!fsSync.existsSync(this.migrationsPath)) {
            fsSync.mkdirSync(this.migrationsPath);
        }
        try {
            fsSync.accessSync(this.migrationsPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch (err) {
            throw new ValidationError(
                `Migrations folder is not readable/writable: ${this.migrationsPath}`,
                { cause: err },
            );
        }
        if (!fsSync.existsSync(this.schemaPath)) {
            throw new ValidationError(`Schema file not found: ${this.schemaPath}`);
        } else {
            try {
                fsSync.accessSync(this.schemaPath, fs.constants.R_OK);
            } catch (err) {
                throw new ValidationError(`Schema file is not readable: ${this.schemaPath}`, {
                    cause: err,
                });
            }
        }
    }
}
