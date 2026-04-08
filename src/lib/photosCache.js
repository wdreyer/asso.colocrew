/**
 * Module-level photos cache shared by Medias.jsx and PhotoPicker.jsx.
 * Single Firestore fetch per session, 5-min TTL, instant re-open.
 */
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { COLLECTIONS } from "@/src/lib/firebaseCollections";

let _cache = null;
let _cacheTs = 0;

const CACHE_TTL  = 5 * 60 * 1000; // 5 min
const LOAD_LIMIT = 800;

export function invalidatePhotosCache() {
  _cache = null;
  _cacheTs = 0;
}

/** Mutate the in-memory cache without re-fetching (for deletes / moves / uploads). */
export function updatePhotosCache(updater) {
  if (_cache) _cache = updater(_cache);
}

export async function fetchAllPhotos() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PHOTOS), orderBy("dateAjout", "desc"), limit(LOAD_LIMIT))
    );
    _cache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.url);
  } catch {
    // Index not ready — fallback without orderBy
    const snap = await getDocs(query(collection(db, COLLECTIONS.PHOTOS), limit(LOAD_LIMIT)));
    _cache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.url);
  }
  _cacheTs = Date.now();
  return _cache;
}
