import { createApp } from './app'

const port = Number(process.env.PORT ?? 4002)

createApp().listen(port, () => {
  console.log(`kyc listening on http://localhost:${port}`)
})
