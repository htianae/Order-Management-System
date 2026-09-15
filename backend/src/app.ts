import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'node:path'

import { env } from './config/env.js'
import aiRoutes from './ai/ai.routes.js'
import authRoutes from './routes/auth.routes.js'
import inquiryRoutes from './routes/inquiry.routes.js'
import orderRoutes from './routes/order.routes.js'
import reportRoutes from './routes/report.routes.js'

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(cookieParser())
app.use(morgan('dev'))
app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir)))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/inquiries', inquiryRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/reports', reportRoutes)

export default app
