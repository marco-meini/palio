import type { AuthUser } from './auth-types.js';
import type { CurrentUserDto } from './dto.js';
import { effectivePermissions } from './permissions.js';

export function toCurrentUserDto(user: AuthUser): CurrentUserDto {
  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    isAdmin: user.is_admin,
    permissions: effectivePermissions(user.is_admin, user.permissions),
  };
}
