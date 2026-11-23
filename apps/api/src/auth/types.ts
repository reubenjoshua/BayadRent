import { UserRole } from '@bayadrent/shared-types';

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};
