/* IndexedDB keeps imported images with the draft, across reloads. */
window.HMAssetStore = (() => {
  let dbPromise;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('html-motion-studio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function get(key) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const request = database.transaction('projects').objectStore('projects').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function put(key, value) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage write aborted'));
    });
  }
  return { get, put };
})();
