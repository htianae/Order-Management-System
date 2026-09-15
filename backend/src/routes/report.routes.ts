import { UserRole } from '@prisma/client'
import { Router } from 'express'

import {
  exportAnnualPurchaseContracts,
  listAnnualPurchaseContractCompanies
} from '../controllers/annualPurchaseContract.controller.js'
import { exportAnnualInquirySummary } from '../controllers/annualInquirySummary.controller.js'
import { getBossDashboard, getBusinessAnalysis, getPaymentApplicationSummary, getPendingApprovals } from '../controllers/report.controller.js'
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware.js'

const router = Router()

router.get('/boss', authenticate, authorizeRoles(UserRole.BOSS, UserRole.ADMIN), getBossDashboard)
router.get('/pending-approvals', authenticate, authorizeRoles(UserRole.BOSS, UserRole.ADMIN), getPendingApprovals)
router.get('/business-analysis', authenticate, getBusinessAnalysis)
router.get('/payment-applications', authenticate, getPaymentApplicationSummary)
router.get('/annual-purchase-contracts/companies', authenticate, listAnnualPurchaseContractCompanies)
router.get('/annual-purchase-contracts/export', authenticate, exportAnnualPurchaseContracts)
router.get('/annual-business/inquiry-summary/export', authenticate, exportAnnualInquirySummary)

export default router
