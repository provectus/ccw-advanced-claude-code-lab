import axios from 'axios'
import { config } from './config'
import type { Payout } from './payouts'

const client = axios.create({
  baseURL: config.providerBaseUrl,
  timeout: 5000,
  headers: { Authorization: `Bearer ${config.providerApiKey}` },
})

/** Submits a payout to the external provider. Only called when PROVIDER_LIVE=1. */
export async function submitToProvider(payout: Payout): Promise<{ providerRef: string }> {
  const res = await client.post('/v1/payouts', {
    reference: payout.id,
    amount: payout.amountCents,
    currency: payout.currency,
  })
  return { providerRef: String(res.data?.id ?? '') }
}
