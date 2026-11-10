'use client';

import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface text-text-muted border-border',
  primary: 'bg-primary/15 text-primary-text border-primary-text/30',
  accent: 'bg-accent/15 text-accent border-accent/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  outline: 'bg-transparent text-text border-border',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold font-sans rounded-full border leading-tight select-none ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
