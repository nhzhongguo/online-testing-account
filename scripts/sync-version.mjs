import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BUILD_PATTERN = /^\d{8}$/;

export function validateVersionMetadata(value) {
  if (!value || typeof value !== 'object') throw new Error('Version metadata must be an object');
  const metadata = value;
  if (typeof metadata.version !== 'string' || !VERSION_PATTERN.test(metadata.version)) {
    throw new Error('Version metadata requires a semantic version');
  }
  if (typeof metadata.build !== 'string' || !BUILD_PATTERN.test(metadata.build)) {
    throw new Error('Version metadata requires an eight-digit build date');
  }
  if (typeof metadata.upgrade !== 'string' || !metadata.upgrade.trim()) {
    throw new Error('Version metadata requires an upgrade summary');
  }
  if (typeof metadata.author !== 'string' || !metadata.author.trim()) {
    throw new Error('Version metadata requires an author');
  }
  return {
    version: metadata.version,
    build: metadata.build,
    upgrade: metadata.upgrade.trim(),
    author: metadata.author.trim(),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function syncAndroidBuildGradle(contents, metadata) {
  const next = contents
    .replace(/versionCode\s+\d+/, `versionCode ${Number(metadata.build)}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${metadata.version}"`);

  if (next === contents && (!contents.includes('versionCode') || !contents.includes('versionName'))) {
    throw new Error('Android build.gradle is missing versionCode or versionName');
  }
  return next;
}

export async function synchronizeVersionMetadata(rootDir) {
  const metadata = validateVersionMetadata(await readJson(join(rootDir, 'version.json')));
  const packagePath = join(rootDir, 'package.json');
  const androidBuildPath = join(rootDir, 'android', 'app', 'build.gradle');
  const packageJson = await readJson(packagePath);
  const androidBuild = await readFile(androidBuildPath, 'utf8');

  if (packageJson.version !== metadata.version) {
    await writeJson(packagePath, { ...packageJson, version: metadata.version });
  }

  const nextAndroidBuild = syncAndroidBuildGradle(androidBuild, metadata);
  if (nextAndroidBuild !== androidBuild) {
    await writeFile(androidBuildPath, nextAndroidBuild, 'utf8');
  }

  return metadata;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const rootDir = resolve(dirname(scriptPath), '..');
  synchronizeVersionMetadata(rootDir).then((metadata) => {
    process.stdout.write(`Synchronized version ${metadata.version} (${metadata.build})\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
