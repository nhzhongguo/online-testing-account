import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { synchronizeVersionMetadata, validateVersionMetadata } from './sync-version.mjs';

test('rejects invalid version metadata', () => {
  assert.throws(
    () => validateVersionMetadata({ version: '2', build: '', upgrade: '' }),
    /version/i,
  );
});

test('synchronizes package and Android versions from version.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'account-pulse-version-'));
  await Promise.all([
    writeFile(join(root, 'version.json'), JSON.stringify({
      version: '2.0.0',
      build: '20260719',
      upgrade: 'Release metadata test',
      author: 'Test',
    })),
    writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.8.5' })),
  ]);

  const androidDir = join(root, 'android', 'app');
  await (await import('node:fs/promises')).mkdir(androidDir, { recursive: true });
  await writeFile(join(androidDir, 'build.gradle'), [
    'defaultConfig {',
    '  versionCode 5',
    '  versionName "0.8.4"',
    '}',
  ].join('\n'));

  const metadata = await synchronizeVersionMetadata(root);

  assert.equal(metadata.version, '2.0.0');
  assert.match(await readFile(join(root, 'package.json'), 'utf8'), /"version": "2\.0\.0"/);
  assert.match(await readFile(join(androidDir, 'build.gradle'), 'utf8'), /versionCode 20260719/);
  assert.match(await readFile(join(androidDir, 'build.gradle'), 'utf8'), /versionName "2\.0\.0"/);
});
