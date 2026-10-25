import { EventEmitter } from 'node:events';
import { utilityProcess } from 'electron';

export class MetadataProcess extends EventEmitter {
  private readonly child: Electron.UtilityProcess;
  private ready = false;
  private pending?: unknown;
  private stopped = false;

  constructor(modulePath: string) {
    super();
    this.child = utilityProcess.fork(modulePath, [], { serviceName: 'Baglib metadata extraction', stdio: 'pipe', execArgv: ['--max-old-space-size=768'] });
    this.child.on('message', message => this.emit('message', message));
    this.child.on('exit', code => this.emit('exit', code));
    this.child.once('spawn', () => {
      if (this.stopped) { this.child.kill(); return; }
      this.ready = true;
      if (this.pending !== undefined) { this.child.postMessage(this.pending); this.pending = undefined; }
    });
    this.child.stdout?.on('data', data => process.stdout.write(data));
    this.child.stderr?.on('data', data => process.stderr.write(data));
  }

  postMessage(message: unknown): void {
    if (this.ready) this.child.postMessage(message);
    else this.pending = message;
  }

  terminate(): void { this.stopped = true; this.pending = undefined; this.child.kill(); }
  unref(): void {}
}
