import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('src').filter((name) => name.endsWith('.js')).map((name) => `src/${name}`);
const html = readFileSync('index.html', 'utf8');
const inline = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
if (!inline) throw new Error('Missing application module');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: inline, encoding: 'utf8' });
if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
for (const match of html.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) readFileSync(match[1]);
console.log(`Syntax and imports OK (${files.length} modules and index.html)`);
