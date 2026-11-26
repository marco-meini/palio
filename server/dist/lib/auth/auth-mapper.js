import { effectivePermissions } from './permissions.js';
export function toCurrentUserDto(user) {
    return {
        id: user.idp_user_id,
        displayName: user.display_name,
        email: user.email,
        permissions: effectivePermissions(user.permissions),
    };
}
//# sourceMappingURL=auth-mapper.js.map