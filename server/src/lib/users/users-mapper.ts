import type { UserDto, UserStatus } from '../auth/dto.js';
import { ALL_PERMISSIONS } from '../auth/permissions.js';
import type { ZitadelGrant } from '../zitadel.js';

export function userStatus(grant: ZitadelGrant, lastLoginAt: Date | undefined): UserStatus {
  if (!grant.active) return 'disabled';
  return lastLoginAt ? 'active' : 'invited';
}

export function toUserDto(grant: ZitadelGrant, lastLoginAt: Date | undefined): UserDto {
  return {
    id: grant.userId,
    firstName: grant.firstName,
    lastName: grant.lastName,
    displayName: grant.displayName || [grant.firstName, grant.lastName].filter(Boolean).join(' '),
    email: grant.email,
    permissions: ALL_PERMISSIONS.filter((p) => grant.roleKeys.includes(p)),
    status: userStatus(grant, lastLoginAt),
    lastLoginAt: lastLoginAt?.toISOString() ?? null,
    createdAt: grant.createdAt,
  };
}
