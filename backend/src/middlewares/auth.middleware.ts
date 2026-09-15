import type { NextFunction, Request, Response } from 'express'

import { prisma } from '../utils/prisma.js'
import { verifyAccessToken } from '../utils/jwt.js'
import type { UserRole } from '@prisma/client'

function getBearerToken(req: Request) {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length)
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req)

  if (!token) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  try {
    const payload = verifyAccessToken(token)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true
      }
    })

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or disabled' })
    }

    req.user = {
      id: user.id,
      username: user.username,
      realName: user.displayName,
      role: user.role
    }

    return next()
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again' })
  }
}

export function authorizeRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Please sign in' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource' })
    }

    return next()
  }
}
