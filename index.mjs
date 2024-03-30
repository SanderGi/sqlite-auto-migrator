/*!
 * sqlite-auto-migrator
 * Copyright(c) 2024 Alexander Metzger
 * MIT Licensed
 */

/** @typedef {import('./lib/migrator.mjs').MigrationOptions} MigrationOptions */
/** @typedef {import('./lib/migrator.mjs').Action} Action */
/** @typedef {import('./lib/migrator.mjs').Status} Status */
/**
 * @template [R=any]
 * @template {any[]} [P=any[]]
 * @typedef {import('./lib/database.mjs').Statement<R, P>} Statement
 */

export { Migrator } from './lib/migrator.mjs';
export * as Errors from './lib/errors.mjs';
export { Database } from './lib/database.mjs';
