import 'dotenv/config'

import { env } from './config/env.js'
import app from './app.js'

app.listen(env.port, env.host, () => {
  console.log(`Backend server is running on http://${env.host}:${env.port}`)
})
