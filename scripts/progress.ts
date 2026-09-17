// Renders an in-place, single-line progress indicator for a long-running
// step (embedding hundreds of chunks, OCR'ing pages one at a time) so a
// multi-minute ingest run doesn't look hung. `interrupt()` lets a caller
// print a one-off console.log/warn (e.g. "chunk exceeded context window")
// without it getting smeared by the in-place line.
export class ProgressBar {
  private current = 0;
  private lastLineLength = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly label: string,
    private readonly total: number,
  ) {
    this.render();
  }

  tick(n = 1): void {
    this.current += n;
    this.render();
  }

  interrupt(print: () => void): void {
    process.stdout.write(`\r${" ".repeat(this.lastLineLength)}\r`);
    print();
    this.render();
  }

  done(): void {
    this.render();
    process.stdout.write("\n");
  }

  private render(): void {
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    const rate = elapsedSec > 0 ? this.current / elapsedSec : 0;
    const remainingSec = rate > 0 ? (this.total - this.current) / rate : 0;
    const pct = this.total === 0 ? 100 : Math.min(100, Math.round((this.current / this.total) * 100));

    const barWidth = 24;
    const filled = Math.round((barWidth * pct) / 100);
    const bar = `${"#".repeat(filled)}${"-".repeat(barWidth - filled)}`;

    const eta = this.current >= this.total || rate === 0 ? "" : ` ETA ${formatDuration(remainingSec)}`;
    const line = `  ${this.label} [${bar}] ${this.current}/${this.total} (${pct}%) ${formatDuration(elapsedSec)} elapsed${eta}`;

    this.lastLineLength = Math.max(this.lastLineLength, line.length);
    process.stdout.write(`\r${line.padEnd(this.lastLineLength)}`);
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m${secs.toString().padStart(2, "0")}s`;
}
