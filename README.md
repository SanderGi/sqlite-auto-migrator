# sqlite-auto-migrator

[![LOC](./.badges/lines-of-code.svg)](./.badges/lines-of-code.svg)
[![FileCount](./.badges/file-count.svg)](./.badges/file-count.svg)
[![Tests](./.badges/tests.svg)](./.badges/tests.svg)
[![Coverage](./.badges/coverage.svg)](./.badges/coverage.svg)

Simple automated SQLite database migration tool which works well with CI/CD pipelines and VCS.

Flexible JavaScript-based migration files that can be auto-generated and applied directly via JavaScript or TypeScript:

```js
import { Migrator } from 'sqlite-auto-migrator';
const migrator = new Migrator();

await migrator.make();
await migrator.migrate();
```

Works from the command line too:

```console
$ sam make
$ sam migrate
```

## Installation

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/). [Node.js v18.17.0](https://nodejs.org/en/download/) or higher is recommended.

Installation is done using the
[`npm install`](https://docs.npmjs.com/getting-started/installing-npm-packages-locally) command:

```console
$ npm install sqlite-auto-migrator
```

## Usage

When dealing with synchronizing database state between production, local development and more, you have two things to keep track of: the schema file that contains the desired database state and the database schema state itself.

### Configuration

First specify the path to the schema file with the `SAM_SCHEMA_PATH` environment variable and the path to the database file with `SAM_DB_PATH`. You can set them when running `node` or `sam`:

```console
$ SAM_SCHEMA_PATH=./schema.sql SAM_DB_PATH=./data.db node your_script.js
$ SAM_SCHEMA_PATH=./schema.sql SAM_DB_PATH=./data.db sam help
```

or provide them without the 'SAM\_' prefix in a [.samrc configuration file](test/.samrc):

```json
{
    "SCHEMA_PATH": "./schema.sql",
    "DB_PATH": "./data.db"
}
```

sqlite-auto-migrator will keep track of the operations needed to change the database state to your various schema states through time. These are stored in the `migrations` table and `migrations` folder. You can specify these as `SAM_MIGRATION_TABLE` and `SAM_MIGRATION_PATH` environment variables respectively. You can also provide the config via a JavaScript object as seen in the [JavaScript Migration Management](#javascript-migration-management) section.

### Automatically Make the Database Schema Match the Schema File

The following code will automatically create a migration file if needed (a record of operations to apply to your database to make it match the schema file) and apply it to your database:

```js
import { Migrator } from 'sqlite-auto-migrator';
const migrator = new Migrator();

await migrator.make();
await migrator.migrate();
```

You can add this to your CI/CD pipeline or on application startup to ensure that your database schema is always up to date with your schema file.

You can leave out the `await migrator.make();` line if you only want to apply the migrations and not create new ones. This plays well with a workflow where you create migration files by running `sam make` from the commandline when you are ready to save your schema file changes to the database and then your code auto applies the changes.

sqlite-auto-migrator will automatically figure out if the content of the migration folder has changed and unapply any removed migration files and unapply+reapply modified migration files. By keeping the migration files in version control, you can easily roll back to a previous database state by checking out an older commit.

## Documentation

### JavaScript Migration Management

Start by importing the `Migrator` class and creating a new instance:

```js
import { Migrator } from 'sqlite-auto-migrator';

const migrator = new Migrator(
  {
    /** Path to the SQLite database file. Default is `process.env.SAM_DB_PATH` if provided, otherwise `path.join(process.cwd(), 'data.db')` */
    dbPath?: string;
    /** Path to the migrations folder. Default is `process.env.SAM_MIGRATION_PATH` if provided, otherwise `path.join(process.cwd(), 'migrations')` */
    migrationsPath?: string;
    /** Name of the table to store migration information in. Default is `process.env.SAM_MIGRATIONS_TABLE` if provided, otherwise `migrations` */
    migrationsTable?: string;
    /** Path to the schema file. Default is `process.env.SAM_SCHEMA_PATH` if provided, otherwise `path.join(process.cwd(), 'schema.sql')` */
    schemaPath?: string;
    /** Whether to create a new database file instead of throwing an error if it is missing. Default is true if `process.env.SAM_CREATE_DB_IF_MISSING === 'true'` and false otherwise */
    createDBIfMissing?: boolean;
    /** Path to the configuration file. Default is `process.env.SAM_CONFIG_PATH` if provided, otherwise `path.join(process.cwd(), '.samrc')`. The config file is a json file where the object keys are the same as the environment variables minus the SAM_ prefix. The provided keys act as defaults and are overridden by the environment variables if they exist */
    configPath?: string;
  }
);
```

> Commonjs syntax is not supported. Use `import` instead of `require`.

Then make new migration files (by default, you'll be prompted via the console to confirm renames and destructive changes):

```js
await migrator.make(
  {
    /** How to handle autodetected column/table renames.  Default is `process.env.SAM_ON_RENAME` if provided, otherwise `Migrator.PROMPT` */
    onRename?: Migrator.PROMPT | Migrator.PROCEED | Migrator.SKIP | Migrator.REQUIRE_MANUAL_MIGRATION;
    /** How to handle irreversible changes like dropping tables/columns. Default is `process.env.SAM_ON_DESTRUCTIVE_CHANGE` if provided, otherwise `Migrator.PROMPT` */
    onDestructiveChange?: Migrator.PROMPT | Migrator.PROCEED | Migrator.SKIP | Migrator.REQUIRE_MANUAL_MIGRATION;
    /** How to handle dropped/changed views. Default is `process.env.SAM_ON_CHANGED_VIEW` if provided, otherwise `Migrator.PROCEED` */
    onChangedView?: Migrator.PROMPT | Migrator.PROCEED | Migrator.SKIP | Migrator.REQUIRE_MANUAL_MIGRATION;
    /** How to handle dropped/changed indices. Default is `process.env.SAM_ON_CHANGED_INDEX` if provided, otherwise `Migrator.PROCEED` */
    onChangedIndex?: Migrator.PROMPT | Migrator.PROCEED | Migrator.SKIP | Migrator.REQUIRE_MANUAL_MIGRATION;
    /** How to handle dropped/changed triggers. Default is `process.env.SAM_ON_CHANGED_TRIGGER` if provided, otherwise `Migrator.PROCEED` */
    onChangedTrigger?: Migrator.PROMPT | Migrator.PROCEED | Migrator.SKIP | Migrator.REQUIRE_MANUAL_MIGRATION;
    /** Whether to create a new migration file even if no changes are needed. Default is true if `process.env.SAM_CREATE_IF_NO_CHANGES === 'true'` and false otherwise */
    createIfNoChanges?: boolean;
  },
  /** a function to log progress messages through. Default is `process.stdout.write` */
  log?: Function
);
```

> All table, index, view, trigger, and virtual table operations are supported, however custom extensions are not. If you need to use a custom extension, you'll have to manually edit the migration files.

Finally, apply the migrations:

```js
await migrator.migrate(
  /** The migration to set the database state to, e.g. "0001", "zero" or "latest" (default) */
  target?: string,
  /** a function to log progress messages through. Default is `process.stdout.write` */
  log?: Function
);
```

> Either all the migrations are applied or they are rolled back and a RolledBackTransaction error is thrown. This is to ensure that the database is always in a consistent state.

Check the status of the migrations and database:

```js
const status = await migrator.status();
```

> This returns a [`Status`](types/lib/migrator.d.mts) object. You can use the `status.pragmas` object to apply any non-persisted pragmas to your database connection.

### Command Line Interface

```console
$ sam help
```

To see a list of available commands and options including all the 'SAM\_' environment variables you can set.

```console
$ sam status [--no-output]
```

Prints a message to the console showing the current migration, the migrations that have yet to be applied, and whether there have been changes made between the schema file and migration files.

```console
$ sam make [--no-output]
```

Creates a new migration file in the migrations folder that when applied with `sam migrate` will bring the database state to match the schema file.

```console
$ sam migrate [--no-output] [<target migration>]
```

Applies the unapplied migrations in the migrations folder up to the target migration. If no target migration is provided, all unapplied migrations are applied. Also unapplies any migrations that have been removed from the migrations folder. The target migration can be the migration id or one of the following special values: `zero`, `latest`. If no target migration is provided, the default is `latest`. If the target migration is `zero`, all migrations are unapplied.

> Note: The target migration must be the last argument if provided.

### Understanding Migration Files

Each migration file represents a database state. In most cases, you will automatically create the migration files using the `make` function. However, you can also create/tweak them manually. They are written in JavaScript to allow flexibility in the sort of operations they perform. Checkout this [sample migration](test/valid_migrations/0000_sample_migration.mjs). All a migration file is, is a script that exports an `up` and `down` function and a `PRAGMAS` object. The `up` function is run in a transaction with deferred foreign key constraints and takes care of bringing the database from the state of the previous migration file to that of this migration file. The `down` function undoes the changes made by the `up` function. The `PRAGMAS` object is used to specify the pragmas associated with this database state. The `PRAGMAS` object is optional and can be empty if no pragmas need to be set. The naming convention for migration files is `id_name.mjs` where `id` is a zero-padded number and `name` can be any descriptive name. The `id` is used to order the migrations and the `name` is largely ignored and only used for display purposes so you are free to change it.

### Asynchronous Database Wrapper

The migration functions `up` and `down` get access to a `Database` instance which is a promise based wrapper around the callback based [sqlite3](https://www.npmjs.com/package/sqlite3) library. You can also import the `Database` class and instantiate it in your own scripts:

```js
import { Database } from 'sqlite-auto-migrator';

const db = await Database.connect('path/to/database.db');
```

You can use it to run queries:

```js
const rows = await db.all('SELECT * FROM table');
```

Insert rows (and get the last inserted row id):

```js
const { lastID } = await db.run('INSERT INTO table (column) VALUES (?)', 'value', 'value');
```

Update rows (and get the number of changed rows):

```js
const { changes } = await db.run('UPDATE table SET column = ? WHERE id = ?', 'value', 1);
```

Iterate through rows:

```js
for await (const row of db.each('SELECT * FROM table')) {
    console.log(row);
}
```

Create prepared statements:

```js
const stmt = await db.prepare('SELECT * FROM table WHERE column = ?');
const rows = await stmt.all('value');
```

Close the database connection:

```js
await db.close();
```

And more. Checkout the [documentation](types/lib/database.d.mts) for the `Database` class for more information.

### TypeScript and JSDoc Support

You can import the types using `import type` in TypeScript to avoid including them in the compiled output while still getting static analysis and autocomplete:

```ts
import type { MigrationOptions, MakeOptions, Action, Status } from 'sqlite-auto-migrator';

const options: MigrationOptions = {
    dbPath: './data.db',
};
const migrator = new Migrator(options);

const action: Action = Migrator.PROCEED;
const makeOptions: MakeOptions = {
    onRename: action,
};
migrator.make(makeOptions);

const status: Status = await migrator.status();
```

And equivalently in JavaScript with JSDoc:

```js
/** @typedef {import('sqlite-auto-migrator').MigrationOptions} MigrationOptions */
/** @typedef {import('sqlite-auto-migrator').MakeOptions} MakeOptions */
/** @typedef {import('sqlite-auto-migrator').Action} Action */
/** @typedef {import('sqlite-auto-migrator').Status} Status */

/** @type {MigrationOptions} */
const options = {
    dbPath: './data.db',
};
const migrator = new Migrator(options);

/** @type {Action} */
const action = Migrator.PROCEED;
/** @type {MakeOptions} */
const makeOptions = {
    onRename: action,
};
migrator.make(makeOptions);
/** @type {Status} */
const status = await migrator.status();
```

You can also import the error classes to catch specific errors:

```ts
import { Errors } from 'sqlite-auto-migrator';
const { RolledBackTransaction, ValidationError, IntegrityError, ManualMigrationRequired } = Errors;

try {
    await migrator.migrate();
} catch (error) {
    if (error instanceof RolledBackTransaction) {
        console.error('The transaction was rolled back');
    } else if (error instanceof ValidationError) {
        console.error('The input was invalid');
    } else if (error instanceof IntegrityError) {
        console.error('The final database state was corrupted');
    } else if (error instanceof ManualMigrationRequired) {
        console.error('A manual migration is required');
    } else {
        throw error;
    }
}
```

The `Database` types are a bit more interesting. You can declare a type for the rows returned by a query and pass as a generic to the `Database` methods:

```ts
type Row = {
    id: number;
    name: string;
};

const db = await Database.connect(':memory:');
const row = await db.get<Row>('SELECT * FROM users WHERE id = ?', 1);
```

This can be baked into a prepared statement and even include a type for its params:

```ts
type Params = {
    $id: number;
    $name: string;
};
const stmt = await db.prepare<Row, Params>('SELECT * FROM users WHERE id = $id AND name = $name');
const rows = await stmt.all({ $id: 1, $name: 'Alice' }); // type checks
const row = await stmt.get({ $id: 1 }); // type errors because $name is missing
```

JSDoc generics look less clean but work the same way:

```js
/**
 * @typedef {Object} Row
 * @property {string} id
 * @property {string} name
 */

/** @type {ReturnType<typeof db.get<Row>>} */
const row = db.get('SELECT * FROM users WHERE id = ? AND name = ?', 1, 'Bob');
```

## Examples

The following application uses the sqlite-auto-migrator: [Attendance Scanner](https://github.com/clr-li/AttendanceScanner).
You can also take a look at the [test suite](test) and [cli](lib/cli.js) for more examples.

## Alternatives

-   [node-sqlite](https://github.com/kriasoft/node-sqlite#migrations) is an asynchronous SQLite client for Node.js which can run SQL based migration scripts. Not as flexible as JavaScript based migrations and also does not automatically generate migration files like sqlite-auto-migrator.
-   [django](https://docs.djangoproject.com/en/5.0/topics/migrations/) has pretty awesome automatic migrations. The caveat is they are not focused on SQLite (they do not recommend using their SQLite migrations for critical data), use Python for the migration files and the schema, and are part of a larger server framework.
-   [declarative migrations](https://david.rothlis.net/declarative-schema-migration-for-sqlite/) is a [simple Python script](https://david.rothlis.net/declarative-schema-migration-for-sqlite/migrator.py) for migrating the database state to match a schema file without keeping track of migration files. Does not support renaming columns/tables. Also does not include triggers, virtual tables, views, etc.
-   [sqldef](https://github.com/sqldef/sqldef) allows comparing schema files and database schemas. Does not support renaming columns/tables.

## Related Tools

-   SQL string syntax highlighting: VS Code: [ES6 String HTML](https://marketplace.visualstudio.com/items?itemName=Tobermory.es6-string-html). Sublime Text: [javascript-sql-sublime-syntax](https://github.com/AsterisqueDigital/javascript-sql-sublime-syntax). Vim: [vim-javascript-sql](https://github.com/statico/vim-javascript-sql).
-   [sql-strings](https://www.npmjs.com/package/sql-strings) creates prepared statements and bind parameters with a nice syntax using es6 template strings.

## Contributing

All constructive contributions are welcome including anything from bug fixes and new features to improved documentation, tests and more! Feel free to open an issue to discuss the proposed change and then submit a pull request :)

### Security Issues

If you discover a security vulnerability in sqlite-auto-migrator, please contact the [current main maintainer](#contributors).

### Running Tests

Tests run automatically pre-commit using [Husky](https://typicode.github.io/husky/). To run the test suite manually, first install the dependencies, then run `npm test`:

```console
$ npm install
$ npm test
```

### Linting and Formatting

[Eslint](https://eslint.org/) is used for static analysis, [fixpack](https://www.npmjs.com/package/fixpack) is used to standardize package.json and [Prettier](https://prettier.io/) is used for automatic formatting. Linting will automatically run pre-commit using [Husky](https://typicode.github.io/husky/) and [Lint-Staged](https://www.npmjs.com/package/lint-staged). Formatting can be set up to happen [automatically in your editor](https://prettier.io/docs/en/editors.html) (e.g. on save). Formatting and linting can also be run manually:

```console
$ npm install
$ npm run format
$ npm run lint
```

### Generating TypeScript Types

Typescript types are automatically generated from the JSDoc in the `/types` folder when the npm package is packaged/published. To update the TypeScript types manually, run the following command

```console
$ npm run types
```

This will allow TypeScript users to benefit from the type information provided in the JSDoc.

If you also want to generate the readme badges, run the following command:

```console
$ npm run build
```

## Contributors

The author of sqlite-auto-migrator is [Alexander Metzger](https://sandergi.github.io).

Functionality is inspired by [David Rothlis's migration script](https://david.rothlis.net/declarative-schema-migration-for-sqlite/) and made in consultance with the SQLite documentation, particularly the [alter table instructions](https://www.sqlite.org/lang_altertable.html), [schema table](https://www.sqlite.org/schematab.html), [quirks list](https://www.sqlite.org/quirks.html) and [language documentation](https://www.sqlite.org/lang.html).

All contributors will be listed here.

## License

[MIT](LICENSE)
