'use strict';

const RESET = '\x1b[0m';
export const colors = {
    Bright: s => '\x1b[1m' + s + RESET,
    Dim: s => '\x1b[2m' + s + RESET,
    Underscore: s => '\x1b[4m' + s + RESET,
    Blink: s => '\x1b[5m' + s + RESET,
    Reverse: s => '\x1b[7m' + s + RESET,
    Hidden: s => '\x1b[8m' + s + RESET,
    OverwritableLine: s => s + '\x1b[0G',

    FgBlack: s => '\x1b[30m' + s + RESET,
    FgRed: s => '\x1b[31m' + s + RESET,
    FgGreen: s => '\x1b[32m' + s + RESET,
    FgYellow: s => '\x1b[33m' + s + RESET,
    FgBlue: s => '\x1b[34m' + s + RESET,
    FgMagenta: s => '\x1b[35m' + s + RESET,
    FgCyan: s => '\x1b[36m' + s + RESET,
    FgWhite: s => '\x1b[37m' + s + RESET,
    FgGray: s => '\x1b[90m' + s + RESET,

    BgBlack: s => '\x1b[40m' + s + RESET,
    BgRed: s => '\x1b[41m' + s + RESET,
    BgGreen: s => '\x1b[42m' + s + RESET,
    BgYellow: s => '\x1b[43m' + s + RESET,
    BgBlue: s => '\x1b[44m' + s + RESET,
    BgMagenta: s => '\x1b[45m' + s + RESET,
    BgCyan: s => '\x1b[46m' + s + RESET,
    BgWhite: s => '\x1b[47m' + s + RESET,
    BgGray: s => '\x1b[100m' + s + RESET,
};

const main = {
    info: colors.FgBlue('ℹ'),
    success: colors.FgGreen('✔'),
    warning: colors.FgYellow('⚠'),
    error: colors.FgRed('✖'),
    bullet: '•',
};

const fallback = {
    info: colors.FgBlue('i'),
    success: colors.FgGreen('√'),
    warning: colors.FgYellow('‼'),
    error: colors.FgRed('x'),
    bullet: '-',
};

function isUnicodeSupported() {
    if (process.platform !== 'win32') {
        return process.env.TERM !== 'linux'; // Linux console (kernel)
    }

    return (
        Boolean(process.env.WT_SESSION) || // Windows Terminal
        Boolean(process.env.TERMINUS_SUBLIME) || // Terminus (<0.2.27)
        process.env.ConEmuTask === '{cmd::Cmder}' || // ConEmu and cmder
        process.env.TERM_PROGRAM === 'Terminus-Sublime' ||
        process.env.TERM_PROGRAM === 'vscode' ||
        process.env.TERM === 'xterm-256color' ||
        process.env.TERM === 'alacritty' ||
        process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm'
    );
}

export const symbols = isUnicodeSupported() ? main : fallback;
