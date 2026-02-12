import React, { useMemo, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { auth } from "../src/lib/firebase";
import { signOut, updatePassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../src/lib/firebase";
import ManageSupportNetworkModal from "./ManageSupportNetworkModal";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../src/lib/firebase";
import { UsersIcon, ClipboardListIcon, UserIcon } from "./icons/MiscIcons";

const ManagerDashboard: React.FC = () => {
  const {
    managerProfile,
    isManager,
    supportNetworkProfessionals,
    activeSupportNetworkProfessionals,
  } = useAppContext();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [view, setView] = useState<"dashboard" | "profile">("dashboard");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    fullName: "",
    whatsapp: "",
    phone: "",
    address: "",
    profilePhotoUrl: "",
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const scopedProfessionals = useMemo(() => {
    if (!managerProfile) return [];
    const cityIds = new Set(managerProfile.cityIds || []);
    return supportNetworkProfessionals.filter(
      (p) => p.uf === managerProfile.uf && cityIds.has(String(p.cityId))
    );
  }, [supportNetworkProfessionals, managerProfile]);

  const scopedActive = useMemo(() => {
    if (!managerProfile) return [];
    const cityIds = new Set(managerProfile.cityIds || []);
    return activeSupportNetworkProfessionals.filter(
      (p) => p.uf === managerProfile.uf && cityIds.has(String(p.cityId))
    );
  }, [activeSupportNetworkProfessionals, managerProfile]);

  const expiringSoon = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayStr + "T00:00:00");
    return scopedProfessionals.filter((p) => {
      if (!p.validTo) return false;
      const to = new Date(p.validTo + "T23:59:59");
      const days = Math.ceil((to.getTime() - todayStart.getTime()) / 86400000);
      return days >= 0 && days <= 7;
    });
  }, [scopedProfessionals]);

  const pendingPayments = scopedProfessionals.filter((p) => p.paymentStatus === "pending");
  const paidPayments = scopedProfessionals.filter((p) => p.paymentStatus === "paid");
  const masters = scopedProfessionals.filter((p) => p.tier === "master");
  const exclusives = scopedProfessionals.filter((p) => p.tier === "exclusive");

  const needsPasswordChange = Boolean(isManager && managerProfile?.mustChangePassword);

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) return alert("A senha precisa ter pelo menos 8 caracteres.");
    if (newPassword !== confirmPassword) return alert("As senhas não conferem.");
    if (!auth.currentUser) return alert("Usuário não autenticado.");
    try {
      setIsChangingPassword(true);
      await updatePassword(auth.currentUser, newPassword);
      if (managerProfile?.id) {
        await setDoc(
          doc(db, "managers", managerProfile.id),
          { mustChangePassword: false, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
      alert("Senha atualizada com sucesso.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Falha ao atualizar senha:", err);
      alert("Falha ao atualizar senha. Tente novamente.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleStartEdit = () => {
    setProfileDraft({
      fullName: managerProfile.fullName || "",
      whatsapp: managerProfile.whatsapp || "",
      phone: managerProfile.phone || "",
      address: managerProfile.address || "",
      profilePhotoUrl: managerProfile.profilePhotoUrl || "",
    });
    setIsEditingProfile(true);
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
    if (file.size > 1_500_000) {
      setUploadError("Arquivo grande demais. Máximo 1.5MB.");
      return;
    }
    try {
      setIsUploading(true);
      const img = new Image();
      const url = URL.createObjectURL(file);
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
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
      if (dims.width !== 600 || dims.height !== 600) {
        setUploadError("A foto precisa ter 600x600px.");
        return;
      }
      const id = managerProfile?.id || `manager-${crypto.randomUUID()}`;
      const uploadedUrl = await uploadImage(file, `managers/profiles/${id}-${Date.now()}`);
      setProfileDraft((p) => ({ ...p, profilePhotoUrl: uploadedUrl }));
    } catch (err) {
      setUploadError("Falha ao enviar a foto.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!managerProfile?.id) return;
    if (!profileDraft.fullName.trim()) return alert("Informe o nome.");
    try {
      await setDoc(
        doc(db, "managers", managerProfile.id),
        {
          fullName: profileDraft.fullName.trim(),
          whatsapp: profileDraft.whatsapp.trim(),
          phone: profileDraft.phone.trim(),
          address: profileDraft.address.trim(),
          profilePhotoUrl: profileDraft.profilePhotoUrl || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Falha ao atualizar perfil:", err);
      alert("Falha ao salvar perfil. Verifique permissões.");
    }
  };

  if (!managerProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Perfil de gerente não encontrado.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-72 bg-white border-r p-5 hidden md:flex flex-col">
        <div className="text-lg font-bold text-gray-800 mb-2">Painel do Gerente</div>
        <div className="text-xs text-gray-500 mb-6">{managerProfile.fullName}</div>
        <div className="space-y-2">
          <button
            onClick={() => setView("dashboard")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold ${
              view === "dashboard" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            <ClipboardListIcon className="w-4 h-4" /> Métricas
          </button>
          <button
            onClick={() => setIsAddOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100"
          >
            <UsersIcon className="w-4 h-4" /> Adicionar Profissional
          </button>
          <button
            onClick={() => setView("profile")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold ${
              view === "profile" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            <UserIcon className="w-4 h-4" /> Meu Perfil
          </button>
        </div>
        <div className="mt-auto pt-4">
          <button
            onClick={() => signOut(auth)}
            className="w-full px-3 py-2 rounded-lg text-sm font-bold border border-gray-200"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 space-y-6">
        <div className="md:hidden flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Painel do Gerente</div>
            <div className="text-xs text-gray-500">{managerProfile.fullName}</div>
          </div>
          <button onClick={() => signOut(auth)} className="text-xs font-bold border px-3 py-2 rounded-lg">
            Sair
          </button>
        </div>

        {view === "dashboard" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Profissionais</div>
                <div className="text-xl font-bold text-gray-800">{scopedProfessionals.length}</div>
                <div className="text-xs text-gray-500">{scopedActive.length} ativos</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Pagamentos</div>
                <div className="text-xl font-bold text-gray-800">{paidPayments.length}</div>
                <div className="text-xs text-gray-500">{pendingPayments.length} pendentes</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Premium</div>
                <div className="text-xl font-bold text-gray-800">{exclusives.length}</div>
                <div className="text-xs text-gray-500">{masters.length} masters</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Vencendo</div>
                <div className="text-xl font-bold text-gray-800">{expiringSoon.length}</div>
                <div className="text-xs text-gray-500">em até 7 dias</div>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">Profissionais vencendo em até 7 dias</h3>
                <button
                  onClick={() => setIsAddOpen(true)}
                  className="text-xs font-semibold text-purple-600"
                >
                  Adicionar profissional
                </button>
              </div>
              {expiringSoon.length === 0 ? (
                <div className="text-sm text-gray-500">Nenhum vencimento próximo.</div>
              ) : (
                <ul className="text-sm text-gray-700 space-y-1">
                  {expiringSoon.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.city}/{p.uf}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {view === "profile" && (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <h3 className="font-bold text-gray-800">Meu Perfil</h3>
            {!isEditingProfile ? (
              <div className="text-sm text-gray-700">
                <div><span className="font-semibold">Nome:</span> {managerProfile.fullName}</div>
                <div><span className="font-semibold">E-mail:</span> {managerProfile.email}</div>
                <div><span className="font-semibold">WhatsApp:</span> {managerProfile.whatsapp || "-"}</div>
                <div><span className="font-semibold">Telefone:</span> {managerProfile.phone || "-"}</div>
                <div><span className="font-semibold">Endereço:</span> {managerProfile.address || "-"}</div>
                <div><span className="font-semibold">UF:</span> {managerProfile.uf}</div>
                <div><span className="font-semibold">Cidades:</span> {(managerProfile.cityNames || []).join(", ")}</div>
                <div className="mt-3">
                  <button onClick={handleStartEdit} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold">
                    Editar perfil
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={profileDraft.fullName}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, fullName: e.target.value }))}
                    placeholder="Nome"
                    className="p-2 border rounded"
                  />
                  <input value={managerProfile.email} readOnly className="p-2 border rounded bg-gray-100 text-gray-600" />
                  <input
                    value={profileDraft.whatsapp}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, whatsapp: e.target.value }))}
                    placeholder="WhatsApp"
                    className="p-2 border rounded"
                  />
                  <input
                    value={profileDraft.phone}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="Telefone"
                    className="p-2 border rounded"
                  />
                </div>
                <textarea
                  value={profileDraft.address}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Endereço"
                  className="p-2 border rounded w-full h-20"
                />
                <div>
                  <div className="text-xs text-gray-500 mb-1">Foto de perfil (600x600px)</div>
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
                  {profileDraft.profilePhotoUrl && (
                    <div className="mt-2">
                      <img src={profileDraft.profilePhotoUrl} alt="Perfil" className="w-16 h-16 rounded-full border" />
                    </div>
                  )}
                  {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isUploading}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold disabled:opacity-60"
                  >
                    {isUploading ? "Enviando..." : "Salvar perfil"}
                  </button>
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 bg-gray-200 rounded-lg text-xs font-bold"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Não é possível alterar comissão, dados bancários, UF ou cidades.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {isAddOpen && <ManageSupportNetworkModal onClose={() => setIsAddOpen(false)} />}

      {needsPasswordChange && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-2">Trocar senha</h3>
            <p className="text-xs text-gray-500 mb-4">
              Por segurança, defina uma nova senha para continuar.
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nova senha"
              className="p-2 border rounded w-full mb-2"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmar senha"
              className="p-2 border rounded w-full mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handlePasswordChange}
                disabled={isChangingPassword}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold disabled:opacity-60"
              >
                {isChangingPassword ? "Salvando..." : "Salvar senha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard;
