'use client';

import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { X, Plus, Hash } from 'lucide-react';
import { suggestTags } from '../../../shared/tag-suggestions';

export interface TagEditorProps {
  value?: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxTags?: number;
  showPopularSuggestions?: boolean;
}

// Consistent deterministic color generator based on tag string
export const getTagColorClass = (name: string): { bg: string; text: string; border: string } => {
  const palettes = [
    { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
    { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
    { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
    { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30' },
    { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
    { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
};

export const TagEditor: React.FC<TagEditorProps> = ({
  value = [],
  onChange,
  placeholder,
  className = '',
  disabled = false,
  maxTags = 30,
  showPopularSuggestions = true,
}) => {
  const { allTags, t } = useWorkspace();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentTags = useMemo(() => Array.isArray(value) ? value : [], [value]);
  const listId = useId();

  // Autocomplete matching suggestions
  const suggestions = useMemo(() => {
    return suggestTags(allTags, currentTags, inputValue);
  }, [inputValue, allTags, currentTags]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tagName: string) => {
    if (disabled) return;
    const trimmed = allTags.find(tag => tag.name.toLowerCase() === tagName.trim().toLowerCase())?.name || tagName.trim();
    if (!trimmed) return;
    if (currentTags.length >= maxTags) return;

    // Check case-insensitive duplicate
    const exists = currentTags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      onChange([...currentTags, trimmed]);
    }
    setInputValue('');
    setSelectedIndex(-1);
  };

  const removeTag = (indexToRemove: number) => {
    if (disabled) return;
    const newTags = currentTags.filter((_, idx) => idx !== indexToRemove);
    onChange(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        addTag(suggestions[selectedIndex].name);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && currentTags.length > 0) {
      e.preventDefault();
      removeTag(currentTags.length - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsFocused(true);
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsFocused(true);
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Escape') {
      setIsFocused(false);
      setSelectedIndex(-1);
    }
  };

  // Popular unselected tags to suggest quick clicks
  const popularSuggestions = useMemo(() => {
    if (!showPopularSuggestions) return [];
    return suggestTags(allTags, currentTags, '', 5);
  }, [allTags, currentTags, showPopularSuggestions]);

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-2 w-full ${className}`}>
      {/* Chips Container & Input Box */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 p-2 rounded-xl border transition-all cursor-text min-h-[44px]
          ${
            disabled
              ? 'opacity-60 cursor-not-allowed bg-subtle/30 border-subtle'
              : isFocused
              ? 'bg-surface border-pale-sky-500 shadow-sm ring-1 ring-pale-sky-500/20'
              : 'bg-surface border-subtle hover:border-subtle-accent'
          }`}
      >
        {/* Render Existing Tag Chips */}
        {currentTags.map((tag, idx) => {
          const colors = getTagColorClass(tag);
          return (
            <span
              key={`${tag}-${idx}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors select-none ${colors.bg} ${colors.text} ${colors.border}`}
            >
              <Hash className="w-3 h-3 opacity-60 shrink-0" />
              <span>{tag}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(idx);
                  }}
                  className="p-0.5 hover:bg-black/20 dark:hover:bg-white/20 rounded-full transition-colors"
                  aria-label={`${t('tagRemoveAction')}: ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}

        {/* Text Input */}
        {!disabled && currentTags.length < maxTags && (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={placeholder || t('addTagPlaceholder')}
            aria-autocomplete="list"
            aria-expanded={isFocused && suggestions.length > 0}
            aria-controls={isFocused && suggestions.length > 0 ? listId : undefined}
            aria-activedescendant={isFocused && suggestions[selectedIndex] ? `${listId}-${selectedIndex}` : undefined}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsFocused(true);
              setSelectedIndex(-1);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => { setIsFocused(false); setSelectedIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder={currentTags.length === 0 ? (placeholder || t('addTagPlaceholder')) : ''}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-main placeholder:text-muted outline-none px-1 py-0.5"
          />
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isFocused && !disabled && currentTags.length < maxTags && suggestions.length > 0 && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('addTagPlaceholder')}
          className="absolute z-50 top-full mt-1.5 w-full bg-surface rounded-2xl border border-subtle shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto p-1 divide-y divide-subtle/40"
          style={{ insetInlineStart: 0 }}
        >
          {suggestions.map((item, idx) => {
            const isHighlighted = idx === selectedIndex;
            const colors = getTagColorClass(item.name);
            return (
              <div
                key={item.id}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(item.name);
                }}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl cursor-pointer text-sm transition-all ${
                  isHighlighted ? 'bg-pale-sky-500/15 text-pale-sky-500 font-medium' : 'hover:bg-subtle/60 text-main'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[11px] font-bold ${colors.bg} ${colors.text}`}
                  >
                    #
                  </span>
                  <span className="font-medium">{item.name}</span>
                </div>
                {item.workCount > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-subtle text-muted">
                    {t('tagBookCount', { count: item.workCount })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Suggested Popular Tags */}
      {showPopularSuggestions && !disabled && popularSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted pt-0.5">
          <span className="opacity-70">{t('popularTags')}</span>
          {popularSuggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addTag(item.name)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-subtle/50 hover:bg-pale-sky-500/15 hover:text-pale-sky-500 border border-subtle text-muted transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
