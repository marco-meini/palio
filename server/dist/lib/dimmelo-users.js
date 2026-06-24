export function normalizeEmail(email) {
    return String(email ?? '').trim().toLowerCase();
}
export async function findDimmeloUserByEmail(pg, email) {
    const normalized = normalizeEmail(email);
    if (!normalized)
        return null;
    return pg.queryReturnFirst('SELECT id, email, display_name, created_at FROM dimmelo_users WHERE email = $1', [normalized]);
}
//# sourceMappingURL=dimmelo-users.js.map