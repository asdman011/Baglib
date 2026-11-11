'use client';

import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Skeleton } from './Skeleton';

export function FeedbackSkeleton() {
  const { t } = useWorkspace();
  return <div data-feedback-skeleton role="status" aria-label={t('plannerLoading')} className="space-y-3 p-4">
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-20 w-full" />
  </div>;
}
