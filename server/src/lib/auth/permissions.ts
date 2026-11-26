/**
 * Permessi sulle funzioni di palio, `<sezione>.<azione>`. Per le sezioni gestionali `view`
 * (vedere) e `manage` (modificare, che comprende vedere); la chat ha solo `use`.
 * Sono i ruoli del progetto Dimmelo su ZITADEL (stesse chiavi): un permesso nuovo va creato
 * anche lì. Etichette e raggruppamento li espone l'API (`GET /api/permissions`).
 */
export type Permission = 'chat.use' | 'users.view' | 'users.manage';

export interface PermissionDto {
  key: Permission;
  label: string;
  description: string;
  /** Permessi compresi in questo (es. modificare comprende vedere). */
  implies: Permission[];
}

/** Sezione con i suoi permessi, per la pagina di modifica degli utenti. */
export interface PermissionSectionDto {
  key: string;
  label: string;
  permissions: PermissionDto[];
}

/**
 * Catalogo dei permessi. Ogni funzione nuova aggiunge qui i suoi permessi (e il tipo
 * `Permission`, anche nel client): il `Record` obbliga a definirli tutti.
 */
const SECTIONS: Record<string, string> = {
  chat: 'Chat',
  users: 'Utenti',
};

const DEFINITIONS: Record<Permission, { label: string; description: string; implies: Permission[] }> = {
  'chat.use': {
    label: 'Usare',
    description: 'Fare domande a Dimmelo sul database del Palio',
    implies: [],
  },
  'users.view': {
    label: 'Vedere',
    description: 'Elenco e schede degli utenti',
    implies: [],
  },
  'users.manage': {
    label: 'Modificare',
    description: 'Aggiungere, modificare, invitare e disattivare utenti; assegnare permessi',
    implies: ['users.view'],
  },
};

export const ALL_PERMISSIONS = Object.keys(DEFINITIONS) as Permission[];

export const PERMISSION_CATALOG: readonly PermissionSectionDto[] = Object.entries(SECTIONS).map(
  ([key, label]) => ({
    key,
    label,
    permissions: ALL_PERMISSIONS.filter((p) => p.startsWith(`${key}.`)).map((p) => ({
      key: p,
      ...DEFINITIONS[p],
    })),
  }),
);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.hasOwn(DEFINITIONS, value);
}

/** Permessi effettivi: quelli assegnati più quelli che comprendono (modificare → vedere). */
export function effectivePermissions(granted: readonly string[]): Permission[] {
  const result = new Set<Permission>();
  const add = (permission: Permission) => {
    if (result.has(permission)) return;
    result.add(permission);
    DEFINITIONS[permission].implies.forEach(add);
  };
  granted.filter(isPermission).forEach(add);
  return ALL_PERMISSIONS.filter((p) => result.has(p));
}

/** `true` se l'utente ha tutti i permessi richiesti. */
export function hasPermissions(
  user: { permissions: readonly string[] },
  required: readonly Permission[],
): boolean {
  const effective = effectivePermissions(user.permissions);
  return required.every((p) => effective.includes(p));
}
