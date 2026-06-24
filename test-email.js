const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: { user: 'bgv-asq.com@bgv-asq.com', pass: 'Lawyerspassword@2026' }
});
t.sendMail({
  from: '"Aniceta Law Firm" <bgv-asq.com@bgv-asq.com>',
  to: 'theadmin@bgv-asq.com',
  subject: 'Direct SMTP Test - theadmin inbox check',
  html: '<p>If you see this in <b>theadmin@bgv-asq.com</b>, email is fully working.</p>'
}, (err, info) => {
  if (err) console.log('FAIL:', err.message);
  else console.log('SENT to theadmin! MessageId:', info.messageId);
});
