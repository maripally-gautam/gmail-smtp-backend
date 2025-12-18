// console.log("Reading .env from:", process.cwd());

import dotenv from "dotenv";
dotenv.config();
// console.log("Dotenv loaded:", dotenv.config());

// console.log("ENV LOAD TEST:", process.env.EMAIL_USER);

import { pool } from "./db.js";
import express from "express";
import nodemailer from "nodemailer";
import cron from "node-cron";

const app = express();
app.use(express.json());

/* ---------------- SECURITY ---------------- */
function authenticate(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ---------------- SMTP ---------------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.send("Email Scheduler Backend Running");
});

/* ---------------- CREATE SCHEDULE ---------------- */
app.post("/schedule", authenticate, async (req, res) => {
  const { to, subject, message, runAt, repeat } = req.body;

  await pool.query(
    `INSERT INTO schedules (to_email, subject, message, run_at, repeat)
     VALUES ($1, $2, $3, $4, $5)`,
    [to, subject, message, runAt, repeat || "once"]
  );

  res.json({ success: true });
});

/* ---------------- MCP TOOL DISCOVERY ---------------- */
app.get("/mcp", authenticate, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");

  res.write(`data: ${JSON.stringify({
    tools: [
      {
        name: "schedule_email",
        description: "Schedule one-time or recurring email",
        input_schema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            message: { type: "string" },
            runAt: { type: "string" },
            repeat: { type: "string", enum: ["once", "daily", "weekly"] }
          },
          required: ["to", "subject", "message", "runAt"]
        }
      }
    ]
  })}\n\n`);
});

/* ---------------- MCP EXECUTION ---------------- */
app.post("/mcp/schedule_email", authenticate, async (req, res) => {
  const { to, subject, message, runAt, repeat } = req.body;

  await pool.query(
    `INSERT INTO schedules (to_email, subject, message, run_at, repeat)
     VALUES ($1, $2, $3, $4, $5)`,
    [to, subject, message, runAt, repeat || "once"]
  );

  res.json({ success: true });
});

/* ---------------- SCHEDULER ---------------- */
cron.schedule("* * * * *", async () => {
  const { rows } = await pool.query(
    `SELECT * FROM schedules WHERE run_at <= NOW()`
  );

  for (const row of rows) {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: row.to_email,
      subject: row.subject,
      text: row.message
    });

    if (row.repeat === "once") {
      await pool.query(`DELETE FROM schedules WHERE id = $1`, [row.id]);
    } else {
      const next = new Date(row.run_at);
      if (row.repeat === "daily") next.setDate(next.getDate() + 1);
      if (row.repeat === "weekly") next.setDate(next.getDate() + 7);

      await pool.query(
        `UPDATE schedules SET run_at = $1 WHERE id = $2`,
        [next.toISOString(), row.id]
      );
    }
  }
});

/* ---------------- START ---------------- */
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
