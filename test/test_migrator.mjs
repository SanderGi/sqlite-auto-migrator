import { describe, it, before, beforeEach } from 'node:test'; // read about the builtin Node.js test framework here: https://nodejs.org/docs/latest-v18.x/api/test.html
import assert from 'node:assert';

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

const CLEAR_DB = `
    PRAGMA writable_schema = 1;
    DELETE FROM sqlite_master;
    PRAGMA writable_schema = 0;
    VACUUM;
`;

describe('Migrator', () => {
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

        it('should create the migrations table if it does not exist', async () => {
            await migrator.migrate('zero');
            const db = await Database.connect(VALID_OPTIONS.dbPath);
            const rows = await db.all('SELECT * FROM migrations');
            assert.strictEqual(rows.length, 0);
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
});
