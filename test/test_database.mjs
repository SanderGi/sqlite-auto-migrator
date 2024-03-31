import { describe, it, before, beforeEach, after } from 'node:test'; // read about the builtin Node.js test framework here: https://nodejs.org/docs/latest-v18.x/api/test.html
import assert from 'node:assert';

import sqlite3 from 'sqlite3';
import { Database } from '../lib/database.mjs';

describe('Database', () => {
    describe('connect', () => {
        it('should be able to connect to an in-memory database', async () => {
            const db = await Database.connect(':memory:');
            assert(db instanceof Database);
            await db.close();
        });

        it('should be able to connect to a file database', async () => {
            const db = await Database.connect('./test/test.db');
            assert(db instanceof Database);
            await db.close();
        });

        it('should be able to connect to an anonymous disk database', async () => {
            const db = await Database.connect('');
            assert(db instanceof Database);
            await db.close();
        });
    });

    describe('run', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect(':memory:');
        });
        after(async () => {
            await db.close();
        });

        beforeEach(async () => {
            await db.run('DROP TABLE IF EXISTS test');
            await db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        });

        it('should be able to run a simple SQL command', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [{ id: 1, name: 'test' }]);
        });

        it('should be able to run a multiple SQL commands', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });

        it('should be able to run a SQL command with multiple parameters', async () => {
            await db.run('INSERT INTO test (id, name) VALUES (?, ?)', 2, 'test');
            await db.run('INSERT INTO test (id, name) VALUES (?, ?)', [3, 'test2']);
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 2, name: 'test' },
                { id: 3, name: 'test2' },
            ]);
        });

        it('should be able to set PRAGMAs', async () => {
            await db.run('PRAGMA foreign_keys = ON');
            const row = await db.get('PRAGMA foreign_keys');
            assert.strictEqual(row['foreign_keys'], 1);
        });

        it('should be able to commit a transaction', async () => {
            await db.run('BEGIN TRANSACTION');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('COMMIT TRANSACTION');
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [{ id: 1, name: 'test' }]);
        });

        it('should be able to rollback a transaction', async () => {
            await db.run('BEGIN TRANSACTION');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('ROLLBACK TRANSACTION');
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, []);
        });

        it('should return the lastID property', async () => {
            const { lastID } = await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            assert.strictEqual(lastID, 1);
        });

        it('should return the changes property on UPDATE/DELETE', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            const { changes } = await db.run('DELETE FROM test WHERE name = ?', 'test');
            assert.strictEqual(changes, 1);
        });
    });

    describe('get', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect('./test/test.db');
        });
        after(async () => {
            await db.close();
        });

        beforeEach(async () => {
            await db.run('DROP TABLE IF EXISTS test');
            await db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        });

        it('should be able to get a single row', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            const row = await db.get('SELECT * FROM test');
            assert.deepStrictEqual(row, { id: 1, name: 'test' });
        });

        it('should be able to get a single row with parameters', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            const row = await db.get('SELECT * FROM test WHERE name = ?', 'test');
            assert.deepStrictEqual(row, { id: 1, name: 'test' });
        });

        it('should be able to get one of many rows with key-value parameters', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const row = await db.get('SELECT * FROM test WHERE name = :name', { ':name': 'test2' });
            assert.deepStrictEqual(row, { id: 2, name: 'test2' });
        });

        it('should return undefined if no rows are found', async () => {
            const row = await db.get('SELECT * FROM test');
            assert.strictEqual(row, undefined);
        });
    });

    describe('all', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect('');
        });
        after(async () => {
            await db.close();
        });

        beforeEach(async () => {
            await db.run('DROP TABLE IF EXISTS test');
            await db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        });

        it('should be able to get all rows', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });

        it('should be able to get all rows with parameters', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = await db.all('SELECT * FROM test WHERE name = ?', 'test2');
            assert.deepStrictEqual(rows, [{ id: 2, name: 'test2' }]);
        });

        it('should be able to get all rows with key-value parameters', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = await db.all('SELECT * FROM test WHERE name = $name', {
                $name: 'test2',
            });
            assert.deepStrictEqual(rows, [{ id: 2, name: 'test2' }]);
        });

        it('should return an empty array if no rows are found', async () => {
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, []);
        });
    });

    describe('each', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect(':memory:');
        });
        after(async () => {
            await db.close();
        });

        beforeEach(async () => {
            await db.run('DROP TABLE IF EXISTS test');
            await db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        });

        it('should be able to iterate over all rows', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = [];
            for await (const row of db.each('SELECT * FROM test')) {
                rows.push(row);
            }
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });

        it('should be able to iterate over all rows with parameters', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = [];
            for await (const row of db.each('SELECT * FROM test WHERE name = ?', 'test2')) {
                rows.push(row);
            }
            assert.deepStrictEqual(rows, [{ id: 2, name: 'test2' }]);
        });

        it('should be able to iterate over all rows with key-value parameters', async () => {
            await db.run('INSERT INTO test (name) VALUES (?)', 'test');
            await db.run('INSERT INTO test (name) VALUES (?)', 'test2');
            const rows = [];
            for await (const row of db.each('SELECT * FROM test WHERE name = @name', {
                '@name': 'test2',
            })) {
                rows.push(row);
            }
            assert.deepStrictEqual(rows, [{ id: 2, name: 'test2' }]);
        });

        it('should not iterate over any rows if no rows are found', async () => {
            for await (const _ of db.each('SELECT * FROM test')) {
                assert.fail('should not iterate over any rows');
            }
        });
    });

    describe('exec', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect('./test/test.db');
        });
        after(async () => {
            await db.close();
        });

        it('should be able to execute a multi-statement SQL command', async () => {
            const schema = `
                CREATE TABLE IF NOT EXISTS test (
                    id INTEGER PRIMARY KEY,
                    name TEXT
                );

                INSERT INTO test (name) VALUES ('test');
                INSERT INTO test (name) VALUES ('test2');
            `;
            await db.exec(schema);
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });
    });

    describe('prepare', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect(':memory:');
        });
        after(async () => {
            await db.close();
        });

        beforeEach(async () => {
            await db.run('DROP TABLE IF EXISTS test');
            await db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        });

        it('should be able to prepare a statement', async () => {
            const stmt = await db.prepare('INSERT INTO test (name) VALUES (?)');
            await stmt.run('test');
            await stmt.run('test2');
            await stmt.finalize();
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });

        it('should be able to prepare a statement with multiple parameters', async () => {
            const stmt = await db.prepare('INSERT INTO test (id, name) VALUES (?, ?)');
            await stmt.run(1, 'test');
            await stmt.run(2, 'test2');
            await stmt.finalize();
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });

        it('should be able to bind and reset a statement', async () => {
            const stmt = await db.prepare('INSERT INTO test (name) VALUES (?)');
            await stmt.bind('test');
            await stmt.run();
            await stmt.reset();
            await stmt.run();
            await stmt.finalize();
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test' },
            ]);
        });

        it('should be able to bind with key-value parameters', async () => {
            const stmt = await db.prepare('INSERT INTO test (name) VALUES (@name)');
            await stmt.bind({ '@name': 'test' });
            await stmt.run();
            await stmt.finalize();
            const rows = await db.all('SELECT * FROM test');
            assert.deepStrictEqual(rows, [{ id: 1, name: 'test' }]);
        });

        it('should work with each()', async () => {
            const stmt = await db.prepare('INSERT INTO test (name) VALUES (?)');
            await stmt.run('test');
            await stmt.run('test2');
            await stmt.finalize();
            const rows = [];
            const eachStmt = await db.prepare('SELECT * FROM test');
            for await (const row of eachStmt.each()) {
                rows.push(row);
            }
            await eachStmt.finalize();
            assert.deepStrictEqual(rows, [
                { id: 1, name: 'test' },
                { id: 2, name: 'test2' },
            ]);
        });
    });

    describe('loadExtension', () => {
        /** @type {Database} */
        let db;
        before(async () => {
            db = await Database.connect(':memory:');
        });
        after(async () => {
            await db.close();
        });

        it('should be able to load the crypto extension correctly', async () => {
            await db.loadExtension('./test/crypto');
            const row = await db.get('SELECT SHA1("test") AS hash');
            assert.deepEqual(
                row['hash'],
                Buffer.from('a94a8fe5ccb19ba61c4c0873d391e987982fbbd3', 'hex'),
            );
        });
    });

    describe('errors', () => {
        it('should not allow calling the constructor directly', () => {
            assert.throws(() => new Database());
            assert.throws(() => new Database(''));
            assert.throws(() => new Database(':memory:'));
            assert.throws(() => new Database('./test/test.db'));
        });

        it('should error when write operations made on a read-only database', async () => {
            const db = await Database.connect('./test/test.db', sqlite3.OPEN_READONLY);
            await assert.rejects(db.run('INSERT INTO test (name) VALUES (?)', 'test'));
            await assert.rejects(db.exec('UPDATE test SET name = "test"'));
            await db.close();
        });

        it('should error when calling get(), all(), prepare(), or each() on a non-existent table', async () => {
            const db = await Database.connect(':memory:');
            await assert.rejects(db.get('SELECT * FROM test'));
            await assert.rejects(db.all('SELECT * FROM test'));
            await assert.rejects(db.prepare('SELECT * FROM test'));
            await assert.rejects(async () => {
                for await (const _ of db.each('SELECT * FROM test')) {
                    assert.fail('should not iterate over any rows');
                }
            });
            await db.close();
        });

        it('should fail to connect to a non-existent file when not using the `OPEN_CREATE` flag', async () => {
            await assert.rejects(Database.connect('./test/nonexistent.db', sqlite3.OPEN_READONLY));
        });

        it('should error when trying to load a non-existent extension', async () => {
            const db = await Database.connect(':memory:');
            await assert.rejects(db.loadExtension('nonexistent'));
            await db.close();
        });
    });
});
