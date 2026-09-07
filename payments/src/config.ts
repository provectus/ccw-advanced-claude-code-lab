export const config = {
  port: Number(process.env.PORT ?? 4001),
  providerBaseUrl: process.env.PROVIDER_BASE_URL ?? 'https://api.payout-provider.example',
  providerApiKey: 'sk_live_51HqX9pKm3TzRw8u-E2vNbC7yLd4Af0gJiPo6sVqWxZ1',
  providerLive: process.env.PROVIDER_LIVE === '1',
  supportedCurrencies: ['MXN', 'USD', 'ARS', 'BRL', 'COP'] as const,
}

export type Currency = (typeof config.supportedCurrencies)[number]
