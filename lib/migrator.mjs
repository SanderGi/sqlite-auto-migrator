/* eslint-disable */

'use strict';

import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { colors, symbols } from './colors.mjs';

import { ManualMigrationRequired, ValidationError, RolledBackTransaction } from './errors.mjs';
import { setDifference, objectDifference, fileHash } from './diff.mjs';
import { getPragmas, getTables } from './parse.mjs';
import Database from './database.mjs';

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
 * @property {string | undefined} dbPath Path to the SQLite db file. Default is `path.join(process.cwd(), 'data.db')`
 * @property {string | undefined} migrationsPath Path to the migrations folder. Default is `path.join(process.cwd(), 'migrations')`
 * @property {string | undefined} migrationTable Name of the table to store migration information in. Default is `migrations`
 * @property {string | undefined} schemaPath Path to the schema file. Default is `path.join(process.cwd(), 'schema.sql')`
 */

/**
 * Compares two objects by their `id` property in ascending order.
 */
const ASCENDING_BY_ID = (a, b) => {
    a.id - b.id;
};
const MAX_FILE_NAME_LENGTH = 40;

/**
 * A class to manage migrations for a SQLite database.
 */
export default class Migrator {
    /** You'll be prompted via the commandline for how to proceed. */
    PROMPT = 'PROMPT';
    /** A {@link ManualMigrationRequired} error is thrown. */
    REQUIRE_MANUAL_MIGRATION = 'REQUIRE_MANUAL_MIGRATION';
    /** Automatically respond yes to the prompt. */
    PROCEED = 'PROCEED';
    /** Automatically respond no to the prompt. */
    SKIP = 'SKIP';

    /**
     * @param {MigrationOptions} options the options for the migrator {@link MigrationOptions}
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     */
    constructor(options) {
        this.dbPath = options.dbPath ?? path.join(process.cwd(), 'data.db');
        this.migrationsPath = options.migrationsPath ?? path.join(process.cwd(), 'migrations');
        this.tempPath = path.join(this.migrationsPath, '/temp');
        this.schemaPath = options.schemaPath ?? path.join(process.cwd(), 'schema.sql');
        this.migrationTable = options.migrationTable ?? 'migrations';

        this.#validateOptions();
    }

