import React, { useEffect, useRef, useState } from "react";
import { loadGooglePlacesLibrary } from "../../utils/loadGoogleMaps";

// Free-text input with Google Places (New) autocomplete suggestions,
// styled as a plain Bootstrap form-control + dropdown so it matches every
// other input in this app, rather than Google's shadow-DOM
// PlaceAutocompleteElement widget (which is hard to restyle to fit).
//
// - onChange(e) fires with a {target:{name,value}} shape, same as a plain
//   <input>, so it drops into the existing handleChange(e) pattern used
//   across facilities.js/locations.js unchanged.
// - onPlaceSelected(details) is optional and fires only when a suggestion
//   is actually picked, with the formatted address plus parsed
//   county/town, so callers can auto-fill sibling fields.
function AddressAutocompleteInput({
  name,
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className = "form-control",
  countryCodes, // e.g. ["ke"] to bias/restrict results to Kenya
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const placesRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadGooglePlacesLibrary()
      .then((places) => {
        if (!cancelled) placesRef.current = places;
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runFetch = async (text) => {
    const places = placesRef.current;
    if (!places || !text || text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new places.AutocompleteSessionToken();
      }
      const request = {
        input: text,
        sessionToken: sessionTokenRef.current,
      };
      if (countryCodes?.length) request.includedRegionCodes = countryCodes;

      const { suggestions: results } =
        await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      setSuggestions(results || []);
      setOpen(true);
    } catch (err) {
      // Non-fatal — the field still works as a plain text input either way —
      // but log it so a real cause (bad API key restrictions, API not
      // enabled, etc.) is visible in the browser console instead of just
      // silently showing no suggestions.
      console.error("Places Autocomplete request failed:", err);
      setLoadError(err.message || String(err));
      setSuggestions([]);
    }
  };

  const handleInputChange = (e) => {
    onChange(e);
    const text = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runFetch(text), 250);
  };

  const handleSelect = async (suggestion) => {
    const places = placesRef.current;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "addressComponents"] });

      const formatted =
        place.formattedAddress || suggestion.placePrediction.text.toString();
      onChange({ target: { name, value: formatted } });

      if (onPlaceSelected) {
        const components = place.addressComponents || [];
        const find = (type) =>
          components.find((c) => c.types.includes(type))?.longText || "";
        onPlaceSelected({
          formattedAddress: formatted,
          county: find("administrative_area_level_1"),
          town:
            find("locality") ||
            find("sublocality") ||
            find("administrative_area_level_2"),
        });
      }
    } finally {
      setOpen(false);
      setSuggestions([]);
      sessionTokenRef.current = places ? new places.AutocompleteSessionToken() : null;
    }
  };

  return (
    <div className="position-relative" ref={containerRef}>
      <input
        name={name}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => value && runFetch(value)}
        autoComplete="off"
      />
      {loadError && <div className="form-text text-danger">{loadError}</div>}
      {open && suggestions.length > 0 && (
        <ul
          className="list-group position-absolute w-100 shadow-sm"
          style={{ zIndex: 1050, maxHeight: 220, overflowY: "auto" }}
        >
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="list-group-item list-group-item-action"
              style={{ cursor: "pointer" }}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              {s.placePrediction.text.toString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AddressAutocompleteInput;
