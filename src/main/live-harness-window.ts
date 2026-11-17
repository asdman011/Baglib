import { screen, type App, type BrowserWindow } from 'electron';

/**
 * Live test harnesses (scripts/<name>/main.cjs) drive the real app. By default their windows open
 * off-screen and never take focus, so a run doesn't cover the screen while the user works.
 *
 * Why not minimised: on Windows a minimised window has no drawing surface, so capturePage fails
 * ("Current display surface not available for capture"). An off-screen window keeps rendering
 * normally. It still has a taskbar button; clicking it brings the window onto the screen.
 *
 * Set BAGLIB_LIVE_VISIBLE=1 to watch a run in a normal window. The packaged app is never started
 * with a scripts/ entry file, so this never applies to real use.
 */
export function isLiveHarnessRun(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.BAGLIB_LIVE_VISIBLE === '1') return false;
  return argv.some(arg => /(^|[\\/])scripts[\\/][^\\/]+[\\/][^\\/]+\.c?js$/u.test(arg));
}

/** A position just past the left edge of the leftmost display. */
export function offscreenPosition(displayXs: readonly number[], width: number): { x: number; y: number } {
  const leftmost = displayXs.length ? Math.min(...displayXs) : 0;
  return { x: leftmost - width - 200, y: 0 };
}

export function keepWindowInBackground(win: BrowserWindow): void {
  win.webContents.setBackgroundThrottling(false);
  let userWantsIt = false;
  const park = () => {
    if (win.isDestroyed() || userWantsIt) return;
    const [width] = win.getSize();
    const { x, y } = offscreenPosition(screen.getAllDisplays().map(d => d.bounds.x), width);
    win.setPosition(x, y, false);
  };
  const showInactive = win.showInactive.bind(win);
  win.show = () => {
    if (win.isDestroyed()) return;
    park();
    if (!win.isVisible()) showInactive();
  };
  win.focus = () => {};
  win.maximize = () => {};
  win.moveTop = () => {};
  win.setAlwaysOnTop = () => {};
  win.flashFrame = () => {};
  win.center = () => park();
  // Harness code sizes the window after creation; keep it parked.
  win.on('resize', park);
  // The user clicked the taskbar button: bring the window onto the screen and leave it there.
  win.on('focus', () => {
    if (userWantsIt || win.isDestroyed()) return;
    userWantsIt = true;
    const area = screen.getPrimaryDisplay().workArea;
    const [width, height] = win.getSize();
    win.setPosition(area.x + Math.max(0, Math.round((area.width - width) / 2)), area.y + Math.max(0, Math.round((area.height - height) / 2)));
  });
  park();
}

/** Call before app.whenReady(). */
export function installLiveHarnessWindowMode(app: App): boolean {
  if (!isLiveHarnessRun()) return false;
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.on('browser-window-created', (_event, win) => keepWindowInBackground(win));
  return true;
}
