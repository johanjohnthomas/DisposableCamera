import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const file of readdirSync('web').filter(name => name.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `web/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
JSON.parse(readFileSync('web/manifest.webmanifest', 'utf8'));
process.stdout.write('All JavaScript syntax and manifest checks passed.\n');
