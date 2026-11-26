const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Formato email (verifica leggera: il resto lo fa il server di posta). */
export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}
