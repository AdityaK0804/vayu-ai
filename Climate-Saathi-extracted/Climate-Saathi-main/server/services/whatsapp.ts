/**
 * WhatsApp alert sender via Twilio WhatsApp API.
 *
 * Requires env vars:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *
 * The "from" number must be a Twilio WhatsApp-enabled sender
 * (sandbox: "whatsapp:+14155238886", production: your own number).
 */

const TWILIO_SID = () => process.env.TWILIO_ACCOUNT_SID ?? ''
const TWILIO_TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? ''
const TWILIO_FROM = () => process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'

function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}

interface SendResult {
  success: boolean
  sid?: string
  error?: string
}

/**
 * Send a WhatsApp message via Twilio REST API (no SDK needed).
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { success: false, error: 'Twilio credentials not configured' }
  }

  // Normalize phone number: ensure whatsapp: prefix
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const fromNumber = TWILIO_FROM().startsWith('whatsapp:')
    ? TWILIO_FROM()
    : `whatsapp:${TWILIO_FROM()}`

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID()}/Messages.json`

  const params = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    Body: body,
  })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${TWILIO_SID()}:${TWILIO_TOKEN()}`).toString('base64'),
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    })

    const json = await res.json()

    if (!res.ok) {
      return { success: false, error: json.message ?? `Twilio ${res.status}` }
    }

    return { success: true, sid: json.sid }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Network error' }
  }
}

/**
 * Build a well-formatted alert message for WhatsApp.
 */
export function formatAlertMessage(alert: {
  type: string
  severity: string
  message: string
  facilityName: string
  district: string
  triggeredAt: string | Date
}, language: 'ENGLISH' | 'HINDI' = 'ENGLISH'): string {
  const typeLabels: Record<string, string> = {
    WATER_SHORTAGE: language === 'HINDI' ? 'जल की कमी' : 'Water Shortage',
    SOLAR_FAILURE: language === 'HINDI' ? 'सोलर विफलता' : 'Solar Failure',
    HEAT_STRESS: language === 'HINDI' ? 'गर्मी का तनाव' : 'Heat Stress',
    DISEASE_RISK: language === 'HINDI' ? 'रोग का खतरा' : 'Disease Risk',
    TURBIDITY: language === 'HINDI' ? 'जल मैलापन' : 'Turbidity',
  }

  const sevLabels: Record<string, string> = {
    LOW: language === 'HINDI' ? 'कम' : 'LOW',
    MEDIUM: language === 'HINDI' ? 'मध्यम' : 'MEDIUM',
    HIGH: language === 'HINDI' ? 'उच्च' : 'HIGH',
    CRITICAL: language === 'HINDI' ? 'गंभीर' : 'CRITICAL',
  }

  const time = new Date(alert.triggeredAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  if (language === 'HINDI') {
    return [
      `🚨 *Climate Saathi अलर्ट*`,
      ``,
      `*प्रकार:* ${typeLabels[alert.type] ?? alert.type}`,
      `*गंभीरता:* ${sevLabels[alert.severity] ?? alert.severity}`,
      `*सुविधा:* ${alert.facilityName}`,
      `*जिला:* ${alert.district}`,
      `*समय:* ${time}`,
      ``,
      `*संदेश:* ${alert.message}`,
      ``,
      `कृपया तुरंत कार्रवाई करें।`,
    ].join('\n')
  }

  return [
    `🚨 *Climate Saathi Alert*`,
    ``,
    `*Type:* ${typeLabels[alert.type] ?? alert.type}`,
    `*Severity:* ${sevLabels[alert.severity] ?? alert.severity}`,
    `*Facility:* ${alert.facilityName}`,
    `*District:* ${alert.district}`,
    `*Time:* ${time}`,
    ``,
    `*Message:* ${alert.message}`,
    ``,
    `Please take immediate action.`,
  ].join('\n')
}
