/* eslint-disable */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { ManualMigrationRequired, ValidationError } = require('./errors.mjs');
const { setDifference } = require('./diff.mjs');
const { parsePragmas, getTables } = require('./parse.mjs');
const Database = require('./database.mjs');

/** @typedef {{'PROMPT'|'REQUIRE_MANUAL_MIGRATION'|'PROCEED'|'SKIP'}} Action */

/**
 * The options for the migrator.
 * @typedef {Object} MigrationOptions
 * @property {string | undefined} dbPath Path to the SQLite db file. Default is `path.join(process.cwd(), 'data.db')`
 * @property {string | undefined} migrationsPath Path to the migrations folder. Default is `path.join(process.cwd(), 'migrations')`
 * @property {string | undefined} migrationTable Name of the table to store migration information in. Default is `migrations`
 * @property {string | undefined} schemaPath Path to the schema file. Default is `path.join(process.cwd(), 'schema.sql')`
 */

/**
 * A class to manage migrations for a SQLite database.
 */
class Migrator {
    /** You'll be prompted via the commandline for how to proceed. */
    PROMPT = 'PROMPT';
    /** A {@link ManualMigrationRequired} error is thrown. */
    REQUIRE_MANUAL_MIGRATION = 'REQUIRE_MANUAL_MIGRATION';
    /** Automatically respond yes to the prompt. */
    PROCEED = 'PROCEED';
    /** Automatically respond no to the prompt. */
    SKIP = 'SKIP';
    // /** Automatically create a duplicate table/view/trigger/index. */
    // CREATE_DUPLICATE = 'CREATE_DUPLICATE';

    /**
     * @param {MigrationOptions} options the options for the migrator {@link MigrationOptions}
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     */
    constructor(options) {
        this.dbPath = options.dbPath ?? path.join(process.cwd(), 'data.db');
        this.migrationsPath = options.migrationsPath ?? path.join(process.cwd(), 'migrations');
        this.schemaPath = options.schemaPath ?? path.join(process.cwd(), 'schema.sql');
        this.migrationTable = options.migrationTable ?? 'migrations';

        this.#validateOptions();
    }

    /**
     * Creates a new migration file that when applied will bring the latest migration file state to that of the current schema. If no changes are needed, this is a no-op.
     * @param {Action} onRename How to handle autodetected column/table renames. Default is `migrator.PROMPT`
     * @param {Action} onDestructiveChange How to handle irreversible changes like dropping tables/columns. Default is `migrator.PROMPT`
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     */
    async make(onRename = this.PROMPT, onDestructiveChange = this.PROMPT) {
        this.#validateOptions();

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const prompt = query => new Promise(resolve => rl.question(query, resolve));

        let manualMigrationReasons = []; // if we detect a rename/destructive change that we can't handle automatically, we'll append the reason(s) here
        try {
            const oldDB = Database.connect('');
            const newDB = Database.connect('');

            const migrationFiles = fs.readdirSync(this.migrationsPath).sort();
            const schema = fs.readFileSync(this.schemaPath, 'utf8');

            await Promise.all(
                this.#applyMigrations(oldDB, migrationFiles),
                this.#applySchema(newDB, schema),
            );

            const oldTables = await getTables(oldDB);
            const newTables = await getTables(newDB);

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
        } catch (err) {
            manualMigrationReasons.push(err.message);
        } finally {
            rl.close();
            oldDB.close();
            newDB.close();
        }

        if (manualMigrationReasons.length > 0) {
            throw new ManualMigrationRequired(manualMigrationReasons.join('\n\n'), {
                cause: manualMigrationReasons,
            });
        }
    }

    /**
     * Migrates the database state to the given target. Automatically figures out if the migrations
     * in the migration folder have changed (e.g. changed git branch) and undoes and reapplies migrations as necessary.
     * @param {string} target The migration to set the database state to, e.g. "0001", "zero" or "latest" (default).
     * @throws an appropriate {@link ValidationError} if the options are invalid.
     * @throws an appropriate {@link ManualMigrationRequired} if a manual migration is required.
     */
    async migrate(target) {
        this.#validateOptions();

        const db = new sqlite3.Database(this.dbPath);

        db.close();
    }

    /**
     * Apply the migrations to the given database.
     * @private
     * @param {import('sqlite3').Database} db the database connection to run the migrations on
     * @param {string[]} migrationFiles the names of the migration files to run
     */
    async #applyMigrations(db, migrationFiles) {
        db.serialize(() => {
            for (const file of migrationFiles) {
                const { up } = require(path.join(this.migrationsPath, file));
                up(db);
            }
        });
    }

    /**
     * Undo the migrations on the given database.
     * @private
     * @param {import('sqlite3').Database} db the database connection to undo the migrations on
     * @param {string[]} migrationFiles the names of the migration files to undo
     */
    async #undoMigrations(db, migrationFiles) {
        db.serialize(() => {
            for (const file of migrationFiles) {
                const { down } = require(path.join(this.migrationsPath, file));
                down(db);
            }
        });
    }

    /**
     * Apply the given schema to the given database.
     * @private
     * @param {import('sqlite3').Database} db the database connection to apply the schema to
     * @param {string} schema the schema (string with semi-colon separated DDL SQL statements) to apply
     */
    async #applySchema(db, schema) {
        await new Promise((resolve, reject) => {
            db.exec(schema, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * @throws an appropriate {@link ValidationError} if the options are invalid.
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

module.exports = Migrator;
