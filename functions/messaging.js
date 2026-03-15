const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

const loadMessagingConfig = () => {
  const cfg = functions.config();
  return {
    supabaseUrl: cfg.supabase && cfg.supabase.url ? String(cfg.supabase.url) : "",
    supabaseServiceKey: cfg.supabase && cfg.supabase.service_key ? String(cfg.supabase.service_key) : "",
    evolutionUrl: cfg.evolution && cfg.evolution.url ? String(cfg.evolution.url) : "",
    evolutionApiKey: cfg.evolution && cfg.evolution.api_key ? String(cfg.evolution.api_key) : "",
    telegramBotToken: cfg.telegram && cfg.telegram.bot_token ? String(cfg.telegram.bot_token) : "",
    defaultFallbackChannel:
      cfg.messaging && cfg.messaging.default_fallback_channel
        ? String(cfg.messaging.default_fallback_channel)
        : "telegram",
  };
};

const normalizeBrPhoneToIntl = (value) => {
  const d = digitsOnly(value);
  if (!d) return "";
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 12 && d.startsWith("55")) return `55${d.slice(2, 4)}9${d.slice(4)}`;
  if (d.length === 11) return `55${d}`;
  if (d.length === 10) return `55${d.slice(0, 2)}9${d.slice(2)}`;
  return "";
};

const withCors = (res) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.set(k, v));
};

const assertMessagingConfigured = (cfg) => {
  if (!cfg.supabaseUrl || !cfg.supabaseServiceKey) {
    const err = new Error("SUPABASE_CONFIG_NOT_READY");
    err.status = 500;
    throw err;
  }
};

const verifyToken = async (req) => {
  const auth = String(req.headers.authorization || "");
  const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!idToken) {
    const err = new Error("UNAUTHENTICATED");
    err.status = 401;
    throw err;
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
};

