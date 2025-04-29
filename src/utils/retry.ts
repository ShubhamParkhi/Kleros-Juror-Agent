export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500
): Promise<T> {
  let err: any;
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      if (i < retries) await new Promise((res) => setTimeout(res, delayMs * i));
    }
  }
  throw err;
}