    /**
     * Creates a new migration file that when applied will bring the latest migration file state to that of the current schema.
     * @param {Action} onRename How to handle autodetected column/table renames. Default is `migrator.PROMPT`
     * @param {Action} onDestructiveChange How to handle irreversible changes like dropping tables/columns. Default is `migrator.PROMPT`
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

        const [oldDB, newDB] = await Promise.all(Database.connect(''), Database.connect('')).catch(
            err => {
                throw new ManualMigrationRequired(
                    'Failed to open two anonymous disk databases for schema comparison',
                    {
                        cause: err,
                    },
                );
            },
        );

        let manualMigrationReasons = []; // if we detect a rename/destructive change that we can't handle automatically, we'll append the reason(s) here
        try {
            const migrationFiles = this.#getMigrationFiles();
            const schema = fs.readFileSync(this.schemaPath, 'utf8');
            await Promise.all(this.#applyMigrations(oldDB, migrationFiles), newDB.exec(schema));

            const [oldPragmas, newPragmas] = await Promise.all(
                getPragmas(oldDB),
                getPragmas(newDB),
            );
            const upPragmas = objectDifference(newPragmas, oldPragmas); // pragmas that need to be set in the up migration
            const downPragmas = objectDifference(newPragmas, oldPragmas, false); // pragmas that need to be set in the down migration

            const [oldTables, newTables] = await Promise.all(getTables(oldDB), getTables(newDB));

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
     * @param {function} log a function to log messages to. Default is `process.stdout.write`
     * @throws an appropriate {@link ValidationError} if the options or prompted input is invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     * @throws an appropriate {@link RolledBackTransaction} if the migrations failed causing the transaction to be rolled back.
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
                if (nextMigration === undefined) {
                    throw new ValidationError(`Migration not found: ${target}`);
                }
                const appliedMigration = appliedMigrations.shift();
                if (nextMigration.content_hash !== appliedMigration.content_hash) {
                    migrationFiles.unshift(nextMigration);
                    appliedMigrations.unshift(appliedMigration);
                    break;
                }
                if (nextMigration.id === target) {
                    migrationFiles.splice(0);
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

            if (appliedMigrations.length !== 0) {
                log(colors.FgCyan('Undoing migrations:\n'));

                try {
                    await db.run('BEGIN TRANSACTION');

                    await this.#undoMigrations(db, appliedMigrations, log);

                    await db.run(
                        `DELETE FROM "${this.migrationTable}" WHERE id IN (${appliedMigrations
                            .map(m => `'${m.id}'`)
                            .join(',')})`,
                    );

                    await db.run('COMMIT TRANSACTION');
                } catch (err) {
                    log(colors.FgRed('Error occured.') + ' Rolling back transaction...\n');
                    await db.run('ROLLBACK TRANSACTION');
                    throw new RolledBackTransaction('Migrations have not been undone.', {
                        cause: err,
                    });
                }
            }

            if (migrationFiles.length !== 0) {
                log(colors.FgCyan('Applying migrations:\n'));
                try {
                    await db.run('BEGIN TRANSACTION');

                    await this.#applyMigrations(db, migrationFiles, log);

                    const stmt = await db.prepare(
                        `INSERT INTO "${this.migrationTable}" (id, name, content_hash, content) VALUES (?, ?, ?, ?)`,
                    );
                    for (const migration of migrationFiles) {
                        const content = fs.readFileSync(migration.content_path, 'utf8');
                        await stmt.run(
                            migration.id,
                            migration.name,
                            migration.content_hash,
                            content,
                        );
                    }
                    await stmt.finalize();

                    await db.run('COMMIT TRANSACTION');
                } catch (err) {
                    log(colors.FgRed('Error occured.') + ' Rolling back transaction...\n');
                    await db.run('ROLLBACK TRANSACTION');
                    throw new RolledBackTransaction('Migrations have not been applied.', {
                        cause: err,
                    });
                }
            }

            this.#verifyIntegrityAndForeignKeys(db, log);

            log(
                colors.FgCyan('Migrations complete!\n') +
                    `  Database state now matches the migrations up to and including ${target}.\n`,
            );
            // TODO: show warning if the schema file has changed since the last migration
        } finally {
            await db.run('VACUUM');
            await db.close();
            if (fs.existsSync(this.tempPath)) {
                fs.rmSync(this.tempPath, { recursive: true });
            }
        }
    }

    /**
     * Verifies the integrity and foreign keys of the database.
     * @param {Database} db the database connection to run the checks on
     * @param {function} log a function to log messages to
     * @throws a {@link ValidationError} if the integrity or foreign key checks fail
     * @returns {Promise<void>} a promise that resolves when the checks are complete or rejects if an error occurs
     */
    async #verifyIntegrityAndForeignKeys(db, log = () => {}) {
        log(colors.FgCyan('Running integrity and foreignkey checks...\n'));
        const violations = await db.all('PRAGMA integrity_check');
        if (violations.length > 0 && violations[0].integrity_check !== 'ok') {
            log(colors.FgRed('Integrity check failed:') + '\n');
            for (const violation of violations) {
                log(`  ${symbols.bullet} ${violation.integrity_check}\n`);
            }
            throw new ValidationError('Integrity check failed');
        }
        log(`  ${symbols.bullet} Integrity check passed ${symbols.success}\n`);
        const foreignKeyCheck = await db.all('PRAGMA foreign_key_check');
        if (foreignKeyCheck.length > 0) {
            log(colors.FgRed('Foreign key check failed:') + '\n');
            for (const violation of foreignKeyCheck) {
                log(`  ${symbols.bullet} ${violation}\n`);
            }
            throw new ValidationError('Foreign key check failed');
        }
        log(`  ${symbols.bullet} Foreign key check passed ${symbols.success}\n`);
    }

    /**
     * Gets the current migration state of the database.
     * @private
     * @returns {Promise<MigrationFile[]>} the list of currently applied migrations sorted by id in ascending order
     * @effects creates the migration table and temp folder if they don't exist
     */
    async #getAppliedMigrationFiles(db) {
        if (!fs.existsSync(this.tempPath)) {
            fs.mkdirSync(this.tempPath);
        }
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
            `SELECT id, name, content_hash, content FROM ${this.migrationTable}`,
        )) {
            const content_path = path.join(this.tempPath, `${row.id}_${row.name}.mjs`);
            fs.writeFileSync(content_path, row.content);
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
        return [
            ...(await Promise.all(
                fs
                    .readdirSync(this.migrationsPath)
                    .filter(filename => filename.endsWith('.mjs') && filename.includes('_'))
                    .map(async filename => {
                        const filepath = path.join(this.migrationsPath, filename);
                        return {
                            id: filename.split('_')[0],
                            name: filename.split('_').slice(1).join('_').replace('.mjs', ''),
                            content_hash: await fileHash(filepath),
                            content_path: filepath,
                        };
                    }),
            )),
        ].sort(ASCENDING_BY_ID);
    }

    /**
     * Apply the migrations to the given database.
     * @private
     * @param {Database} db the database connection to run the migrations on
     * @param {MigrationFile[]} migrationFiles the migration files to run
     * @param {function} log a function to log messages to
     * @effects defers foreign key checks
     */
    async #applyMigrations(db, migrationFiles, log = () => {}) {
        await db.run('PRAGMA defer_foreign_keys = TRUE'); // disable foreign key checks while migrating; automatically re-enabled at the end of the transaction

        for (const migration of migrationFiles) {
            log(`  ${symbols.bullet} Applying ${migration.id}_${migration.name}...`);
            try {
                const { up } = await import(migration.content_path);
                await up(db);
            } catch (err) {
                log(`  ${symbols.error}\n`);
                throw err;
            }
            log(`  ${symbols.success}\n`);
        }
    }

    /**
     * Undo the migrations on the given database.
     * @private
     * @param {Database} db the database connection to undo the migrations on
     * @param {MigrationFile[]} migrationFiles the migration files to undo
     * @param {function} log a function to log messages to
     * @effects defers foreign key checks
     */
    async #undoMigrations(db, migrationFiles, log = () => {}) {
        await db.run('PRAGMA defer_foreign_keys = TRUE'); // disable foreign key checks while migrating; automatically re-enabled at the end of the transaction

        for (const migration of migrationFiles) {
            log(`  ${symbols.bullet} Undoing ${migration.id}_${migration.name}...`);
            try {
                const { down } = await import(migration.content_path);
                await down(db);
            } catch (err) {
                log(`  ${symbols.error}\n`);
                throw err;
            }
            log(`  ${symbols.success}\n`);
        }
    }

    #writeMigrationFile(id, name, upPragmas, downPragmas) {
        const upStatements = [];
        const downStatements = [];

        const upPragmaStatements = Object.entries(upPragmas).map(
            ([name, value]) => `\tawait db.run(PRAGMA ${name} = ${value});`,
        );
        upStatements.push(...upPragmaStatements);
        const downPragmaStatements = Object.entries(downPragmas).map(
            ([name, value]) => `\tawait db.run(PRAGMA ${name} = ${value});`,
        );
        downStatements.push(...downPragmaStatements);

        if (upStatements.length === 0) {
            const errorStatement = `\tthrow new Errors.ManualMigrationRequired('Migration ${id} is not yet implemented');`;
            upStatements.push(errorStatement);
            downStatements.push(errorStatement);
        }

        const filepath = path.join(this.migrationsPath, `${id}_${name}.mjs`);
        const content = `
// Automatically created by 'sqlite auto migrator (SAM)' on ${new Date().toISOString()}

import { Errors } from 'sqlite-auto-migrator';
import { Database } from 'sqlite-auto-migrator';

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
        fs.writeFileSync(filepath, content);
    }

    /**
     * Ensures the database path, migrations path, temp path, and schema path are valid and accessible.
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @private
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
        if (!fs.existsSync(this.dbPath)) {
            throw new ValidationError(`Database file not found: ${this.dbPath}`);
        } else {
            try {
                fs.accessSync(this.dbPath, fs.constants.R_OK | fs.constants.W_OK);
            } catch (err) {
                throw new ValidationError(
                    `Database file is not readable/writable: ${this.dbPath}`,
                    { cause: err },
                );
            }
        }
        if (!fs.existsSync(this.migrationsPath)) {
            fs.mkdirSync(this.migrationsPath);
        }
        try {
            fs.accessSync(this.migrationsPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch (err) {
            throw new ValidationError(
                `Migrations folder is not readable/writable: ${this.migrationsPath}`,
                { cause: err },
            );
        }
        if (!fs.existsSync(this.schemaPath)) {
            throw new ValidationError(`Schema file not found: ${this.schemaPath}`);
        } else {
            try {
                fs.accessSync(this.schemaPath, fs.constants.R_OK);
            } catch (err) {
                throw new ValidationError(`Schema file is not readable: ${this.schemaPath}`, {
                    cause: err,
                });
            }
        }
    }
}
