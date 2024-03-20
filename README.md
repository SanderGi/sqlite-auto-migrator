# sqlite-auto-migrator

<!-- [![NPM Version][npm-version-image]][npm-url]
[![NPM Install Size][npm-install-size-image]][npm-install-size-url]
[![NPM Downloads][npm-downloads-image]][npm-downloads-url]
[![Linux Build][github-actions-ci-image]][github-actions-ci-url]
[![Windows Build][appveyor-image]][appveyor-url]
[![Test Coverage][coveralls-image]][coveralls-url] -->

Simple automated SQLite database migration tool which works well with CI/CD pipelines and VCS.

Standard migration files auto-generated and applied (optionally after manual inspection) directly via JavaScript or TypeScript:

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
[npm registry](https://www.npmjs.com/). [Node.js](https://nodejs.org/en/download/) v18.17.0 or higher is recommended.

Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```console
$ npm install sqlite-auto-migrator
```

## Basic Usage

## API Documentation

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

## Examples

The following application uses the sqlite-auto-migrator: [Attendance Scanner](https://github.com/clr-li/AttendanceScanner)

## Contributing

All constructive contributions are welcome including anything from bug fixes and new features to improved documentation, tests and more! Feel free to open an issue to discuss the proposed change and then submit a pull request :)

### Security Issues

If you discover a security vulnerability in sqlite-auto-migrator, please contact the [current main maintainer](#contributors).

### Running Tests

To run the test suite, first install the dependencies, then run `npm test`:

```console
$ npm install
$ npm test
```

### Linting and Formatting

[Eslint](https://eslint.org/) is used for static analysis and [Prettier](https://prettier.io/) is used for automatic formatting. Formatting and linting will automatically run pre-commit using [Husky](https://typicode.github.io/husky/) and [Lint-Staged](https://www.npmjs.com/package/lint-staged) and can be set up to happen [automatically in your editor](https://prettier.io/docs/en/editors.html) (e.g. on save). It can also be run manually:

```console
$ npm install
$ npm run format
$ npm run lint
```

## Contributors

The author of sqlite-auto-migrator is [Alexander Metzger](https://sandergi.github.io).

Functionality is inspired by [David Rothlis's migration script](https://david.rothlis.net/declarative-schema-migration-for-sqlite/) and made in consultance with the SQLite documentation, particularly the [alter table instructions](https://www.sqlite.org/lang_altertable.html), [schema table](https://www.sqlite.org/schematab.html), and [language documentation](https://www.sqlite.org/lang.html).

## License

[MIT](LICENSE)

[appveyor-image]: https://badgen.net/appveyor/ci/dougwilson/express/master?label=windows
[appveyor-url]: https://ci.appveyor.com/project/dougwilson/express
[coveralls-image]: https://badgen.net/coveralls/c/github/expressjs/express/master
[coveralls-url]: https://coveralls.io/r/expressjs/express?branch=master
[github-actions-ci-image]: https://badgen.net/github/checks/expressjs/express/master?label=linux
[github-actions-ci-url]: https://github.com/expressjs/express/actions/workflows/ci.yml
[npm-downloads-image]: https://badgen.net/npm/dm/express
[npm-downloads-url]: https://npmcharts.com/compare/express?minimal=true
[npm-install-size-image]: https://badgen.net/packagephobia/install/express
[npm-install-size-url]: https://packagephobia.com/result?p=express
[npm-url]: https://npmjs.org/package/express
[npm-version-image]: https://badgen.net/npm/v/express
