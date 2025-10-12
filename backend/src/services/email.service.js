// backend/src/services/email.service.js
const nodemailer = require('nodemailer');

// 🔹 Configuración del transporte con variables de entorno
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587, 
  secure: false, // true para 465, false para otros
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Enviar correo de notificación de asignación de turno
 * @param {string} to Correo del empleado
 * @param {string} subject Asunto
 * @param {string} html Contenido en HTML
 */
async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"Hospital Regional" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email enviado a ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Error enviando email:", error);
    return false;
  }
}

module.exports = { sendEmail };
