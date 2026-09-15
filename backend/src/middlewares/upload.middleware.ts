import fs from 'node:fs'
import path from 'node:path'

import multer from 'multer'

import { env } from '../config/env.js'
import { normalizeUploadedFilename } from '../utils/filename.js'

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.webp'])

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    const orderId = String(req.params.id)
    const uploadPath = path.resolve(process.cwd(), env.uploadDir, 'orders', orderId)
    fs.mkdirSync(uploadPath, { recursive: true })
    callback(null, uploadPath)
  },
  filename(_req, file, callback) {
    const extension = path.extname(normalizeUploadedFilename(file.originalname)).toLowerCase()
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`
    callback(null, safeName)
  }
})

export const uploadOrderFile = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter(_req, file, callback) {
    const extension = path.extname(normalizeUploadedFilename(file.originalname)).toLowerCase()

    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
      callback(new Error('Only PDF, Word, Excel and image files are supported'))
      return
    }

    callback(null, true)
  }
})
