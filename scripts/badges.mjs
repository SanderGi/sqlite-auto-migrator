import fs from 'node:fs';
import { exec } from 'node:child_process';

if (!fs.existsSync('./.badges')) fs.mkdirSync('./.badges');

function createBadge(label, value, leftWidth, rightWidth, color, filename) {
    const totalWidth = leftWidth + rightWidth;
    const svg = /*html*/ `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
        <title>${label}: ${value}</title>
        <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
        <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
        <g clip-path="url(#r)">
            <rect width="${leftWidth}" height="20" fill="#555"/>
            <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
            <rect width="${totalWidth}" height="20" fill="url(#s)"/></g>
            <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
            <text aria-hidden="true" x="${
                5 * leftWidth
            }" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)">${label}</text>
            <text x="${5 * leftWidth}" y="140" transform="scale(.1)" fill="#fff">${label}</text>
            <text aria-hidden="true" x="${
                10 * leftWidth + value.toString().length + 5 * rightWidth
            }" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)">${value}</text>
            <text x="${
                10 * leftWidth + value.toString().length + 5 * rightWidth
            }" y="140" transform="scale(.1)" fill="#fff">${value}</text>
        </g>
    </svg>
    `;
    if (!fs.existsSync(filename)) fs.writeFileSync(filename, '');
    fs.writeFileSync(filename, svg, 'utf8');
}

const lines = fs.readFileSync('./tap.info', 'utf8').split('\n');
const fails = parseInt(lines.find(x => x.startsWith('# fail')).replace('# fail ', ''));
const coverage = lines[lines.length - 3].split('|');
const linePercentage = coverage[1].trim();
const branchPercentage = coverage[2].trim();
const functionPercentage = coverage[3].trim();

createBadge(
    'Tests',
    fails ? 'failing' : 'passing',
    40,
    66,
    fails ? '#B12B1D' : '#16B13D',
    './.badges/tests.svg',
);

const label = 'Coverage';
const percentage = Math.round(
    (parseFloat(linePercentage) + parseFloat(branchPercentage) + parseFloat(functionPercentage)) /
        3,
);
let color = 'gray';
if (percentage < 50) color = '#B12B1D';
else if (percentage < 70) color = '#B1671E';
else if (percentage < 80) color = '#B19719';
else if (percentage < 90) color = '#7BB11B';
else color = '#16B13D';
createBadge(label, percentage + '%', 66, 48, color, './.badges/coverage.svg');

exec('tokei ./index.mjs ./lib --output json', (error, stdout, _) => {
    if (error) {
        console.log('Tokei not installed. Skipping lines of code and file count badge.');
        return;
    }
    const totalStats = JSON.parse(stdout)['Total'];
    const totalLinesOfCode = totalStats['code'];
    const totalFiles = Object.values(totalStats['children'])
        .map(x => x.length)
        .reduce((a, b) => a + b, 0);
    createBadge(
        'Lines of Code',
        Intl.NumberFormat('en-US', { notation: 'compact' }).format(totalLinesOfCode),
        87,
        50,
        '#007ec6',
        './.badges/lines-of-code.svg',
    );
    createBadge('Files', totalFiles, 40, 28, '#007ec6', './.badges/file-count.svg');
});
