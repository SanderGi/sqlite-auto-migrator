import { describe, it, before, beforeEach, mock } from 'node:test'; // read about the builtin Node.js test framework here: https://nodejs.org/docs/latest-v18.x/api/test.html
import assert from 'node:assert';

import events from 'node:events';
events.setMaxListeners(0); // Disable the max listener warning since it happens in the node:test internals

import readline from 'node:readline';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { Migrator } from '../lib/migrator.mjs';
import { Database } from '../lib/database.mjs';

const VALID_OPTIONS = {
    dbPath: path.join(__dirname, 'test.db'),
    migrationsPath: path.join(__dirname, 'valid_migrations'),
    migrationsTable: 'migrations',
    schemaPath: path.join(__dirname, 'schemas/schema.sql'),
    hideWarnings: true,
};

const OTHER_VALID_OPTIONS = {
    ...VALID_OPTIONS,
    migrationsPath: path.join(__dirname, 'valid_migrations_other'),
};

const INVALID_OPTIONS = {
    ...VALID_OPTIONS,
    migrationsPath: path.join(__dirname, 'invalid_migrations'),
};

const FOREIGN_KEY_VIOLATION_OPTIONS = {
    ...VALID_OPTIONS,
    migrationsPath: path.join(__dirname, 'foreign_key_violation_migration'),
};

const DECLARATIVE_DIFFING_OPTIONS = {
    ...VALID_OPTIONS,
    migrationsPath: path.join(__dirname, 'migrations'),
    onlyTrackAmbiguousState: true,
};

const MAKE_OPTIONS = {
    ...VALID_OPTIONS,
    migrationsPath: path.join(__dirname, 'migrations'),
};

const CLEAR_DB = `
    PRAGMA writable_schema = 1;
    DELETE FROM sqlite_master;
    PRAGMA writable_schema = 0;
    VACUUM;
`;

