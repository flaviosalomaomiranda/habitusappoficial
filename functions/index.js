const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const messaging = require("./messaging");
const predictive = require("./predictive");

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

const formatDateForTimezone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
};

const toDateFromYmdAndTime = (ymd, time) => new Date(`${ymd}T${time || "07:30"}:00`);

const computeNextRunAtMs = (scheduleDoc, baseDate = new Date()) => {
  const scheduleType = String(scheduleDoc.scheduleType || "DAILY");
  const time = String(scheduleDoc.time || "07:30");
  const startDate = String(scheduleDoc.startDate || "");
  const onceDate = String(scheduleDoc.onceDate || "");
  const days = Array.isArray(scheduleDoc.days) ? scheduleDoc.days.map((n) => Number(n)) : [];
  const dayOfMonth = Number(scheduleDoc.dayOfMonth || 0);

  if (scheduleType === "ONCE") {
    if (!onceDate) return null;
    return toDateFromYmdAndTime(onceDate, time).getTime();
  }

  const cursor = new Date(baseDate);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i += 1) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + i);
    const y = candidate.getFullYear();
    const m = String(candidate.getMonth() + 1).padStart(2, "0");
    const d = String(candidate.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    if (startDate && dateStr < startDate) continue;

    let matches = false;
    if (scheduleType === "DAILY") matches = true;
    if (scheduleType === "WEEKLY") matches = days.includes(candidate.getDay());
    if (scheduleType === "MONTHLY") matches = dayOfMonth > 0 ? candidate.getDate() === dayOfMonth : true;
    if (!matches) continue;

    return toDateFromYmdAndTime(dateStr, time).getTime();
  }
  return null;
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

