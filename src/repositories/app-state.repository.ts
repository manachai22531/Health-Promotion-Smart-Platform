import type { AppState } from '../types/domain';

interface QueryResultLike<TRow = Record<string, unknown>> {
  rows: TRow[];
}

interface TransactionClient {
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResultLike<TRow>>;
  release(): void;
}

export interface StateDatabasePool {
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResultLike<TRow>>;
  connect(): Promise<TransactionClient>;
}

type RelationalSync = (
  client: TransactionClient,
  state: AppState,
  revision: number,
) => Promise<unknown>;

interface StateRow {
  data?: AppState;
  revision?: string | number;
}

interface RevisionRow {
  revision?: string | number;
}

export const READ_STATE_SQL = 'SELECT data, revision FROM app_state WHERE id = 1';
export const WRITE_STATE_SQL =
  'UPDATE app_state SET data = $1::jsonb, revision=revision+1, updated_at = NOW() WHERE id = 1 RETURNING revision';

export async function readAppState(pool: StateDatabasePool): Promise<AppState> {
  const result = await pool.query<StateRow>(READ_STATE_SQL);
  return {
    ...(result.rows[0]?.data || {}),
    _revision: Number(result.rows[0]?.revision || 0),
  };
}

export async function writeAppState(
  pool: StateDatabasePool,
  data: AppState,
  syncStateToRelational: RelationalSync,
): Promise<number> {
  const clean = { ...data };
  delete clean._revision;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<RevisionRow>(WRITE_STATE_SQL, [JSON.stringify(clean)]);
    const revision = Number(result.rows[0]?.revision || 0);
    await syncStateToRelational(client, clean, revision);
    await client.query('COMMIT');
    data._revision = revision;
    return revision;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
