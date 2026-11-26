import type { AuthUser } from './auth-types.js';
import type { CurrentUserDto } from './dto.js';
import { effectivePermissions } from './permissions.js';

export function toCurrentUserDto(user: AuthUser): CurrentUserDto {
  return {
    id: user.idp_user_id,
    displayName: user.display_name,
    email: user.email,
    permissions: effectivePermissions(user.permissions),
  };
}
