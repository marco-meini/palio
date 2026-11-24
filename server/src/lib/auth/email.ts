const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Formato email (verifica leggera: il resto lo fa il server di posta). */
export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

/** Email da un body JSON: stringa ripulita e minuscola, `''` se manca. */
export function emailFrom(body: unknown): string {
  const value = (body as { email?: unknown } | null | undefined)?.email;
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
