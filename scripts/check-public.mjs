import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
const privatePath = /(^|\/)(?:\.omx|\.omo|\.codegraph|artifacts|node_modules|\.gradle)(?:\/|$)|(^|\/)(?:local\.properties|id_rsa|id_ed25519|credentials\.json)$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const rules = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['GitHub access token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['database connection password', /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i],
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
];
function inspect(file) {
  const info = lstatSync(file);
  if (info.isSymbolicLink()) { failures.push(`${file}: symbolic link is not approved for publication`); return; }
  if (!info.isFile()) return;
  if (privatePath.test(file) || (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example'))) failures.push(`${file}: private/local file must not be committed`);
  const content = readFileSync(file);
  if (content.includes(0)) return;
  const source = content.toString('utf8');
  for (const [label, pattern] of rules) if (pattern.test(source)) failures.push(`${file}: possible ${label}`);
  for (const token of source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') failures.push(`${file}: service-role JWT`);
    } catch { /* Text resembling a token can occur in documentation. */ }
  }
}
for (const file of files) inspect(file);
const approvedWebFiles = new Set([
  'index.html', 'admin.html', 'app.js', 'admin.js', 'api.js', 'camera.js', 'config.js',
  'download.js', 'gallery.js', 'local-store.js', 'zip.js', 'sw.js', 'style.css',
  'manifest.webmanifest', 'display.ttf', 'FONT-LICENSE.txt', 'icons/icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png',
]);
function inspectWeb(directory = 'web', prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name, path = join(directory, entry.name);
    if (entry.isDirectory()) inspectWeb(path, relative + '/');
    else if (!approvedWebFiles.has(relative)) failures.push(`${path}: unexpected Pages file; review before adding to the allow-list`);
    else if (entry.isSymbolicLink()) failures.push(`${path}: Pages assets must not be symbolic links`);
    else if (!files.includes(path)) inspect(path);
  }
}
inspectWeb();
if (failures.length) {
  process.stderr.write('Public-file check failed (matched values are not printed):\n' + failures.join('\n') + '\n');
  process.exit(1);
}
process.stdout.write(`Public-file check passed: ${files.length} repo candidates scanned; Pages contains only approved app assets.\n`);
