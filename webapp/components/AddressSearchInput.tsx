'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Municipality } from '@/types/charging';

// Mapping table for PDOK municipality names to our database names
// PDOK uses official CBS names, which differ from common/simplified names in our database
//
// Common issues with Dutch municipality names:
// 1. Apostrophe 's-: PDOK uses official 's-Gravenhage, 's-Hertogenbosch
// 2. Parenthetical disambiguation: PDOK omits periods: Bergen (NH) vs Bergen (NH.)
// 3. Regional identifiers: PDOK uses (O), (L), (NH), (ZH) for disambiguation
//
// PDOK returns:                Our database has:
// - 's-Gravenhage         ->   Den Haag (common name)
// - 's-Hertogenbosch      ->   s-Hertogenbosch (no apostrophe)
// - Bergen (NH)           ->   Bergen (NH.) (with period)
// - Bergen (L)            ->   Bergen (L.) (with period)
// - Hengelo (O)           ->   Hengelo (simplified, no region identifier)
// - Beek (L)              ->   Beek (simplified, no region identifier)
// - Laren (NH)            ->   Laren (simplified, no region identifier)
// - Middelburg (Z)        ->   Middelburg (simplified, no region identifier)
// - Rijswijk (ZH)         ->   Rijswijk (simplified, no region identifier)
// - Stein (L)             ->   Stein (simplified, no region identifier)
const MUNICIPALITY_NAME_MAPPING: Record<string, string> = {
  // Apostrophe 's- cases
  "'s-gravenhage": "den haag",
  "'s-hertogenbosch": "s-hertogenbosch",

  // Bergen disambiguation (keep period)
  "bergen (nh)": "bergen (nh.)",
  "bergen (l)": "bergen (l.)",

  // Regional identifiers removed in our database (without periods)
  "hengelo (o)": "hengelo",
  "beek (l)": "beek",
  "laren (nh)": "laren",
  "middelburg (z)": "middelburg",
  "rijswijk (zh)": "rijswijk",
  "stein (l)": "stein",

  // With periods (just in case PDOK returns these variants)
  "hengelo (o.)": "hengelo",
  "beek (l.)": "beek",
  "laren (nh.)": "laren",
  "middelburg (z.)": "middelburg",
  "rijswijk (zh.)": "rijswijk",
  "stein (l.)": "stein",
};

interface SearchResult {
  id: string;
  displayName: string;
  type: string;
  municipality?: string;
  score: number;
}

interface AddressDetails {
  id: string;
  displayName: string;
  municipality: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
}

interface AddressSearchInputProps {
  municipalities: Municipality[];
  onAddressSelected: (
    municipalitySlug: string,
    coordinates: { latitude: number; longitude: number },
    displayName: string
  ) => void;
}

export default function AddressSearchInput({
  municipalities,
  onAddressSelected,
}: AddressSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const searchAddress = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(searchQuery)}`
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();
      setResults(data.results || []);
      setShowDropdown(true);
      setSelectedIndex(-1);
    } catch (err) {
      console.error('Geocoding error:', err);
      setError('Adres zoeken mislukt. Probeer het opnieuw.');
      setResults([]);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout (300ms debounce)
    timeoutRef.current = setTimeout(() => {
      searchAddress(value);
    }, 300);
  };

  // Handle result selection
  const handleSelectResult = async (result: SearchResult) => {
    setQuery(result.displayName);
    setShowDropdown(false);
    setIsLoading(true);
    setError(null);

    try {
      // Lookup full details for the selected address
      const response = await fetch(`/api/geocode?id=${encodeURIComponent(result.id)}`);

      if (!response.ok) {
        throw new Error('Address lookup failed');
      }

      const details: AddressDetails = await response.json();

      if (!details.coordinates) {
        setError('Geen coördinaten beschikbaar voor dit adres');
        setIsLoading(false);
        return;
      }

      if (!details.municipality) {
        setError('Geen gemeente beschikbaar voor dit adres');
        setIsLoading(false);
        return;
      }

      // Find matching municipality in our data
      // First normalize the PDOK municipality name
      let normalizedMunicipality = details.municipality.toLowerCase();

      // Check if we have a mapping for this PDOK name (e.g., 's-Gravenhage -> Den Haag)
      if (MUNICIPALITY_NAME_MAPPING[normalizedMunicipality]) {
        normalizedMunicipality = MUNICIPALITY_NAME_MAPPING[normalizedMunicipality];
      }

      // Try to find exact match
      let municipality = municipalities.find(
        (m) => m.name.toLowerCase() === normalizedMunicipality
      );

      // If no exact match, try to find by slug (some edge cases)
      if (!municipality) {
        const slugMatch = municipalities.find(
          (m) => m.slug.toLowerCase() === normalizedMunicipality.replace(/\s+/g, '-').replace(/\./g, '')
        );
        if (slugMatch) {
          municipality = slugMatch;
        }
      }

      if (!municipality) {
        setError(
          `Gemeente "${details.municipality}" niet beschikbaar in de database`
        );
        setIsLoading(false);
        return;
      }

      // Notify parent component
      onAddressSelected(municipality.slug, details.coordinates, details.displayName);
    } catch (err) {
      console.error('Address lookup error:', err);
      setError('Adres ophalen mislukt. Probeer het opnieuw.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Zoek adres..."
          className="w-full px-3 md:px-4 py-2.5 md:py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-sm"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <svg
              className="animate-spin h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}
        {!isLoading && query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setShowDropdown(false);
              setError(null);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-red-600">{error}</div>
      )}

      {/* Dropdown results */}
      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[50vh] md:max-h-96 overflow-y-auto"
        >
          {results.map((result, index) => (
            <button
              key={result.id}
              onClick={() => handleSelectResult(result)}
              className={`w-full px-3 md:px-4 py-3 text-left hover:bg-blue-50 active:bg-blue-100 transition ${
                index === selectedIndex ? 'bg-blue-50' : ''
              } ${index !== results.length - 1 ? 'border-b border-gray-200' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {result.displayName}
                  </div>
                  {result.municipality && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {result.municipality}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {result.type === 'adres' ? 'Adres' :
                     result.type === 'weg' ? 'Straat' :
                     result.type === 'postcode' ? 'PC' :
                     result.type === 'woonplaats' ? 'Plaats' : result.type}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showDropdown && !isLoading && query.length >= 3 && results.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-3 md:px-4 py-3"
        >
          <div className="text-sm text-gray-500">
            Geen resultaten voor &quot;{query}&quot;
          </div>
        </div>
      )}
    </div>
  );
}
