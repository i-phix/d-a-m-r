import { getGooglePlacesApiKey } from "./googleMapsKey";

// Loads the Google Maps JS API using Google's own "dynamic library import"
// bootstrap loader — see
// https://developers.google.com/maps/documentation/javascript/load-maps-js-api#dynamic-library-import
// A plain <script src="https://maps.googleapis.com/maps/api/js?key=..."> tag
// does NOT reliably define window.google.maps.importLibrary; this inline
// snippet is what Google itself ships to guarantee importLibrary exists.
// De-minified here (functionally identical to Google's snippet) with the
// hardcoded "YOUR_API_KEY" replaced by our runtime-resolved key.
function installBootstrapLoader(apiKey) {
  ((g) => {
    let h, a, k;
    const p = "The Google Maps JavaScript API";
    const c = "google";
    const l = "importLibrary";
    const q = "__ib__";
    const m = document;
    let b = window;
    b = b[c] || (b[c] = {});
    const d = b.maps || (b.maps = {});
    const r = new Set();
    const e = new URLSearchParams();
    const u = () =>
      h ||
      (h = new Promise(async (f, n) => {
        await (a = m.createElement("script"));
        e.set("libraries", [...r] + "");
        for (k in g) {
          e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), g[k]);
        }
        e.set("callback", c + ".maps." + q);
        a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
        d[q] = f;
        a.onerror = () => (h = n(Error(p + " could not load.")));
        a.nonce = m.querySelector("script[nonce]")?.nonce || "";
        m.head.append(a);
      }));
    d[l]
      ? console.warn(p + " only loads once. Ignoring:", g)
      : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)));
  })({
    key: apiKey,
    v: "weekly",
  });
}

let placesLibraryPromise = null;

export function loadGooglePlacesLibrary() {
  if (placesLibraryPromise) return placesLibraryPromise;

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    placesLibraryPromise = Promise.reject(
      new Error(
        "Google Places API key not configured (missing REACT_APP_GOOGLE_PLACES_KEY_SEED or key parts)",
      ),
    );
    return placesLibraryPromise;
  }

  if (!window.google?.maps?.importLibrary) {
    installBootstrapLoader(apiKey);
  }

  placesLibraryPromise = window.google.maps.importLibrary("places").catch((err) => {
    throw new Error(`Failed to load Google Places library: ${err.message}`);
  });

  return placesLibraryPromise;
}
