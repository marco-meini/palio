/**
 * Catalogo dei permessi. Ogni funzione nuova aggiunge qui i suoi permessi (e il tipo
 * `Permission`, anche nel client): il `Record` obbliga a definirli tutti.
 */
const SECTIONS = {
    chat: 'Chat',
    users: 'Utenti',
};
const DEFINITIONS = {
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
export const ALL_PERMISSIONS = Object.keys(DEFINITIONS);
export const PERMISSION_CATALOG = Object.entries(SECTIONS).map(([key, label]) => ({
    key,
    label,
    permissions: ALL_PERMISSIONS.filter((p) => p.startsWith(`${key}.`)).map((p) => ({
        key: p,
        ...DEFINITIONS[p],
    })),
}));
export function isPermission(value) {
    return typeof value === 'string' && Object.hasOwn(DEFINITIONS, value);
}
/** Permessi effettivi: quelli assegnati più quelli che comprendono (modificare → vedere). */
export function effectivePermissions(granted) {
    const result = new Set();
    const add = (permission) => {
        if (result.has(permission))
            return;
        result.add(permission);
        DEFINITIONS[permission].implies.forEach(add);
    };
    granted.filter(isPermission).forEach(add);
    return ALL_PERMISSIONS.filter((p) => result.has(p));
}
/** `true` se l'utente ha tutti i permessi richiesti. */
export function hasPermissions(user, required) {
    const effective = effectivePermissions(user.permissions);
    return required.every((p) => effective.includes(p));
}
//# sourceMappingURL=permissions.js.map