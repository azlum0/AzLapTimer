#!/usr/bin/env bun
// Puts the current build live on this PC's setup in one go: the screen half onto the Car Thing,
// and the extension half into the copy the bridgething desktop app runs, which is then restarted.
//
// The desktop app only takes an extension from a zip installed through its own window, so this
// writes over the file it unpacked last time. Its label keeps the version of that last zip until
// the next one is installed; the code it runs is the new build.
//
//   bun run deploy               build, push to the device, swap and restart the extension
//   bun run deploy --no-device   leave the Car Thing alone

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const appDir = resolve(import.meta.dir, '..');
const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: appDir, stdio: 'inherit' }).status === 0;
const powershell = (script: string): string =>
  spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();

if (process.platform !== 'win32') {
  console.error('deploy swaps the extension inside the windows desktop app; elsewhere, install the zip from `bun run share`');
  process.exit(1);
}

const pushed = process.argv.includes('--no-device')
  ? run(process.execPath, ['run', 'build'])
  : run(process.execPath, ['run', 'push']);
if (!pushed) process.exit(1);

const manifest = JSON.parse(readFileSync(join(appDir, 'dist', 'manifest.json'), 'utf8')) as {
  id: string;
  version: string;
  extension: { entry: string };
};
const home = join(process.env.APPDATA ?? '', 'bridgething', 'bridgething', 'data', 'extensions', manifest.id);
const recordPath = join(home, 'extension.json');
if (!existsSync(recordPath)) {
  console.error(`the desktop app has no copy of this extension at ${home}`);
  console.error('install the zip from `bun run share` through the desktop app once; deploy takes over from there');
  process.exit(1);
}
const record = JSON.parse(readFileSync(recordPath, 'utf8')) as { version: string; entry: string };
const installed = join(home, record.version, record.entry);
copyFileSync(join(appDir, 'dist', manifest.extension.entry), installed);
console.log(`extension ${manifest.version} written over the desktop app's ${record.version} copy`);

// the desktop app starts the extension again within a few seconds of it exiting
const mine = `Get-CimInstance Win32_Process -Filter "Name='deno.exe'" | Where-Object { $_.CommandLine -like '*${manifest.id}*' }`;
const before = powershell(`(${mine}).ProcessId`);
if (!before) {
  console.log('the desktop app is not running the extension; it will pick the new build up when it next starts it');
  process.exit(0);
}
powershell(`${mine} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`);
for (let waited = 0; waited < 40; waited++) {
  await Bun.sleep(1000);
  const now = powershell(`(${mine}).ProcessId`);
  if (now && now !== before) {
    console.log(`extension restarted (process ${before} -> ${now}); the lap list starts again from here`);
    process.exit(0);
  }
}
console.error('the desktop app has not restarted the extension after 40 seconds; check its row in the desktop app');
process.exit(1);
