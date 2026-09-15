import { Router } from 'express'

import { bulkCreateInquiries, createInquiry, deleteInquiry, listInquiryItems } from '../controllers/inquiry.controller.js'
import { authenticate } from '../middlewares/auth.middleware.js'

const router = Router()

router.get('/', authenticate, listInquiryItems)
router.post('/bulk', authenticate, bulkCreateInquiries)
router.post('/', authenticate, createInquiry)
router.delete('/:id', authenticate, deleteInquiry)

export default router
