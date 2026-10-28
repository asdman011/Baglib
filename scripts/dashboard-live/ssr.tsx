import React from 'react';
import { renderToString } from 'react-dom/server';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { AppLayout } from '../../src/renderer/components/layout/AppLayout';
export function markup() { return renderToString(<WorkspaceProvider><AppLayout /></WorkspaceProvider>); }
