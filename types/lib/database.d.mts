/**
 * Promise-based wrapper around the callback-based node-sqlite3 bindings.
 */
export class Database {
    static OPEN_READONLY: any;
    static OPEN_READWRITE: any;
    static OPEN_CREATE: any;
    static OPEN_FULLMUTEX: any;
    static OPEN_URI: any;
    static OPEN_SHAREDCACHE: any;
    static OPEN_PRIVATECACHE: any;
    /**
     * Connects to a database file.
     * @param {string} filename the path to the database file. Use ':memory:' for an in-memory database and '' for a temporary on-disk database.
     * @param {number} [mode=Database.OPEN_READWRITE | Database.OPEN_CREATE | Database.OPEN_FULLMUTEX] the mode to open the database in. One or more of Database.OPEN_READONLY, Database.OPEN_READWRITE, Database.OPEN_CREATE, Database.OPEN_FULLMUTEX, Database.OPEN_URI, Database.OPEN_SHAREDCACHE, Database.OPEN_PRIVATECACHE. The default value is OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX.
     * @param {boolean} [verbose=true] whether to print verbose error messages with stack traces and sql/params
     * @returns {Promise<Database>} a promise that resolves to a Database instance connected to the database file
     * @throws {Error} if the database cannot be opened
     * @see {@link sqlite3.Database}
     */
    static connect(filename: string, mode?: number, verbose?: boolean): Promise<Database>;
    /**
     * Stores the database connection.
     * @private
     * @param {sqlite3.Database} db the database connection
     * @param {boolean} verbose whether to print verbose error messages with stack traces and sql/params
     */
    private constructor();
    db: sqlite3.Database;
    verbose: boolean;
    /**
     * Loads a SQLite extension.
     * @param {string} path the path to the compiled SQLite extension
     * @returns {Promise<void>} a promise that resolves when the extension has been loaded
     * @throws {Error} if the extension cannot be loaded
     * @see {@link sqlite3.Database#loadExtension}
     */
    loadExtension(path: string): Promise<void>;
    /**
     * Runs a SQL query with optional parameters.
     * @param {string} sql the SQL query to run
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<RunResult>} a promise that resolves to a {@link RunResult} object with a `lastID` property and a `changes` property representing the id of the last INSERTed row and the number of UPDATEd/DELETEd rows respectively.
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#run}
     */
    run(sql: string, ...params: any[]): Promise<RunResult>;
    /**
     * Gets a single row from a SQL query with optional parameters.
     * @param {string} sql the SQL query to run
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @template [Row=any] - the type of the row object that is returned
     * @returns {Promise<Row | undefined>} a promise that resolves to the first row returned by the query or undefined if no rows are returned
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#get}
     */
    get<Row = any>(sql: string, ...params: any[]): Promise<Row>;
    /**
     * Gets all rows from a SQL query with optional parameters.
     * @param {string} sql the SQL query to run
     * @param {any[]} params the parameters to bind to the query. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @template [Row=any] - the type of the row object that is returned
     * @returns {Promise<Row[]>} a promise that resolves to all rows returned by the query
     * @throws {Error} if the query cannot be run
     * @see {@link sqlite3.Database#all}
     */
    all<Row_1 = any>(sql: string, ...params: any[]): Promise<Row_1[]>;
    /**
     * Runs all SQL queries in the supplied string up to the first NULL byte. If a query fails, no subsequent statements will be executed.
     * @param {string} sql the SQL queries to run
     * @returns {Promise<void>} a promise that resolves when all queries have been executed
     * @throws {Error} if any query cannot be run
     * @see {@link sqlite3.Database#exec}
     */
    exec(sql: string): Promise<void>;
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
    each<Row_2 = any>(sql: string, ...params: any[]): AsyncGenerator<Row_2, void, unknown>;
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
    prepare<Row_3 = any, Params extends unknown = any>(sql: string, ...params: Params | Params[]): Promise<Statement<Row_3, Params>>;
    /**
     * Closes the database connection.
     * @returns {Promise<void>} a promise that resolves when the database connection has been closed
     * @throws {Error} if the database connection cannot be closed
     * @see {@link sqlite3.Database#close}
     */
    close(): Promise<void>;
}
/**
 * Represents a prepared statement. Async wrapper around the sqlite3.Statement class.
 * @template [Row=any] - the type of the row object that is returned
 * @template {any[] | Object} [Params=any[]] - the type of the parameters that can be bound to the prepared statement
 */
export class Statement<Row = any, Params extends unknown = any[]> {
    /**
     * Stores the prepared statement.
     * @private should be created with `Database#prepare` instead
     * @param {sqlite3.Statement} stmt the prepared statement
     * @param {string|null} sql the SQL query that was prepared if verbose error messages are enabled, otherwise null
     */
    private constructor();
    stmt: sqlite3.Statement;
    sql: string;
    /**
     * Binds parameters to the prepared statement. Completely resets the row cursor and removes any previously bound parameters.
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<void>} a promise that resolves when the parameters have been bound
     * @throws {Error} if the parameters cannot be bound
     * @see {@link sqlite3.Statement#bind}
     */
    bind(...params: Params | Params[]): Promise<void>;
    /**
     * Resets the row cursor so the prepared statement can be executed again with the same bound parameters.
     * @returns {Promise<void>} a promise that resolves when the prepared statement has been reset
     * @throws {Error} if the prepared statement cannot be reset
     * @see {@link sqlite3.Statement#reset}
     */
    reset(): Promise<void>;
    /**
     * Finalizes the prepared statement, releasing any resources it holds.
     * Typically optional unless you are experiencing long delays before the next query is executed.
     * @returns {Promise<void>} a promise that resolves when the prepared statement has been finalized
     * @throws {Error} if the prepared statement cannot be finalized
     */
    finalize(): Promise<void>;
    /**
     * Runs the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<RunResult>} a promise that resolves to a {@link RunResult} object with a `lastID` property and a `changes` property
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#run}
     */
    run(...params: Params | Params[]): Promise<RunResult>;
    /**
     * Gets a single row from the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Row | undefined>} a promise that resolves to the first row returned by the prepared statement or undefined if no rows are returned
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#get}
     */
    get(...params: Params | Params[]): Promise<Row | undefined>;
    /**
     * Gets all rows from the prepared statement with the optional bound parameters (overwriting any previously bound parameters when supplied).
     * @param {Params | Params[]} params the parameters to bind to the prepared statement. Supports a dictionary with `:name`, `@name` and `$name` style parameters, or an array with `?` position based parameters.
     * @returns {Promise<Row[]>} a promise that resolves to all rows returned by the prepared statement
     * @throws {Error} if the prepared statement cannot be run
     * @see {@link sqlite3.Statement#all}
     */
    all(...params: Params | Params[]): Promise<Row[]>;
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
    each(...params: Params | Params[]): AsyncGenerator<Row, void, undefined>;
}
export type RunResult = {
    /**
     * the id of the last INSERTed row
     */
    lastID: number;
    /**
     * the number of affected rows in the most recent UPDATE/DELETE query
     */
    changes: number;
};
