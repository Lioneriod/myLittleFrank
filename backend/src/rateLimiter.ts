import { fail } from "./errors";

const MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): void {
    const now = Date.now();
    if (this.hits.size > MAX_KEYS) this.prune(now);

    const recent = (this.hits.get(key) ?? []).filter((time) => time > now - this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    if (recent.length > this.limit) fail("rate_limited");
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((time) => time <= now - this.windowMs)) this.hits.delete(key);
    }
  }
}
