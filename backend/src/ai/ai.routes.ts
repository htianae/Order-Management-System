import { Router } from 'express'

import { aiChat } from './ai.controller.js'
import { authenticate } from '../middlewares/auth.middleware.js'

const router = Router()

router.post('/chat', authenticate, aiChat)

export default router
