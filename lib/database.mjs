// import sqlite3 from 'sqlite3';
/** @typedef {import('sqlite3')} sqlite3 */
/** @type {sqlite3} */
let sqlite3 = {};
if (!process.versions.bun) {
    sqlite3 = await import('sqlite3').then(mod => mod.default); // only import sqlite3 if not running in bun
}

/**
 * @typedef {Object} RunResult
 * @property {number} lastID the id of the last INSERTed row
 * @property {number} changes the number of affected rows in the most recent UPDATE/DELETE query
 */

/**
 * Prettify sqlite3 error.
 * @param {Error} err sqlite3 error to prettify
 * @param {string} sql sql that caused the error
 * @param {Array|Object} params parameters used in the sql
 * @param {Error} stackReference stack reference to use
 * @effect modifies err to include the sql and params and a stack trace relative to stackReference
 */
function prettifySqlite3Error(err, sql, params, stackReference) {
    stackReference.message = err.message;
    const stack = stackReference.stack.split('\n');
    stack[1] = stack[1]
        .replace('at', 'in')
        .replace(
            /\s\(.*\)/,
            params ? `("${sql}", ${JSON.stringify(params)})` : sql ? `("${sql}")` : '()',
        );
    err.stack = stack.join('\n');
    err.sql = sql;
    err.params = params;
}

// used to prevent other files from creating Database/Statement instances
const privateConstructor = Symbol('private constructor');

/**
 * Promise-based wrapper around the callback-based node-sqlite3 bindings.
 */
export class Database {
    static OPEN_READONLY = sqlite3.OPEN_READONLY;
    static OPEN_READWRITE = sqlite3.OPEN_READWRITE;
    static OPEN_CREATE = sqlite3.OPEN_CREATE;
    static OPEN_FULLMUTEX = sqlite3.OPEN_FULLMUTEX;
    static OPEN_URI = sqlite3.OPEN_URI;
    static OPEN_SHAREDCACHE = sqlite3.OPEN_SHAREDCACHE;
    static OPEN_PRIVATECACHE = sqlite3.OPEN_PRIVATECACHE;

    /**
     * Stores the database connection.
     * @private
     * @param {sqlite3.Database} db the database connection
     * @param {boolean} verbose whether to print verbose error messages with stack traces and sql/params
     */
    constructor(db, verbose, key) {
        if (key !== privateConstructor) {
            throw new Error(
                'Database constructor is private. Please use Database.connect() instead.',
            );
        }
        this.db = db;
        this.verbose = verbose;
    }

