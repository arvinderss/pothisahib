/**
 * Package an alpha build of the Pothi Sahib reader.
 *
 * Produces `dist-alpha/pothi-sahib-alpha-<version>-<commit>.zip` containing the built app, a
 * build-info file recording exactly which commit it came from, and a short README telling a tester
 * how to run it. The corpus is NOT included: the app downloads verified Bani bundles from a public
 * API at run time, so a build carries no Gurbani and needs no licence bundling of its own.
 *
 * Usage: node scripts/package-alpha.mjs [--api https://kosh.example/api/v1]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apiBase = args.includes('--api') ? args[args.indexOf('--api') + 1] : '/api/v1';

const run = (cmd, cmdArgs, env) =>
  execFileSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });

const capture = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { cwd: root, shell: process.platform === 'win32' })
    .toString()
    .trim();

const version = JSON.parse(readFileSync(join(root, 'apps/reader/package.json'), 'utf8')).version;
const commit = capture('git', ['rev-parse', '--short', 'HEAD']);
const dirty = capture('git', ['status', '--porcelain']) !== '';
const builtAt = new Date().toISOString();
const name = `pothi-sahib-alpha-${version}-${commit}${dirty ? '-dirty' : ''}`;

console.log(`Building ${name} (API base ${apiBase})`);
run('pnpm', ['--filter', '@pothisahib/reader', 'run', 'build'], { VITE_API_BASE: apiBase });

const dist = join(root, 'apps/reader/dist');
writeFileSync(
  join(dist, 'build-info.json'),
  JSON.stringify({ name, version, commit, dirty, builtAt, apiBase, channel: 'alpha' }, null, 2) +
    '\n',
);
writeFileSync(
  join(dist, 'README.txt'),
  [
    `Pothi Sahib — alpha build ${name}`,
    `Built ${builtAt} from commit ${commit}${dirty ? ' (with uncommitted changes)' : ''}.`,
    '',
    'This is a static web app. It contains no Gurbani: it downloads each Bani from the',
    `Gurbani Kosh public API (${apiBase}), verifies every line and the whole bundle against`,
    'SHA-256 hashes, and only then stores it on the device and shows it.',
    '',
    'To run it:',
    '  1. Start the public API so that it answers at the address above.',
    '  2. Serve this folder over HTTPS (or from localhost). A secure context is required:',
    '     without it the browser provides no Web Crypto, so nothing can be verified or stored.',
    '',
    'Alpha status: the text is adopted from the Shabad OS database and is labelled PROVISIONAL,',
    'meaning it has not yet been reviewed against printed sources. Please report anything that',
    'looks wrong rather than assuming it is settled.',
    '',
    'Everything you do in the app stays on your device. Nothing is sent anywhere, there is no',
    'analytics and no account.',
  ].join('\n') + '\n',
);

const outDir = join(root, 'dist-alpha');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const zip = join(outDir, `${name}.zip`);

if (process.platform === 'win32') {
  run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${dist}\\*' -DestinationPath '${zip}' -Force`,
  ]);
} else {
  run('sh', ['-c', `cd "${dist}" && zip -qr "${zip}" .`]);
}

console.log(`\nPackaged ${zip}`);
