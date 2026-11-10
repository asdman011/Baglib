'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-contrast hover:opacity-95 active:scale-[0.98] shadow-sm focus-visible:outline-focus',
  secondary:
    'bg-surface text-text border border-border hover:bg-canvas active:scale-[0.98] focus-visible:outline-focus',
  ghost:
    'text-primary-text hover:bg-primary/10 active:scale-[0.98] focus-visible:outline-focus',
  danger:
    'bg-danger text-white hover:opacity-95 active:scale-[0.98] shadow-sm focus-visible:outline-danger',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9.5 px-4 text-sm rounded-xl gap-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon,
    children,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={`inline-flex items-center justify-center font-sans font-medium transition-all select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin shrink-0 size-3.5" aria-hidden="true" />
      ) : (
        icon && <span className="shrink-0 inline-flex" aria-hidden="true">{icon}</span>
      )}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'icon'> {
  label: string;
  icon?: React.ReactNode;
}

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: 'size-8 p-1.5 rounded-lg',
  md: 'size-9.5 p-2 rounded-xl',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled = false,
    children,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={`inline-flex items-center justify-center font-sans transition-all select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ${variantStyles[variant]} ${iconSizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin shrink-0 size-4" aria-hidden="true" />
      ) : (
        children
      )}
    </button>
  );
});
