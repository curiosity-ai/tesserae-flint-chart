/**
 * Recursively renames *.dontload files to their real names (drops the suffix),
 * mirroring what Mosaik's FrontEndWatcher does at deploy time.
 * Usage: node scripts/strip-dontload.mjs <dir>
 */
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: strip-dontload.mjs <dir>'); process.exit(1); }

try {
  await stat(root);
} catch {
  // Debug/Release output layouts can differ; nothing to strip is fine.
  console.log(`strip-dontload: ${root} does not exist, nothing to do`);
  process.exit(0);
}

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.dontload')) {
      if (!e.isFile()) {
        console.warn(`strip-dontload: skipping non-file ${p}`);
        continue;
      }
      const target = p.slice(0, -'.dontload'.length);
      const existed = await stat(target).then(() => true, () => false);
      if (existed) {
        // The un-suffixed file should never be emitted next to its .dontload
        // resource — if it is, the upstream packaging is misconfigured.
        console.warn(`strip-dontload: ${target} already existed (upstream packaging bug?), overwriting`);
        await rm(target, { force: true });
      }
      await rename(p, target);
      console.log(`stripped: ${target}`);
    }
  }
}
await walk(root);
