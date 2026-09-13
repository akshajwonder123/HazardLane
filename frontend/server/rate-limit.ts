/** Only fixed, recognized provider messages may enter logs; never arbitrary bodies. */
export async function rateLimitEvidence(response: Response) {
  let body = '', bytes = 0;
  try {
    const reader = response.body?.getReader();
    if (reader) while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); body = ''; break; }
      body += new TextDecoder().decode(part.value);
    }
    const value = JSON.parse(body);
    const reason = typeof value.reason === 'string' && /^(?:Minutely|Hourly|Daily) API request limit exceeded\.(?: Please try again (?:in one minute|in an hour|tomorrow)\.)?$/i.test(value.reason) ? value.reason : null;
    return { reason, format: 'json' as const };
  } catch { return { reason: null, format: 'unrecognized' as const }; }
}

export function retryDeadline(header: string | null, reason: string | null, now: number, strikes: number): number {
  let advertised = 0;
  if (header && /^\d+$/.test(header.trim())) advertised = now + Number(header) * 1000;
  else if (header) { const date = Date.parse(header); if (Number.isFinite(date)) advertised = date; }
  const period = /^daily/i.test(reason ?? '') ? 86400000 : /^hourly/i.test(reason ?? '') ? 3600000 : 0;
  // No automatic retry. Subsequent callers must wait; repeated unqualified429s back off.
  const fallback = period || Math.min(3600000, 60000 * 2 ** Math.min(6, Math.max(0, strikes - 1)));
  const deadline = advertised > now ? Math.max(advertised, now + period) : now + fallback;
  return Math.min(8640000000000000, Math.max(now + 1000, deadline));
}
