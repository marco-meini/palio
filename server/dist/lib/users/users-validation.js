import { badRequest } from '../http-error.js';
import { isEmail } from '../auth/email.js';
import { ALL_PERMISSIONS, isPermission } from '../auth/permissions.js';
function str(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}
/** Valida e normalizza i dati di un utente; in caso di errori `400` con il dettaglio per campo. */
export function parseUserInput(body) {
    const input = (body ?? {});
    const errors = {};
    const firstName = str(input['firstName']);
    const lastName = str(input['lastName']);
    const email = str(input['email']).toLowerCase();
    const permissions = input['permissions'] ?? [];
    if (!firstName)
        errors['firstName'] = 'Il nome è obbligatorio';
    else if (firstName.length > 50)
        errors['firstName'] = 'Massimo 50 caratteri';
    if (!lastName)
        errors['lastName'] = 'Il cognome è obbligatorio';
    else if (lastName.length > 50)
        errors['lastName'] = 'Massimo 50 caratteri';
    if (!email)
        errors['email'] = "L'email è obbligatoria";
    else if (!isEmail(email))
        errors['email'] = 'Email non valida';
    if (!Array.isArray(permissions) || !permissions.every(isPermission)) {
        errors['permissions'] = 'Permessi non validi';
    }
    else if (permissions.length === 0) {
        errors['permissions'] = 'Serve almeno un permesso';
    }
    if (Object.keys(errors).length > 0) {
        throw badRequest('Dati non validi', errors);
    }
    return {
        firstName,
        lastName,
        email,
        permissions: ALL_PERMISSIONS.filter((p) => permissions.includes(p)),
    };
}
export function fullName(firstName, lastName) {
    return [firstName, lastName].filter(Boolean).join(' ');
}
//# sourceMappingURL=users-validation.js.map