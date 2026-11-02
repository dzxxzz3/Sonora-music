import type { Track, Playlist } from "./types";

const DB_NAME = "sonora-library";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("playlists")) db.createObjectStore("playlists", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function store<T>(name: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const req = action(tx.objectStore(name));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}
export const getTracks = () => store<Track[]>("tracks", "readonly", s => s.getAll());
export const putTrack = (track: Track) => store<IDBValidKey>("tracks", "readwrite", s => s.put(track));
export const deleteTrack = (id: string) => store<undefined>("tracks", "readwrite", s => s.delete(id));
export const putPlaylist = (p: Playlist) => store<IDBValidKey>("playlists", "readwrite", s => s.put(p));
export const getPlaylists = () => store<Playlist[]>("playlists", "readonly", s => s.getAll());
export const deletePlaylist = (id: string) => store<undefined>("playlists", "readwrite", s => s.delete(id));
