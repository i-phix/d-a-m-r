// Remaining two-thirds of the Google Places API key, stored only as
// shifted character codes (same +7 shift scheme used on the backend for
// the Gemini key) so the full value never sits as one plaintext string in
// the source tree. Reassembled at runtime in src/utils/googleMapsKey.js
// together with the first third, which lives in .env
// (REACT_APP_GOOGLE_PLACES_KEY_SEED).
//
// Worth being upfront about the actual security model here: this key is
// inherently public once the app is running in a browser (it has to be
// sent to Google to load the Maps/Places script at all, and is visible in
// the page's network requests to anyone using the deployed site). This
// split does not change that — it only means someone with just the raw
// source files (not a running copy of the app) can't grab the whole key
// with a single search. The real access control for this key is the HTTP
// referrer + API restrictions set on it in Cloud Console.
export const pk3x9m = [116, 96, 108, 95, 127, 81, 62, 96, 90, 84, 105, 87, 89];
export const pk7q2v = [83, 120, 72, 97, 97, 124, 92, 92, 112, 57, 95, 52, 110];
