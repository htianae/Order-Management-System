export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 4000),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'change_me_in_development',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 10),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  fileBaseUrl: process.env.FILE_BASE_URL || 'http://localhost:4000/uploads',
  aiProvider: process.env.AI_PROVIDER || 'bailian',
  aiModel: process.env.AI_MODEL || 'qwen3.7-plus',
  dashScopeApiKey: process.env.DASHSCOPE_API_KEY || '',
  dashScopeBaseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  aiAgentMaxToolIterations: Number(process.env.AI_AGENT_MAX_TOOL_ITERATIONS || 5),
  aiAgentTimeoutMs: Number(process.env.AI_AGENT_TIMEOUT_MS || 30000),
  aiAgentDelayedStatusDays: Number(process.env.AI_AGENT_DELAYED_STATUS_DAYS || 14),
  aiAgentDelayedPurchaseToShipDays: Number(process.env.AI_AGENT_DELAYED_PURCHASE_TO_SHIP_DAYS || 7),
  aiAgentDelayedShipToPaymentDays: Number(process.env.AI_AGENT_DELAYED_SHIP_TO_PAYMENT_DAYS || 30)
}
