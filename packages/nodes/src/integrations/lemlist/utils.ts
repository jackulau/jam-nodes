export const LEMLIST_API_BASE = 'https://api.lemlist.com/api'

/**
 * Build the Lemlist Authorization header value.
 * Lemlist uses HTTP Basic auth with an empty username and the API key as the password:
 * `Basic base64(":" + apiKey)`.
 */
export function buildLemlistAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`:${apiKey}`).toString('base64')
  return `Basic ${encoded}`
}

/**
 * Build the standard Lemlist request headers (Authorization + Content-Type).
 */
export function buildLemlistHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: buildLemlistAuthHeader(apiKey),
    'Content-Type': 'application/json',
  }
}
