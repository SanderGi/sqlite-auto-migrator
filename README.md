# sqlite-auto-migrator

[![LOC](./.badges/lines-of-code.svg)](./.badges/lines-of-code.svg)
[![FileCount](./.badges/file-count.svg)](./.badges/file-count.svg)
[![Tests](./.badges/tests.svg)](./.badges/tests.svg)
[![Coverage](./.badges/coverage.svg)](./.badges/coverage.svg)

Simple automated SQLite database migration tool which works well with CI/CD pipelines and VCS.

Flexible migration files can be auto-generated and applied (optionally after manual inspection) directly via JavaScript or TypeScript:

```js
const { Migrator } = require('sqlite-auto-migrator');
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
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```console
$ npm install sqlite-auto-migrator
```

## Basic Usage

## API Documentation

### JavaScript Migration Management

```js
const { Migrator } = require('sqlite-auto-migrator');

const migrator = new Migrator(
  {
    /**
    * Path to the SQLite db file. Default is `path.join(process.cwd(), 'data.db')`
    */
    dbPath?: string,
    /**
    * Path to the migrations folder. Default is `path.join(process.cwd(), 'migrations')`
    */
    migrationsPath?: string,
    /**
     * Name of the table to store migration information in. Default is `migrations`
     */
    migrationTable?: string,
    /**
    * Path to the schema file. Default is `path.join(process.cwd(), 'schema.sql')`
    */
    schemaPath?: string,
  }
);

await migrator.make(
  /**
  * How to handle autodetected column/table renames. Default is `migrator.PROMPT`
  */
  onRename?: migrator.PROMPT | migrator.REQUIRE_MANUAL_MIGRATION | migrator.PROCEED | migrator.SKIP | migrator.CREATE_DUPLICATE
  /**
  * How to handle irreversible changes like dropping tables/columns. Default is `migrator.REQUIRE_MANUAL_MIGRATION`
  */
  onDestructiveChange?: migrator.PROMPT | migrator.REQUIRE_MANUAL_MIGRATION | migrator.PROCEED | migrator.SKIP | migrator.CREATE_DUPLICATE
);

await migrator.migrate(
  /**
  * The migration to set the database state to, e.g. "0001", "zero" or "latest" (default).
  */
  target?: string
);
```

### Command Line Interface

```console
$ sam status [--dbPath <path>] [--migrationsPath <path>] [--migrationTable <name>] [--schemaPath <path>]
```

```console
$ sam make [--dbPath <path>] [--migrationsPath <path>] [--migrationTable <name>] [--schemaPath <path>] [--onRename <action>] [--onDestructiveChange <action>] [--onChangedIndex <action>] [--onChangedView <action>] [--onChangedTrigger <action>] [--onlyCreateIfChanges]
```

```console
$ sam migrate [--dbPath <path>] [--migrationsPath <path>] [--migrationTable <name>] [--schemaPath <path>] [<target migration>]
```

### Understanding Migration Files

TODO

### The Asynchronous Database Wrapper

TODO

### TypeScript and JSDoc Support

TODO

## Examples

The following application uses the sqlite-auto-migrator: [Attendance Scanner](https://github.com/clr-li/AttendanceScanner).
You can also take a look at the [test suite](test) and [cli](lib/cli.js) for more examples.

## Alternatives

TODO

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

Functionality is inspired by [David Rothlis's migration script](https://david.rothlis.net/declarative-schema-migration-for-sqlite/) and made in consultance with the SQLite documentation, particularly the [alter table instructions](https://www.sqlite.org/lang_altertable.html), [schema table](https://www.sqlite.org/schematab.html), and [language documentation](https://www.sqlite.org/lang.html).

All contributors will be listed here.

## License

[MIT](LICENSE)
