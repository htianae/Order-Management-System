import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Please enter your username'),
  password: z.string().min(1, 'Please enter your password')
})

export type LoginInput = z.infer<typeof loginSchema>
