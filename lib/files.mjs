import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

// Node.js fs functions do not work with Bun embedded files
const bundledFiles = [];
const bundledFilesContent = {};
if (process.versions.bun) {
    const embeddedFiles = import('bun').then(m => m.embeddedFiles);
    for (const f of await embeddedFiles) {
        const dir = path.join('/$bunfs/root/', f.name);
        bundledFiles.push(dir);
        bundledFilesContent[dir] = Buffer.from(await f.arrayBuffer());
    }
}

/** @see {@link fs.access} */
export async function accessAsync(path, mode) {
    if (bundledFiles.includes(path)) {
        Promise.resolve();
        return;
    }
    await fs.access(path, mode);
}

/** @see {@link fsSync.accessSync} */
export function accessSync(path, mode) {
    if (bundledFiles.includes(path)) {
        return;
    }
    fsSync.accessSync(path, mode);
}

/** @see {@link fsSync.existsSync} */
export function existsSync(path) {
    if (bundledFiles.includes(path)) {
        return true;
    }
    return fsSync.existsSync(path);
}

/** @see {@link fsSync.statSync} */
export function statSync(path, options) {
    if (bundledFiles.includes(path)) {
        return { isDirectory: () => false, isFile: () => true, mtimeMs: Date.now() };
    }
    return fsSync.statSync(path, options);
}

/** @see {@link fs.readFile} */
export async function readFileAsync(path, options) {
    if (bundledFiles.includes(path)) {
        return bundledFilesContent[path].toString(options);
    }
    return await fs.readFile(path, options);
}

/** @see {@link fsSync.readFileSync} */
export function readFileSync(path, options) {
    if (bundledFiles.includes(path)) {
        return bundledFilesContent[path].toString(options);
    }
    return fsSync.readFileSync(path, options);
}

/** @see {@link fs.rm} */
export async function rmAsync(path, options) {
    if (bundledFiles.includes(path)) {
        throw new Error('Cannot remove bundled file');
    }
    return await fs.rm(path, options);
}

/** @see {@link fs.mkdir} */
export async function mkdirAsync(path, options) {
    if (bundledFiles.includes(path)) {
        throw new Error('Cannot create directory over bundled file');
    }
    return await fs.mkdir(path, options);
}

/** @see {@link fs.writeFile} */
export async function writeFileAsync(path, data, options) {
    if (bundledFiles.includes(path)) {
        throw new Error('Cannot write to bundled file');
    }
    return await fs.writeFile(path, data, options);
}

/** @see {@link fs.readFile} */
export async function readdirAsync(path, options) {
    if (bundledFiles.includes(path)) {
        return bundledFiles;
    }
    return await fs.readdir(path, options);
}

/** @see {@link fs.stat} */
export async function statAsync(path, options) {
    if (bundledFiles.includes(path)) {
        return statSync(path, options);
    }
    return await fs.stat(path, options);
}

/** @see {@link fs.constants} */
export const fsConstants = fs.constants;
