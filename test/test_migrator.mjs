'use strict';

import { describe, it, before, beforeEach, after } from 'node:test'; // read about the builtin Node.js test framework here: https://nodejs.org/docs/latest-v18.x/api/test.html
import assert from 'node:assert';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import Migrator from '../lib/migrator.mjs';
import Database from '../lib/database.mjs';

const VALID_OPTIONS = {
    dbPath: path.join(__dirname, 'test.db'),
    migrationsPath: path.join(__dirname, 'valid_migrations'),
    migrationsTable: 'migrations',
    schemaPath: path.join(__dirname, 'schemas/schema.sql'),
};

const CLEAR_DB = `
    PRAGMA writable_schema = 1;
    DELETE FROM sqlite_master;
    PRAGMA writable_schema = 0;
    VACUUM;
`;

describe('Migrator', () => {
    describe('constructor', () => {
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
                '246fcee34835a0d5fca30be2d9250d5b96be9f8512a361def3746ae03d557a4b',
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
    });
});
