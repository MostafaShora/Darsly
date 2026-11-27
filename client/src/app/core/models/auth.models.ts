export interface RegisterRequest {
  accountType?: 'teacher';
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type AuthUserStatus = 'active' | 'pending' | 'suspended';

export interface AccountCapabilities {
  teacher: boolean;
  student: boolean;
  owner: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  status: AuthUserStatus;
  lastLoginAt: string | null;
  capabilities?: AccountCapabilities;
}

export interface AuthenticatedResponse {
  message: string;
  user: AuthUser;
}

export interface AuthMessageResponse {
  message: string;
}
