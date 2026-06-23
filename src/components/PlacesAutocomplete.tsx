import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps";

type Props = {
  value: string;
  onChange: (val: { address: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
  className?: string;
  country?: string; // e.g. "MY"
};

export function PlacesAutocomplete({ value, onChange, placeholder, className, country = "MY" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string }>>([]);
  const [open, setOpen] = useState(false);
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async (g) => {
        if (cancelled) return;
        await g.maps.importLibrary("places");
        const { AutocompleteSessionToken } = (g as any).maps.places;
        sessionTokenRef.current = new AutocompleteSessionToken();
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSuggestions = (q: string) => {
    if (!ready || !q.trim() || q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const g = (window as any).google;
    const { AutocompleteSuggestion } = g.maps.places;
    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: q,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: [country.toLowerCase()],
    })
      .then((res: any) => {
        const list = (res.suggestions ?? [])
          .map((s: any) => {
            const p = s.placePrediction;
            if (!p) return null;
            return { placeId: p.placeId, text: p.text?.toString?.() ?? "" };
          })
          .filter(Boolean) as Array<{ placeId: string; text: string }>;
        setSuggestions(list);
        setOpen(true);
      })
      .catch(() => setSuggestions([]));
  };

  const pick = async (s: { placeId: string; text: string }) => {
    setOpen(false);
    setSuggestions([]);
    try {
      const g = (window as any).google;
      const { Place } = g.maps.places;
      const place = new Place({ id: s.placeId, requestedLanguage: "en" });
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      const addr = (place as any).formattedAddress || s.text;
      const loc = (place as any).location;
      const lat = loc?.lat ? loc.lat() : null;
      const lng = loc?.lng ? loc.lng() : null;
      onChange({ address: addr, lat, lng });
      // new session token after place selection
      const { AutocompleteSessionToken } = g.maps.places;
      sessionTokenRef.current = new AutocompleteSessionToken();
    } catch {
      onChange({ address: s.text, lat: null, lng: null });
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ address: v, lat: null, lng: null });
          if (debRef.current) window.clearTimeout(debRef.current);
          debRef.current = window.setTimeout(() => fetchSuggestions(v), 250);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-auto">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60"
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}