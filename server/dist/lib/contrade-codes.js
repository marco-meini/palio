// @ts-nocheck
/** Site contrada codes (DC/BrbXX) → name as seeded in `contrade`. */
export const CONTRADA_CODE_TO_NAME = {
    AQ: 'Aquila',
    BR: 'Bruco',
    CH: 'Chiocciola',
    CI: 'Civetta',
    DR: 'Drago',
    GI: 'Giraffa',
    IS: 'Istrice',
    LE: 'Leocorno',
    LU: 'Lupa',
    NI: 'Nicchio',
    OC: 'Oca',
    ON: 'Onda',
    PA: 'Pantera',
    SE: 'Selva',
    TA: 'Tartuca',
    TO: 'Torre',
    VA: 'Valdimontone',
};
export function contradaNameFromCode(code) {
    const name = CONTRADA_CODE_TO_NAME[String(code || '').toUpperCase()];
    if (!name) {
        throw new Error(`Unknown contrada code: ${code}`);
    }
    return name;
}
/** Alias used by scraper/parser */
export const nameFromCode = contradaNameFromCode;
//# sourceMappingURL=contrade-codes.js.map