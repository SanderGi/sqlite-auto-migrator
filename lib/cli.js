#!/usr/bin/env node

'use strict';

/** @typedef {import('sqlite-auto-migrator').MigrationOptions} MigrationOptions */
/** @typedef {import('sqlite-auto-migrator').MakeOptions} MakeOptions */

async function main(argv) {
    const { Migrator } = await import('sqlite-auto-migrator');
    const { symbols, colors } = await import('./colors.mjs');

    const cmd = argv.length > 0 ? argv.shift() : null;
    const noOutput = argv.includes('--no-output');
    const target = argv.length > 0 ? argv.shift() : 'latest';

    if (cmd === 'status') {
        if (noOutput) return;
        const migrator = new Migrator();
        const status = await migrator.status();
        if (status.current_id && status.current_id !== 'zero') {
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

        if (status.has_tampered_data) {
            console.log(
                `${symbols.error} The database schema has been modified by other means than 'sam migrate'. Please undo any DDL changes you've made and instead change the schema file to create/apply a migration file with 'sam make'/'sam migrate'.`,
            );
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
        const migrator = new Migrator();
        await migrator.make({}, noOutput ? () => {} : s => process.stdout.write(s));
    } else if (cmd === 'migrate') {
        const migrator = new Migrator();
        await migrator.migrate(target, noOutput ? () => {} : s => process.stdout.write(s));
    } else if (cmd === 'help') {
        console.log(colors.FgCyan('Available commands:'));
        console.log(`  ${symbols.bullet} sam status ${colors.FgGray('[--no-output]')}`);
        console.log(`  ${symbols.bullet} sam make ${colors.FgGray('[--no-output]')}`);
        console.log(
            `  ${symbols.bullet} sam migrate ${colors.FgGray(
                '[--no-output] [<target migration>]',
            )}`,
        );

        console.log(colors.FgCyan('\nKey:'));
        console.log(
            `  ${symbols.bullet} <target migration> ${colors.FgGray(
                'the migration ID to migrate to, e.g. `0001`, `latest`, or `zero`. Must be the last parameter if provided. Default is `latest`',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} --no-output ${colors.FgGray(
                'supresses all output to stdout except migration prompts when those settings are set to "PROMPT"',
            )}`,
        );

        console.log(
            colors.FgCyan('\nEnvironment variables: ') +
                'the following environment variables can be set to configure the migrator, e.g. `SAM_DB_PATH=example.db sam status`',
        );
        console.log(
            `  ${symbols.bullet} SAM_DB_PATH ${colors.FgGray(
                'the path to the SQLite database file',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_SCHEMA_PATH ${colors.FgGray(
                'the path to the schema file (default: `schema.sql`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_MIGRATIONS_PATH ${colors.FgGray(
                'the path to the migrations directory (default: `migrations`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_MIGRATIONS_TABLE ${colors.FgGray(
                'the name of the migration table (default: `migrations`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_ON_RENAME ${colors.FgGray(
                'how to handle a column/table rename, one of `PROMPT`, `PROCEED`, `SKIP`, or `REQUIRE_MANUAL_MIGRATION` (default: `PROMPT`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_ON_DESTRUCTIVE_CHANGE ${colors.FgGray(
                'how to handle a destructive change, one of `PROMPT`, `PROCEED`, `SKIP`, or `REQUIRE_MANUAL_MIGRATION` (default: `PROMPT`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_ON_CHANGED_INDEX ${colors.FgGray(
                'how to handle an index change, one of `PROMPT`, `PROCEED`, `SKIP`, or `REQUIRE_MANUAL_MIGRATION` (default: `PROCEED`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_ON_CHANGED_VIEW ${colors.FgGray(
                'how to handle a view change, one of `PROMPT`, `PROCEED`, `SKIP`, or `REQUIRE_MANUAL_MIGRATION` (default: `PROCEED`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_ON_CHANGED_TRIGGER ${colors.FgGray(
                'how to handle a trigger change, one of `PROMPT`, `PROCEED`, `SKIP`, or `REQUIRE_MANUAL_MIGRATION` (default: `PROCEED`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_CREATE_IF_NO_CHANGES ${colors.FgGray(
                'set to true to only create a new migration file if there has been changes to the schema file since the last migration file (default: `false`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_CREATE_DB_IF_MISSING ${colors.FgGray(
                'set to true to create a new database file instead of throwing an error if it is missing (default: `false`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_CREATE_ON_MANUAL_MIGRATION ${colors.FgGray(
                'set to true to create a new migration file when a manual migration is required (default: `false`)',
            )}`,
        );
        console.log(
            `  ${symbols.bullet} SAM_CONFIG_PATH ${colors.FgGray(
                'the path to a JSON configuration file containing defaults for the above environment variables, keys should leave out the `SAM_` prefix. (default: `./.samrc`)',
            )}`,
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
