import { createApp } from './app'
import { config } from './config'

createApp().listen(config.port, () => {
  console.log(`payments listening on http://localhost:${config.port}`)
})
