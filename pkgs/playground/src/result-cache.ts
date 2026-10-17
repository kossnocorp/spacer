// Page-local, bounded LRU cache. Failed requests remain retryable; simultaneous
// requests for the same input share one promise. Credentials are never stored.
export class ResultCache<T> {
  private results = new Map<string, T>();
  private pending = new Map<string, Promise<T>>();

  get(key: string): T | undefined {
    const result = this.results.get(key);
    if (result !== undefined) {
      this.results.delete(key);
      this.results.set(key, result);
    }
    return result;
  }

  async run(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = Promise.resolve()
      .then(load)
      .then((result) => {
        this.results.set(key, result);
        if (this.results.size > 30)
          this.results.delete(this.results.keys().next().value!);
        return result;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}

export const resultKey = (source: string, filename: string, backend: string) =>
  JSON.stringify([source, filename, backend]);