exports.dispatchRigidReminders = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const remindersSnap = await admin
    .firestore()
    .collection("reminderSchedules")
    .where("isActive", "==", true)
    .where("nextRunAtMs", "<=", nowMs)
    .limit(200)
    .get();

  if (remindersSnap.empty) return null;

  for (const reminderDoc of remindersSnap.docs) {
    const reminder = reminderDoc.data() || {};
    const familyId = String(reminder.familyId || "");
    const childId = String(reminder.childId || "");
    const habitId = String(reminder.habitId || "");
    const timezone = String(reminder.timezone || "America/Sao_Paulo");
    const todayDate = formatDateForTimezone(now, timezone);

    try {
      if (!familyId || !childId || !habitId) {
        await reminderDoc.ref.set({ isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }

      const childRef = admin.firestore().doc(`families/${familyId}/children/${childId}`);
      const childSnap = await childRef.get();
      if (!childSnap.exists) {
        await reminderDoc.ref.set({ isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }
      const child = childSnap.data() || {};
      const habits = Array.isArray(child.habits) ? child.habits : [];
      const habit = habits.find((h) => String(h && h.id) === habitId);
      if (!habit) {
        await reminderDoc.ref.set({ isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }

      const completions = (habit && habit.completions) || {};
      const isCompletedToday = String(completions[todayDate] || "") === "COMPLETED";
      const sentToday = String(reminder.lastSentDate || "") === todayDate;

      if (!isCompletedToday && !sentToday) {
        const tokensSnap = await admin
          .firestore()
          .collection("userPushTokens")
          .where("familyId", "==", familyId)
          .where("isActive", "==", true)
          .limit(100)
          .get();
        const tokens = tokensSnap.docs.map((docSnap) => String((docSnap.data() || {}).token || "")).filter(Boolean);

        if (tokens.length > 0) {
          const message = {
            notification: {
              title: "Lembrete de rotina",
              body: `${child.name || "Paciente"}: ${habit.name || "Tarefa"}`,
            },
            data: {
              type: "rigid_reminder",
              familyId,
              childId,
              habitId,
              date: todayDate,
            },
            tokens,
          };
          const response = await admin.messaging().sendEachForMulticast(message);
          response.responses.forEach((result, idx) => {
            if (result.success) return;
            const code = result.error && result.error.code ? result.error.code : "";
            if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
              const tokenValue = tokens[idx];
              const tokenDoc = tokensSnap.docs.find((docSnap) => String((docSnap.data() || {}).token || "") === tokenValue);
              if (tokenDoc) {
                tokenDoc.ref.set(
                  {
                    isActive: false,
                    invalidAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                ).catch(() => null);
              }
            }
          });
        }
      }

      const nextRunAtMs = computeNextRunAtMs(reminder, new Date(nowMs + 60 * 1000));
      const shouldDeactivateOnce = String(reminder.scheduleType || "") === "ONCE";
      await reminderDoc.ref.set(
        {
          lastSentDate: !isCompletedToday ? todayDate : reminder.lastSentDate || null,
          nextRunAtMs: shouldDeactivateOnce ? null : nextRunAtMs,
          isActive: shouldDeactivateOnce ? false : Boolean(nextRunAtMs),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("dispatchRigidReminders item error:", err, reminderDoc.id);
    }
  }
  return null;
});

const resolvePlanType = (data) => {
  const explicit = String(data.plan_type || data.plano || "").trim().toUpperCase();
  if (["FREE", "VIP", "PRO", "PREMIUM", "MASTER"].includes(explicit)) return explicit;
  return "FREE";
};

const getVoiceSecondsRemaining = (data) => {
  const raw = Number(
    data.segundos_transcricao_restantes ??
      data.horas_transcricao_restantes ??
      data.transcriptionSecondsRemaining ??
      0
  );
  return Number.isFinite(raw) ? raw : 0;
};

const loadOpenAiKey = () => String(process.env.OPENAI_API_KEY || "").trim();

const verifySignedRequest = async (req) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const err = new Error("UNAUTHENTICATED");
    err.status = 401;
    throw err;
  }
  return admin.auth().verifyIdToken(token);
};

const ensureProfessionalVoiceAccess = async (professionalId, requesterEmail) => {
  const docSnap = await admin.firestore().collection("supportNetwork").doc(String(professionalId || "")).get();
  if (!docSnap.exists) {
    const err = new Error("PROFESSIONAL_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  const data = docSnap.data() || {};
  const email = normalizeEmail(requesterEmail);
  const ownerEmails = [
    normalizeEmail(data.email),
    normalizeEmail(data.professionalEmail),
    normalizeEmail(data.contacts && data.contacts.email),
  ].filter(Boolean);
  if (!email || !ownerEmails.includes(email)) {
    const err = new Error("FORBIDDEN");
    err.status = 403;
    throw err;
  }
  const planType = resolvePlanType(data);
  if (planType === "FREE") {
    const err = new Error("FREE_PLAN_NO_VOICE");
    err.status = 403;
    throw err;
  }
  const remaining = getVoiceSecondsRemaining(data);
  if (remaining <= 0) {
    const err = new Error("VOICE_BALANCE_EXHAUSTED");
    err.status = 403;
    throw err;
  }
  return { planType, remaining };
};

const transcribeAudioWithOpenAI = async ({ apiKey, audioBase64, mimeType }) => {
  const audioBuffer = Buffer.from(String(audioBase64 || ""), "base64");
  const safeMime = String(mimeType || "audio/webm");
  const extension = safeMime.includes("mp4") ? "mp4" : safeMime.includes("mpeg") ? "mp3" : "webm";
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("file", new Blob([audioBuffer], { type: safeMime }), `anamnese.${extension}`);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(String(json.error && json.error.message ? json.error.message : "TRANSCRIPTION_FAILED"));
    err.status = 502;
    throw err;
  }
  return String(json.text || "").trim();
};

const createDefaultAnamnesisSummaryJson = () => ({
  queixaPrincipal: "Não informado",
  historicoSaude: {
    doencasPrevias: "Não informado",
    usoMedicamentos: "Não informado",
    alergias: "Não informado",
    historicoFamiliarRelevante: "Não informado",
    condicoesSistemicasRelevantes: "Não informado",
  },
  habitosHigiene: {
    escovacao: "Não informado",
    usoFioDental: "Não informado",
    enxaguanteBucal: "Não informado",
    outrosHabitosRelevantes: "Não informado",
  },
  linhaDoTempo: [],
  pendenciasProximaConsulta: ["Não informado"],
  conclusao: "Não informado",
});

const normalizeSummaryTextField = (value) => {
  const text = String(value || "").trim();
  return text || "Não informado";
};

const normalizeSummaryStringArray = (value) => {
  if (!Array.isArray(value)) return ["Não informado"];
  const normalized = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : ["Não informado"];
};

const normalizeSummaryTimeline = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const safe = item && typeof item === "object" ? item : {};
      return {
        eventoPergunta: normalizeSummaryTextField(safe.eventoPergunta),
        respostaResumo: normalizeSummaryTextField(safe.respostaResumo),
      };
    })
    .filter((item) => item.eventoPergunta !== "Não informado" || item.respostaResumo !== "Não informado");
};

const normalizeStructuredSummaryJson = (value) => {
  const fallback = createDefaultAnamnesisSummaryJson();
  const safe = value && typeof value === "object" ? value : {};
  const historicoSaude = safe.historicoSaude && typeof safe.historicoSaude === "object" ? safe.historicoSaude : {};
  const habitosHigiene = safe.habitosHigiene && typeof safe.habitosHigiene === "object" ? safe.habitosHigiene : {};

  return {
    queixaPrincipal: normalizeSummaryTextField(safe.queixaPrincipal),
    historicoSaude: {
      doencasPrevias: normalizeSummaryTextField(historicoSaude.doencasPrevias || fallback.historicoSaude.doencasPrevias),
      usoMedicamentos: normalizeSummaryTextField(historicoSaude.usoMedicamentos || fallback.historicoSaude.usoMedicamentos),
      alergias: normalizeSummaryTextField(historicoSaude.alergias || fallback.historicoSaude.alergias),
      historicoFamiliarRelevante: normalizeSummaryTextField(
        historicoSaude.historicoFamiliarRelevante || fallback.historicoSaude.historicoFamiliarRelevante
      ),
      condicoesSistemicasRelevantes: normalizeSummaryTextField(
        historicoSaude.condicoesSistemicasRelevantes || fallback.historicoSaude.condicoesSistemicasRelevantes
      ),
    },
    habitosHigiene: {
      escovacao: normalizeSummaryTextField(habitosHigiene.escovacao || fallback.habitosHigiene.escovacao),
      usoFioDental: normalizeSummaryTextField(habitosHigiene.usoFioDental || fallback.habitosHigiene.usoFioDental),
      enxaguanteBucal: normalizeSummaryTextField(habitosHigiene.enxaguanteBucal || fallback.habitosHigiene.enxaguanteBucal),
      outrosHabitosRelevantes: normalizeSummaryTextField(
        habitosHigiene.outrosHabitosRelevantes || fallback.habitosHigiene.outrosHabitosRelevantes
      ),
    },
    linhaDoTempo: normalizeSummaryTimeline(safe.linhaDoTempo),
    pendenciasProximaConsulta: normalizeSummaryStringArray(safe.pendenciasProximaConsulta),
    conclusao: normalizeSummaryTextField(safe.conclusao),
  };
};

const formatStructuredSummaryText = (summaryJson) => {
  const normalized = normalizeStructuredSummaryJson(summaryJson);
  const linhaDoTempo = normalized.linhaDoTempo.length > 0
    ? normalized.linhaDoTempo.map((item) => `- ${item.eventoPergunta} -> ${item.respostaResumo}`)
    : ["- Não informado"];
  const pendencias = normalized.pendenciasProximaConsulta.map((item) => `- ${item}`);

  return [
    "Queixa Principal",
    `- ${normalized.queixaPrincipal}`,
    "",
    "Histórico de Saúde",
    `- Doenças prévias: ${normalized.historicoSaude.doencasPrevias}`,
    `- Uso de medicamentos: ${normalized.historicoSaude.usoMedicamentos}`,
    `- Alergias: ${normalized.historicoSaude.alergias}`,
    `- Histórico familiar relevante: ${normalized.historicoSaude.historicoFamiliarRelevante}`,
    `- Condições sistêmicas relevantes: ${normalized.historicoSaude.condicoesSistemicasRelevantes}`,
    "",
    "Hábitos de Higiene",
    `- Escovação (frequência/técnica): ${normalized.habitosHigiene.escovacao}`,
    `- Uso de fio dental: ${normalized.habitosHigiene.usoFioDental}`,
    `- Enxaguante bucal: ${normalized.habitosHigiene.enxaguanteBucal}`,
    `- Outros hábitos relevantes (tabagismo, bruxismo, dieta): ${normalized.habitosHigiene.outrosHabitosRelevantes}`,
    "",
    "Linha do Tempo (se identificável)",
    ...linhaDoTempo,
    "",
    "Pendências para próxima consulta",
    ...pendencias,
    "",
    "Conclusão",
    `- ${normalized.conclusao}`,
  ].join("\n");
};

const parseSummaryJsonFromContent = (content) => {
  const text = String(content || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {}

  const noFence = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  if (noFence) {
    try {
      return JSON.parse(noFence);
    } catch (err) {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const maybeJson = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(maybeJson);
    } catch (err) {}
  }
  return null;
};

const summarizeTranscriptionWithOpenAI = async ({ apiKey, transcript, questions, questionTimeline }) => {
  const systemPrompt =
    [
      "Você é um assistente odontológico especializado em anamnese.",
      "Sua tarefa é transformar a transcrição bruta em um resumo clínico claro, objetivo e fiel ao que foi dito.",
      "",
      "Regras:",
      "1) Não invente informações.",
      "2) Se algo não foi informado, escreva: \"Não informado\".",
      "3) Preserve termos clínicos relevantes.",
      "4) Separe fatos relatados pelo paciente de observações do profissional.",
      "5) Use português do Brasil.",
      "",
      "Formato de saída (obrigatório):",
      "",
      "Queixa Principal",
      "- [resumo curto da queixa]",
      "",
      "Histórico de Saúde",
      "- Doenças prévias: [texto]",
      "- Uso de medicamentos: [texto]",
      "- Alergias: [texto]",
      "- Histórico familiar relevante: [texto]",
      "- Condições sistêmicas relevantes: [texto]",
      "",
      "Hábitos de Higiene",
      "- Escovação (frequência/técnica): [texto]",
      "- Uso de fio dental: [texto]",
      "- Enxaguante bucal: [texto]",
      "- Outros hábitos relevantes (tabagismo, bruxismo, dieta): [texto]",
      "",
      "Linha do Tempo (se identificável)",
      "- [evento/pergunta] -> [resposta/resumo]",
      "",
      "Pendências para próxima consulta",
      "- [itens faltantes, dúvidas, exames ou confirmações]",
      "",
      "Conclusão",
      "- [síntese clínica objetiva em 2-4 linhas]",
    ].join("\n");
  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "anamnese_odontologica_resumo",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "queixaPrincipal",
            "historicoSaude",
            "habitosHigiene",
            "linhaDoTempo",
            "pendenciasProximaConsulta",
            "conclusao",
          ],
          properties: {
            queixaPrincipal: { type: "string" },
            historicoSaude: {
              type: "object",
              additionalProperties: false,
              required: [
                "doencasPrevias",
                "usoMedicamentos",
                "alergias",
                "historicoFamiliarRelevante",
                "condicoesSistemicasRelevantes",
              ],
              properties: {
                doencasPrevias: { type: "string" },
                usoMedicamentos: { type: "string" },
                alergias: { type: "string" },
                historicoFamiliarRelevante: { type: "string" },
                condicoesSistemicasRelevantes: { type: "string" },
              },
            },
            habitosHigiene: {
              type: "object",
              additionalProperties: false,
              required: [
                "escovacao",
                "usoFioDental",
                "enxaguanteBucal",
                "outrosHabitosRelevantes",
              ],
              properties: {
                escovacao: { type: "string" },
                usoFioDental: { type: "string" },
                enxaguanteBucal: { type: "string" },
                outrosHabitosRelevantes: { type: "string" },
              },
            },
            linhaDoTempo: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["eventoPergunta", "respostaResumo"],
                properties: {
                  eventoPergunta: { type: "string" },
                  respostaResumo: { type: "string" },
                },
              },
            },
            pendenciasProximaConsulta: {
              type: "array",
              items: { type: "string" },
            },
            conclusao: { type: "string" },
          },
        },
      },
    },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          "Transcrição bruta da anamnese:",
          transcript,
          "",
          "Perguntas aplicadas:",
          Array.isArray(questions) ? questions.map((q, i) => `${i + 1}. ${q}`).join("\n") : "",
          "",
          "Linha do tempo das perguntas (ms):",
          JSON.stringify(Array.isArray(questionTimeline) ? questionTimeline : []),
        ].join("\n"),
      },
    ],
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(String(json.error && json.error.message ? json.error.message : "SUMMARY_FAILED"));
    err.status = 502;
    throw err;
  }
  const modelContent = String(
    json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
      ? json.choices[0].message.content
      : ""
  ).trim();
  const parsedSummary = parseSummaryJsonFromContent(modelContent);
  const structuredSummaryJson = normalizeStructuredSummaryJson(parsedSummary);
  const structuredSummary = formatStructuredSummaryText(structuredSummaryJson);
  return { structuredSummary, structuredSummaryJson };
};

