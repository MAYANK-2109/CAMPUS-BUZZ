const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // 1) Create a transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
    port: process.env.SMTP_PORT || 2525,
    auth: {
      user: process.env.SMTP_EMAIL || 'user',
      pass: process.env.SMTP_PASSWORD || 'password',
    },
  });

  // 2) Define the email options
  const message = {
    from: `${process.env.FROM_NAME || 'CampusBuzz'} <${process.env.FROM_EMAIL || 'noreply@campusbuzz.local'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // 3) Actually send the email
  try {
    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
  } catch (err) {
    console.error('Email sending failed (this might be expected if no SMTP details are in .env):', err.message);
    console.log('\n--- MOCKED EMAIL CONTENT ---');
    console.log(`To: ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message:\n${options.message}`);
    console.log('----------------------------\n');
  }
};

module.exports = sendEmail;
