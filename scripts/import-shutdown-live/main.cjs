const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.BAGLIB_IMPORT_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
let started = false;
const evidence = { quitDuringImport: false, windowClosed: false, errors: [] };
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) evidence.errors.push(message.slice(0, 1000)); });
  const send = owner.webContents.send.bind(owner.webContents);
  owner.webContents.send = (channel, ...args) => {
    if (channel === 'digital:import-progress' && !evidence.quitDuringImport) {
      evidence.quitDuringImport = true;
      evidence.firstProgress = args[0];
      setImmediate(() => app.quit());
    }
    return send(channel, ...args);
  };
  owner.on('closed', () => { evidence.windowClosed = true; });
  owner.webContents.once('did-finish-load', async () => {
    try {
      const language = process.env.BAGLIB_IMPORT_LIVE_LANG;
      await owner.webContents.executeJavaScript(`localStorage.setItem('baglib-lang',${JSON.stringify(language)})`);
      await owner.reload();
      owner.webContents.once('did-finish-load', async () => {
        try {
          const options = JSON.parse(fs.readFileSync(path.join(directory, 'options.json'), 'utf8'));
          await owner.webContents.executeJavaScript(`window.electronAPI.importDigitalFiles(${JSON.stringify(options)})`, true);
        } catch (error) {
          if (!owner.isDestroyed()) { evidence.failure = String(error); app.exit(1); }
        }
      });
    } catch (error) { evidence.failure = String(error); app.exit(1); }
  });
});
app.on('will-quit', () => fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)));
require('../../dist/main/index.js');