const supabaseRequest = async (cfg, path, method = "GET", body = null, extraHeaders = {}) => {
  const url = `${cfg.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${path.replace(/^\/+/, "")}`;
  const headers = {
    apikey: cfg.supabaseServiceKey,
    Authorization: `Bearer ${cfg.supabaseServiceKey}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const err = new Error((json && (json.message || json.error || json.hint)) || "SUPABASE_REQUEST_FAILED");
    err.status = 502;
    err.details = json;
    throw err;
  }
  return json;
};

const insertMessageAttempt = async (cfg, payload) =>
  supabaseRequest(cfg, "message_attempts", "POST", payload, {
    Prefer: "return=minimal",
  });

const patchMessage = async (cfg, messageId, payload) =>
  supabaseRequest(cfg, `messages?id=eq.${encodeURIComponent(messageId)}`, "PATCH", payload, {
    Prefer: "return=minimal",
  });

const sendViaTelegram = async (cfg, target, text) => {
  if (!cfg.telegramBotToken) {
    const err = new Error("TELEGRAM_CONFIG_NOT_READY");
    err.status = 500;
    throw err;
  }
  const chatId = String(target || "").trim();
  if (!chatId) {
    const err = new Error("TELEGRAM_TARGET_REQUIRED");
    err.status = 400;
    throw err;
  }
  const endpoint = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) {
    const err = new Error((json && json.description) || "TELEGRAM_SEND_FAILED");
    err.status = 502;
    throw err;
  }
  return {
    providerStatus: "ok",
    providerMessageId: json.result && json.result.message_id ? String(json.result.message_id) : null,
  };
};

const sendViaEvolution = async (cfg, targetPhone, text) => {
  if (!cfg.evolutionUrl || !cfg.evolutionApiKey) {
    const err = new Error("EVOLUTION_CONFIG_NOT_READY");
    err.status = 500;
    throw err;
  }
  const intl = normalizeBrPhoneToIntl(targetPhone);
  if (!intl) {
    const err = new Error("WHATSAPP_PHONE_INVALID");
    err.status = 400;
    throw err;
  }

  const response = await fetch(cfg.evolutionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.evolutionApiKey,
    },
    body: JSON.stringify({
      number: intl,
      text,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error((json && (json.message || json.error)) || "EVOLUTION_SEND_FAILED");
    err.status = 502;
    throw err;
  }
  return {
    providerStatus: "ok",
    providerMessageId: String((json && (json.key && json.key.id)) || json.id || ""),
  };
};

const executeMessageWithFallback = async (cfg, message, actorUid) => {
  const primary = String(message.primary_channel || "whatsapp_evolution");
  const secondary = String(message.secondary_channel || cfg.defaultFallbackChannel || "telegram");
  const payloadText = String(message.body || "");
  const whatsappTarget = String(message.target_phone || "");
  const telegramTarget = String(message.target_telegram || "");

  const attemptSend = async (channel) => {
    if (channel === "whatsapp_evolution") {
      return sendViaEvolution(cfg, whatsappTarget, payloadText);
    }
    if (channel === "telegram") {
      return sendViaTelegram(cfg, telegramTarget, payloadText);
    }
    const err = new Error("CHANNEL_NOT_SUPPORTED");
    err.status = 400;
    throw err;
  };

  let firstError = null;
  try {
    const result = await attemptSend(primary);
    await insertMessageAttempt(cfg, {
      message_id: message.id,
      channel: primary,
      provider_status: result.providerStatus || "ok",
      provider_message_id: result.providerMessageId || null,
      success: true,
      attempted_at: new Date().toISOString(),
    });
    await patchMessage(cfg, message.id, {
      status: "sent",
      final_channel: primary,
      updated_at: new Date().toISOString(),
      sent_by_uid: actorUid || null,
    });
    return { ok: true, finalChannel: primary };
  } catch (err) {
    firstError = err;
    await insertMessageAttempt(cfg, {
      message_id: message.id,
      channel: primary,
      provider_status: "error",
      provider_message_id: null,
      success: false,
      error_text: String(err.message || "PRIMARY_SEND_FAILED"),
      attempted_at: new Date().toISOString(),
    });
  }

  if (!message.enable_fallback) {
    await patchMessage(cfg, message.id, {
      status: "failed",
      final_channel: primary,
      updated_at: new Date().toISOString(),
      sent_by_uid: actorUid || null,
    });
    return { ok: false, finalChannel: primary, error: firstError };
  }

  try {
    const fallbackResult = await attemptSend(secondary);
    await insertMessageAttempt(cfg, {
      message_id: message.id,
      channel: secondary,
      provider_status: fallbackResult.providerStatus || "ok",
      provider_message_id: fallbackResult.providerMessageId || null,
      success: true,
      attempted_at: new Date().toISOString(),
    });
    await patchMessage(cfg, message.id, {
      status: "fallback_sent",
      final_channel: secondary,
      updated_at: new Date().toISOString(),
      sent_by_uid: actorUid || null,
    });
    return { ok: true, finalChannel: secondary, fallback: true };
  } catch (fallbackErr) {
    await insertMessageAttempt(cfg, {
      message_id: message.id,
      channel: secondary,
      provider_status: "error",
      provider_message_id: null,
      success: false,
      error_text: String(fallbackErr.message || "FALLBACK_SEND_FAILED"),
      attempted_at: new Date().toISOString(),
    });
    await patchMessage(cfg, message.id, {
      status: "failed",
      final_channel: secondary,
      updated_at: new Date().toISOString(),
      sent_by_uid: actorUid || null,
    });
    return { ok: false, finalChannel: secondary, error: fallbackErr };
  }
};

const queueMessage = async (cfg, body, actor) => {
  const required = ["municipio_id", "ubs_id", "paciente_id", "template_type", "body"];
  for (const field of required) {
    if (!body || body[field] == null || String(body[field]).trim() === "") {
      const err = new Error(`MISSING_${field.toUpperCase()}`);
      err.status = 400;
      throw err;
    }
  }
  const row = {
    municipio_id: String(body.municipio_id),
    ubs_id: String(body.ubs_id),
    profissional_id: body.profissional_id ? String(body.profissional_id) : null,
    paciente_id: String(body.paciente_id),
    agendamento_id: body.agendamento_id ? String(body.agendamento_id) : null,
    template_type: String(body.template_type),
    status: "queued",
    body: String(body.body),
    primary_channel: String(body.primary_channel || "whatsapp_evolution"),
    secondary_channel: String(body.secondary_channel || "telegram"),
    enable_fallback: body.enable_fallback !== false,
    target_phone: body.target_phone ? String(body.target_phone) : null,
    target_telegram: body.target_telegram ? String(body.target_telegram) : null,
    created_by: actor && actor.uid ? actor.uid : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const inserted = await supabaseRequest(cfg, "messages", "POST", row, {
    Prefer: "return=representation",
  });
  return Array.isArray(inserted) ? inserted[0] : inserted;
};

const handleQueueMessage = async (req, res, cfg, actor) => {
  const queued = await queueMessage(cfg, req.body || {}, actor);
  return res.status(200).json({ ok: true, message: queued });
};

const handleSendNow = async (req, res, cfg, actor) => {
  const queued = await queueMessage(cfg, req.body || {}, actor);
  const result = await executeMessageWithFallback(cfg, queued, actor && actor.uid ? actor.uid : null);
  return res.status(200).json({ ok: true, message_id: queued.id, result });
};

const handleUpsertTemplate = async (req, res, cfg, actor) => {
  const body = req.body || {};
  const required = ["municipio_id", "template_type", "channel", "body"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return res.status(400).json({ error: `MISSING_${field.toUpperCase()}` });
    }
  }
  const payload = {
    municipio_id: String(body.municipio_id),
    ubs_id: body.ubs_id ? String(body.ubs_id) : null,
    template_type: String(body.template_type),
    channel: String(body.channel),
    body: String(body.body),
    ativo: body.ativo !== false,
    created_by: actor.uid,
    created_at: new Date().toISOString(),
  };
  const created = await supabaseRequest(cfg, "message_templates", "POST", payload, {
    Prefer: "return=representation",
  });
  return res.status(200).json({ ok: true, template: Array.isArray(created) ? created[0] : created });
};

const handleListMessages = async (req, res, cfg) => {
  const municipioId = String((req.query && req.query.municipio_id) || "").trim();
  const ubsId = String((req.query && req.query.ubs_id) || "").trim();
  const status = String((req.query && req.query.status) || "").trim();
  const limit = Math.max(1, Math.min(200, Number(req.query && req.query.limit ? req.query.limit : 50)));
  let path = `messages?select=*&order=created_at.desc&limit=${limit}`;
  if (municipioId) path += `&municipio_id=eq.${encodeURIComponent(municipioId)}`;
  if (ubsId) path += `&ubs_id=eq.${encodeURIComponent(ubsId)}`;
  if (status) path += `&status=eq.${encodeURIComponent(status)}`;
  const rows = await supabaseRequest(cfg, path, "GET");
  return res.status(200).json({ ok: true, items: rows || [] });
};

exports.messagingApi = functions.https.onRequest(async (req, res) => {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");

  const cfg = loadMessagingConfig();
  try {
    assertMessagingConfigured(cfg);
    const actor = await verifyToken(req);
    const route = String(req.path || "/").replace(/^\/+/, "");

    if (req.method === "POST" && route === "messages/queue") {
      return handleQueueMessage(req, res, cfg, actor);
    }
    if (req.method === "POST" && route === "messages/send-now") {
      return handleSendNow(req, res, cfg, actor);
    }
    if (req.method === "POST" && route === "templates/upsert") {
      return handleUpsertTemplate(req, res, cfg, actor);
    }
    if (req.method === "GET" && route === "messages/list") {
      return handleListMessages(req, res, cfg);
    }

    return res.status(404).json({ error: "ROUTE_NOT_FOUND" });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    console.error("messagingApi error:", err);
    return res.status(status).json({ error: err.message || "UNKNOWN_ERROR", details: err.details || null });
  }
});

exports.processQueuedMessages = functions.pubsub.schedule("every 1 minutes").onRun(async () => {
  const cfg = loadMessagingConfig();
  assertMessagingConfigured(cfg);

  const rows = await supabaseRequest(
    cfg,
    "messages?select=*&status=eq.queued&order=created_at.asc&limit=50",
    "GET"
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;

  for (const row of rows) {
    try {
      await executeMessageWithFallback(cfg, row, null);
    } catch (err) {
      console.error("processQueuedMessages item error:", row && row.id, err.message || err);
      await patchMessage(cfg, row.id, {
        status: "failed",
        updated_at: new Date().toISOString(),
      }).catch(() => null);
    }
  }
  return null;
});

