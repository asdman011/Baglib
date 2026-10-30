interface CanvasSurface { width: number; height: number }

export class PdfCanvasPool<Surface extends CanvasSurface> {
  private idle: Surface[] = [];
  private leased = new Set<Surface>();
  private disposed = false;

  constructor(private create: () => Surface, private maxIdle = 4, private maxBytes = 32 * 1024 * 1024) {}

  acquire(): Surface {
    if (this.disposed) throw new Error('cancelled');
    const surface = this.idle.pop() || this.create();
    this.leased.add(surface);
    return surface;
  }

  release(surface: Surface): void {
    if (!this.leased.delete(surface)) return;
    const bytes = [...this.idle, surface].reduce((total, canvas) => total + canvas.width * canvas.height * 4, 0);
    if (this.disposed || this.idle.length >= this.maxIdle || bytes > this.maxBytes) {
      surface.width = 0;
      surface.height = 0;
    } else this.idle.push(surface);
  }

  dispose(): void {
    this.disposed = true;
    for (const surface of this.idle) { surface.width = 0; surface.height = 0; }
    this.idle = [];
  }
}
