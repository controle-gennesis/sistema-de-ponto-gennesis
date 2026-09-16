export function isNetworkError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network|failed to fetch|network request failed|timeout|offline|sem conexão|sem rede|econnrefused|enotfound|typeerror|internet|timed out/i.test(
    msg
  );
}
