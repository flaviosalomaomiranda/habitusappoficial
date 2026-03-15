const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
};

const withCors = (res) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.set(k, v));
};

const loadConfig = () => {
  const cfg = functions.config();
  return {
    supabaseUrl: cfg.supabase && cfg.supabase.url ? String(cfg.supabase.url) : "",
    supabaseServiceKey: cfg.supabase && cfg.supabase.service_key ? String(cfg.supabase.service_key) : "",
  };
};

const assertConfigured = (cfg) => {
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
  return admin.auth().verifyIdToken(idToken);
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

const nowIso = () => new Date().toISOString();

const parseRoute = (req) =>
  String(req.path || "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);

const requireFields = (obj, fields) => {
  for (const field of fields) {
    if (obj == null || obj[field] == null || String(obj[field]).trim() === "") {
      const err = new Error(`MISSING_${String(field).toUpperCase()}`);
      err.status = 400;
      throw err;
    }
  }
};

const handleCreateQuestionnaire = async (req, res, cfg, actor) => {
  const body = req.body || {};
  requireFields(body, ["municipio_id", "code", "nome"]);
  const payload = {
    municipio_id: String(body.municipio_id),
    ubs_id: body.ubs_id ? String(body.ubs_id) : null,
    code: String(body.code).trim(),
    nome: String(body.nome).trim(),
    descricao: body.descricao != null ? String(body.descricao) : null,
    area: body.area != null ? String(body.area) : null,
    ativo: body.ativo !== false,
    created_by: actor && actor.uid ? String(actor.uid) : null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const created = await supabaseRequest(cfg, "predictive_questionnaires", "POST", payload, {
    Prefer: "return=representation",
  });
  return res.status(201).json({ ok: true, item: Array.isArray(created) ? created[0] : created });
};

const handleListQuestionnaires = async (req, res, cfg) => {
  const municipioId = String((req.query && req.query.municipio_id) || "").trim();
  const ubsId = String((req.query && req.query.ubs_id) || "").trim();
  const area = String((req.query && req.query.area) || "").trim();
  const activeOnly = String((req.query && req.query.active) || "").trim().toLowerCase() === "true";

  let path = "predictive_questionnaires?select=*&order=updated_at.desc&limit=200";
  if (municipioId) path += `&municipio_id=eq.${encodeURIComponent(municipioId)}`;
  if (ubsId) path += `&ubs_id=eq.${encodeURIComponent(ubsId)}`;
  if (area) path += `&area=eq.${encodeURIComponent(area)}`;
  if (activeOnly) path += "&ativo=eq.true";

  const rows = await supabaseRequest(cfg, path, "GET");
  return res.status(200).json({ ok: true, items: rows || [] });
};

const handleCreateVersion = async (req, res, cfg, actor, questionnaireId) => {
  const body = req.body || {};
  requireFields(body, ["version_number"]);

  const payload = {
    questionnaire_id: String(questionnaireId),
    version_number: Number(body.version_number),
    status: String(body.status || "draft"),
    config: body.config && typeof body.config === "object" ? body.config : {},
    created_at: nowIso(),
    updated_at: nowIso(),
    published_by: null,
    published_at: null,
  };
  if (!Number.isFinite(payload.version_number) || payload.version_number <= 0) {
    return res.status(400).json({ error: "INVALID_VERSION_NUMBER" });
  }
  if (payload.status === "published") {
    payload.published_by = actor && actor.uid ? String(actor.uid) : null;
    payload.published_at = nowIso();
  }

  const created = await supabaseRequest(cfg, "predictive_questionnaire_versions", "POST", payload, {
    Prefer: "return=representation",
  });
  return res.status(201).json({ ok: true, item: Array.isArray(created) ? created[0] : created });
};

const upsertQuestion = async (cfg, versionId, question) => {
  requireFields(question, ["code", "label", "kind"]);
  const existing = await supabaseRequest(
    cfg,
    `predictive_questions?select=*&questionnaire_version_id=eq.${encodeURIComponent(
      String(versionId)
    )}&code=eq.${encodeURIComponent(String(question.code))}&limit=1`,
    "GET"
  );

  const payload = {
    questionnaire_version_id: String(versionId),
    code: String(question.code),
    label: String(question.label),
    help_text: question.help_text != null ? String(question.help_text) : null,
    kind: String(question.kind),
    required: question.required === true,
    order_index: Number.isFinite(Number(question.order_index)) ? Number(question.order_index) : 0,
    weight: Number.isFinite(Number(question.weight)) ? Number(question.weight) : 0,
    rules: question.rules && typeof question.rules === "object" ? question.rules : {},
    updated_at: nowIso(),
  };

  let row;
  if (Array.isArray(existing) && existing[0] && existing[0].id) {
    const id = String(existing[0].id);
    const updated = await supabaseRequest(
      cfg,
      `predictive_questions?id=eq.${encodeURIComponent(id)}`,
      "PATCH",
      payload,
      { Prefer: "return=representation" }
    );
    row = Array.isArray(updated) ? updated[0] : updated;
  } else {
    payload.created_at = nowIso();
    const created = await supabaseRequest(cfg, "predictive_questions", "POST", payload, {
      Prefer: "return=representation",
    });
    row = Array.isArray(created) ? created[0] : created;
  }
  return row;
};

const replaceOptionsForQuestion = async (cfg, questionId, options) => {
  await supabaseRequest(
    cfg,
    `predictive_question_options?question_id=eq.${encodeURIComponent(String(questionId))}`,
    "DELETE",
    null,
    { Prefer: "return=minimal" }
  );
  const rows = Array.isArray(options) ? options : [];
  if (rows.length === 0) return;

  const payload = rows.map((opt, idx) => ({
    question_id: String(questionId),
    code: String(opt.code || `opt_${idx + 1}`),
    label: String(opt.label || opt.code || `Opção ${idx + 1}`),
    score: Number.isFinite(Number(opt.score)) ? Number(opt.score) : 0,
    order_index: Number.isFinite(Number(opt.order_index)) ? Number(opt.order_index) : idx,
    created_at: nowIso(),
  }));

  await supabaseRequest(cfg, "predictive_question_options", "POST", payload, {
    Prefer: "return=minimal",
  });
};

const replaceRiskBands = async (cfg, versionId, bands) => {
  await supabaseRequest(
    cfg,
    `predictive_risk_bands?questionnaire_version_id=eq.${encodeURIComponent(String(versionId))}`,
    "DELETE",
    null,
    { Prefer: "return=minimal" }
  );
  const rows = Array.isArray(bands) ? bands : [];
  if (rows.length === 0) return;

  const payload = rows.map((band, idx) => ({
    questionnaire_version_id: String(versionId),
    label: String(band.label || `Faixa ${idx + 1}`),
    level: String(band.level || "none"),
    min_score: Number.isFinite(Number(band.min_score)) ? Number(band.min_score) : 0,
    max_score: Number.isFinite(Number(band.max_score)) ? Number(band.max_score) : 0,
    color_hex: band.color_hex != null ? String(band.color_hex) : null,
    priority: Number.isFinite(Number(band.priority)) ? Number(band.priority) : idx + 1,
    created_at: nowIso(),
  }));
  await supabaseRequest(cfg, "predictive_risk_bands", "POST", payload, {
    Prefer: "return=minimal",
  });
};

const handlePutVersionStructure = async (req, res, cfg, versionId) => {
  const body = req.body || {};
  const questions = Array.isArray(body.questions) ? body.questions : [];
  const riskBands = Array.isArray(body.risk_bands) ? body.risk_bands : [];

  const upsertedQuestions = [];
  for (const question of questions) {
    const row = await upsertQuestion(cfg, versionId, question);
    if (row && row.id) {
      await replaceOptionsForQuestion(cfg, row.id, question.options || []);
    }
    upsertedQuestions.push(row);
  }

  await replaceRiskBands(cfg, versionId, riskBands);
  return res.status(200).json({
    ok: true,
    questionnaire_version_id: String(versionId),
    questions_upserted: upsertedQuestions.length,
    risk_bands_replaced: riskBands.length,
  });
};

const handlePublishVersion = async (req, res, cfg, actor, versionId) => {
  const targetRows = await supabaseRequest(
    cfg,
    `predictive_questionnaire_versions?select=*&id=eq.${encodeURIComponent(String(versionId))}&limit=1`,
    "GET"
  );
  const target = Array.isArray(targetRows) ? targetRows[0] : null;
  if (!target || !target.id) return res.status(404).json({ error: "VERSION_NOT_FOUND" });

  const questionnaireId = String(target.questionnaire_id);

  await supabaseRequest(
    cfg,
    `predictive_questionnaire_versions?questionnaire_id=eq.${encodeURIComponent(questionnaireId)}&status=eq.published`,
    "PATCH",
    {
      status: "archived",
      updated_at: nowIso(),
    },
    { Prefer: "return=minimal" }
  );

  const published = await supabaseRequest(
    cfg,
    `predictive_questionnaire_versions?id=eq.${encodeURIComponent(String(versionId))}`,
    "PATCH",
    {
      status: "published",
      published_at: nowIso(),
      published_by: actor && actor.uid ? String(actor.uid) : null,
      updated_at: nowIso(),
    },
    { Prefer: "return=representation" }
  );

  return res.status(200).json({ ok: true, item: Array.isArray(published) ? published[0] : published });
};

const handleGetActiveVersion = async (req, res, cfg, questionnaireId) => {
  const questionnaireRows = await supabaseRequest(
    cfg,
    `predictive_questionnaires?select=*&id=eq.${encodeURIComponent(String(questionnaireId))}&limit=1`,
    "GET"
  );
  const questionnaire = Array.isArray(questionnaireRows) ? questionnaireRows[0] : null;
  if (!questionnaire || !questionnaire.id) return res.status(404).json({ error: "QUESTIONNAIRE_NOT_FOUND" });

  const versions = await supabaseRequest(
    cfg,
    `predictive_questionnaire_versions?select=*&questionnaire_id=eq.${encodeURIComponent(
      String(questionnaireId)
    )}&status=eq.published&order=version_number.desc&limit=1`,
    "GET"
  );
  const version = Array.isArray(versions) ? versions[0] : null;
  if (!version || !version.id) return res.status(404).json({ error: "PUBLISHED_VERSION_NOT_FOUND" });

  const questions = await supabaseRequest(
    cfg,
    `predictive_questions?select=*&questionnaire_version_id=eq.${encodeURIComponent(
      String(version.id)
    )}&order=order_index.asc`,
    "GET"
  );

  const questionIds = (Array.isArray(questions) ? questions : [])
    .map((q) => String(q.id || ""))
    .filter(Boolean);

  let options = [];
  if (questionIds.length > 0) {
    const inList = questionIds.map((id) => `"${id}"`).join(",");
    options = await supabaseRequest(
      cfg,
      `predictive_question_options?select=*&question_id=in.(${encodeURIComponent(inList)})&order=order_index.asc`,
      "GET"
    );
  }

  const bands = await supabaseRequest(
    cfg,
    `predictive_risk_bands?select=*&questionnaire_version_id=eq.${encodeURIComponent(
      String(version.id)
    )}&order=priority.asc`,
    "GET"
  );

  const optionMap = new Map();
  (Array.isArray(options) ? options : []).forEach((opt) => {
    const key = String(opt.question_id);
    const arr = optionMap.get(key) || [];
    arr.push(opt);
    optionMap.set(key, arr);
  });

  const hydratedQuestions = (Array.isArray(questions) ? questions : []).map((q) => ({
    ...q,
    options: optionMap.get(String(q.id)) || [],
  }));

  return res.status(200).json({
    ok: true,
    questionnaire,
    version,
    questions: hydratedQuestions,
    risk_bands: Array.isArray(bands) ? bands : [],
  });
};

exports.predictiveApi = functions.https.onRequest(async (req, res) => {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");

  const cfg = loadConfig();
  try {
    assertConfigured(cfg);
    const actor = await verifyToken(req);
    const route = parseRoute(req);

    // POST /questionnaires
    if (req.method === "POST" && route.length === 1 && route[0] === "questionnaires") {
      return handleCreateQuestionnaire(req, res, cfg, actor);
    }

    // GET /questionnaires
    if (req.method === "GET" && route.length === 1 && route[0] === "questionnaires") {
      return handleListQuestionnaires(req, res, cfg);
    }

    // POST /questionnaires/:id/versions
    if (req.method === "POST" && route.length === 3 && route[0] === "questionnaires" && route[2] === "versions") {
      return handleCreateVersion(req, res, cfg, actor, route[1]);
    }

    // PUT /versions/:id/structure
    if (req.method === "PUT" && route.length === 3 && route[0] === "versions" && route[2] === "structure") {
      return handlePutVersionStructure(req, res, cfg, route[1]);
    }

    // POST /versions/:id/publish
    if (req.method === "POST" && route.length === 3 && route[0] === "versions" && route[2] === "publish") {
      return handlePublishVersion(req, res, cfg, actor, route[1]);
    }

    // GET /questionnaires/:id/active-version
    if (
      req.method === "GET" &&
      route.length === 3 &&
      route[0] === "questionnaires" &&
      route[2] === "active-version"
    ) {
      return handleGetActiveVersion(req, res, cfg, route[1]);
    }

    return res.status(404).json({ error: "ROUTE_NOT_FOUND" });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    console.error("predictiveApi error:", err);
    return res.status(status).json({ error: err.message || "UNKNOWN_ERROR", details: err.details || null });
  }
});

