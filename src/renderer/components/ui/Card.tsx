'use client';

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'raised';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', className = '', children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={`rounded-2xl border border-border text-text transition-colors ${
        variant === 'raised'
          ? 'bg-surface-raised shadow-md'
          : 'bg-surface shadow-xs'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className = '', children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={`p-4 sm:p-5 flex flex-col space-y-1.5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className = '', children, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={`font-display text-base font-bold text-text leading-snug tracking-normal ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
});

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className = '', children, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={`text-xs text-text-muted leading-relaxed font-sans ${className}`}
      {...props}
    >
      {children}
    </p>
  );
});

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardContent({ className = '', children, ...props }, ref) {
  return (
    <div ref={ref} className={`px-4 sm:px-5 pb-4 sm:pb-5 ${className}`} {...props}>
      {children}
    </div>
  );
});

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardFooter({ className = '', children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={`p-4 sm:p-5 pt-0 flex items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});
