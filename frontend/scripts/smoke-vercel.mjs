import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'stormroute-esm-'));
try {
  // Preserve the deployed package scope and .js extension. A TS loader or .mjs
  // bundle would conceal the missing package type that caused the Vercel 500s.
  await writeFile(join(output, 'package.json'), await readFile(join(frontend, 'package.json')));
  await build({
    absWorkingDir: frontend,
    entryPoints: ['api/search.ts', 'api/health.ts', 'api/analyze.ts'],
    outdir: join(output, 'api'), bundle: true, platform: 'node',
    format: 'esm', target: 'node22',
  });
  const result = spawnSync(process.execPath, ['--no-experimental-detect-module', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { pathToFileURL } from 'node:url';
    import { join } from 'node:path';
    globalThis.fetch = async () => { throw new Error('Unexpected live provider request'); };
    const load = async name => (await import(pathToFileURL(join(process.argv[1], 'api', name + '.js')).href)).default;
    const health = await load('health'), search = await load('search'), analyze = await load('analyze');
    const response = await health.fetch(new Request('https://demo.vercel.app/api/health'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal((await search.fetch(new Request('https://demo.vercel.app/api/search?q=x'))).status, 400);
    assert.equal((await analyze.fetch(new Request('https://demo.vercel.app/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }))).status, 400);
    console.log('Native Node ESM imports and offline smoke checks passed for all three Vercel functions.');
  `, output], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Vercel Node ESM smoke test failed.');
} finally {
  await rm(output, { recursive: true, force: true });
}
