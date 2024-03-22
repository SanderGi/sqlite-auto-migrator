/*!
 * sqlite-auto-migrator
 * Copyright(c) 2024 Alexander Metzger
 * MIT Licensed
 */

'use strict';

module.exports.Migrator = import('./lib/migrator.mjs');
module.exports.Errors = import('./lib/errors.mjs');
module.exports.Database = import('./lib/database.mjs');