exports.processAnamnesisAudio = functions
  .runWith({ secrets: ["OPENAI_API_KEY"] })
  .https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const decoded = await verifySignedRequest(req);
    const professionalId = String((req.body && req.body.professionalId) || "").trim();
    const patientId = String((req.body && req.body.patientId) || "").trim();
    const protocol = String((req.body && req.body.protocol) || "odontopediatria").trim();
    const questions = Array.isArray(req.body && req.body.questions) ? req.body.questions : [];
    const questionTimeline = Array.isArray(req.body && req.body.questionTimeline) ? req.body.questionTimeline : [];
    const manualTranscript = String((req.body && req.body.manualTranscript) || "").trim();
    const manualAnswers = req.body && typeof req.body.manualAnswers === "object" ? req.body.manualAnswers : {};
    const audioBase64 = String((req.body && req.body.audioBase64) || "").trim();
    const mimeType = String((req.body && req.body.mimeType) || "audio/webm");
    const audioDurationSec = Number(req.body && req.body.audioDurationSec ? req.body.audioDurationSec : 0);

    if (!professionalId || !patientId) {
      return res.status(400).json({ error: "MISSING_REQUIRED_FIELDS" });
    }

    let transcript = manualTranscript;
    let usedVoiceSeconds = 0;
    const hasAudio = audioBase64.length > 0;

    if (hasAudio) {
      await ensureProfessionalVoiceAccess(professionalId, decoded.email);
      const apiKey = loadOpenAiKey();
      if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_CONFIG_NOT_READY" });
      }
      transcript = await transcribeAudioWithOpenAI({ apiKey, audioBase64, mimeType });
      usedVoiceSeconds = Math.max(0, Math.round(audioDurationSec));
      if (!transcript) transcript = manualTranscript;
    }

    if (!transcript) {
      transcript = JSON.stringify(manualAnswers || {});
    }

    const apiKeyForSummary = loadOpenAiKey();
    let structuredSummary = "";
    let structuredSummaryJson = createDefaultAnamnesisSummaryJson();
    if (apiKeyForSummary) {
      const summaryResult = await summarizeTranscriptionWithOpenAI({
        apiKey: apiKeyForSummary,
        transcript,
        questions,
        questionTimeline,
      });
      structuredSummary = String(summaryResult && summaryResult.structuredSummary ? summaryResult.structuredSummary : "").trim();
      structuredSummaryJson = normalizeStructuredSummaryJson(summaryResult && summaryResult.structuredSummaryJson);
    }
    if (!structuredSummary) {
      structuredSummary = formatStructuredSummaryText(structuredSummaryJson);
    }

    const sessionRef = await admin.firestore().collection("professionalAnamnesisSessions").add({
      professionalId,
      patientId,
      protocol,
      transcriptRaw: transcript,
      structuredSummary,
      structuredSummaryJson,
      questions,
      questionTimeline,
      usedVoiceSeconds,
      hasAudio,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: decoded.uid,
      createdByEmail: normalizeEmail(decoded.email),
    });

    return res.status(200).json({
      ok: true,
      sessionId: sessionRef.id,
      transcript,
      structuredSummary,
      structuredSummaryJson,
      usedVoiceSeconds,
    });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    console.error("processAnamnesisAudio error:", err);
    return res.status(status).json({ error: err.message || "UNKNOWN_ERROR" });
  }
  });

exports.messagingApi = messaging.messagingApi;
exports.processQueuedMessages = messaging.processQueuedMessages;
exports.predictiveApi = predictive.predictiveApi;
