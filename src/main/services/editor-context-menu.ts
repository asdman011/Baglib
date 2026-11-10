import { Menu, type BrowserWindow } from 'electron';
import { translations } from '../../renderer/translations';
/** Electron needs an explicit editing menu for native text controls. */
export function installEditorContextMenu(window: BrowserWindow) {
    window.webContents.on('context-menu', async (event, params) => {
        if (!params.isEditable)
            return;
        event.preventDefault();
        const language = await window.webContents.executeJavaScript('document.documentElement.lang').catch(() => 'en');
        if (window.isDestroyed())
            return;
        const t = translations[language === 'ar' ? 'ar' : 'en'];
        Menu.buildFromTemplate([
            { role: 'undo', label: t.undo, enabled: params.editFlags.canUndo },
            { role: 'redo', label: t.pdfPageEditorRedo, enabled: params.editFlags.canRedo },
            { type: 'separator' },
            { role: 'cut', label: t.ctxCut, enabled: params.editFlags.canCut },
            { role: 'copy', label: t.sunnahCopy, enabled: params.editFlags.canCopy },
            { role: 'paste', label: t.ctxPaste, enabled: params.editFlags.canPaste },
            { type: 'separator' },
            { role: 'selectAll', label: t.ctxSelectAll },
        ]).popup({ window });
    });
}
