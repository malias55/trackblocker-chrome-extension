// Builds dist/linkwash-<version>.zip for the Chrome Web Store.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
const zip = path.join(dist, `linkwash-${version}.zip`);
if (existsSync(zip)) rmSync(zip);
execFileSync('zip', ['-r', '-X', '-q', zip, 'manifest.json', '_locales', 'icons', 'src', '-x', '*.DS_Store', 'icons/icon.svg'], { cwd: root, stdio: 'inherit' });
console.log('Created', path.relative(root, zip));
