import { ipcMain } from 'electron';
import { OpdsClientService } from '../services/opds/opds-client.service';
import { OpdsServerService } from '../services/opds/opds-server.service';
import type { OPDSCatalog, OPDSServerConfig } from '../../shared/types/opds';

export function registerOpdsIpcHandlers(): void {
  const client = OpdsClientService.getInstance();
  const server = OpdsServerService.getInstance();

  ipcMain.handle('opds:get-presets', async () => {
    return client.getBuiltInCatalogs();
  });

  ipcMain.handle('opds:browse-catalog', async (_event, url: string, catalog?: Partial<OPDSCatalog>) => {
    return client.fetchFeed(url, catalog);
  });

  ipcMain.handle(
    'opds:search-catalog',
    async (_event, searchTemplate: string, query: string, catalog?: Partial<OPDSCatalog>) => {
      return client.searchCatalog(searchTemplate, query, catalog);
    }
  );

  ipcMain.handle(
    'opds:download-book',
    async (_event, downloadUrl: string, catalog?: Partial<OPDSCatalog>, suggestedFileName?: string) => {
      return client.downloadAndImportBook(downloadUrl, catalog, suggestedFileName);
    }
  );

  ipcMain.handle('opds:server-start', async (_event, port?: number) => {
    return server.startServer(port);
  });

  ipcMain.handle('opds:server-stop', async () => {
    return server.stopServer();
  });

  ipcMain.handle('opds:server-status', async () => {
    return server.getStatus();
  });

  ipcMain.handle('opds:server-set-config', async (_event, config: Partial<OPDSServerConfig>) => {
    server.setConfig(config);
    return server.getConfig();
  });
}
