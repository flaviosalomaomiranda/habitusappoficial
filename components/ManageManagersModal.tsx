import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../src/lib/firebase";
import { db } from "../src/lib/firebase";
import { getStates, getCitiesByState, type Municipio, type UF } from "../services/ibgeService";
import type { Manager } from "../types";
import { createManagerAuthUser } from "../src/lib/managerProvisioning";

interface ManageManagersModalProps {
  onClose: () => void;
}

const emptyManager: Partial<Manager> = {
  status: "active",
  uf: "",
  cityIds: [],
  clientsRegistered: 0,
  clientsPaying: 0,
};

const PROFILE_IMAGE_MAX_BYTES = 1_500_000;
const PROFILE_IMAGE_WIDTH = 600;
const PROFILE_IMAGE_HEIGHT = 600;

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const formatCpf = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
const formatCnpj = (value: string) => {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};
const formatPhone = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
};
const formatAgency = (value: string) => {
  const normalized = value.replace(/x/gi, "0");
  return onlyDigits(normalized).slice(0, 6);
};
const formatAccount = (value: string) => onlyDigits(value).slice(0, 12);
const formatPix = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return value.trim();
};

// Firestore does not accept undefined values.
const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((v) => stripUndefinedDeep(v))
      .filter((v) => v !== undefined) as any;
  }
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
};

const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const { width, height } = img;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao ler imagem."));
    };
    img.src = url;
  });

const bankOptions = [
  "Banco do Brasil",
  "Caixa",
  "Bradesco",
  "Itaú",
  "Santander",
  "Nubank",
  "Inter",
  "C6 Bank",
  "Sicredi",
  "Sicoob",
  "Banrisul",
  "BTG Pactual",
  "Outro",
];

