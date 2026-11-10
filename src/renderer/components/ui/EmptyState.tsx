'use client';

import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center select-none ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-canvas border border-border/80 flex items-center justify-center text-text-muted mb-4 shadow-xs">
          {icon}
        </div>
      )}
      <h3 className="font-display text-base sm:text-lg font-bold text-text leading-snug">
        {title}
      </h3>
      {description && (
        <p className="text-xs sm:text-sm text-text-muted max-w-sm mt-1.5 font-sans leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
