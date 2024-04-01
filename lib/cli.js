#!/usr/bin/env node

'use strict';

/** @typedef {import('sqlite-auto-migrator').MigrationOptions} MigrationOptions */
/** @typedef {import('sqlite-auto-migrator').MakeOptions} MakeOptions */

async function main(argv) {
    const { Migrator } = await import('sqlite-auto-migrator');
    const { symbols, colors } = await import('./colors.mjs');

    const cmd = argv.length > 0 ? argv.shift() : null;
    const args = new Map();
    for (let i = 0; i < argv.length - 1; i += 2) {
        const key = argv[i];
        const value = argv[i + 1];
        args.set(key, value);
    }
    const target = argv.length % 2 === 1 ? argv[argv.length - 1] : null;

    /** @type {MigrationOptions} */
    const options = {};
    if (args.has('--dbPath')) {
        options.dbPath = args.get('--dbPath');
    }
    if (args.has('--schemaPath')) {
        options.schemaPath = args.get('--schemaPath');
    }
    if (args.has('--migrationsPath')) {
        options.migrationsPath = args.get('--migrationsPath');
    }
    if (args.has('--migrationTable')) {
        options.migration = args.get('--migrationTable');
    }
    const migrator = new Migrator(options);

    if (cmd === 'status') {
        const status = await migrator.status();
        if (status.current_id) {
            console.log(`On migration ${status.current_id} - ${status.current_name}`);
        } else if (status.missing_migrations.length === 0) {
            console.log(
                'No migrations found. Run `sam make` to create a migration and `sam migrate` to apply it.',
            );
        } else {
            console.log(
                'No migrations applied. Run `sam migrate` to apply the unapplied migrations.',
            );
        }

        if (status.has_schema_changes) {
            console.log(
                `${symbols.warning} Schema changes detected. Run \`sam make\` to create a migration.`,
            );
        } else if (status.schema_diff_error) {
            console.log(
                `${symbols.error} Error comparing schema: ${status.schema_diff_error.message}`,
            );
        } else {
            console.log(`${symbols.success} No schema changes detected.`);
        }

        if (status.missing_migrations.length > 0) {
            console.log(colors.FgCyan('\nUnapplied migrations:'));
            for (const migration of status.missing_migrations) {
                console.log(
                    colors.FgRed(`  ${symbols.bullet} ${migration.id} - ${migration.name}`),
                );
            }
            console.log('Run `sam migrate` to apply.');
        }
        if (status.extra_migrations.length > 0) {
            console.log(colors.FgCyan('\nExtra applied migrations:'));
            for (const migration of status.extra_migrations) {
                console.log(
                    colors.FgRed(`  ${symbols.bullet} ${migration.id} - ${migration.name}`),
                );
            }
            console.log('Run `sam migrate` to unapply.');
        }
    } else if (cmd === 'make') {
        /** @type {MakeOptions} */
        const makeOptions = {};
        if (args.has('--onRename')) {
            makeOptions.onRename = args.get('--onRename');
        }
        if (args.has('--onDestructiveChange')) {
            makeOptions.onDestructiveChange = args.get('--onDestructiveChange');
        }
        if (args.has('--onChangedIndex')) {
            makeOptions.onChangedIndex = args.get('--onChangedIndex');
        }
        if (args.has('--onChangedView')) {
            makeOptions.onChangedView = args.get('--onChangedView');
        }
        if (args.has('--onChangedTrigger')) {
            makeOptions.onChangedTrigger = args.get('--onChangedTrigger');
        }
        if (target) {
            makeOptions.createIfNoChanges = false;
        } else {
            makeOptions.createIfNoChanges = true;
        }

        await migrator.make(makeOptions);
    } else if (cmd === 'migrate') {
        await migrator.migrate(target ?? 'latest');
    } else if (cmd === 'help') {
        console.log(colors.FgCyan('Available commands:'));
        console.log(
            '  ' +
                symbols.bullet +
                ' sam status ' +
                colors.FgGray(
                    '[--dbPath <path>] [--migrationsPath <path>] [--migrationTable <name>] [--schemaPath <path>]',
                ),
        );
        console.log(
            '  ' +
                symbols.bullet +
                ' sam make ' +
                colors.FgGray(
                    '[--dbPath <path>] [--migrationsPath <path>] [--migrationTable <name>] [--schemaPath <path>] [--onRename <action>] [--onDestructiveChange <action>] [--onChangedIndex <action>] [--onChangedView <action>] [--onChangedTrigger <action>] [--onlyCreateIfChanges]',
                ),
        );
        console.log(
            '  ' +
                symbols.bullet +
                ' sam migrate ' +
                colors.FgGray(
                    '[--dbPath <path>] [--migrationsPath <path>] [--migrationTable <name>] [--schemaPath <path>] [<target migration>]',
                ),
        );
        console.log(colors.FgCyan('\nKey:'));
        console.log(
            '  ' +
                symbols.bullet +
                ' <action> ' +
                colors.FgGray("one of 'PROMPT'|'REQUIRE_MANUAL_MIGRATION'|'PROCEED'|'SKIP'"),
        );
        console.log(
            '  ' + symbols.bullet + ' <path> ' + colors.FgGray('a valid relative or absolute path'),
        );
        console.log(
            '  ' +
                symbols.bullet +
                ' <name> ' +
                colors.FgGray('a valid table name in the database'),
        );
        console.log(
            '  ' +
                symbols.bullet +
                ' <target migration> ' +
                colors.FgGray(
                    'the migration ID to migrate to, e.g. `0001`, `latest`, or `zero`. Default is `latest`.',
                ),
        );

        console.log(
            colors.FgCyan('\nNote: ') +
                'optional keyvalue arguments can be provided in any order but <target migration> and --onlyCreateIfChanges must be last if provided.',
        );

        console.log(
            colors.FgCyan('\nLearn more: ') + 'https://github.com/SanderGi/sqlite-auto-migrator',
        );
    } else {
        console.error('Usage: `sam status`, `sam make`, `sam migrate`, or `sam help`');
        process.exit(1);
    }
}

main(process.argv.slice(2));