await describe('Migrator', () => {
    // Mock the migrate/make methods to suppress output
    const originalMigrate = Migrator.prototype.migrate;
    Migrator.prototype.migrate = mock.fn(Migrator.prototype.migrate, async function (target) {
        return originalMigrate.call(this, target, {}, () => {});
    });
    const originalMake = Migrator.prototype.make;
    Migrator.prototype.make = mock.fn(Migrator.prototype.make, async function (options) {
        return originalMake.call(this, options, () => {});
    });

    describe('constructor', () => {
        before(async () => {
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            await db.exec(CLEAR_DB);
            await db.close();
        });

        it('should throw an error if the database file is not found', () => {
            assert.throws(() => new Migrator({ ...VALID_OPTIONS, dbPath: 'invalid.db' }));
        });

        it('should throw an error if the schema file is not found', () => {
            assert.throws(() => new Migrator({ ...VALID_OPTIONS, schemaPath: 'invalid.sql' }));
        });

        it('should work with valid options', () => {
            assert.doesNotThrow(() => new Migrator(VALID_OPTIONS));
        });

        it('should not allow anonymous disk databases', () => {
            assert.throws(() => new Migrator({ ...VALID_OPTIONS, dbPath: '' }));
        });

        it('should not allow anonymous memory databases', () => {
            assert.throws(() => new Migrator({ ...VALID_OPTIONS, dbPath: ':memory:' }));
        });

        it('should not allow a directory as a database', () => {
            assert.throws(() => new Migrator({ ...VALID_OPTIONS, dbPath: '.' }));
        });

        it('should not create the migrations folder if it does not exist', () => {
            fs.rmSync(MAKE_OPTIONS.migrationsPath, { recursive: true, force: true });
            assert.doesNotThrow(() => new Migrator(MAKE_OPTIONS));
            assert.ok(!fs.existsSync(MAKE_OPTIONS.migrationsPath));
        });

        it('should load a config file if provided', () => {
            const configPath = path.join(__dirname, '.samrc');
            const migrator = new Migrator({ configPath });
            assert.strictEqual(migrator.dbPath, path.resolve(VALID_OPTIONS.dbPath));
            assert.strictEqual(migrator.migrationsPath, path.resolve(VALID_OPTIONS.migrationsPath));
            assert.strictEqual(migrator.migrationsTable, VALID_OPTIONS.migrationsTable);
            assert.strictEqual(migrator.schemaPath, path.resolve(VALID_OPTIONS.schemaPath));
            assert.strictEqual(migrator.configPath, configPath);
        });
    });

    describe('one branch migrate()', () => {
        /** @type {Migrator} */
        let migrator;
        beforeEach(async () => {
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            await db.exec(CLEAR_DB);
            await db.close();
            migrator = new Migrator(VALID_OPTIONS);
        });

        it('should start out in a test environment with an empty database', async () => {
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const sqlmaster = await db.all('SELECT * FROM sqlite_master');
            assert.strictEqual(sqlmaster.length, 0);
            assert.rejects(db.get('SELECT * FROM migrations'));
            await db.close();
        });

        it('should create the migrations table if it does not exist and schema changes are made', async () => {
            await migrator.migrate('0000');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 1);
            await db.close();
        });

        it('should be able to apply a migration', async () => {
            await migrator.migrate('0000');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].id, '0000');
            assert.strictEqual(rows[0].name, 'sample_migration');
            assert.strictEqual(
                rows[0].content_hash,
                'c453a51fa18b84da6fafca10dee56aef521457c6d93c3ee7b0888ae177e2adad',
            );
            assert.strictEqual(
                rows[0].content,
                fs.readFileSync(
                    path.join(VALID_OPTIONS.migrationsPath, '0000_sample_migration.mjs'),
                    'utf8',
                ),
            );
            await db.run('SELECT * FROM sample_table');
            await db.close();
        });

        it('should be able to undo a migration', async () => {
            await migrator.migrate('0000');
            await migrator.migrate('zero');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 0);
            assert.rejects(db.get('SELECT * FROM sample_table'));
            await db.close();
        });

        it('should be a no-op if the database is already at the target migration', async () => {
            await migrator.migrate('0000');
            await migrator.migrate('0000');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 1);
            await db.close();
        });

        it('should be able to apply persistent pragmas', async () => {
            await migrator.migrate('0001');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const { journal_mode } = await db.get('PRAGMA journal_mode');
            assert.strictEqual(journal_mode.toLowerCase(), 'wal');
            await db.close();
        });

        it('should be able to rollback persistent pragmas', async () => {
            await migrator.migrate('0001');
            await migrator.migrate('zero');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const { journal_mode } = await db.get('PRAGMA journal_mode');
            assert.strictEqual(journal_mode.toLowerCase(), 'delete');
            await db.close();
        });

        it('should keep track of all pragmas including non-persistent ones', async () => {
            await migrator.migrate('0001');
            const { pragmas } = await migrator.status();
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            for (const [pragma, value] of Object.entries(pragmas)) {
                await db.run(`PRAGMA ${pragma} = ${value}`);
            }
            const { journal_mode } = await db.get('PRAGMA journal_mode');
            const { foreign_keys } = await db.get('PRAGMA foreign_keys');
            assert.strictEqual(journal_mode.toLowerCase(), 'wal');
            assert.strictEqual(foreign_keys, 1);
            await db.close();
        });

        it('should be able to apply multiple migrations', async () => {
            await migrator.migrate('0003');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 4);
            await db.run('SELECT * FROM sample_table');
            await db.run('SELECT * FROM users');
            await db.run('SELECT * FROM foreignkeytousers');
            await db.run('SELECT * FROM users_view');
            await db.close();
        });

        it('should be able to undo multiple migrations', async () => {
            await migrator.migrate('0003');
            await migrator.migrate('0000');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 1);
            await db.run('SELECT * FROM sample_table');
            assert.rejects(db.get('SELECT * FROM users'));
            assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            assert.rejects(db.get('SELECT * FROM users_view'));
            await db.close();
        });

        it('should be able to migrate to the latest version', async () => {
            await migrator.migrate();
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 7);
            await db.run('SELECT * FROM sample_table');
            await db.run('SELECT * FROM users');
            await db.run('SELECT * FROM foreignkeytousers');
            await db.run('SELECT * FROM users_view');
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 1);
            const triggers = await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'");
            assert.strictEqual(triggers.length, 1);
            await db.close();
        });

        it('should be able to undo all migrations', async () => {
            await migrator.migrate();
            await migrator.migrate('zero');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 0);
            assert.rejects(db.get('SELECT * FROM sample_table'));
            assert.rejects(db.get('SELECT * FROM users'));
            assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            assert.rejects(db.get('SELECT * FROM users_view'));
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 0);
            const triggers = await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'");
            assert.strictEqual(triggers.length, 0);
            await db.close();
        });

        it('should throw a ValidationError if the target migration does not exist', async () => {
            await assert.rejects(migrator.migrate('invalid'), { name: 'ValidationError' });
            await assert.rejects(migrator.migrate('0007'), { name: 'ValidationError' });
            await assert.rejects(migrator.migrate('-0001'), { name: 'ValidationError' });
        });
    });

    describe('branch change migrate()', () => {
        beforeEach(async () => {
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            await db.exec(CLEAR_DB);
            await db.close();
        });

        it('should migrate to latest correctly after migration folder changes', async () => {
            const migrator = new Migrator(VALID_OPTIONS);
            const otherMigrator = new Migrator(OTHER_VALID_OPTIONS);

            await migrator.migrate();
            const db_temp = await Database.connect(VALID_OPTIONS.dbPath);
            await db_temp.run('INSERT INTO sample_table (id, name) VALUES (1, "test")');
            await db_temp.close();
            await otherMigrator.migrate();

            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const migrations = await db.all('SELECT * FROM migrations');
            assert.strictEqual(migrations.length, 3);
            const rows = await db.all('SELECT * FROM renamed');
            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].identifier, 1);
            assert.strictEqual(rows[0].name, 'test');
            assert.rejects(db.get('SELECT * FROM users'));
            assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            assert.rejects(db.get('SELECT * FROM users_view'));
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 0);
            const triggers = await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'");
            assert.strictEqual(triggers.length, 0);
            const { journal_mode } = await db.get('PRAGMA journal_mode');
            assert.strictEqual(journal_mode.toLowerCase(), 'delete');

            await db.close();
        });

        it('should be able to undo all migrations after migration folder changes', async () => {
            const migrator = new Migrator(VALID_OPTIONS);
            const otherMigrator = new Migrator(OTHER_VALID_OPTIONS);

            await migrator.migrate();
            await otherMigrator.migrate('zero');

            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 0);
            assert.rejects(db.get('SELECT * FROM sample_table'));
            assert.rejects(db.get('SELECT * FROM users'));
            assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            assert.rejects(db.get('SELECT * FROM users_view'));
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 0);
            const triggers = await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'");
            assert.strictEqual(triggers.length, 0);
            await db.close();
        });

        it('should throw a ValidationError if the target migration does not exist after migration folder changes', async () => {
            const migrator = new Migrator(VALID_OPTIONS);
            const otherMigrator = new Migrator(OTHER_VALID_OPTIONS);

            await migrator.migrate();
            await assert.rejects(otherMigrator.migrate('invalid'), { name: 'ValidationError' });
            await assert.rejects(otherMigrator.migrate('0003'), { name: 'ValidationError' });
            await assert.rejects(otherMigrator.migrate('-0001'), { name: 'ValidationError' });
        });
    });

    describe('migrate() with invalid migrations', () => {
        beforeEach(async () => {
            const db = await Database.connect(INVALID_OPTIONS.dbPath);
            await db.exec(CLEAR_DB);
            await db.close();
        });

        it('should rollback if an error occurs while applying migrations', async () => {
            const migrator = new Migrator(INVALID_OPTIONS);
            await assert.rejects(migrator.migrate(), { name: 'RolledBackTransaction' });

            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const migrationTableExists = await db.all(
                'SELECT * FROM sqlite_master WHERE type = "table" AND name = "migrations"',
            );
            assert.strictEqual(migrationTableExists.length, 0);
            assert.rejects(db.get('SELECT * FROM sample_table'));
            assert.rejects(db.get('SELECT * FROM users'));
            assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            assert.rejects(db.get('SELECT * FROM users_view'));
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 0);
            const triggers = await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'");
            assert.strictEqual(triggers.length, 0);
            await db.close();
        });

        it('should rollback if an error occurs while undoing migrations', async () => {
            const migrator = new Migrator(INVALID_OPTIONS);
            await migrator.migrate('0001');
            await assert.rejects(migrator.migrate('zero'), { name: 'RolledBackTransaction' });
        });

        it('should throw an IntegrityError on foreign_key violation', async () => {
            const migrator = new Migrator(FOREIGN_KEY_VIOLATION_OPTIONS);
            await assert.rejects(migrator.migrate('0000'), { name: 'IntegrityError' });
        });
    });

    describe('make()', () => {
        beforeEach(async () => {
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            await db.exec(CLEAR_DB);
            await db.close();

            fs.rmSync(MAKE_OPTIONS.migrationsPath, { recursive: true, force: true });
            fs.mkdirSync(MAKE_OPTIONS.migrationsPath);
        });

        it('should create the migrations folder if it does not exist and schema changes are made', async () => {
            fs.rmSync(MAKE_OPTIONS.migrationsPath, { recursive: true, force: true });

            const migrator = new Migrator(MAKE_OPTIONS);
            await migrator.make();

            assert.ok(fs.existsSync(MAKE_OPTIONS.migrationsPath));
        });

        it('should be able to create a migration file for one table', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const files = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(files.length, 1);
        });

        it('should create a working up migration for one table', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users');
            assert.strictEqual(rows.length, 0);
        });

        it('should create a working down migration for one table', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();
            await migrator.migrate('zero');
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            assert.rejects(db.get('SELECT id, name, age FROM users'));
        });

        it('should not do anything if there are no changes to the schema', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/empty.sql'),
            });
            await migrator.make();
            const files = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(files.length, 0);

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator2.make();
            await migrator2.make();
            const files2 = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(files2.length, 1);
        });

        it('should create a migration file that errors if createIfNoChanges is true and no changes are made', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/empty.sql'),
            });
            await migrator.make({ createIfNoChanges: true });
            const files = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(files.length, 1);
            await assert.rejects(() => migrator.migrate(), { name: 'RolledBackTransaction' });
        });

        it('should handle a column rename', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_column_rename.sql'),
            });
            await migrator2.make({ onRename: Migrator.PROCEED });
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, username, age FROM users');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should handle a column rename via prompt', async t => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_column_rename.sql'),
            });
            t.mock.method(readline, 'createInterface', () => {
                return {
                    question: (_, callback) => {
                        callback('y');
                    },
                    close: () => {},
                };
            });
            await migrator2.make({ onRename: Migrator.PROMPT });
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, username, age FROM users');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should handle skipping a column rename', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_column_rename.sql'),
            });
            await migrator2.make({ onRename: Migrator.SKIP, onDestructiveChange: Migrator.SKIP });
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should handle skipping a column rename and then requiring manual migration for the column add/remove via prompt', async t => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_column_rename.sql'),
            });
            let count = 0;
            t.mock.method(readline, 'createInterface', () => {
                return {
                    question: (_, callback) => {
                        callback(count++ === 0 ? 'n' : 'm');
                    },
                    close: () => {},
                };
            });
            await assert.rejects(
                migrator2.make({
                    onRename: Migrator.PROMPT,
                    onDestructiveChange: Migrator.PROMPT,
                    createOnManualMigration: true,
                }),
                { name: 'ManualMigrationRequired' },
            );
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, username, age FROM users');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should throw a ValidationError on invalid actions', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_column_rename.sql'),
            });
            await assert.rejects(migrator2.make({ onRename: 'adjwaoidjawodjaiodjadaj' }), {
                name: 'ValidationError',
            });
        });

        it('should handle a table rename', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_rename.sql'),
            });
            await migrator2.make({ onRename: Migrator.PROCEED });
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users_renamed');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should handle throwing a ManualMigrationRequired error on table rename if specified', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_rename.sql'),
            });
            await assert.rejects(
                migrator2.make({
                    onRename: Migrator.REQUIRE_MANUAL_MIGRATION,
                    createOnManualMigration: true,
                }),
                {
                    name: 'ManualMigrationRequired',
                },
            );

            // migration file should still be created
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users_renamed');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should handle changing a column type', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_change_column_type.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });

        it('should handle changing primary key', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_primarykey_change.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users');
            assert.strictEqual(rows.length, 0);
            const info = await db.all(`PRAGMA table_info(users)`);
            for (const columnInfo of info) {
                if (columnInfo.name === 'name') assert(columnInfo.pk > 0);
                else if (columnInfo.name === 'age') assert(columnInfo.pk > 0);
                if (columnInfo.name === 'id') assert(columnInfo.pk === 0);
            }
            await db.close();
        });

        it('should handle multiple tables with foreign keys', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema.sql'),
            });
            await migrator.make();
            await migrator.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            await db.run('PRAGMA foreign_keys = ON');
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            await db.run('INSERT INTO foreignkeytousers (id, user_id) VALUES (1, 1)');
            await assert.rejects(
                db.run('INSERT INTO foreignkeytousers (id, user_id) VALUES (2, 2)'),
            );
            await db.close();
        });

        it('should handle many migration files adding views, triggers, indices, and virtual tables', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema2_add_view.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows.length, 0);
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            const rows2 = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows2.length, 1);
            assert.strictEqual(rows2[0].id, 1);
            assert.strictEqual(rows2[0].name, 'test');
            await db.close();

            const migrator3 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema3_add_index.sql'),
            });
            await migrator3.make();
            await migrator3.migrate();
            const db2 = await Database.connect(MAKE_OPTIONS.dbPath);
            const indexes = await db2.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 1);
            assert.strictEqual(indexes[0].name, 'users_name_index');
            await db2.close();

            const migrator4 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema4_add_trigger.sql'),
            });
            await migrator4.make();
            await migrator4.migrate();
            const db3 = await Database.connect(MAKE_OPTIONS.dbPath);
            await db3.run('INSERT INTO users (id, name, age) VALUES (2, "test", 20)');
            const rows3 = await db3.all('SELECT * FROM users ORDER BY id ASC');
            assert.strictEqual(rows3.length, 3);
            assert.strictEqual(rows3[2].name, 'trigger');
            await db3.close();

            const migrator5 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema5_add_virtual_table.sql'),
            });
            await migrator5.make();
            await migrator5.migrate();
            const db4 = await Database.connect(MAKE_OPTIONS.dbPath);
            const tables = await db4.all(
                'SELECT name FROM sqlite_master WHERE type = "table" AND name LIKE "users_fts%"',
            );
            assert.strictEqual(tables.length, 6);
            await db4.close();
        });

        it('should handle many changes with fewer migrations', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema2_add_view.sql'),
            });
            await migrator.make();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema5_add_virtual_table.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();

            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows.length, 0);
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            const rows2 = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows2.length, 2);
            assert.strictEqual(rows2[0].id, 1);
            assert.strictEqual(rows2[0].name, 'test');
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 1);
            assert.strictEqual(indexes[0].name, 'users_name_index');
            await db.run('INSERT INTO users (id, name, age) VALUES (3, "test", 20)');
            const rows3 = await db.all('SELECT * FROM users ORDER BY id ASC');
            assert.strictEqual(rows3.length, 4);
            assert.strictEqual(rows3[3].name, 'trigger');
            const tables = await db.all(
                'SELECT name FROM sqlite_master WHERE type = "table" AND name LIKE "users_fts%"',
            );
            assert.strictEqual(tables.length, 6);
            await db.close();
        });

        it('should handle down migrations for many changes', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema2_add_view.sql'),
            });
            await migrator.make();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema5_add_virtual_table.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();

            await migrator2.migrate('0000');
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows.length, 0);
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            const rows2 = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows2.length, 1);
            assert.strictEqual(rows2[0].id, 1);
            assert.strictEqual(rows2[0].name, 'test');
            const tables = await db.all(
                'SELECT name FROM sqlite_master WHERE type = "table" AND name LIKE "users_fts%"',
            );
            assert.strictEqual(tables.length, 0);
            await db.close();

            await migrator.migrate('zero');
            const db2 = await Database.connect(MAKE_OPTIONS.dbPath);
            assert.rejects(db2.get('SELECT * FROM users_view'));
            assert.rejects(db2.get('SELECT * FROM users'));
            assert.rejects(db2.get('SELECT * FROM foreignkeytousers'));
            assert.rejects(db2.get('SELECT * FROM users_fts'));
            await db2.close();
        });

        it('should handle one big down migration', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema5_add_virtual_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();
            await migrator.migrate('zero');
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            await assert.rejects(db.get('SELECT * FROM users_view'));
            await assert.rejects(db.get('SELECT * FROM users'));
            await assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            await assert.rejects(db.get('SELECT * FROM users_fts'));
            await db.close();
        });

        it('should treat case changes as renames when ignoreNameCase is not set to true', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema5_add_virtual_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema6.5_name_case_changes.sql'),
            });
            await migrator2.make({
                onRename: Migrator.PROCEED,
                onDestructiveChange: Migrator.PROCEED,
            });
            const migrationFiles = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(migrationFiles.length, 2);
            await migrator2.migrate();

            await migrator2.make({ createIfNoChanges: true });
            await assert.rejects(migrator2.migrate());

            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows.length, 0);
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            const rows2 = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows2.length, 2);
            assert.strictEqual(rows2[0].id, 1);
            assert.strictEqual(rows2[0].name, 'test');
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 1);
            assert.strictEqual(indexes[0].name, 'users_Name_index');
            await db.run('INSERT INTO users (id, name, age) VALUES (3, "test", 20)');
            const rows3 = await db.all('SELECT * FROM users ORDER BY id ASC');
            assert.strictEqual(rows3.length, 4);
            assert.strictEqual(rows3[3].name, 'trigger');
            const tables = await db.all(
                'SELECT name FROM sqlite_master WHERE type = "table" AND name LIKE "users_fts%"',
            );
            assert.strictEqual(tables.length, 6);
            assert.strictEqual(tables[0].name, 'uSErs_fts_data');
            const views = await db.all('SELECT name FROM sqlite_master WHERE type = "view"');
            assert.strictEqual(views.length, 1);
            assert.strictEqual(views[0].name, 'users_View');
            const all_tables = await db.all(
                'SELECT name, sql FROM sqlite_master WHERE type = "table"',
            );
            assert(all_tables.some(row => row.name === 'useRs'));
            const foreignkeytousers = await db.all('PRAGMA table_info(foreignkeytousers)');
            assert(foreignkeytousers.some(row => row.name === 'uSer_id'));
            await db.close();
        });

        it('should not treat formatting changes as schema changes', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                ignoreNameCase: true,
                schemaPath: path.join(__dirname, 'schemas/schema5_add_virtual_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                ignoreNameCase: true,
                schemaPath: path.join(__dirname, 'schemas/schema6_obfuscated.sql'),
            });
            await migrator2.make();
            const migrationFiles = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(migrationFiles.length, 1);

            await migrator2.make({ createIfNoChanges: true });
            await assert.rejects(migrator2.migrate());

            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows.length, 0);
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            const rows2 = await db.all('SELECT * FROM users_view');
            assert.strictEqual(rows2.length, 2);
            assert.strictEqual(rows2[0].id, 1);
            assert.strictEqual(rows2[0].name, 'test');
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes.length, 1);
            assert.strictEqual(indexes[0].name, 'users_name_index');
            await db.run('INSERT INTO users (id, name, age) VALUES (3, "test", 20)');
            const rows3 = await db.all('SELECT * FROM users ORDER BY id ASC');
            assert.strictEqual(rows3.length, 4);
            assert.strictEqual(rows3[3].name, 'trigger');
            const tables = await db.all(
                'SELECT name FROM sqlite_master WHERE type = "table" AND name LIKE "users_fts%"',
            );
            assert.strictEqual(tables.length, 6);
            await db.close();
        });

        it('should handle removing a table', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await assert.rejects(
                migrator2.make({
                    onDestructiveChange: Migrator.REQUIRE_MANUAL_MIGRATION,
                    createOnManualMigration: true,
                }),
                {
                    name: 'ManualMigrationRequired',
                },
            );
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            assert.rejects(db.get('SELECT * FROM foreignkeytousers'));
            await db.all('SELECT * FROM users');
            await db.close();
        });

        it('should not allow modifying the migrations table', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/migrations_table.sql'),
            });
            await assert.rejects(migrator.make(), { name: 'ValidationError' });
        });

        it('should allow modifying a view by removing and readding it', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema2_add_view.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/schema2.5_modify_view.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();

            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            await db.all('SELECT id, name, age FROM users_view');
            await db.close();
        });

        it('should allow skipping a table remove', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/empty.sql'),
            });
            await migrator2.make({ onDestructiveChange: Migrator.SKIP });
            await migrator2.migrate();
            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            await db.all('SELECT * FROM users');
            await db.close();
        });

        it('should require Manual Migration to add a NOT NULL column without default value', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(
                    __dirname,
                    'schemas/one_table_add_notnull_without_default.sql',
                ),
            });
            await assert.rejects(migrator2.make(), { name: 'ManualMigrationRequired' });
            await migrator2.migrate();
        });

        it('should work on a table with rows in it', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const db = await Database.connect(MAKE_OPTIONS.dbPath);
            await db.run('INSERT INTO users (id, name, age) VALUES (1, "test", 20)');
            await db.run('INSERT INTO users (id, name, age) VALUES (2, "test", 22)');
            await db.close();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_change_column_type.sql'),
            });
            await migrator2.make();
            await migrator2.migrate();

            const db2 = await Database.connect(MAKE_OPTIONS.dbPath);
            await db2.all('SELECT * FROM users');
            await db2.close();

            await migrator2.migrate('zero');
        });

        it('should not create a manual migration if createOnManualMigration is false', async () => {
            const migrator = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const migrator2 = new Migrator({
                ...MAKE_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/empty.sql'),
            });
            await assert.rejects(
                migrator2.make({
                    onDestructiveChange: Migrator.REQUIRE_MANUAL_MIGRATION,
                    createOnManualMigration: false,
                }),
                {
                    name: 'ManualMigrationRequired',
                },
            );
            const files = fs.readdirSync(MAKE_OPTIONS.migrationsPath);
            assert.strictEqual(files.length, 1);
        });
    });

    describe('status()', () => {
        it('should return the current migration status', async () => {
            const migrator = new Migrator(VALID_OPTIONS);
            await migrator.migrate('zero');
            const status = await migrator.status();
            assert.strictEqual(status.current_id, 'zero');
            assert.strictEqual(status.extra_migrations.length, 0);
            assert.strictEqual(status.missing_migrations.length, 7);

            await migrator.migrate('0003');
            const status2 = await migrator.status();
            assert.strictEqual(status2.current_id, '0003');
            assert.strictEqual(status2.extra_migrations.length, 0);
            assert.strictEqual(status2.missing_migrations.length, 3);

            await migrator.migrate('0006');
            const status3 = await migrator.status();
            assert.strictEqual(status3.current_id, '0006');
            assert.strictEqual(status3.extra_migrations.length, 0);
            assert.strictEqual(status3.missing_migrations.length, 0);

            const migrator2 = new Migrator(OTHER_VALID_OPTIONS);
            const status4 = await migrator2.status();
            assert.strictEqual(status4.current_id, '0006');
            assert.strictEqual(status4.extra_migrations.length, 6);
            assert.strictEqual(status4.missing_migrations.length, 2);
        });
    });

    describe('declarative diffing with onlyTrackAmbiguousState=true', () => {
        beforeEach(async () => {
            if (process.platform == 'win32') {
                const db = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
                await db.exec(CLEAR_DB);
                await db.close();
            } else {
                fs.rmSync(DECLARATIVE_DIFFING_OPTIONS.dbPath, { force: true });
            }
            fs.rmSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath, {
                recursive: true,
                force: true,
            });
            fs.writeFileSync(DECLARATIVE_DIFFING_OPTIONS.dbPath, '');
        });

        it('should not create a migrations table/folder with an empty schema', async () => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/empty.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));
            const db = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = "table"');
            assert.strictEqual(tables.length, 0);
        });

        it('should not create a migrations table/files with an empty schema even if the migrations folder already exists', async () => {
            fs.mkdirSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath);

            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/empty.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            const files = fs.readdirSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath);
            assert.strictEqual(files.length, 0);
            const db = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = "table"');
            assert.strictEqual(tables.length, 0);
        });

        it('should not create migrations table/files when the database starts from the empty schema', async () => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/main.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));
            const db = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = "table"');
            assert.strictEqual(tables.length, 1);
            assert.strictEqual(tables[0].name, 'users');
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes[0].name, 'mail');
        });

        it('should work without make() call', async () => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/main.sql'),
            });
            await migrator.migrate();

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));
            const db = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = "table"');
            assert.strictEqual(tables.length, 1);
            assert.strictEqual(tables[0].name, 'users');
            const indexes = await db.all('PRAGMA index_list(users)');
            assert.strictEqual(indexes[0].name, 'mail');
        });

        it('should work with multiple databases', async () => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/sessions.sql'),
            });
            await migrator.migrate('latest', {
                onRename: Migrator.REQUIRE_MANUAL_MIGRATION,
                onDestructiveChange: Migrator.REQUIRE_MANUAL_MIGRATION,
                onChangedView: Migrator.REQUIRE_MANUAL_MIGRATION,
                onChangedIndex: Migrator.PROCEED,
                onChangedTrigger: Migrator.PROCEED,
            });

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));

            const dbPath2 = path.join(__dirname, 'other.db');
            const migrator2 = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/main.sql'),
                dbPath: dbPath2,
                createDBIfMissing: true,
            });
            await migrator2.migrate('latest', {
                onRename: Migrator.REQUIRE_MANUAL_MIGRATION,
                onDestructiveChange: Migrator.REQUIRE_MANUAL_MIGRATION,
                onChangedView: Migrator.REQUIRE_MANUAL_MIGRATION,
                onChangedIndex: Migrator.PROCEED,
                onChangedTrigger: Migrator.PROCEED,
            });

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));

            const db1 = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
            const rows1 = await db1.all('SELECT * FROM sessions');
            assert.strictEqual(rows1.length, 0);
            await db1.close();

            const db2 = await Database.connect(dbPath2);
            const rows2 = await db2.all('SELECT * FROM users');
            assert.strictEqual(rows2.length, 0);
            await db2.close();
            fs.rmSync(dbPath2);
        });

        it('should require manual migration on table renames if make() is not called', async () => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.migrate();

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));

            const migrator2 = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_rename.sql'),
            });
            await assert.rejects(migrator2.migrate(), { name: 'RolledBackTransaction' });

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));
        });

        it('should require manual migration on column renames if make() is not called', async () => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.migrate();

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));

            const migrator2 = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_column_rename.sql'),
            });
            await assert.rejects(migrator2.migrate(), { name: 'RolledBackTransaction' });

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));
        });

        it('should allow renames with make()', async t => {
            const migrator = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table.sql'),
            });
            await migrator.make();
            await migrator.migrate();

            assert.ok(!fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));

            const migrator2 = new Migrator({
                ...DECLARATIVE_DIFFING_OPTIONS,
                schemaPath: path.join(__dirname, 'schemas/one_table_rename.sql'),
            });
            t.mock.method(readline, 'createInterface', () => {
                return {
                    question: (_, callback) => {
                        callback('y');
                    },
                    close: () => {},
                };
            }); // mock the prompt as a yes
            await migrator2.make();

            assert.ok(fs.existsSync(DECLARATIVE_DIFFING_OPTIONS.migrationsPath));

            await migrator2.migrate();

            const db = await Database.connect(DECLARATIVE_DIFFING_OPTIONS.dbPath);
            const rows = await db.all('SELECT id, name, age FROM users_renamed');
            assert.strictEqual(rows.length, 0);
            await db.close();
        });
    });
});
