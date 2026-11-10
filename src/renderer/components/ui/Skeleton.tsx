'use client';

import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const roundedStyles = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-xl',
  full: 'rounded-full',
};

export const Skeleton: React.FC<SkeletonProps> = ({
  rounded = 'md',
  className = '',
  ...props
}) => {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-border/50 ${roundedStyles[rounded]} ${className}`}
      {...props}
    />
  );
};
