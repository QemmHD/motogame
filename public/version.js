// Shared release metadata for the page and service worker.
// Change this one value whenever a release must invalidate the offline cache.
(() => {
  const version = '1.3.0';
  const cachePrefix = 'moto-rush-x3-v';
  globalThis.MOTO_RUSH_BUILD = Object.freeze({
    version,
    label: `v${version}`,
    cachePrefix,
    cacheName: `${cachePrefix}${version}`,
  });
})();
