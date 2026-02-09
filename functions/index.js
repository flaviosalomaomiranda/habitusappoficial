const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Resend } = require("resend");

admin.initializeApp();

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const randomPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const length = 20;
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

const loadConfig = () => {
  const cfg = functions.config();
  return {
    resendKey: cfg.resend && cfg.resend.key ? String(cfg.resend.key) : "",
    mailFrom: cfg.mail && cfg.mail.from ? String(cfg.mail.from) : "",
    appUrl: cfg.app && cfg.app.url ? String(cfg.app.url) : "",
    adminEmails: (cfg.admin && cfg.admin.emails ? String(cfg.admin.emails) : "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  };
};

const ensureAllowed = async (req, adminEmails) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const err = new Error("UNAUTHENTICATED");
    err.status = 401;
    throw err;
  }

  const decoded = await admin.auth().verifyIdToken(token);
  const requesterEmail = normalizeEmail(decoded.email);
  if (!requesterEmail || !adminEmails.includes(requesterEmail)) {
    const err = new Error("FORBIDDEN");
    err.status = 403;
    throw err;
  }
  return decoded;
};

exports.createManager = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { resendKey, mailFrom, appUrl, adminEmails } = loadConfig();
  if (!resendKey || !mailFrom || !appUrl || adminEmails.length === 0) {
    return res.status(500).json({ error: "CONFIG_NOT_READY" });
  }

  try {
    await ensureAllowed(req, adminEmails);

    const email = normalizeEmail(req.body && req.body.email);
    const fullName = String((req.body && req.body.fullName) || "").trim();
    const managerId = String((req.body && req.body.managerId) || "").trim();

    if (!email) return res.status(400).json({ error: "EMAIL_REQUIRED" });

    let user;
    try {
      user = await admin.auth().createUser({
        email,
        password: randomPassword(),
        displayName: fullName || undefined,
      });
    } catch (err) {
      if (err && err.code === "auth/email-already-exists") {
        user = await admin.auth().getUserByEmail(email);
      } else {
        throw err;
      }
    }

    const resetLink = await admin.auth().generatePasswordResetLink(email, { url: appUrl });

    const resend = new Resend(resendKey);
    const subject = "Acesso de gerente - Habitus";
    const text = [
      `Olá ${fullName || ""},`,
      "",
      "Seu acesso ao Habitus foi criado.",
      "Para definir sua senha, use este link:",
      resetLink,
      "",
      "Se você não esperava este e-mail, ignore.",
    ].join("\n");
    const html = [
      `<p>Olá ${fullName || ""},</p>`,
      "<p>Seu acesso ao Habitus foi criado.</p>",
      `<p><a href="${resetLink}" target="_blank" rel="noopener noreferrer">Definir senha</a></p>`,
      "<p>Se você não esperava este e-mail, ignore.</p>",
    ].join("");

    await resend.emails.send({
      from: mailFrom,
      to: email,
      subject,
      text,
      html,
    });

    if (managerId) {
      await admin.firestore().collection("managers").doc(managerId).set(
        {
          authUserId: user.uid,
          inviteStatus: "pending",
          mustChangePassword: false,
          resetLinkSentAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return res.status(200).json({
      ok: true,
      uid: user.uid,
      resetLink,
    });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    console.error("createManager error:", err);
    return res.status(status).json({ error: err.message || "UNKNOWN_ERROR" });
  }
});
