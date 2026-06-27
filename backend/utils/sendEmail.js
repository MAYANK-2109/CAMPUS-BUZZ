const nodemailer = require('nodemailer');
const dns = require('dns');

// Hosts like Render resolve smtp.gmail.com to an IPv6 address they cannot route
// to (connect ENETUNREACH …:465), which hangs/fails the send. Prefer IPv4 for
// all DNS lookups so nodemailer connects over IPv4 first. (Node 16.4+)
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) { /* older Node */ }

const sendEmail = async (options) => {
  // 1) Create a transporter
  const isGmail = (process.env.SMTP_HOST || '').includes('gmail');
  const port    = Number(process.env.SMTP_PORT) || 2525;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
    port,
    secure: port === 465,        // SMTPS on 465, STARTTLS otherwise
    ...(isGmail && { service: 'gmail' }),
    auth: {
      user: process.env.SMTP_EMAIL || 'user',
      pass: process.env.SMTP_PASSWORD || 'password',
    },
    // Hosts like Render resolve smtp.gmail.com to an unreachable IPv6 address
    // (connect ENETUNREACH …:465). Force IPv4 so the connection succeeds.
    family: 4,
    // Fail fast instead of hanging — keeps requests under the client timeout.
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });

  // 2) Define the email options.
  // Gmail requires the From address to be the authenticated account, so default
  // the sender to SMTP_EMAIL rather than an arbitrary address.
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_EMAIL || 'noreply@campusbuzz.local';
  const message = {
    from: `${process.env.FROM_NAME || 'CampusBuzz'} <${fromEmail}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // 3) Actually send the email
  const smtpConfigured = !!process.env.SMTP_HOST;
  try {
    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (err) {
    console.error('[sendEmail] failed:', err.message);
    // When SMTP is configured (production), a failure is a real error — surface
    // it so callers don't report a false success. Only fall back to a console
    // mock for local dev where no SMTP credentials are set.
    if (smtpConfigured) throw err;
    console.log('\n--- MOCKED EMAIL CONTENT ---');
    console.log(`To: ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message:\n${options.message}`);
    console.log('----------------------------\n');
  }
};

module.exports = sendEmail;
