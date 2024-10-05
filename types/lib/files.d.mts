/** @see {@link fs.access} */
export function accessAsync(path: any, mode: any): Promise<void>;
/** @see {@link fsSync.accessSync} */
export function accessSync(path: any, mode: any): void;
/** @see {@link fsSync.existsSync} */
export function existsSync(path: any): any;
/** @see {@link fsSync.statSync} */
export function statSync(path: any, options: any): any;
/** @see {@link fs.readFile} */
export function readFileAsync(path: any, options: any): Promise<any>;
/** @see {@link fsSync.readFileSync} */
export function readFileSync(path: any, options: any): any;
/** @see {@link fs.rm} */
export function rmAsync(path: any, options: any): Promise<any>;
/** @see {@link fs.mkdir} */
export function mkdirAsync(path: any, options: any): Promise<any>;
/** @see {@link fs.writeFile} */
export function writeFileAsync(path: any, data: any, options: any): Promise<any>;
/** @see {@link fs.readFile} */
export function readdirAsync(path: any, options: any): Promise<any>;
/** @see {@link fs.stat} */
export function statAsync(path: any, options: any): Promise<any>;
/** @see {@link fs.constants} */
export const fsConstants: any;
