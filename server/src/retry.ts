// Equal-jitter exponential backoff: the delay lands in [cap / 2, cap], where cap doubles per attempt up to maxDelay.
export function backoffDelay(attempt: number, baseDelay: number, maxDelay: number): { delayCap: number; delay: number } {
  const delayCap = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
  return { delayCap, delay: Math.round(delayCap / 2 + Math.random() * (delayCap / 2)) };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
