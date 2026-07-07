import { pk3x9m, pk7q2v } from "../config/mapsKeyParts";

function decodeSeed(codes) {
  if (!Array.isArray(codes)) return null;
  return codes.map((n) => String.fromCharCode(n - 7)).join("");
}

// Reassembles the Google Places API key from its three pieces: the first
// third lives in .env (REACT_APP_GOOGLE_PLACES_KEY_SEED), the other two are
// shifted char-code arrays in src/config/mapsKeyParts.js. No fallback — if
// any piece is missing this returns null and callers should treat
// Autocomplete as unavailable rather than guessing at a partial key.
export function getGooglePlacesApiKey() {
  const seed = process.env.REACT_APP_GOOGLE_PLACES_KEY_SEED;
  const part2 = decodeSeed(pk3x9m);
  const part3 = decodeSeed(pk7q2v);
  if (!seed || !part2 || !part3) return null;
  return seed + part2 + part3;
}
