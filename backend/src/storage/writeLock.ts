// Serializes mutating operations across the whole backend process so two
// writers (e.g. the HTTP API and the MCP server) can never interleave their
// read-modify-write cycles on the same project files. Reads stay lock-free:
// individual files are written atomically, so a concurrent read is at worst
// slightly stale, never torn.
let tail: Promise<void> = Promise.resolve();

export async function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}
