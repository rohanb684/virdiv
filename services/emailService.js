import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.mail.us-east-1.awsapps.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVerificationSuccessEmail = async (email, name) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Account Has Been Verified!",
      html: `
        <h2>Congratulations, ${name}!</h2>
        <p>Your account has been successfully verified.</p>
        <p>Welcome to <strong>Viridiv</strong>! 🎉</p>
        <p>We're excited to have you on board.</p>
        <br/>
        <p>Best Regards,<br/>Viridiv Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification success email sent to ${email}`);
  } catch (error) {
    console.error("❌ Error sending verification success email:", error);
  }
};

export const sendVerificationRejectionEmail = async (email, name, reason) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Account Verification Declined",
      html: `
        <h2>Dear ${name},</h2>
        <p>Unfortunately, your account verification has been declined.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please review the provided details and try again with the correct documents.</p>
        <br/>
        <p>Best Regards,<br/>Viridiv Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Rejection email sent to ${email}`);
  } catch (error) {
    console.error("❌ Error sending verification rejection email:", error);
  }
};

export const testMail = async () => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: "rohanb684@gmail.com",
      subject: "Your Account Has Been Verified!",
      html: `
        <h2>Congratulations, Test!</h2>
        <p>Your account has been successfully verified.</p>
        <p>Welcome to <strong>Viridiv</strong>! 🎉</p>
        <p>We're excited to have you on board.</p>
        <br/>
        <p>Best Regards,<br/>Viridiv Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification success email sent to test@email.com`);
  } catch (error) {
    console.error("❌ Error sending verification success email:", error);
  }
};
