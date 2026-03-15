(() => {
  if (window.__ESUS_AGENDA_WA_V9__) return;
  window.__ESUS_AGENDA_WA_V9__ = true;

  const PHONE_EXACT_RE = /^\(\d{2}\)\s*(?:9\d{4}|\d{4})-\d{4}$/;
  const PHONE_ANY_RE = /\(\d{2}\)\s*(?:9\d{4}|\d{4})-\d{4}/g;
  const MODAL_ID = "esus-wa-modal";
  const CLICKED_KEY = "esus-wa-clicked-v1";
  const REMARCAR_KEY = "esus-wa-remarcar-v1";
  const REMARCAR_ARQUIVO_KEY = "esus-wa-remarcar-arquivo-v1";
  const REMARCAR_PANEL_ID = "esus-remarcar-panel";

  let refreshTimer = null;
  let latestEntries = [];

  function isInsideOurUi(node) {
    if (!node) return false;
    const el =
      node instanceof Element
        ? node
        : node.parentElement || (node.parentNode instanceof Element ? node.parentNode : null);
    if (!el) return false;
    if (el.id === REMARCAR_PANEL_ID || el.id === MODAL_ID) return true;
    if (el.id === "esus-remarcar-list" || el.id === "esus-remarcar-toggle" || el.id === "esus-open-lembrete")
      return true;
    if (el.closest(`#${REMARCAR_PANEL_ID}`) || el.closest(`#${MODAL_ID}`)) return true;
    return false;
  }

  function loadClickedMap() {
    try {
      const raw = localStorage.getItem(CLICKED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveClickedMap(map) {
    try {
      localStorage.setItem(CLICKED_KEY, JSON.stringify(map || {}));
    } catch {}
  }

  function loadRemarcarStore() {
    try {
      const raw = localStorage.getItem(REMARCAR_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveRemarcarStore(store) {
    try {
      localStorage.setItem(REMARCAR_KEY, JSON.stringify(store || {}));
    } catch {}
  }

  function loadRemarcarArchiveStore() {
    try {
      const raw = localStorage.getItem(REMARCAR_ARQUIVO_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveRemarcarArchiveStore(store) {
    try {
      localStorage.setItem(REMARCAR_ARQUIVO_KEY, JSON.stringify(store || {}));
    } catch {}
  }

  function getEquipeKey() {
    const nodes = Array.from(document.querySelectorAll("div,span,p,strong,label"));
    const hit = nodes
      .map((el) => textOf(el))
      .find((t) => /equipe\s*\d+/i.test(t));
    if (!hit) return "equipe-desconhecida";
    const m = hit.match(/equipe\s*([0-9\-]+)/i);
    return m?.[1] || hit;
  }

  function getProfessionalNameKey() {
    const inputs = Array.from(document.querySelectorAll("input"))
      .filter((el) => el && typeof el.getBoundingClientRect === "function")
      .map((el) => ({
        value: String(el.value || "").trim(),
        rect: el.getBoundingClientRect(),
      }))
      .filter((x) => x.value && /[a-zà-ÿ]{3,}/i.test(x.value))
      .filter((x) => x.rect.top > 120 && x.rect.top < 380 && x.rect.left > 200 && x.rect.left < 1200)
      .filter((x) => x.value.length >= 12)
      .sort((a, b) => a.rect.top - b.rect.top);
    if (inputs.length > 0) return inputs[0].value;
    return "profissional-desconhecido";
  }

  function getProfessionalDisplayName() {
    const name = String(getProfessionalNameKey() || "").trim();
    if (!name || name === "profissional-desconhecido") return "Profissional";
    // Mantém o nome puro para a frase "Dr(a) Nome"
    return name;
  }

  function getProfessionalStoreKey() {
    return `${getProfessionalNameKey()}|${getEquipeKey()}`;
  }

  function normalizeStoreKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getUbsStoreKey() {
    const unit = getUnitName();
    const key = normalizeStoreKey(unit);
    return key || "ubs-desconhecida";
  }

  function purgeOldRemarcarItems(items) {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    return (items || []).filter((item) => {
      if (!item) return false;
      // Apenas itens concluídos (riscados) expiram em 24h.
      if (item.status === "done") {
        const ref = Number(item.doneAt || 0);
        if (!ref) return false;
        return now - ref < DAY;
      }
      // Itens pendentes não expiram automaticamente.
      return true;
    });
  }

  function upsertRemarcarItem(entry) {
    const store = loadRemarcarStore();
    const profKey = getProfessionalStoreKey();
    const list = purgeOldRemarcarItems(store[profKey] || []);
    const id = `${entry.phone}|${entry.patient}`;
    const now = Date.now();
    const existing = list.find((x) => x.id === id);
    if (existing) {
      existing.patient = entry.patient;
      existing.phoneDisplay = entry.phoneDisplay || entry.phone;
      existing.hour = entry.hour || existing.hour || "";
      existing.dateLabel = entry.dateLabel || existing.dateLabel || "";
      existing.status = "pending";
      existing.lastCancelAt = now;
      delete existing.doneAt;
    } else {
      list.push({
        id,
        patient: entry.patient,
        phoneDisplay: entry.phoneDisplay || entry.phone,
        hour: entry.hour || "",
        dateLabel: entry.dateLabel || "",
        status: "pending",
        createdAt: now,
        lastCancelAt: now,
      });
    }
    store[profKey] = list;
    saveRemarcarStore(store);
    return list;
  }

  function toggleRemarcarDone(itemId, doneDateLabel, doneProfessionalName) {
    const store = loadRemarcarStore();
    const profKey = getProfessionalStoreKey();
    const list = purgeOldRemarcarItems(store[profKey] || []);
    const now = Date.now();
    const target = list.find((x) => x.id === itemId);
    if (!target) return;
    if (target.status === "done") {
      target.status = "pending";
      target.lastCancelAt = now;
      delete target.doneAt;
      delete target.doneDateLabel;
      delete target.doneProfessionalName;
    } else {
      target.status = "done";
      target.doneAt = now;
      target.doneDateLabel = doneDateLabel || getAgendaDateLabel();
      target.doneProfessionalName = doneProfessionalName || getProfessionalDisplayName();
    }
    store[profKey] = list;
    saveRemarcarStore(store);
  }

  function getRemarcarItemsForCurrentProfessional() {
    const store = loadRemarcarStore();
    const profKey = getProfessionalStoreKey();
    const list = purgeOldRemarcarItems(store[profKey] || []);
    store[profKey] = list;
    saveRemarcarStore(store);
    const pending = list.filter((x) => x.status !== "done");
    const done = list.filter((x) => x.status === "done");
    return [...pending, ...done];
  }

  function archiveRemarcarItem(itemId) {
    const store = loadRemarcarStore();
    const profKey = getProfessionalStoreKey();
    const list = purgeOldRemarcarItems(store[profKey] || []);
    const idx = list.findIndex((x) => x.id === itemId);
    if (idx < 0) return false;

    const item = list[idx];
    if (!item || item.status !== "done") return false;

    list.splice(idx, 1);
    store[profKey] = list;
    saveRemarcarStore(store);

    const archive = loadRemarcarArchiveStore();
    const ubsKey = getUbsStoreKey();
    const bucket = Array.isArray(archive[ubsKey]) ? archive[ubsKey] : [];
    bucket.push({
      ...item,
      archivedAt: Date.now(),
      archivedFromProfessional: getProfessionalDisplayName(),
      archivedFromProfile: profKey,
      archivedUbsName: getUnitName(),
    });
    archive[ubsKey] = bucket.slice(-5000);
    saveRemarcarArchiveStore(archive);
    return true;
  }

  function formatDateTime(ts) {
    const d = new Date(Number(ts || Date.now()));
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  }

  function getHistory(store, entryKey) {
    const value = store?.[entryKey];
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.actions)) return value.actions;
    return [];
  }

  function addHistoryAction(entryKey, type) {
    const store = loadClickedMap();
    const prev = getHistory(store, entryKey);
    const next = [...prev, { type, at: Date.now() }].slice(-6);
    store[entryKey] = { actions: next };
    saveClickedMap(store);
    return next;
  }

  function getLastAction(history) {
    if (!Array.isArray(history) || history.length === 0) return null;
    return history[history.length - 1] || null;
  }

  function getEntryKey(entry) {
    return [
      String(entry?.dateLabel || ""),
      String(entry?.hour || ""),
      String(entry?.patient || ""),
      String(entry?.phone || ""),
    ].join("|");
  }

  function isAgendaPage() {
    return /\/agenda\//i.test(window.location.pathname);
  }

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function linesOf(el) {
    return String(el?.innerText || el?.textContent || "")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeBrPhone(phoneText) {
    const d = digitsOnly(phoneText);
    if (!d) return { phone: "", dddCorrected: false };
    let normalized = d;
    let dddCorrected = false;

    // Corrige DDD invalido conhecido no legado local: 06 -> 69
    if (normalized.length >= 10) {
      if (normalized.startsWith("55") && normalized.slice(2, 4) === "06") {
        normalized = `5569${normalized.slice(4)}`;
        dddCorrected = true;
      } else if (!normalized.startsWith("55") && normalized.slice(0, 2) === "06") {
        normalized = `69${normalized.slice(2)}`;
        dddCorrected = true;
      }
    }

    // +55 + DDD + 8 digitos (legado) -> injeta 9
    if (normalized.length === 12 && normalized.startsWith("55")) {
      return { phone: `55${normalized.slice(2, 4)}9${normalized.slice(4)}`, dddCorrected };
    }
    // +55 + DDD + 9 digitos (ja atualizado)
    if (normalized.length === 13 && normalized.startsWith("55")) {
      return { phone: normalized, dddCorrected };
    }
    // DDD + 8 digitos (legado) -> injeta 9
    if (normalized.length === 10) {
      return { phone: `55${normalized.slice(0, 2)}9${normalized.slice(2)}`, dddCorrected };
    }
    // DDD + 9 digitos (ja atualizado)
    if (normalized.length === 11) {
      return { phone: `55${normalized}`, dddCorrected };
    }
    return { phone: "", dddCorrected };
  }

  function formatBrPhoneFromIntl(intl) {
    const d = digitsOnly(intl);
    if (d.length !== 13 || !d.startsWith("55")) return intl;
    const ddd = d.slice(2, 4);
    const local = d.slice(4); // sempre 9 digitos apos normalize
    return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
  }

  function getUnitName() {
    const candidates = Array.from(document.querySelectorAll("span,div,p,strong"))
      .map((el) => textOf(el))
      .filter(Boolean)
      .filter((t) => t.length >= 12 && t.length <= 140)
      .filter((t) => /unidade\s+de\s+sa[uú]de/i.test(t));

    if (candidates.length === 0) return "Unidade de Saude da Familia";

    const preferred = candidates.find((t) =>
      /unidade\s+de\s+sa[uú]de\s+da\s+fam[ií]lia/i.test(t)
    );
    const raw = preferred || candidates[0];

    let value = raw
      .replace(/([a-zà-ÿ])([A-ZÀ-Ý])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();

    const start = value.search(/unidade\s+de\s+sa[uú]de\s+da\s+fam[ií]lia/i);
    if (start >= 0) value = value.slice(start).trim();

    value = value.replace(/^(Unidade\s+de\s+Sa[uú]de\s+da\s+Fam[ií]lia)\s*[:\-]?\s*/i, "$1: ");
    value = value.split("|")[0].trim();
    value = value.split(/\s+-\s+/)[0].trim();
    value = value.split(/M[oó]dulos|Agenda|CBO|Equipe|Relat[oó]rios/i)[0].trim();
    return value || "Unidade de Saude da Familia";
  }

  function getAgendaDateLabel() {
    const datePattern = /((?:segunda|terça|terca|quarta|quinta|sexta|s[áa]bado|domingo)[^-–]*,\s*\d{1,2}\s+de\s+[a-zçãéêíóôú]+\s+de\s+\d{4})/i;
    const simplePattern = /(\d{1,2}\s+de\s+[a-zçãéêíóôú]+\s+de\s+\d{4})/i;

    const sanitizeCandidates = (arr) =>
      arr
        .map((el) => textOf(el))
        .filter(Boolean)
        .filter((t) => t.length >= 10 && t.length <= 120)
        .filter((t) => !PHONE_EXACT_RE.test(t))
        .filter((t) => !/\breagendado\b|\bcancelado\b/i.test(t));

    const pickDateFromText = (texts) => {
      for (const t of texts) {
        const full = t.match(datePattern);
        if (full?.[1]) return full[1].trim();
      }
      for (const t of texts) {
        const simple = t.match(simplePattern);
        if (simple?.[1]) return simple[1].trim();
      }
      return "";
    };

    // Prioriza elementos de título/cabeçalho.
    const headingTexts = sanitizeCandidates(Array.from(document.querySelectorAll("h1,h2,h3,strong")));
    const fromHeadings = pickDateFromText(headingTexts);
    if (fromHeadings) return fromHeadings;

    const allTexts = sanitizeCandidates(Array.from(document.querySelectorAll("div,span,p")));
    const fromAll = pickDateFromText(allTexts);
    if (fromAll) return fromAll;

    return "data nao informada";
  }

  function parseHour(text) {
    const m = String(text || "").match(/\b(\d{1,2}:\d{2})\b/);
    return m ? m[1] : "";
  }

  function buildHourGuides() {
    const guides = Array.from(document.querySelectorAll("div,span,p,li"))
      .map((el) => {
        const txt = textOf(el);
        if (!/^\d{1,2}:\d{2}$/.test(txt)) return null;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.height <= 0 || rect.width <= 0) return null;
        // Coluna de horários fica na esquerda da agenda
        if (rect.left > 700) return null;
        return { hour: txt, top: rect.top, left: rect.left };
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);

    const unique = [];
    let lastTop = -9999;
    guides.forEach((g) => {
      if (Math.abs(g.top - lastTop) < 4) return;
      unique.push(g);
      lastTop = g.top;
    });
    return unique;
  }

  function buildHourMap() {
    const map = new Map();
    const dayGroups = Array.from(document.querySelectorAll(".rbc-day-slot .rbc-timeslot-group"));
    const gutterGroups = Array.from(document.querySelectorAll(".rbc-time-gutter .rbc-timeslot-group"));

    if (dayGroups.length > 0 && gutterGroups.length > 0) {
      const len = Math.min(dayGroups.length, gutterGroups.length);
      for (let i = 0; i < len; i += 1) {
        const hour = parseHour(textOf(gutterGroups[i]));
        if (hour) map.set(dayGroups[i], hour);
      }
    }

    return map;
  }

  function getHourFromGuides(anchorTop, guides) {
    if (!Number.isFinite(anchorTop) || !Array.isArray(guides) || guides.length === 0) return "";
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;

    guides.forEach((g) => {
      const dist = Math.abs(g.top - anchorTop);
      if (dist < bestDist) {
        bestDist = dist;
        best = g;
      }
    });

    if (!best) return "";
    if (bestDist > 36) return "";
    return best.hour || "";
  }

  function cleanPatientLine(line) {
    return String(line || "")
      .replace(PHONE_ANY_RE, "")
      .replace(/\|\s*(Atendimento.*|Não compareceu.*|Nao compareceu.*)$/i, "")
      .replace(/\s+\|\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function looksLikePatientLine(line) {
    const t = String(line || "").trim();
    if (!t) return false;
    if (/^observa[cç][õo]es?/i.test(t)) return false;
    if (/^\d{1,2}:\d{2}$/.test(t)) return false;
    if (/\(\d{2}\)\s*(?:9\d{4}|\d{4})-\d{4}/.test(t)) return true;
    if (/\|/.test(t) && /[a-zà-ÿ]{2,}/i.test(t)) return true;
    return false;
  }

  function parsePatientFromLines(lines, phoneText) {
    const withPhoneIndex = lines.findIndex((line) => line.includes(phoneText));
    const withPhone = withPhoneIndex >= 0 ? lines[withPhoneIndex] : "";
    if (withPhone) {
      const cleaned = cleanPatientLine(withPhone);
      if (cleaned && cleaned.toLowerCase() !== "paciente") return cleaned;

      // Em alguns cards da agenda o nome vem na linha imediatamente anterior ao telefone.
      for (let i = withPhoneIndex - 1; i >= 0; i -= 1) {
        const prev = String(lines[i] || "").trim();
        if (!prev) continue;
        if (/^observa[cç][õo]es?/i.test(prev)) continue;
        if (/^\d{1,2}:\d{2}$/.test(prev)) continue;
        if (PHONE_EXACT_RE.test(prev)) continue;
        const prevClean = cleanPatientLine(prev);
        if (prevClean && prevClean.toLowerCase() !== "paciente") return prevClean;
      }
    }

    const richLine = lines.find((line) => looksLikePatientLine(line));
    if (richLine) {
      const cleaned = cleanPatientLine(richLine);
      if (cleaned && cleaned.toLowerCase() !== "paciente") return cleaned;
    }

    const fallback = lines.find((line) => /[a-zà-ÿ]{3,}/i.test(line));
    if (fallback) {
      const cleaned = cleanPatientLine(fallback);
      if (cleaned) return cleaned;
    }
    return "Paciente";
  }

  function isValidPatientCandidate(raw) {
    const t = cleanPatientLine(raw);
    if (!t) return false;
    if (t.toLowerCase() === "paciente") return false;
    if (/^observa[cç][õo]es?/i.test(t)) return false;
    if (/^acs\b/i.test(t)) return false;
    if (/^(atendimento|não compareceu|nao compareceu|demanda)\b/i.test(t)) return false;
    if (!/[a-zà-ÿ]{2,}/i.test(t)) return false;
    if (t.split(/\s+/).length < 2) return false;
    if (t.length < 5 || t.length > 90) return false;
    return true;
  }

  function parsePatientNearPhone(phoneNode, container, phoneText) {
    if (!phoneNode || !container) return "";

    let cursor = phoneNode;
    while (cursor && cursor !== container && cursor !== document.body) {
      let prev = cursor.previousElementSibling;
      while (prev) {
        const txt = textOf(prev).replace(phoneText, "").trim();
        if (isValidPatientCandidate(txt)) return cleanPatientLine(txt);
        prev = prev.previousElementSibling;
      }
      cursor = cursor.parentElement;
    }

    // Fallback: varre candidatos textuais curtos dentro do card e pega o primeiro válido.
    const candidates = Array.from(container.querySelectorAll("div,span,strong,p,a"))
      .map((el) => textOf(el))
      .map((t) => t.replace(phoneText, "").trim())
      .filter((t) => isValidPatientCandidate(t));

    return candidates.length > 0 ? cleanPatientLine(candidates[0]) : "";
  }

  function findAppointmentContainer(phoneNode, phoneText) {
    let cursor = phoneNode;
    let fallback = null;
    while (cursor && cursor !== document.body) {
      const txt = textOf(cursor);
      const hasPhone = txt.includes(phoneText);
      const hasLetters = /[a-zà-ÿ]{3,}/i.test(txt);
      const hasReasonableLength = txt.length >= 14 && txt.length <= 260;
      const hasPatientLike = /\|/.test(txt) || /[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý]?[a-zà-ÿ]+)+/.test(txt);

      if (hasPhone && hasLetters && hasReasonableLength) {
        fallback = cursor;
      }
      if (hasPhone && hasLetters && hasReasonableLength && hasPatientLike) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return fallback || phoneNode.parentElement || null;
  }

  function extractPatientAndHour(container, phoneText, phoneNode, hourMap, hourGuides) {
    const lines = linesOf(container);
    let patient = parsePatientFromLines(lines, phoneText);
    if (!patient || patient.toLowerCase() === "paciente") {
      const near = parsePatientNearPhone(phoneNode, container, phoneText);
      if (near) patient = near;
    }
    if (!patient) patient = "Paciente";
    let hour = "";

    const slotGroup = container?.closest?.(".rbc-timeslot-group");
    if (slotGroup && hourMap?.has(slotGroup)) {
      hour = hourMap.get(slotGroup) || "";
    }
    if (!hour) {
      hour = parseHour(lines.join(" "));
    }
    if (!hour) {
      const top = container?.getBoundingClientRect?.().top;
      hour = getHourFromGuides(top, hourGuides);
    }
    return { patient, hour };
  }

  function collectAgendaEntries() {
    const dateLabel = getAgendaDateLabel();
    const hourMap = buildHourMap();
    const hourGuides = buildHourGuides();
    const all = Array.from(document.querySelectorAll("span,div"));
    const phoneNodes = all.filter((el) => {
      if (el.children.length > 0) return false;
      const t = textOf(el);
      return PHONE_EXACT_RE.test(t);
    });

    const entries = [];
    const seen = new Set();

    phoneNodes.forEach((phoneNode) => {
      const phoneRaw = textOf(phoneNode);
      const phoneInfo = normalizeBrPhone(phoneRaw);
      const phone = phoneInfo.phone;
      if (!phone) return;

      const rowEl = findAppointmentContainer(phoneNode, phoneRaw);
      const { patient, hour } = extractPatientAndHour(rowEl, phoneRaw, phoneNode, hourMap, hourGuides);
      const key = `${patient}|${phone}|${hour || ""}|${dateLabel}`;
      if (seen.has(key)) return;
      seen.add(key);

      entries.push({
        patient,
        phone,
        phoneDisplay: formatBrPhoneFromIntl(phone),
        dddCorrected: Boolean(phoneInfo.dddCorrected),
        hour,
        dateLabel,
        anchorTop: rowEl?.getBoundingClientRect?.().top ?? null,
      });
    });

    return entries;
  }

  function buildWhatsappMessage(entry, templateId = "reminder") {
    const unidade = getUnitName();
    if (templateId === "cancel") {
      return [
        `Olá! Somos da ${unidade}.`,
        `Informamos que a consulta do(a) paciente ${entry.patient}, prevista para ${entry.dateLabel} às ${entry.hour || "horário não informado"}, foi cancelada por motivos internos da unidade.`,
        `O atendimento será reagendado em breve.`,
        `Para mais informações, entre em contato com a unidade.`,
        `Obrigado(a).`,
      ].join(" ");
    }

    return [
      `Olá! Somos da ${unidade}.`,
      `Lembrete da sua consulta.`,
      `Paciente: ${entry.patient}.`,
      `Data: ${entry.dateLabel}.`,
      `Horário: ${entry.hour || "não informado"}.`,
      `Em caso de necessidade, entre em contato com a unidade.`,
      `Obrigado(a).`,
    ].join(" ");
  }

  function truncateName(name, max = 15) {
    const clean = String(name || "").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max)}...`;
  }

  function getAgendaCitizenAnchorRoot() {
    const anchorLabel = Array.from(document.querySelectorAll("div,span,p,label,strong"))
      .find((el) => textOf(el).toLowerCase() === "agenda do cidadão");
    if (!anchorLabel) return null;
    return (
      anchorLabel.closest("div")?.parentElement?.parentElement ||
      anchorLabel.closest("div")?.parentElement ||
      anchorLabel.closest("div")
    );
  }

  function renderRemarcarPanel() {
    if (!isAgendaPage()) return;

    const anchorRoot = getAgendaCitizenAnchorRoot();
    if (!anchorRoot) return;

    let panel = document.getElementById(REMARCAR_PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = REMARCAR_PANEL_ID;
      panel.style.marginTop = "10px";
      panel.style.border = "1px solid #d7e0ef";
      panel.style.borderRadius = "8px";
      panel.style.background = "#fff";
      panel.style.padding = "8px";
      panel.style.fontSize = "12px";
      panel.style.width = "100%";
      panel.style.maxWidth = "100%";
      panel.style.boxSizing = "border-box";
      panel.style.overflow = "hidden";
      panel.innerHTML = `
        <button id="esus-open-lembrete" type="button"
          style="width:100%;max-width:100%;box-sizing:border-box;border:1px solid #2b7a3d;background:#e8f7ec;color:#1f5e2f;font-weight:700;border-radius:6px;padding:8px;cursor:pointer;margin-bottom:6px;">
          LEMBRETE / CANCELAMENTO (0)
        </button>
        <button id="esus-remarcar-toggle" type="button"
          style="width:100%;max-width:100%;box-sizing:border-box;border:1px solid #c53030;background:#fff5f5;color:#9b1c1c;font-weight:700;border-radius:6px;padding:8px;cursor:pointer;">
          REAGENDAMENTOS NECESSARIOS
        </button>
        <div id="esus-remarcar-list" style="display:none;margin-top:8px;max-height:220px;overflow:auto;width:100%;max-width:100%;box-sizing:border-box;"></div>
        <button id="esus-reagendados-toggle" type="button"
          style="width:100%;max-width:100%;box-sizing:border-box;border:1px solid #1f4f95;background:#eef4ff;color:#1f4f95;font-weight:700;border-radius:6px;padding:8px;cursor:pointer;margin-top:6px;">
          REAGENDAMENTOS FEITOS
        </button>
        <div id="esus-reagendados-wrap" style="display:none;margin-top:8px;">
          <input id="esus-reagendados-search" type="text" placeholder="Buscar paciente reagendado"
            style="width:100%;max-width:100%;box-sizing:border-box;border:1px solid #c9d3e4;border-radius:6px;padding:6px 8px;margin-bottom:6px;" />
          <div id="esus-reagendados-list" style="max-height:220px;overflow:auto;width:100%;max-width:100%;box-sizing:border-box;"></div>
        </div>
      `;
      anchorRoot.appendChild(panel);
    }

    const items = getRemarcarItemsForCurrentProfessional();
    const openReminderBtn = panel.querySelector("#esus-open-lembrete");
    const toggle = panel.querySelector("#esus-remarcar-toggle");
    const list = panel.querySelector("#esus-remarcar-list");
    const reagToggle = panel.querySelector("#esus-reagendados-toggle");
    const reagWrap = panel.querySelector("#esus-reagendados-wrap");
    const reagList = panel.querySelector("#esus-reagendados-list");
    const reagSearch = panel.querySelector("#esus-reagendados-search");
    if (!toggle || !list || !openReminderBtn || !reagToggle || !reagWrap || !reagList || !reagSearch) return;

    openReminderBtn.textContent = `LEMBRETE / CANCELAMENTO (${latestEntries.length})`;
    openReminderBtn.disabled = latestEntries.length === 0;
    openReminderBtn.style.opacity = latestEntries.length === 0 ? "0.55" : "1";
    openReminderBtn.style.cursor = latestEntries.length === 0 ? "not-allowed" : "pointer";
    openReminderBtn.onclick = () => {
      if (latestEntries.length === 0) return;
      openModal(latestEntries);
    };

    const pendingCount = items.filter((x) => x.status !== "done").length;
    const doneCount = items.filter((x) => x.status === "done").length;
    toggle.textContent = `REAGENDAMENTOS NECESSARIOS (${pendingCount})`;
    reagToggle.textContent = `REAGENDAMENTOS FEITOS (${doneCount})`;
    toggle.onclick = () => {
      list.style.display = list.style.display === "none" ? "block" : "none";
    };
    reagToggle.onclick = () => {
      reagWrap.style.display = reagWrap.style.display === "none" ? "block" : "none";
      renderReagendadosList();
    };

    list.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "Nenhum paciente pendente.";
      empty.style.color = "#667";
      empty.style.padding = "6px";
      list.appendChild(empty);
      return;
    }

    const pendingItems = items.filter((x) => x.status !== "done");
    pendingItems.forEach((item) => {
      const row = document.createElement("div");
      row.style.width = "100%";
      row.style.maxWidth = "100%";
      row.style.boxSizing = "border-box";
      row.style.border = "1px solid #d6e0ef";
      row.style.borderRadius = "6px";
      row.style.padding = "6px 8px";
      row.style.marginBottom = "6px";
      row.style.background = item.status === "done" ? "#f6f7f9" : "#fff";
      row.style.color = "#233";

      const title = document.createElement("div");
      title.textContent = item.patient || "Paciente";
      title.style.whiteSpace = "nowrap";
      title.style.overflow = "hidden";
      title.style.textOverflow = "ellipsis";
      if (item.status === "done") {
        title.style.textDecoration = "line-through";
        title.style.opacity = "0.7";
      }
      title.style.fontWeight = "600";

      const meta = document.createElement("div");
      meta.style.fontSize = "11px";
      meta.style.opacity = "0.85";
      const timeInfo = item.hour ? ` - ${item.hour}` : "";
      const statusInfo =
        item.status === "done"
          ? `reagendado para ${item.doneDateLabel || getAgendaDateLabel()}`
          : `cancelado ${formatDateTime(item.lastCancelAt)}`;
      meta.textContent = `${item.phoneDisplay || ""}${timeInfo} | ${statusInfo}`;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "6px";
      actions.style.marginTop = "6px";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "Copiar nome";
      copyBtn.style.border = "1px solid #9fb3d8";
      copyBtn.style.background = "#f5f8ff";
      copyBtn.style.color = "#244a87";
      copyBtn.style.borderRadius = "5px";
      copyBtn.style.fontSize = "11px";
      copyBtn.style.padding = "3px 8px";
      copyBtn.style.cursor = "pointer";
      copyBtn.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          await navigator.clipboard.writeText(item.patient || "");
          copyBtn.textContent = "Copiado!";
          window.setTimeout(() => {
            copyBtn.textContent = "Copiar nome";
          }, 1200);
        } catch {
          copyBtn.textContent = "Falha ao copiar";
          window.setTimeout(() => {
            copyBtn.textContent = "Copiar nome";
          }, 1200);
        }
      };

      const doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.textContent = item.status === "done" ? "Desfazer" : "Marcar reagendado";
      doneBtn.style.border = "1px solid #c3cbd9";
      doneBtn.style.background = item.status === "done" ? "#fff4f4" : "#f6f7f9";
      doneBtn.style.color = "#333";
      doneBtn.style.borderRadius = "5px";
      doneBtn.style.fontSize = "11px";
      doneBtn.style.padding = "3px 8px";
      doneBtn.style.cursor = "pointer";
      doneBtn.onclick = () => {
        toggleRemarcarDone(item.id, getAgendaDateLabel(), getProfessionalDisplayName());
        renderRemarcarPanel();
      };

      actions.appendChild(copyBtn);
      actions.appendChild(doneBtn);

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(actions);
      list.appendChild(row);
    });

    const renderReagendadosList = () => {
      const term = String(reagSearch.value || "").toLowerCase().trim();
      const doneItems = items.filter((x) => x.status === "done");
      const filtered = doneItems.filter((x) => {
        if (!term) return true;
        return String(x.patient || "").toLowerCase().includes(term);
      });

      reagList.innerHTML = "";
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = term ? "Nenhum paciente encontrado." : "Nenhum paciente reagendado.";
        empty.style.color = "#667";
        empty.style.padding = "6px";
        reagList.appendChild(empty);
        return;
      }

      filtered.forEach((item) => {
        const row = document.createElement("div");
        row.style.width = "100%";
        row.style.maxWidth = "100%";
        row.style.boxSizing = "border-box";
        row.style.border = "1px solid #d6e0ef";
        row.style.borderRadius = "6px";
        row.style.padding = "6px 8px";
        row.style.marginBottom = "6px";
        row.style.background = "#f6f7f9";
        row.style.color = "#233";

        const title = document.createElement("div");
        title.textContent = item.patient || "Paciente";
        title.style.textDecoration = "line-through";
        title.style.opacity = "0.75";
        title.style.fontWeight = "600";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";

        const meta = document.createElement("div");
        meta.style.fontSize = "11px";
        meta.style.opacity = "0.85";
        meta.textContent = `${item.phoneDisplay || ""}${item.hour ? ` - ${item.hour}` : ""} | reagendado para ${item.doneDateLabel || getAgendaDateLabel()}`;

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.justifyContent = "flex-end";
        actions.style.marginTop = "6px";

        const archiveBtn = document.createElement("button");
        archiveBtn.type = "button";
        archiveBtn.textContent = "X Arquivar";
        archiveBtn.title = "Arquivar este reagendamento (salvo por UBS para relatório)";
        archiveBtn.style.border = "1px solid #c53030";
        archiveBtn.style.background = "#fff5f5";
        archiveBtn.style.color = "#9b1c1c";
        archiveBtn.style.borderRadius = "5px";
        archiveBtn.style.fontSize = "11px";
        archiveBtn.style.padding = "3px 8px";
        archiveBtn.style.cursor = "pointer";
        archiveBtn.onclick = () => {
          const ok = archiveRemarcarItem(item.id);
          if (ok) renderRemarcarPanel();
        };
        actions.appendChild(archiveBtn);

        row.appendChild(title);
        row.appendChild(meta);
        row.appendChild(actions);
        reagList.appendChild(row);
      });
    };

    reagSearch.oninput = () => renderReagendadosList();
    renderReagendadosList();
  }

  function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  function openModal(entries) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,.35)";
    overlay.style.zIndex = "1000003";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const box = document.createElement("div");
    box.style.width = "min(760px, 92vw)";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";
    box.style.background = "#fff";
    box.style.border = "1px solid #d6deea";
    box.style.borderRadius = "10px";
    box.style.padding = "12px";
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>Enviar mensagem da consulta</strong>
        <button id="esus-wa-close" style="border:0;background:transparent;cursor:pointer;font-size:18px;">x</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <label for="esus-wa-template" style="font-size:12px;color:#334;">Modelo:</label>
        <select id="esus-wa-template" style="padding:6px 8px;border:1px solid #c9d3e4;border-radius:6px;">
          <option value="reminder">Lembrete de consulta</option>
          <option value="cancel">Cancelamento de consulta</option>
        </select>
      </div>
      <div id="esus-wa-list"></div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const closeBtn = box.querySelector("#esus-wa-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeModal();
    });

    const list = box.querySelector("#esus-wa-list");
    const templateSelect = box.querySelector("#esus-wa-template");

    const applySentStyle = (node) => {
      node.style.setProperty("background", "#c8f7d1", "important");
      node.style.setProperty("border-color", "#2f9e44", "important");
      node.style.setProperty("color", "#125b2b", "important");
      node.style.setProperty("font-weight", "700", "important");
    };

    const applyCancelStyle = (node) => {
      node.style.setProperty("background", "#fff3bf", "important");
      node.style.setProperty("border-color", "#f08c00", "important");
      node.style.setProperty("color", "#7a4b00", "important");
      node.style.setProperty("font-weight", "700", "important");
    };

    const historyLabel = (history) => {
      if (!history || history.length === 0) return "";
      return history
        .map((h) => `${h.type === "cancel" ? "cancelamento" : "lembrete"} ${formatDateTime(h.at)}`)
        .join(" | ");
    };

    const renderList = (templateId) => {
      if (!list) return;
      list.innerHTML = "";
      const store = loadClickedMap();
      entries.forEach((entry) => {
        const msg = buildWhatsappMessage(entry, templateId);
        const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(
          entry.phone
        )}&text=${encodeURIComponent(msg)}`;
        const baseKey = getEntryKey(entry);
        const history = getHistory(store, baseKey);
        const last = getLastAction(history);
        const wasClicked = Boolean(last);
        const item = document.createElement("a");
        item.href = url;
        item.target = "_blank";
        item.rel = "noopener noreferrer";
        item.dataset.entryKey = baseKey;
        const patientShort = truncateName(entry.patient, 15) || "Paciente";
        const dddWarn = entry.dddCorrected ? " | DDD incorreto (06), ajuste para 69" : "";
        const sentMark = wasClicked ? " [enviado]" : "";

        const main = document.createElement("div");
        main.textContent = `${entry.hour ? `${entry.hour} - ` : ""}${patientShort} | ${entry.phoneDisplay || entry.phone}${dddWarn}${sentMark}`;
        const meta = document.createElement("div");
        meta.style.fontSize = "11px";
        meta.style.opacity = "0.9";
        meta.style.marginTop = "3px";
        meta.textContent = historyLabel(history);

        item.style.display = "block";
        item.style.padding = "10px";
        item.style.marginBottom = "6px";
        item.style.border = "1px solid #d8e1ef";
        item.style.borderRadius = "8px";
        item.style.textDecoration = "none";
        item.style.color = "#1f2a44";
        item.style.background = "#f8fbff";
        item.appendChild(main);
        item.appendChild(meta);

        if (last?.type === "cancel") applyCancelStyle(item);
        else if (last?.type === "reminder") applySentStyle(item);

        item.addEventListener("click", () => {
          const updatedHistory = addHistoryAction(baseKey, templateId === "cancel" ? "cancel" : "reminder");
          const updatedLast = getLastAction(updatedHistory);

          if (templateId === "cancel") {
            upsertRemarcarItem(entry);
            renderRemarcarPanel();
          }

          if (updatedLast?.type === "cancel") applyCancelStyle(item);
          else applySentStyle(item);

          const nextMain = `${entry.hour ? `${entry.hour} - ` : ""}${patientShort} | ${entry.phoneDisplay || entry.phone}${dddWarn} [enviado]`;
          main.textContent = nextMain;
          meta.textContent = historyLabel(updatedHistory);
        });
        list.appendChild(item);
      });
    };

    renderList("reminder");
    if (templateSelect) {
      templateSelect.addEventListener("change", () => {
        const selected = String(templateSelect.value || "reminder");
        renderList(selected);
      });
    }
  }

  function ensureFloatingButton() {
    if (!isAgendaPage()) return;
    latestEntries = collectAgendaEntries();
  }

  function refresh() {
    ensureFloatingButton();
    renderRemarcarPanel();
  }

  function boot() {
    refresh();
  }

  const observer = new MutationObserver((mutations) => {
    const interestingMutation = Array.from(mutations || []).some((m) => {
      const target = m?.target;
      return !isInsideOurUi(target);
    });
    if (!interestingMutation) return;
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 300);
  });

  boot();
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
