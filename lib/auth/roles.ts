export type UserRole = 'admin' | 'editor' | 'viewer';

export function canWriteMasterData(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'editor';
}

export function canDeleteMasterData(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}
