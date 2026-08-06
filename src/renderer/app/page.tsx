'use client';

import { WorkspaceProvider } from '../components/context/WorkspaceContext';
import { AppLayout } from '../components/layout/AppLayout';

export default function Home() {
  return (
    <WorkspaceProvider>
      <AppLayout />
    </WorkspaceProvider>
  );
}
