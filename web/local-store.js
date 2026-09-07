const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('tenframes', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('data');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('Device storage is unavailable. Allow browser storage to keep your roll.'));
});
export async function read(key) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction('data').objectStore('data').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function write(key, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('data', 'readwrite');
    if (value === undefined) transaction.objectStore('data').delete(key);
    else transaction.objectStore('data').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Your device could not save this photo. Free some storage and retry.'));
  });
}
