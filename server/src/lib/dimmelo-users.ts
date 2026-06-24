import type { PgClientManager } from './pg-client-manager.js';

export interface IDimmeloUserRecord {
  id: number;
  email: string;
  display_name: string;
  created_at: Date;
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

export async function findDimmeloUserByEmail(
  pg: Pick<PgClientManager, 'queryReturnFirst'>,
  email: unknown,
): Promise<IDimmeloUserRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return pg.queryReturnFirst<IDimmeloUserRecord>(
    'SELECT id, email, display_name, created_at FROM dimmelo_users WHERE email = $1',
    [normalized],
  );
}
