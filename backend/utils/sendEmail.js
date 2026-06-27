const nodemailer = require('nodemailer');
const dns = require('dns');

// Hosts like Render resolve smtp.gmail.com to an IPv6 address they cannot route
// to (connect ENETUNREACH …:465). Prefer IPv4 for the SMTP fallback path.
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) { /* older Node */ }

const fromEmail = () =>
  process.env.FROM_EMAIL || process.env.SMTP_EMAIL || 'noreply@campusbuzz.local';
const fromName = () => process.env.FROM_NAME || 'CampusBuzz';

/**
 * Send via Brevo's HTTP API (https, port 443).
 * Use this on hosts like Render that block outbound SMTP ports (25/465/587).
 * Requires BREVO_API_KEY and a verified sender (FROM_EMAIL / SMTP_EMAIL).
 */
const sendViaBrevo = async (options) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key':      process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept:         'application/json',
    },
    body: JSON.stringify({
      sender:      { name: fromName(), email: fromEmail() },
      to:          [{ email: options.email }],
      subject:     options.subject,
      textContent: options.message,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
  const data = await res.json().catch(() => ({}));
  console.log('Message sent via Brevo:', data.messageId || '(ok)');
  return data;
};

/**
 * Send via SMTP (nodemailer). Used for local development. On hosts that block
 * SMTP this will time out — use Brevo in production instead.
 */
const sendViaSmtp = async (options) => {
  const isGmail = (process.env.SMTP_HOST || '').includes('gmail');
  const port    = Number(process.env.SMTP_PORT) || 2525;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
    port,
    secure: port === 465,
    ...(isGmail && { service: 'gmail' }),
    auth: {
      user: process.env.SMTP_EMAIL || 'user',
      pass: process.env.SMTP_PASSWORD || 'password',
    },
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });

  const message = {
    from:    `${fromName()} <${fromEmail()}>`,
    to:      options.email,
    subject: options.subject,
    text:    options.message,
  };

  const smtpConfigured = !!process.env.SMTP_HOST;
  try {
    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (err) {
    console.error('[sendEmail] SMTP failed:', err.message);
    // When SMTP is configured, surface the real error. Only mock in local dev
    // (no SMTP credentials set) so the app keeps working offline.
    if (smtpConfigured) throw err;
    console.log('\n--- MOCKED EMAIL CONTENT ---');
    console.log(`To: ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message:\n${options.message}`);
    console.log('----------------------------\n');
  }
};

/**
 * sendEmail({ email, subject, message })
 * Prefers the Brevo HTTP API when BREVO_API_KEY is set (works on Render),
 * otherwise falls back to SMTP / console mock for local development.
 */
const sendEmail = async (options) => {
  if (process.env.BREVO_API_KEY) return sendViaBrevo(options);
  return sendViaSmtp(options);
};

module.exports = sendEmail;
