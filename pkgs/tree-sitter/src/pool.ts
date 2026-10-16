import { Worker } from "node:worker_threads";
const pool = new Map<
  string,
  {
    worker: Worker;
    pending: Map<
      number,
      { resolve: (v: any) => void; reject: (e: Error) => void }
    >;
  }
>();
let sequence = 0;
export function request(
  language: string,
  action: string,
  args: unknown[],
  pkg?: string,
): Promise<any> {
  const key = `${pkg ?? "default"}:${language}`;
  let entry = pool.get(key);
  if (!entry) {
    for (const [oldKey, old] of pool)
      if (pool.size >= 4 && old.pending.size === 0) {
        void old.worker.terminate();
        pool.delete(oldKey);
        break;
      }
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      workerData: { language, package: pkg },
    });
    entry = { worker, pending: new Map() };
    const item = entry;
    worker.on("message", ({ id, value, error }) => {
      const job = item.pending.get(id);
      item.pending.delete(id);
      if (!item.pending.size) worker.unref();
      if (error) job?.reject(new Error(error));
      else job?.resolve(value);
    });
    worker.on("error", (error) => {
      for (const job of item.pending.values()) job.reject(error);
      item.pending.clear();
      pool.delete(key);
    });
    worker.on("exit", (code) => {
      for (const job of item.pending.values())
        job.reject(new Error(`Parser worker exited (${code})`));
      item.pending.clear();
      if (pool.get(key) === item) pool.delete(key);
    });
    pool.set(key, item);
  }
  const id = ++sequence;
  const current = entry;
  current.worker.ref();
  return new Promise((resolve, reject) => {
    current.pending.set(id, { resolve, reject });
    current.worker.postMessage({ id, action, args });
  });
}
export async function closeParsers() {
  await Promise.all([...pool.values()].map((e) => e.worker.terminate()));
  pool.clear();
}
