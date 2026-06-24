/**
 * @param {unknown} email
 */
export function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

/**
 * @typedef {{ id: number; email: string; display_name: string; created_at: Date }} DimmeloUserRow
 */

/**
 * @param {{ queryReturnFirst: (sql: string, replacements?: unknown[]) => Promise<DimmeloUserRow | null> }} pg
 * @param {unknown} email
 * @returns {Promise<DimmeloUserRow | null>}
 */
export async function findDimmeloUserByEmail(pg, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return pg.queryReturnFirst(
    'SELECT id, email, display_name, created_at FROM dimmelo_users WHERE email = $1',
    [normalized],
  );
}