    /**
     * Connects to a database file.
     * @param {string} filename the path to the database file. Use ':memory:' for an in-memory database and '' for a temporary on-disk database.
     * @param {number} [mode=Database.OPEN_READWRITE | Database.OPEN_CREATE | Database.OPEN_FULLMUTEX] the mode to open the database in. One or more of Database.OPEN_READONLY, Database.OPEN_READWRITE, Database.OPEN_CREATE, Database.OPEN_FULLMUTEX, Database.OPEN_URI, Database.OPEN_SHAREDCACHE, Database.OPEN_PRIVATECACHE. The default value is OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX.
     * @param {boolean} [verbose=true] whether to print verbose error messages with stack traces and sql/params
     * @returns {Promise<Database>} a promise that resolves to a Database instance connected to the database file
     * @throws {Error} if the database cannot be opened
     * @see {@link sqlite3.Database}
     */
    static async connect(
        filename,
        mode = Database.OPEN_READWRITE | Database.OPEN_CREATE | Database.OPEN_FULLMUTEX,
        verbose = true,
    ) {
        const stackReference = verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(filename, mode, err => {
                if (err) {
                    if (verbose) prettifySqlite3Error(err, filename, null, stackReference);
                    reject(err);
                } else {
                    resolve(new Database(db, verbose, privateConstructor));
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
        const stackReference = this.verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.db.loadExtension(path, err => {
                if (err) {
                    if (this.verbose) prettifySqlite3Error(err, path, null, stackReference);
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
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<RunResult>} a promise that resolves to a {@link RunResult} object with a `lastID` property and a `changes` property representing the id of the last INSERTed row and the number of UPDATEd/DELETEd rows respectively.
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#run}
     */
    async run(sql, ...params) {
        const verbose = this.verbose;
        const stackReference = verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.db.run(sql, ...params, function (err) {
                if (err) {
                    if (verbose) prettifySqlite3Error(err, sql, params, stackReference);
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
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @template [Row=any] - the type of the row object that is returned
     * @returns {Promise<Row | undefined>} a promise that resolves to the first row returned by the query or undefined if no rows are returned
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#get}
     */
    async get(sql, ...params) {
        const stackReference = this.verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.db.get(sql, ...params, (err, row) => {
                if (err) {
                    if (this.verbose) prettifySqlite3Error(err, sql, params, stackReference);
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
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @template [Row=any] - the type of the row object that is returned
     * @returns {Promise<Row[]>} a promise that resolves to all rows returned by the query
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#all}
     */
    async all(sql, ...params) {
        const stackReference = this.verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.db.all(sql, ...params, (err, rows) => {
                if (err) {
                    if (this.verbose) prettifySqlite3Error(err, sql, params, stackReference);
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
        const stackReference = this.verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.db.exec(sql, err => {
                if (err) {
                    if (this.verbose) prettifySqlite3Error(err, sql, null, stackReference);
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
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @template [Row=any] - the type of the row object that is returned
     * @returns {AsyncGenerator<Row, void, unknown>} an async generator that yields each row returned by the query
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
        const stackReference = this.verbose ? new Error() : null;
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
                    if (this.verbose) prettifySqlite3Error(err, sql, params, stackReference);
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
                    if (this.verbose) prettifySqlite3Error(err, sql, params, stackReference);
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
     * @param {Params | Params[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @template [Row=any] - the type of the row object that is returned
     * @template {any[] | Object} [Params=any] - the type of the parameters that can be bound to the prepared statement
     * @returns {Promise<Statement<Row, Params>} a promise that resolves to a {@link Statement} object representing the prepared statement
     * @throws {Error} if the query cannot be prepared
     * @see {@link sqlite3.Database#prepare}
     */
    async prepare(sql, ...params) {
        const stackReference = this.verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql, params, err => {
                if (err) {
                    if (this.verbose) prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(new Statement(stmt, this.verbose ? sql : null, privateConstructor));
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
        const stackReference = this.verbose ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.db.close(err => {
                if (err) {
                    if (this.verbose) prettifySqlite3Error(err, null, null, stackReference);
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
 * @template [Row=any] - the type of the row object that is returned
 * @template {any[] | Object} [Params=any[]] - the type of the parameters that can be bound to the prepared statement
 */
export class Statement {
    /**
     * Stores the prepared statement.
     * @private should be created with `Database#prepare` instead
     * @param {sqlite3.Statement} stmt the prepared statement
     * @param {string|null} sql the SQL query that was prepared if verbose error messages are enabled, otherwise null
     */
    constructor(stmt, sql, key) {
        if (key !== privateConstructor) {
            throw new Error(
                'Statement constructor is private. Please use Database#prepare() instead.',
            );
        }
        this.stmt = stmt;
        this.sql = sql;
    }

    /**
     * Binds parameters to the prepared statement. Completely resets the row cursor and removes any previously bound parameters.
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<void>} a promise that resolves when the parameters have been bound
     * @throws {Error} if the parameters cannot be bound
     * @see {@link sqlite3.Statement#bind}
     */
    async bind(...params) {
        const stackReference = this.sql ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.stmt.bind(...params, err => {
                if (err) {
                    if (this.sql) prettifySqlite3Error(err, this.sql, params, stackReference);
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
        const stackReference = this.sql ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.stmt.reset(err => {
                if (err) {
                    if (this.sql) prettifySqlite3Error(err, this.sql, null, stackReference);
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
        const stackReference = this.sql ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.stmt.finalize(err => {
                if (err) {
                    if (this.sql) prettifySqlite3Error(err, this.sql, null, stackReference);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Runs the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<RunResult>} a promise that resolves to a {@link RunResult} object with a `lastID` property and a `changes` property
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#run}
     */
    async run(...params) {
        const sql = this.sql;
        const stackReference = sql ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.stmt.run(...params, function (err) {
                if (err) {
                    if (sql) prettifySqlite3Error(err, sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    /**
     * Gets a single row from the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Row | undefined>} a promise that resolves to the first row returned by the prepared statement or undefined if no rows are returned
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#get}
     */
    async get(...params) {
        const stackReference = this.sql ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.stmt.get(...params, (err, row) => {
                if (err) {
                    if (this.sql) prettifySqlite3Error(err, this.sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Gets all rows from the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Row[]>} a promise that resolves to all rows returned by the prepared statement
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#all}
     */
    async all(...params) {
        const stackReference = this.sql ? new Error() : null;
        return await new Promise((resolve, reject) => {
            this.stmt.all(...params, (err, rows) => {
                if (err) {
                    if (this.sql) prettifySqlite3Error(err, this.sql, params, stackReference);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Runs the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied) and returns the rows one by one as an async generator (useful for saving memory with large query results).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {AsyncGenerator<Row, void, undefined>} an async generator that yields each row returned by the prepared statement
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
        const stackReference = this.sql ? new Error() : null;
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
                    if (this.sql) prettifySqlite3Error(err, this.sql, params, stackReference);
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
                    if (this.sql) prettifySqlite3Error(err, this.sql, params, stackReference);
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

// Use bun:sqlite if running in bun
/* node:coverage disable */
if (process.versions.bun) {
    const fs = await import('fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    const BunDB = await import('bun:sqlite').then(({ Database }) => Database);
    const OldDatabase = Database;
    Database = class DB extends OldDatabase {
        constructor(db, mode, verbose, key, tmpdir = undefined) {
            super(db, verbose, key);
            this.mode = mode;
            this.tmpdir = tmpdir;
        }

        static async connect(
            filename,
            mode = Database.OPEN_READWRITE | Database.OPEN_CREATE | Database.OPEN_FULLMUTEX,
            verbose = true,
        ) {
            let dir;
            if (filename === '') {
                // create a temporary on-disk database
                dir = await fs.mkdtemp((await fs.realpath(os.tmpdir())) + path.sep);
                filename = path.join(dir, 'temp.db');
            }
            const db = new BunDB(filename, { create: true });
            return new Database(db, mode, verbose, privateConstructor, dir);
        }

        async run(sql, ...params) {
            const query = this.db.query(sql);
            const res = query.run(...params);
            query.finalize();
            return { lastID: res.lastInsertRowid, changes: res.changes };
        }

        async get(sql, ...params) {
            const query = this.db.query(sql);
            const res = query.get(...params);
            query.finalize();
            return res;
        }

        async all(sql, ...params) {
            const query = this.db.query(sql);
            const res = query.all(...params);
            query.finalize();
            return res;
        }

        async exec(sql) {
            this.db.exec(sql);
        }

        each(sql, ...params) {
            const rowsPromise = this.all(sql, ...params);
            return (async function* () {
                const rows = await rowsPromise;
                for (const row of rows) {
                    yield row;
                }
            })();
        }

        async prepare(sql, ...params) {
            return new Statement(this.db.query(sql), sql, params, privateConstructor);
        }

        async close() {
            this.db.close();
            if (this.tmpdir) {
                await fs.rm(this.tmpdir, { recursive: true });
            }
        }
    };
    const OldStatement = Statement;
    Statement = class Stmt extends OldStatement {
        constructor(stmt, sql, params, key) {
            super(stmt, sql, key);
            this.params = params;
        }

        async bind(...params) {
            this.params = params;
        }

        async reset() {
            this.params = [];
        }

        async finalize() {
            this.stmt.finalize();
        }

        async run(...params) {
            if (params.length) {
                this.params = params;
            }
            const res = this.stmt.run(...this.params);
            return { lastID: res.lastInsertRowid, changes: res.changes };
        }

        async get(...params) {
            if (params.length) {
                this.params = params;
            }
            return this.stmt.get(...this.params);
        }

        async all(...params) {
            if (params.length) {
                this.params = params;
            }
            return this.stmt.all(...this.params);
        }

        each(...params) {
            const rowsPromise = this.all(...params);
            return (async function* () {
                const rows = await rowsPromise;
                for (const row of rows) {
                    yield row;
                }
            })();
        }
    };
}
/* node:coverage enable */
