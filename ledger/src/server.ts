import { createApp } from './app'

const port = Number(process.env.PORT ?? 4003)

createApp().listen(port, () => {
  console.log(`ledger listening on http://localhost:${port}`)
})
