const SHARD_COUNT = 5;

export function databaseNameFromUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const segment = withoutQuery.split("/").pop() ?? "";
  return decodeURIComponent(segment);
}

export function withDatabaseName(url: string, databaseName: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "postgres:"));
  parsed.pathname = `/${databaseName}`;
  return parsed.toString().replace(/^postgres:/, "postgresql:");
}

export function adminDatabaseUrl(url: string): string {
  return withDatabaseName(url, "neondb");
}

export function shardDatabaseName(index: number): string {
  return `tudu_e2e_${index}`;
}

export function shardDatabaseUrl(templateUrl: string, index: number): string {
  return withDatabaseName(templateUrl, shardDatabaseName(index));
}

export function e2eShardCount(): number {
  return SHARD_COUNT;
}

/** Shard 1..5 maps to database index 0..4 (Playwright --shard is 1-based). */
export function shardIndexFromPlaywrightShard(shard: number): number {
  if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
    throw new Error(`Shard must be 1..${SHARD_COUNT}, got ${shard}`);
  }
  return shard - 1;
}

export function readShardUrlFromEnv(index: number): string | undefined {
  return process.env[`E2E_DATABASE_URL_${index}`]?.trim();
}

export function resolveShardUrl(templateUrl: string, index: number): string {
  return readShardUrlFromEnv(index) ?? shardDatabaseUrl(templateUrl, index);
}
