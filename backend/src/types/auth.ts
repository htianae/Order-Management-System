import type { UserRole } from '@prisma/client'

export interface AuthUser {
  id: string
  username: string
  realName: string | null
  role: UserRole
}

export interface JwtPayload {
  sub: string
  username: string
  role: UserRole
}
