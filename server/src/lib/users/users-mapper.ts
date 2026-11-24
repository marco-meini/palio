import type { IAppUserRecord } from '../auth/auth-types.js';
import type { UserDto, UserStatus } from '../auth/dto.js';
import { isPermission } from '../auth/permissions.js';
import type { IUserWithPermissionsRow } from '../../model/users.model.js';

export function userStatus(user: IAppUserRecord): UserStatus {
  if (user.disabled_at) return 'disabled';
  return user.last_login_at ? 'active' : 'invited';
}

export function toUserDto(user: IUserWithPermissionsRow): UserDto {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    displayName: user.display_name,
    email: user.email,
    phone: user.phone,
    isAdmin: user.is_admin,
    permissions: user.permissions.filter(isPermission),
    status: userStatus(user),
    lastLoginAt: user.last_login_at?.toISOString() ?? null,
    createdAt: user.created_at.toISOString(),
  };
}
