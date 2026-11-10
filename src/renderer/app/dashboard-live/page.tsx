'use client';

import React from 'react';
import { WorkspaceProvider } from '../../components/context/WorkspaceContext';
import { HomeDashboardView } from '../../components/dashboard/HomeDashboardView';

export default function DashboardLivePage() {
  return (
    <WorkspaceProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-text">
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <HomeDashboardView />
        </main>
      </div>
    </WorkspaceProvider>
  );
}
