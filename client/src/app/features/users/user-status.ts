import type { UserStatus } from '../../core/auth/dto';

export const STATUS_LABELS: Record<UserStatus, string> = {
  invited: 'Invitato',
  active: 'Attivo',
  disabled: 'Disattivato',
};
