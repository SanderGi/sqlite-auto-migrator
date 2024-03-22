'use strict';

import sqlite3 from 'sqlite3';
import { prettifySqlite3Error } from './errors.mjs';

/**
 * Promise-based wrapper around the callback-based node-sqlite3 bindings.
 */
export default class Database {
    static #privateConstructor = Symbol('private constructor');

    /**
     * Stores the database connection.
     * @private
     * @param {sqlite3.Database} db the database connection
     */
    constructor(db, key) {
        if (key !== Database.#privateConstructor) {
            throw new Error(
                'Database constructor is private. Please use Database.connect() instead.',
            );
        }
        this.db = db;
    }

    /**
     * Connects to a database file.
     * @param {string} filename the path to the database file. Use ':memory:' for an in-memory database and '' for a temporary on-disk database.
     * @param {number} [mode=sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX] the mode to open the database in. One or more of sqlite3.OPEN_READONLY, sqlite3.OPEN_READWRITE, sqlite3.OPEN_CREATE, sqlite3.OPEN_FULLMUTEX, sqlite3.OPEN_URI, sqlite3.OPEN_SHAREDCACHE, sqlite3.OPEN_PRIVATECACHE. The default value is OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX.
     * @returns {Promise<Database>} a promise that resolves to a Database instance connected to the database file
     * @throws {Error} if the database cannot be opened
     * @see {@link sqlite3.Database}
     */
    static async connect(
        filename,
        mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX,
    ) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(filename, mode, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve(new Database(db, Database.#privateConstructor));
                }
            });
        });
    }

    /**
     * Loads a SQLite extension.
     * @param {string} path the path to the compiled SQLite extension
     * @returns {Promise<void>} a promise that resolves when the extension has been loaded
     * @throws {Error} if the extension cannot be loaded
     * @see {@link sqlite3.Database#loadExtension}
     */
    async loadExtension(path) {
        return new Promise((resolve, reject) => {
            this.db.loadExtension(path, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Runs a SQL query with optional parameters.
     * @param {string} sql the SQL query to run
     * @param {any[]} [params] the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<RunResult>} a promise that resolves to a {@link sqlite3.RunResult} object with a `lastID` property and a `changes` property representing the id of the last INSERTed row and the number of UPDATEd/DELETEd rows respectively.
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#run}
     */
    async run(sql, ...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.db.run(sql, ...params, function (err) {
                if (err) {
                    prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    /**
     * Gets a single row from a SQL query with optional parameters.
     * @param {string} sql the SQL query to run
     * @param {any[]} [params] the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Object | undefined>} a promise that resolves to the first row returned by the query
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#get}
     */
    async get(sql, ...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.db.get(sql, ...params, (err, row) => {
                if (err) {
                    prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Gets all rows from a SQL query with optional parameters.
     * @param {string} sql the SQL query to run
     * @param {any[]} [params] the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Object[]>} a promise that resolves to all rows returned by the query
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#all}
     */
    async all(sql, ...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.db.all(sql, ...params, (err, rows) => {
                if (err) {
                    prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Runs all SQL queries in the supplied string up to the first NULL byte. If a query fails, no subsequent statements will be executed.
     * @param {string} sql the SQL queries to run
     * @returns {Promise<void>} a promise that resolves when all queries have been executed
     * @throws {Error} if any query cannot be run
     * @see {@link sqlite3.Database#exec}
     */
    async exec(sql) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.db.exec(sql, err => {
                if (err) {
                    prettifySqlite3Error(err, sql, [], stackReference);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Runs a SQL query with optional parameters and returns the rows one by one as an async generator (useful for saving memory with large query results).
     * @param {string} sql the SQL query to run
     * @param {any[]} [params] the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {AsyncGenerator<Object, void, undefined>} an async generator that yields each row returned by the query
     * @throws {Error} if the query cannot be run
     * @example <caption>Using the async generator</caption>
     * const db = await Database.connect(':memory:');
     * for await (const row of db.each('SELECT * FROM users')) {
     *    console.log(row);
     * }
     * await db.close();
     * @see {@link sqlite3.Database#each}
     */
    each(sql, ...params) {
        const stackReference = new Error();
        const promises = [];
        let resolve, reject;
        promises.push(
            new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            }),
        );
        this.db.each(
            sql,
            ...params,
            (err, row) => {
                // called for each row
                if (err) {
                    prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve([row, false]);
                }
                promises.push(
                    new Promise((res, rej) => {
                        resolve = res;
                        reject = rej;
                    }),
                );
            },
            err => {
                // called when done
                if (err) {
                    prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve([null, true]);
                }
            },
        );
        return (async function* () {
            for (let i = 0; ; i++) {
                const [val, done] = await promises[i];
                if (done) break;
                delete promises[i];
                yield val;
            }
        })();
    }

    /**
     * Prepares a SQL query with parameters and returns a prepared statement.
     * @param {string} sql the SQL query to prepare
     * @param {any[]} [params] the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Statement>} a promise that resolves to a {@link Statement} object representing the prepared statement
     * @throws {Error} if the query cannot be prepared
     * @see {@link sqlite3.Database#prepare}
     */
    async prepare(sql, ...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql, params, err => {
                if (err) {
                    prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(new Statement(stmt));
                }
            });
        });
    }

    /**
     * Closes the database connection.
     * @returns {Promise<void>} a promise that resolves when the database connection has been closed
     * @throws {Error} if the database connection cannot be closed
     * @see {@link sqlite3.Database#close}
     */
    async close() {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.db.close(err => {
                if (err) {
                    prettifySqlite3Error(err, '.quit', [], stackReference);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

/**
 * Represents a prepared statement. Async wrapper around the sqlite3.Statement class.
 */
class Statement {
    /**
     * Stores the prepared statement.
     * @private should be created with `Database#prepare` instead
     * @param {sqlite3.Statement} stmt the prepared statement
     */
    constructor(stmt) {
        this.stmt = stmt;
    }

    /**
     * Binds parameters to the prepared statement. Completely resets the row cursor and removes any previously bound parameters.
     * @param {any[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<void>} a promise that resolves when the parameters have been bound
     * @throws {Error} if the parameters cannot be bound
     * @see {@link sqlite3.Statement#bind}
     */
    async bind(...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.stmt.bind(...params, err => {
                if (err) {
                    prettifySqlite3Error(err, 'bind()', params, stackReference);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Resets the row cursor so the prepared statement can be executed again with the same bound parameters.
     * @returns {Promise<void>} a promise that resolves when the prepared statement has been reset
     * @throws {Error} if the prepared statement cannot be reset
     * @see {@link sqlite3.Statement#reset}
     */
    async reset() {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.stmt.reset(err => {
                if (err) {
                    prettifySqlite3Error(err, 'reset()', [], stackReference);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Finalizes the prepared statement, releasing any resources it holds.
     * Typically optional unless you are experiencing long delays before the next query is executed.
     * @returns {Promise<void>} a promise that resolves when the prepared statement has been finalized
     * @throws {Error} if the prepared statement cannot be finalized
     */
    async finalize() {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.stmt.finalize(err => {
                if (err) {
                    prettifySqlite3Error(err, 'finalize()', [], stackReference);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Runs the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {any[]} [params] the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<RunResult>} a promise that resolves to a {@link sqlite3.RunResult} object with a `lastID` property and a `changes` property
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#run}
     */
    async run(...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.stmt.run(...params, function (err) {
                if (err) {
                    prettifySqlite3Error(err, 'run()', params, stackReference);
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    /**
     * Gets a single row from the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {any[]} [params] the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Object | undefined>} a promise that resolves to the first row returned by the prepared statement
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#get}
     */
    async get(...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.stmt.get(...params, (err, row) => {
                if (err) {
                    prettifySqlite3Error(err, 'get()', params, stackReference);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Gets all rows from the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {any[]} [params] the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Object[]>} a promise that resolves to all rows returned by the prepared statement
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#all}
     */
    async all(...params) {
        const stackReference = new Error();
        return new Promise((resolve, reject) => {
            this.stmt.all(...params, (err, rows) => {
                if (err) {
                    prettifySqlite3Error(err, 'all()', params, stackReference);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Runs the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied) and returns the rows one by one as an async generator (useful for saving memory with large query results).
     * @param {any[]} [params] the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {AsyncGenerator<Object, void, undefined>} an async generator that yields each row returned by the prepared statement
     * @throws {Error} if the prepared statement cannot be run
     * @example <caption>Using the async generator</caption>
     * const stmt = await db.prepare('SELECT * FROM users');
     * for await (const row of stmt.each()) {
     *   console.log(row);
     * }
     * await stmt.finalize();
     * @see {@link sqlite3.Statement#each}
     */
    each(...params) {
        const stackReference = new Error();
        const promises = [];
        let resolve, reject;
        promises.push(
            new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            }),
        );
        this.stmt.each(
            ...params,
            (err, row) => {
                // called for each row
                if (err) {
                    prettifySqlite3Error(err, 'each()', params, stackReference);
                    reject(err);
                } else {
                    resolve([row, false]);
                }
                promises.push(
                    new Promise((res, rej) => {
                        resolve = res;
                        reject = rej;
                    }),
                );
            },
            err => {
                // called when done
                if (err) {
                    prettifySqlite3Error(err, 'each()', params, stackReference);
                    reject(err);
                } else {
                    resolve([null, true]);
                }
            },
        );
        return (async function* () {
            for (let i = 0; ; i++) {
                const [val, done] = await promises[i];
                if (done) break;
                delete promises[i];
                yield val;
            }
        })();
    }
}
