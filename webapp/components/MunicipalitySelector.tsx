'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Municipality } from '@/types/charging';

interface MunicipalitySelectorProps {
  municipalities: Municipality[];
  selected: string;
  onChange: (slug: string) => void;
}

type SortOrder = 'asc' | 'desc';

export default function MunicipalitySelector({
  municipalities,
  selected,
  onChange,
}: MunicipalitySelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get selected municipality display name
  const selectedMunicipality = municipalities.find(m => m.slug === selected);
  const displayValue = selectedMunicipality
    ? `${selectedMunicipality.name} (${selectedMunicipality.province})`
    : '';

  // Get Nederland separately (always shown as sticky footer)
  const nederland = useMemo(() =>
    municipalities.find(m => m.slug === 'nederland'),
    [municipalities]
  );

  // Sort and filter municipalities (excluding Nederland)
  const filteredMunicipalities = useMemo(() => {
    // Exclude Nederland from regular list (it will be sticky at bottom)
    let filtered = municipalities.filter(m => m.slug !== 'nederland');

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.province.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort alphabetically
    filtered = [...filtered].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return sortOrder === 'asc'
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    });

    return filtered;
  }, [municipalities, searchTerm, sortOrder]);

  // Reset highlighted index when search term or dropdown visibility changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchTerm, showDropdown]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcut (Cmd/Ctrl + K) to focus search
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setShowDropdown(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  }, []);

  const handleSelect = (slug: string) => {
    onChange(slug);
    setShowDropdown(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const toggleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      // Open dropdown on ArrowDown when closed
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setShowDropdown(true);
      }
      return;
    }

    // Total items including sticky Nederland
    const totalItems = filteredMunicipalities.length + (nederland ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < totalItems - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredMunicipalities.length) {
          handleSelect(filteredMunicipalities[highlightedIndex].slug);
        } else if (highlightedIndex === filteredMunicipalities.length && nederland) {
          // Nederland is selected (sticky footer)
          handleSelect(nederland.slug);
        } else if (filteredMunicipalities.length === 1) {
          // Auto-select if only one result
          handleSelect(filteredMunicipalities[0].slug);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;

      case 'Tab':
        // Close dropdown on Tab
        setShowDropdown(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          id="municipality"
          value={showDropdown ? searchTerm : displayValue}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedMunicipality ? displayValue : "Selecteer gemeente..."}
          className="w-full px-3 md:px-4 py-2.5 md:py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-sm"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="municipality-listbox"
          aria-activedescendant={
            highlightedIndex >= 0 ? `municipality-option-${highlightedIndex}` : undefined
          }
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {showDropdown && (
          <div
            ref={dropdownRef}
            id="municipality-listbox"
            role="listbox"
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[60vh] md:max-h-96 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-gray-50 px-3 py-2 text-xs text-gray-500 border-b flex items-center justify-between z-10">
              <span>{filteredMunicipalities.length} gemeentes</span>
              <div className="flex items-center gap-2">
                <kbd className="hidden md:inline-block px-1.5 py-0.5 text-xs font-mono bg-white border border-gray-300 rounded">
                  ⌘K
                </kbd>
                <button
                  onClick={toggleSort}
                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1 p-1 -m-1"
                  title={sortOrder === 'asc' ? 'Sorteer Z-A' : 'Sorteer A-Z'}
                  tabIndex={-1}
                >
                  {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortOrder === 'asc' ? "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" : "M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"} />
                  </svg>
                </button>
              </div>
            </div>

            {/* Municipality list */}
            {filteredMunicipalities.length > 0 ? (
              filteredMunicipalities.map((m, index) => (
                <button
                  key={m.slug}
                  id={`municipality-option-${index}`}
                  role="option"
                  aria-selected={m.slug === selected}
                  data-index={index}
                  onClick={() => handleSelect(m.slug)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full text-left px-3 md:px-4 py-3 md:py-2 transition-colors ${
                    index === highlightedIndex
                      ? 'bg-blue-100'
                      : m.slug === selected
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                  tabIndex={-1}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.province}</div>
                    </div>
                    {m.slug === selected && (
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 md:py-8 text-center text-sm text-gray-500">
                Geen gemeentes gevonden voor &quot;{searchTerm}&quot;
              </div>
            )}

            {/* Sticky Nederland footer */}
            {nederland && (
              <div className="sticky bottom-0 border-t border-gray-200 bg-white shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                <button
                  id={`municipality-option-nederland`}
                  role="option"
                  aria-selected={nederland.slug === selected}
                  data-index={filteredMunicipalities.length}
                  onClick={() => handleSelect(nederland.slug)}
                  onMouseEnter={() => setHighlightedIndex(filteredMunicipalities.length)}
                  className={`w-full text-left px-3 md:px-4 py-3 md:py-2 transition-colors ${
                    highlightedIndex === filteredMunicipalities.length
                      ? 'bg-blue-100'
                      : nederland.slug === selected
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                  tabIndex={-1}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{nederland.name}</div>
                      <div className="text-xs text-gray-500">Landelijk overzicht</div>
                    </div>
                    {nederland.slug === selected && (
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
