export interface QueryResultLike<TRow> {
  rows: TRow[];
}

export interface DatabaseClientLike {
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResultLike<TRow>>;
}

export interface HisConnectionRow extends Record<string, unknown> {
  system_code: string;
  api_name?: string;
  endpoint_url?: string;
  http_method?: string;
  content_type?: string;
  api_key?: string;
  active?: boolean;
}

const ACTIVE_CONNECTION_SQL =
  'SELECT * FROM his_api_connections WHERE system_code=$1 AND active=true LIMIT 1';

/** Reads the same row and columns as the legacy inline query. */
export async function findActiveHisConnection(
  client: DatabaseClientLike,
  systemCode: string,
): Promise<HisConnectionRow | null> {
  const result = await client.query<HisConnectionRow>(ACTIVE_CONNECTION_SQL, [systemCode]);
  return result.rows[0] || null;
}

export { ACTIVE_CONNECTION_SQL };
