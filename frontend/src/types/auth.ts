export type UserRole = 'EMPLOYEE' | 'BOSS' | 'ADMIN'

export interface AuthUser {
  id: string
  username: string
  realName: string | null
  role: UserRole
}

export interface LoginPayload {
  username: string
  password: string
}

export interface LoginResponse {
  message: string
  token: string
  user: AuthUser
}

export interface CurrentUserResponse {
  user: AuthUser
}
