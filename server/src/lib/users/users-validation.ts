import { badRequest } from '../http-error.js';
import type { UserInputDto } from '../auth/dto.js';
import { isEmail } from '../auth/email.js';
import { ALL_PERMISSIONS, isPermission } from '../auth/permissions.js';

const PHONE = /^\+?[0-9][0-9 ./()-]{4,24}$/;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** Valida e normalizza i dati di un utente; in caso di errori `400` con il dettaglio per campo. */
export function parseUserInput(body: unknown): UserInputDto {
  const input = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const firstName = str(input['firstName']);
  const lastName = str(input['lastName']);
  const email = str(input['email']).toLowerCase();
  const phone = str(input['phone']);
  const isAdmin = input['isAdmin'] === true;
  const permissions = input['permissions'] ?? [];

  if (!firstName) errors['firstName'] = 'Il nome è obbligatorio';
  else if (firstName.length > 50) errors['firstName'] = 'Massimo 50 caratteri';
  if (!lastName) errors['lastName'] = 'Il cognome è obbligatorio';
  else if (lastName.length > 50) errors['lastName'] = 'Massimo 50 caratteri';
  if (!email) errors['email'] = "L'email è obbligatoria";
  else if (!isEmail(email)) errors['email'] = 'Email non valida';
  if (phone && !PHONE.test(phone)) errors['phone'] = 'Numero di telefono non valido';
  if (!Array.isArray(permissions) || !permissions.every(isPermission)) {
    errors['permissions'] = 'Permessi non validi';
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Dati non validi', errors);
  }
  return {
    firstName,
    lastName,
    email,
    phone: phone || null,
    isAdmin,
    permissions: ALL_PERMISSIONS.filter((p) => (permissions as unknown[]).includes(p)),
  };
}

export function fullName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}
