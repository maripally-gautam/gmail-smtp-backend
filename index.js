import express from "express";
import nodemailer from "nodemailer";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// SMTP transporter (SEND ONLY)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Test route
app.get("/", (req, res) => {
  res.send("Gmail SMTP Backend is running");
});

// Send instant email
app.post("/send", async (req, res) => {
  const { to, subject, message } = req.body;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: message,
    });

    res.json({ success: true, message: "Email sent" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Schedule daily email
app.post("/schedule-daily", (req, res) => {
  const { to, subject, message, time } = req.body;
  // time format: "05:00"

  const [hour, minute] = time.split(":");

  cron.schedule(`${minute} ${hour} * * *`, async () => {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: message,
    });
  });

  res.json({ success: true, message: "Daily email scheduled" });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
