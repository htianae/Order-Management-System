import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { Request, Response } from 'express'

import { loginSchema } from '../validators/auth.validator.js'
import { signAccessToken } from '../utils/jwt.js'
import { prisma } from '../utils/prisma.js'

function toSafeUser(user: {
  id: string
  username: string
  displayName: string | null
  role: UserRole
}) {
  return {
    id: user.id,
    username: user.username,
    realName: user.displayName,
    role: user.role
  }
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid sign-in details',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  const { username, password } = parsed.data
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      displayName: true,
      role: true,
      isActive: true
    }
  })

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Incorrect username or password' })
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash)

  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Incorrect username or password' })
  }

  const token = signAccessToken({
    sub: user.id,
    username: user.username,
    role: user.role
  })

  return res.json({
    message: 'Signed in successfully',
    token,
    user: toSafeUser(user)
  })
}

export function getCurrentUser(req: Request, res: Response) {
  return res.json({
    user: req.user
  })
}