const ManageManagersModal: React.FC<ManageManagersModalProps> = ({ onClose }) => {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [citiesByUf, setCitiesByUf] = useState<Record<string, Municipio[]>>({});
  const [filterUf, setFilterUf] = useState<string>("");

  useEffect(() => {
    const ref = collection(db, "managers");
    const unsub = onSnapshot(ref, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Manager[];
      setManagers(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const ufs = Array.from(new Set(managers.map((m) => m.uf).filter(Boolean)));
    if (ufs.length === 0) return;
    const missing = ufs.filter((uf) => !citiesByUf[uf]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (uf) => {
        const cities = await getCitiesByState(uf);
        return { uf, cities };
      })
    ).then((results) => {
      setCitiesByUf((prev) => {
        const next = { ...prev };
        results.forEach(({ uf, cities }) => {
          next[uf] = cities;
        });
        return next;
      });
    });
  }, [managers, citiesByUf]);

  const summary = useMemo(() => {
    const totalManagers = managers.length;
    const activeManagers = managers.filter((m) => m.status === "active").length;
    const totalClientsRegistered = managers.reduce((acc, m) => acc + (m.clientsRegistered || 0), 0);
    const totalClientsPaying = managers.reduce((acc, m) => acc + (m.clientsPaying || 0), 0);
    return { totalManagers, activeManagers, totalClientsRegistered, totalClientsPaying };
  }, [managers]);

  const exportManagersCsv = () => {
    const headers = [
      "Nome",
      "CPF",
      "Email",
      "Status",
      "UF",
      "Cidades",
      "ComissaoPercentual",
      "ClientesCadastrados",
      "ClientesPagantes",
      "WhatsApp",
      "Telefone",
      "PIX",
      "Banco",
      "Agencia",
      "Conta",
      "TipoConta",
    ];
    const rows = managers
      .filter((m) => !filterUf || m.uf === filterUf)
      .map((m) => [
        m.fullName || "",
        m.cpf || "",
        m.email || "",
        m.status || "",
        m.uf || "",
        (m.cityNames || []).join("; "),
        String(m.commissionPercent ?? 0),
        String(m.clientsRegistered ?? 0),
        String(m.clientsPaying ?? 0),
        m.whatsapp || "",
        m.phone || "",
        m.pix || "",
        m.bankName || "",
        m.bankAgency || "",
        m.bankAccount || "",
        m.bankAccountType || "",
      ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gerentes-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const perState = useMemo(() => {
    const grouped: Record<string, Manager[]> = {};
    managers.forEach((m) => {
      if (!m.uf) return;
      grouped[m.uf] = grouped[m.uf] || [];
      grouped[m.uf].push(m);
    });
    return Object.entries(grouped).map(([uf, list]) => {
      const managersCount = list.length;
      const activeCount = list.filter((m) => m.status === "active").length;
      const cityIds = new Set(list.flatMap((m) => m.cityIds || []));
      const totalCities = citiesByUf[uf]?.length || 0;
      const coverage = totalCities > 0 ? Math.round((cityIds.size / totalCities) * 100) : 0;
      const clientsRegistered = list.reduce((acc, m) => acc + (m.clientsRegistered || 0), 0);
      const clientsPaying = list.reduce((acc, m) => acc + (m.clientsPaying || 0), 0);
      return {
        uf,
        managersCount,
        activeCount,
        citiesCovered: cityIds.size,
        totalCities,
        coverage,
        clientsRegistered,
        clientsPaying,
      };
    });
  }, [managers, citiesByUf]);

  const rankedManagers = useMemo(() => {
    const list = managers.filter((m) => !filterUf || m.uf === filterUf);
    return list
      .slice()
      .sort((a, b) => (b.clientsPaying || 0) - (a.clientsPaying || 0))
      .slice(0, 8);
  }, [managers, filterUf]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-5xl m-4 flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Admin: Gerentes</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-2xl">
            &times;
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b pb-4 mb-4">
          <button
            onClick={() => {
              setEditingManager(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold"
          >
            Adicionar gerente
          </button>
          <button
            onClick={exportManagersCsv}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold"
          >
            Exportar CSV
          </button>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500">Filtrar UF:</label>
            <select
              value={filterUf}
              onChange={(e) => setFilterUf(e.target.value)}
              className="px-2 py-2 border rounded bg-white text-xs"
            >
              <option value="">Todas</option>
              {Array.from(new Set(managers.map((m) => m.uf).filter(Boolean))).map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Gerentes</div>
            <div className="text-xl font-bold text-gray-800">{summary.totalManagers}</div>
            <div className="text-xs text-gray-500">{summary.activeManagers} ativos</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Clientes</div>
            <div className="text-xl font-bold text-gray-800">{summary.totalClientsRegistered}</div>
            <div className="text-xs text-gray-500">cadastrados</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Pagantes</div>
            <div className="text-xl font-bold text-gray-800">{summary.totalClientsPaying}</div>
            <div className="text-xs text-gray-500">ativos</div>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Estados</div>
            <div className="text-xl font-bold text-gray-800">{perState.length}</div>
            <div className="text-xs text-gray-500">com gerentes</div>
          </div>
        </div>

        {perState.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-bold text-gray-700 mb-2">Cobertura por estado</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {perState
                .filter((s) => !filterUf || s.uf === filterUf)
                .map((s) => (
                <div key={s.uf} className="rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-gray-800">{s.uf}</div>
                    <div className="text-xs text-gray-500">{s.managersCount} gerentes ({s.activeCount} ativos)</div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {s.citiesCovered}/{s.totalCities || "?"} cidades • {s.coverage}%
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-2 bg-purple-600" style={{ width: `${s.coverage}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Clientes: {s.clientsRegistered} • Pagantes: {s.clientsPaying}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rankedManagers.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-bold text-gray-700 mb-2">Top gerentes (pagantes)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rankedManagers.map((m, index) => (
                <div key={m.id} className="rounded-lg border bg-white p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-400">#{index + 1}</div>
                    <div className="font-bold text-gray-800">{m.fullName}</div>
                    <div className="text-xs text-gray-500">{m.uf} • {(m.cityNames || []).length} cidades</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-700">{m.clientsPaying || 0}</div>
                    <div className="text-xs text-gray-500">pagantes</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-grow overflow-y-auto pr-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2">Nome</th>
                <th>Email</th>
                <th>UF</th>
                <th>Cidades</th>
                <th>Status</th>
                <th>Comissão</th>
                <th>Clientes</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {managers
                .filter((m) => !filterUf || m.uf === filterUf)
                .map((m) => (
                <tr key={m.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-medium">{m.fullName}</td>
                  <td>{m.email}</td>
                  <td>{m.uf}</td>
                  <td className="max-w-[220px] truncate">{(m.cityNames || []).join(", ")}</td>
                  <td>{m.status === "active" ? "✅" : "❌"}</td>
                  <td>{m.commissionPercent ?? 0}%</td>
                  <td>
                    {m.clientsRegistered ?? 0} / {m.clientsPaying ?? 0}
                  </td>
                  <td className="space-x-2">
                    <button
                      onClick={() => {
                        setEditingManager(m);
                        setIsFormOpen(true);
                      }}
                      className="text-purple-600 font-semibold"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Excluir gerente ${m.fullName}?`)) {
                          deleteDoc(doc(db, "managers", m.id));
                        }
                      }}
                      className="text-red-600 font-semibold"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isFormOpen && (
          <ManagerForm
            manager={editingManager}
            onClose={() => setIsFormOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

interface ManagerFormProps {
  manager: Manager | null;
  onClose: () => void;
}

const ManagerForm: React.FC<ManagerFormProps> = ({ manager, onClose }) => {
  const [formState, setFormState] = useState<Partial<Manager>>(manager || emptyManager);
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [createdManagerId, setCreatedManagerId] = useState<string | null>(null);
  const [hasSentInvite, setHasSentInvite] = useState(false);

  useEffect(() => {
    getStates().then(setStates);
  }, []);

  useEffect(() => {
    if (formState.uf) getCitiesByState(formState.uf).then(setCities);
  }, [formState.uf]);

  useEffect(() => {
    setFormState(manager || emptyManager);
  }, [manager]);
  useEffect(() => {
    setInviteError(null);
    setResetLink(null);
    setCreatedManagerId(null);
    setHasSentInvite(false);
  }, [manager]);

  const toggleCity = (cityId: string) => {
    setFormState((prev) => {
      const current = new Set(prev.cityIds || []);
      if (current.has(cityId)) current.delete(cityId);
      else current.add(cityId);
      return { ...prev, cityIds: Array.from(current) };
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]:
        name === "commissionPercent" || name === "clientsRegistered" || name === "clientsPaying"
          ? Number(value)
          : value,
    }));
  };

  const uploadImage = async (file: File, path: string) => {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, { contentType: file.type });
    return getDownloadURL(fileRef);
  };

  const handleProfileUpload = async (file: File) => {
    setUploadError(null);
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setUploadError("Formato inválido. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setUploadError(`Arquivo grande demais. Máximo ${(PROFILE_IMAGE_MAX_BYTES / 1_000_000).toFixed(1)}MB.`);
      return;
    }
    try {
      setIsUploading(true);
      const { width, height } = await getImageDimensions(file);
      if (width !== PROFILE_IMAGE_WIDTH || height !== PROFILE_IMAGE_HEIGHT) {
        setUploadError(`A foto precisa ter ${PROFILE_IMAGE_WIDTH}x${PROFILE_IMAGE_HEIGHT}px.`);
        return;
      }
      const id = manager?.id || `manager-${crypto.randomUUID()}`;
      const url = await uploadImage(file, `managers/profiles/${id}-${Date.now()}`);
      setFormState((p) => ({ ...p, profilePhotoUrl: url }));
    } catch (err) {
      setUploadError("Falha ao enviar a foto.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.fullName?.trim()) return alert("Informe o nome completo.");
    if (!formState.cpf?.trim()) return alert("Informe o CPF.");
    if (!formState.email?.trim()) return alert("Informe o e-mail.");
    if (formState.commissionPercent === undefined || formState.commissionPercent === null || Number.isNaN(Number(formState.commissionPercent))) {
      return alert("Informe a comissão (%).");
    }
    if (!formState.uf) return alert("Selecione o UF.");
    if (!formState.cityIds || formState.cityIds.length === 0) return alert("Selecione pelo menos 1 cidade.");
    if (isUploading) return alert("Aguarde o upload da foto terminar.");

    const cityNames = cities
      .filter((c) => (formState.cityIds || []).includes(String(c.id)))
      .map((c) => c.nome);

    const id = manager?.id || `manager-${crypto.randomUUID()}`;
    const payload: Manager = {
      id,
      fullName: formState.fullName?.trim() || "",
      cpf: formState.cpf?.trim() || "",
      email: formState.email?.trim().toLowerCase() || "",
      emailLower: formState.email?.trim().toLowerCase() || "",
      whatsapp: formState.whatsapp?.trim() || "",
      phone: formState.phone?.trim() || "",
      address: formState.address?.trim() || "",
      pix: formState.pix?.trim() || "",
      bankName: formState.bankName?.trim() || "",
      bankAgency: formState.bankAgency?.trim() || "",
      bankAccount: formState.bankAccount?.trim() || "",
      bankAccountType: (formState.bankAccountType as any) || "",
      mustChangePassword: false,
      status: (formState.status as "active" | "inactive") || "active",
      uf: formState.uf || "",
      cityIds: formState.cityIds || [],
      cityNames,
      commissionPercent: formState.commissionPercent,
      clientsRegistered: formState.clientsRegistered ?? 0,
      clientsPaying: formState.clientsPaying ?? 0,
      profilePhotoUrl: formState.profilePhotoUrl || "",
      inviteStatus: manager?.inviteStatus || "pending",
      updatedAt: new Date().toISOString(),
    };

    const firestorePayload: Record<string, any> = stripUndefinedDeep({
      ...payload,
      updatedAt: serverTimestamp(),
    });
    if (!manager) firestorePayload.createdAt = serverTimestamp();

    try {
      setIsSaving(true);
      await setDoc(doc(db, "managers", id), firestorePayload, { merge: true });
      if (!manager && !hasSentInvite) {
        setCreatedManagerId(id);
        await sendInvite(id);
      } else if (manager) {
        onClose();
      }
    } catch (err) {
      console.error("Falha ao salvar gerente:", err);
      alert("Falha ao salvar gerente. Verifique as permissões e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const sendInvite = async (managerId: string) => {
    if (!formState.email?.trim()) {
      alert("Informe o e-mail do gerente antes de enviar.");
      return;
    }
    try {
      setInviteError(null);
      setIsSendingInvite(true);
      const result = await createManagerAuthUser({
        email: formState.email.trim().toLowerCase(),
        fullName: formState.fullName || "",
        managerId,
      });
      setResetLink(result?.resetLink || null);
      setHasSentInvite(true);
      alert("Convite enviado por e-mail.");
    } catch (err: any) {
      console.error("Falha ao enviar convite:", err);
      if (String(err?.message || "").includes("CREATE_MANAGER_URL_NOT_CONFIGURED")) {
        setInviteError("Função não configurada. Defina VITE_CREATE_MANAGER_URL.");
      } else {
        setInviteError("Falha ao enviar convite por e-mail.");
      }
      alert("Falha ao enviar convite. Verifique a configuração.");
    } finally {
      setIsSendingInvite(false);
    }
  };

  const selectedCityIds = new Set(formState.cityIds || []);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[51] p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
        <h3 className="text-xl font-bold mb-4">{manager ? "Editar" : "Adicionar"} Gerente</h3>
        <div className="overflow-y-auto pr-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input name="fullName" value={formState.fullName || ""} onChange={handleChange} placeholder="Nome completo" className="p-2 border rounded" />
            <input name="cpf" value={formState.cpf || ""} onChange={(e) => setFormState((p) => ({ ...p, cpf: formatCpf(e.target.value) }))} placeholder="CPF" inputMode="numeric" className="p-2 border rounded" />
            <input name="email" value={formState.email || ""} onChange={handleChange} placeholder="E-mail" className="p-2 border rounded" />
            <input name="whatsapp" value={formState.whatsapp || ""} onChange={(e) => setFormState((p) => ({ ...p, whatsapp: formatPhone(e.target.value) }))} placeholder="WhatsApp" inputMode="numeric" className="p-2 border rounded" />
            <input name="phone" value={formState.phone || ""} onChange={(e) => setFormState((p) => ({ ...p, phone: formatPhone(e.target.value) }))} placeholder="Telefone fixo" inputMode="numeric" className="p-2 border rounded" />
            <input name="pix" value={formState.pix || ""} onChange={(e) => setFormState((p) => ({ ...p, pix: formatPix(e.target.value) }))} placeholder="Chave PIX" className="p-2 border rounded" />
            <select name="bankName" value={formState.bankName || ""} onChange={handleChange} className="p-2 border rounded bg-white">
              <option value="">Banco</option>
              {bankOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              name="bankAgency"
              value={formState.bankAgency || ""}
              onChange={(e) => setFormState((p) => ({ ...p, bankAgency: formatAgency(e.target.value) }))}
              placeholder="Agência (dígitos)"
              inputMode="numeric"
              className="p-2 border rounded"
            />
            <input
              name="bankAccount"
              value={formState.bankAccount || ""}
              onChange={(e) => setFormState((p) => ({ ...p, bankAccount: formatAccount(e.target.value) }))}
              placeholder="Conta (dígitos)"
              inputMode="numeric"
              className="p-2 border rounded"
            />
            <select name="bankAccountType" value={formState.bankAccountType || ""} onChange={handleChange} className="p-2 border rounded bg-white">
              <option value="">Tipo de conta</option>
              <option value="corrente">Conta corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
            <div className="col-span-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Foto de perfil (600x600px, até 1.5MB)</div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleProfileUpload(file);
                    if (e.target) e.target.value = "";
                  }}
                  className="text-xs"
                />
                {formState.profilePhotoUrl && (
                  <div className="flex items-center gap-2">
                    <img src={formState.profilePhotoUrl} alt="Foto de perfil" className="w-16 h-16 rounded-full object-cover border" />
                    <button type="button" onClick={() => setFormState((p) => ({ ...p, profilePhotoUrl: "" }))} className="text-xs text-red-600">
                      Remover
                    </button>
                  </div>
                )}
              </div>
              {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
            </div>
            <select name="status" value={formState.status || "active"} onChange={handleChange} className="p-2 border rounded bg-white">
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <div className="text-[11px] text-gray-500 flex items-center">
              Inativo impede login e gestão de profissionais.
            </div>
            <div className="col-span-2 border rounded-lg p-3 bg-gray-50">
              <div className="text-xs font-semibold text-gray-600 mb-2">Convite de acesso</div>
              <p className="text-[11px] text-gray-500">
                Ao salvar um novo gerente, enviamos automaticamente um e-mail com link para definir a senha.
              </p>
              {inviteError && <p className="text-[11px] text-red-600 mt-2">{inviteError}</p>}
              {resetLink && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] text-gray-500">Link de redefinição (para enviar por WhatsApp):</div>
                  <input
                    value={resetLink}
                    readOnly
                    className="p-2 border rounded bg-white text-gray-700 w-full text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(resetLink);
                          alert("Link copiado!");
                        } catch (err) {
                          alert("Não foi possível copiar o link.");
                        }
                      }}
                      className="px-3 py-2 border rounded bg-white text-xs font-semibold"
                    >
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!formState.whatsapp?.trim()) return alert("Informe o WhatsApp.");
                        const phone = formState.whatsapp.replace(/\D/g, "");
                        const text = encodeURIComponent(
                          `Olá ${formState.fullName || ""}, seu acesso ao Habitus:\nE-mail: ${formState.email}\nLink para definir senha: ${resetLink}`
                        );
                        window.open(`https://wa.me/55${phone}?text=${text}`, "_blank");
                      }}
                      className="px-3 py-2 border rounded bg-white text-xs font-semibold"
                    >
                      Enviar WhatsApp
                    </button>
                  </div>
                </div>
              )}
              {!resetLink && !manager && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const id = createdManagerId || manager?.id;
                      if (!id) {
                        alert("Salve o gerente para enviar o convite.");
                        return;
                      }
                      sendInvite(id);
                    }}
                    className="px-3 py-2 border rounded bg-white text-xs font-semibold"
                    disabled={isSendingInvite}
                  >
                    {isSendingInvite ? "Enviando..." : "Reenviar convite por e-mail"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <textarea name="address" value={formState.address || ""} onChange={handleChange} placeholder="Endereço residencial completo" className="p-2 border rounded w-full h-20"></textarea>

          <div className="grid grid-cols-2 gap-3">
            <input name="commissionPercent" type="number" min={0} max={100} value={formState.commissionPercent ?? ""} onChange={handleChange} placeholder="Comissão (%)" className="p-2 border rounded" />
            <div className="text-[11px] text-gray-500 flex items-center">
              Comissão é obrigatória para salvar.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select name="uf" value={formState.uf || ""} onChange={handleChange} className="p-2 border rounded bg-white">
              <option value="">UF responsável</option>
              {states.map((s) => (
                <option key={s.sigla} value={s.sigla}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">Cidades responsáveis</div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded p-2">
              {cities.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedCityIds.has(String(c.id))}
                    onChange={() => toggleCity(String(c.id))}
                  />
                  <span className="truncate">{c.nome}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">
            Cancelar
          </button>
          <button type="submit" disabled={isSaving} className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold disabled:opacity-60">
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ManageManagersModal;
