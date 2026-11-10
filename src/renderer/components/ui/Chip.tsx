'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface ChipProps {
  label: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  removable?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onSelect,
  removable = false,
  onRemove,
  removeLabel,
  icon,
  disabled = false,
  className = '',
}) => {
  const { t } = useWorkspace();
  const effectiveRemoveLabel = removeLabel || t('delete');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.();
    } else if (removable && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      onRemove?.();
    }
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-medium rounded-full transition-all select-none border ${
        selected
          ? 'bg-primary text-primary-contrast border-primary shadow-xs'
          : 'bg-surface text-text-muted border-border hover:bg-canvas hover:text-text'
      } ${removable ? 'ps-3 pe-1.5' : 'px-3'} py-1 gap-1.5 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {icon && <span className="shrink-0 inline-flex size-3.5 items-center justify-center" aria-hidden="true">{icon}</span>}
      {onSelect ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onSelect}
          onKeyDown={handleKeyDown}
          aria-pressed={selected}
          className="focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus rounded cursor-pointer truncate max-w-xs"
        >
          {label}
        </button>
      ) : (
        <span className="truncate max-w-xs">{label}</span>
      )}
      {removable && onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`${effectiveRemoveLabel}: ${typeof label === 'string' ? label : ''}`}
          title={effectiveRemoveLabel}
          className={`p-0.5 rounded-full transition-colors cursor-pointer hover:bg-black/10 dark:hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-focus ${
            selected ? 'text-primary-contrast/90 hover:text-primary-contrast' : 'text-text-muted hover:text-text'
          }`}
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
};
