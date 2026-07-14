import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, '..');
const DEPLOY_ONLY_FILES = new Set(['.nojekyll', 'sw.js']);
const REFERENCE_EXTENSIONS = new Set([
  '.css', '.html', '.jpeg', '.jpg', '.js', '.json', '.m4a', '.mp3', '.ogg',
  '.png', '.svg', '.wasm', '.wav', '.webmanifest', '.webp',
]);
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.webmanifest']);

function toPosix(path) {
  return path.split(sep).join('/');
}

function walkFiles(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, fullPath));
    else if (entry.isFile()) files.push(toPosix(relative(root, fullPath)));
  }
  return files.sort();
}

export function parsePrecacheManifest(serviceWorkerSource) {
  const match = serviceWorkerSource.match(
    /const\s+PRECACHE\s*=\s*Object\.freeze\s*\(\s*(\[[\s\S]*?\])\s*\)\s*;/,
  );
  if (!match) {
    throw new Error('sw.js must declare a static `const PRECACHE = Object.freeze([...]);` manifest');
  }

  const body = match[1].slice(1, -1);
  const stringPattern = /(['"])(.*?)\1/gs;
  const entries = [...body.matchAll(stringPattern)].map((entry) => entry[2]);
  const dynamicRemainder = body.replace(stringPattern, '').replace(/[\s,]/g, '');
  if (dynamicRemainder) {
    throw new Error(`PRECACHE must contain only literal paths; found: ${dynamicRemainder}`);
  }
  return entries;
}

function extractReferenceStrings(source) {
  const references = [];
  const quoted = /(['"])([^'"\r\n]+)\1/g;
  for (const match of source.matchAll(quoted)) references.push(match[2]);

  // CSS permits an unquoted url(...), which the quoted-string scan cannot see.
  const cssUrl = /url\(\s*([^)'"\s]+)\s*\)/g;
  for (const match of source.matchAll(cssUrl)) references.push(match[1]);

  // Static template literals are also local-reference candidates. Expressions
  // are deliberately ignored because they cannot be resolved without running code.
  const template = /`([^`\r\n]+)`/g;
  for (const match of source.matchAll(template)) {
    if (!match[1].includes('${')) references.push(match[1]);
  }
  return references;
}

function cleanReference(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const withoutFragment = trimmed.split('#', 1)[0].split('?', 1)[0].trim();
  if (!withoutFragment) return null;
  if (withoutFragment === './') return withoutFragment;
  if (withoutFragment.endsWith('/')) return null;
  if (/^(?:[a-z]+:|#|\/\/)/i.test(withoutFragment)) return null;

  const extension = extname(withoutFragment).toLowerCase();
  const looksLocal = withoutFragment.startsWith('./')
    || withoutFragment.startsWith('../')
    || withoutFragment.startsWith('/')
    || withoutFragment.startsWith('assets/')
    || REFERENCE_EXTENSIONS.has(extension);
  return looksLocal ? withoutFragment : null;
}

function resolveReference(publicRoot, sourceRelativePath, reference) {
  if (reference === './') return 'index.html';

  const sourceDirectory = dirname(resolve(publicRoot, sourceRelativePath));
  let candidates;
  if (reference.startsWith('/')) {
    candidates = [resolve(publicRoot, reference.slice(1))];
  } else if (reference.startsWith('./') || reference.startsWith('../')) {
    candidates = [resolve(sourceDirectory, reference)];
  } else {
    candidates = [resolve(sourceDirectory, reference), resolve(publicRoot, 'assets', reference)];
  }

  const publicPrefix = `${resolve(publicRoot)}${sep}`;
  const insidePublic = candidates.filter((candidate) => candidate.startsWith(publicPrefix));
  const resolved = insidePublic.find((candidate) => existsSync(candidate)) || insidePublic[0];
  return resolved ? toPosix(relative(publicRoot, resolved)) : null;
}

function inspectReleaseMetadata(versionSource, errors) {
  const sandbox = {};
  try {
    vm.runInNewContext(versionSource, sandbox, { filename: 'public/version.js' });
  } catch (error) {
    errors.push(`version.js could not be evaluated: ${error.message}`);
    return null;
  }

  const build = sandbox.MOTO_RUSH_BUILD;
  if (!build || typeof build !== 'object') {
    errors.push('version.js must expose globalThis.MOTO_RUSH_BUILD');
    return null;
  }
  if (!/^\d+\.\d+\.\d+$/.test(build.version)) {
    errors.push(`MOTO_RUSH_BUILD.version must be semantic x.y.z; got ${String(build.version)}`);
  }
  const expectedCacheName = `moto-rush-x3-v${build.version}`;
  if (build.cachePrefix !== 'moto-rush-x3-v') {
    errors.push(`cachePrefix must scope Moto Rush caches; got ${String(build.cachePrefix)}`);
  }
  if (build.cacheName !== expectedCacheName) {
    errors.push(`cacheName must be derived as ${expectedCacheName}; got ${String(build.cacheName)}`);
  }
  if (!Object.isFrozen(build)) errors.push('MOTO_RUSH_BUILD must be frozen');

  const versionLiterals = versionSource.match(/\b\d+\.\d+\.\d+\b/g) || [];
  if (versionLiterals.length !== 1) {
    errors.push(`version.js must contain exactly one release-version literal; found ${versionLiterals.length}`);
  }
  return build;
}

export function verifyPublicAssets(repoRoot = DEFAULT_REPO_ROOT) {
  const publicRoot = resolve(repoRoot, 'public');
  const serviceWorkerPath = resolve(publicRoot, 'sw.js');
  const versionPath = resolve(publicRoot, 'version.js');
  const errors = [];

  for (const required of [publicRoot, serviceWorkerPath, versionPath]) {
    if (!existsSync(required)) errors.push(`missing required path: ${toPosix(relative(repoRoot, required))}`);
  }
  if (errors.length) throw new Error(`Public asset verification failed:\n- ${errors.join('\n- ')}`);

  const allPublicFiles = walkFiles(publicRoot);
  const runtimeFiles = allPublicFiles.filter((file) => !DEPLOY_ONLY_FILES.has(file));
  const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8');
  const versionSource = readFileSync(versionPath, 'utf8');

  let precache = [];
  try {
    precache = parsePrecacheManifest(serviceWorkerSource);
  } catch (error) {
    errors.push(error.message);
  }

  if (!serviceWorkerSource.includes("importScripts('./version.js')")) {
    errors.push("sw.js must load the shared release metadata with importScripts('./version.js')");
  }
  if (!/const\s+CACHE\s*=\s*self\.MOTO_RUSH_BUILD\.cacheName\s*;/.test(serviceWorkerSource)) {
    errors.push('sw.js CACHE must come directly from self.MOTO_RUSH_BUILD.cacheName');
  }
  if (!/const\s+CACHE_PREFIX\s*=\s*self\.MOTO_RUSH_BUILD\.cachePrefix\s*;/.test(serviceWorkerSource)) {
    errors.push('sw.js cache cleanup must use self.MOTO_RUSH_BUILD.cachePrefix');
  }
  if (!/\.filter\(k\s*=>\s*k\.startsWith\(CACHE_PREFIX\)\s*&&\s*k\s*!==\s*CACHE\)/.test(serviceWorkerSource)) {
    errors.push('sw.js must delete only stale Moto Rush cache versions');
  }
  if (!/\.addAll\(PRECACHE\)/.test(serviceWorkerSource)) {
    errors.push('the install handler must atomically addAll(PRECACHE)');
  }
  if (/moto-rush-x3-v\d/.test(serviceWorkerSource)) {
    errors.push('sw.js must not contain a second hard-coded cache version');
  }

  const build = inspectReleaseMetadata(versionSource, errors);

  for (const javaScriptFile of runtimeFiles.filter((file) => extname(file) === '.js')) {
    const syntaxCheck = spawnSync(process.execPath, ['--check', resolve(publicRoot, javaScriptFile)], {
      encoding: 'utf8',
    });
    if (syntaxCheck.error) {
      errors.push(`could not syntax-check ${javaScriptFile}: ${syntaxCheck.error.message}`);
    } else if (syntaxCheck.status !== 0) {
      const detail = (syntaxCheck.stderr || syntaxCheck.stdout).trim().split('\n').at(-1);
      errors.push(`invalid JavaScript in ${javaScriptFile}: ${detail}`);
    }
  }

  const precacheSet = new Set(precache);
  if (precacheSet.size !== precache.length) {
    const seen = new Set();
    const duplicates = precache.filter((entry) => seen.has(entry) || !seen.add(entry));
    errors.push(`duplicate PRECACHE paths: ${[...new Set(duplicates)].join(', ')}`);
  }
  if (!precacheSet.has('./') || !precacheSet.has('./index.html')) {
    errors.push("PRECACHE must cover both './' and './index.html' navigation URLs");
  }

  for (const entry of precache) {
    if (!entry.startsWith('./') || entry.includes('?') || entry.includes('#')) {
      errors.push(`non-canonical PRECACHE path: ${entry}`);
      continue;
    }
    if (entry === './') continue;

    const target = resolve(publicRoot, entry.slice(2));
    const relativeTarget = relative(publicRoot, target);
    if (relativeTarget.startsWith('..') || relativeTarget === '') {
      errors.push(`PRECACHE path escapes public/: ${entry}`);
    } else if (!existsSync(target) || !statSync(target).isFile()) {
      errors.push(`PRECACHE path does not exist as a file: ${entry}`);
    }
  }

  for (const file of runtimeFiles) {
    const cachePath = `./${file}`;
    if (!precacheSet.has(cachePath)) errors.push(`runtime file is not precached: ${cachePath}`);
  }

  const sourceReferences = new Map();
  for (const sourceFile of runtimeFiles.filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))) {
    const source = readFileSync(resolve(publicRoot, sourceFile), 'utf8');
    if (extname(sourceFile).toLowerCase() === '.json') {
      try {
        JSON.parse(source);
      } catch (error) {
        errors.push(`invalid JSON in ${sourceFile}: ${error.message}`);
      }
    }
    for (const rawReference of extractReferenceStrings(source)) {
      const reference = cleanReference(rawReference);
      if (reference === null) continue;
      const resolvedReference = resolveReference(publicRoot, sourceFile, reference);
      const label = `${sourceFile} -> ${rawReference}`;
      if (!resolvedReference || !existsSync(resolve(publicRoot, resolvedReference))) {
        errors.push(`broken local reference: ${label}`);
        continue;
      }
      sourceReferences.set(label, resolvedReference);
      if (!DEPLOY_ONLY_FILES.has(resolvedReference) && !precacheSet.has(`./${resolvedReference}`)) {
        errors.push(`referenced runtime file is not precached: ${label}`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Public asset verification failed:\n- ${[...new Set(errors)].join('\n- ')}`);
  }

  return Object.freeze({
    buildVersion: build.version,
    cacheName: build.cacheName,
    publicFileCount: allPublicFiles.length,
    runtimeFileCount: runtimeFiles.length,
    precacheUrlCount: precache.length,
    sourceReferenceCount: sourceReferences.size,
  });
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    const report = verifyPublicAssets();
    console.log(
      `Verified ${report.runtimeFileCount} runtime files, ${report.precacheUrlCount} precache URLs, `
      + `${report.sourceReferenceCount} local references, and cache ${report.cacheName}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
