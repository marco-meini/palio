import type { Permission } from '../auth/dto';
import { ICONS } from './icon';

export interface NavItem {
  label: string;
  path: string;
  icon: readonly string[];
  /** Permesso per vedere la voce (il controllo vero resta su guard e backend). */
  permission?: Permission;
}

/** Voci della sidebar, in ordine. Ogni nuova pagina dell'app si aggiunge qui. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Chat', path: '/chat', icon: ICONS.chat, permission: 'chat.use' },
  { label: 'Palii', path: '/palii', icon: ICONS.flag, permission: 'palii.view' },
  { label: 'Utenti', path: '/utenti', icon: ICONS.users, permission: 'users.view' },
];
