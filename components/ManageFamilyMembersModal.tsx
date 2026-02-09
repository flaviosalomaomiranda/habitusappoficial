import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { useAppContext } from "../context/AppContext";
import { createFamilyInvite } from "../src/lib/db";

interface ManageFamilyMembersModalProps {
  onClose: () => void;
}

type MemberRow = {
  uid: string;
  email?: string | null;
  role?: string;
  canEditChildren?: boolean;
  canEditHabits?: boolean;
  canMarkHabits?: boolean;
  expiresAt?: any;
};

const ManageFamilyMembersModal: React.FC<ManageFamilyMembersModalProps> = ({ onClose }) => {
  const { familyId, isFamilyOwner, canManageMembers } = useAppContext();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [newUid, setNewUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"responsible" | "caregiver">("caregiver");
  const [inviteCanMarkHabits, setInviteCanMarkHabits] = useState(true);
  const [inviteCanEditHabits, setInviteCanEditHabits] = useState(false);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [manualExpiresAt, setManualExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    if (!familyId) {
      setMembers([]);
      return;
    }

    const ref = collection(db, "families", familyId, "members");
    const unsub = onSnapshot(ref, (snap) => {
      const rows = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as any),
      })) as MemberRow[];
      setMembers(rows);
      if (canManageMembers) {
        const now = Date.now();
        rows.forEach((member) => {
          const expiresAt = member.expiresAt?.toDate ? member.expiresAt.toDate().getTime() : null;
          if (expiresAt && expiresAt < now && member.role !== "owner") {
            deleteDoc(doc(db, "families", familyId, "members", member.uid)).catch(() => null);
          }
        });
      }
    });

    return () => unsub();
  }, [familyId, canManageMembers]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      return (a.email || a.uid).localeCompare(b.email || b.uid);
    });
  }, [members]);
  const currentUid = auth.currentUser?.uid || null;
  const currentMember = useMemo(
    () => sortedMembers.find((member) => member.uid === currentUid) || null,
    [sortedMembers, currentUid]
  );
  const otherMembers = useMemo(
    () => sortedMembers.filter((member) => member.uid !== currentUid),
    [sortedMembers, currentUid]
  );

  const formatRole = (role?: string) => {
    if (role === "owner") return "Proprietario do grupo familiar";
    if (role === "responsible") return "Responsavel";
    return "Cuidador";
  };

  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  };

  const inviteRoleLabel = inviteRole === "responsible" ? "Responsavel" : "Cuidador";
  const inviteExpiresLabel = inviteExpiresAt ? inviteExpiresAt.split("-").reverse().join("/") : "--/--/----";
  const inviterLabel = auth.currentUser?.displayName || auth.currentUser?.email || "alguem da familia";
  const invitePermissionsLabel = inviteRole === "responsible"
    ? "editar pessoas, editar habitos e marcar tarefas"
    : [
        inviteCanEditHabits ? "adicionar habitos" : null,
        inviteCanMarkHabits ? "marcar tarefas" : null,
      ].filter(Boolean).join(", ") || "sem permissoes especiais";
  const inviteMessage = `Voce esta sendo convidado por ${inviterLabel} a fazer parte do grupo familiar como: ${inviteRoleLabel} e podera: ${invitePermissionsLabel}. Funcao ate o dia ${inviteExpiresLabel}.`;
  const inviteCopyText = inviteLink ? `${inviteMessage}\n\nLink do convite: ${inviteLink}` : inviteMessage;

  const canEditMember = (member: MemberRow) => {
    const role = member.role ?? "caregiver";
    if (role === "owner") return false;
    if (isFamilyOwner) return true;
    if (!canManageMembers) return false;
    return role === "caregiver";
  };

  const handleAddMember = async () => {
    if (!familyId) return;
    const uid = newUid.trim();
    if (!uid) {
      setError("Informe o UID do responsavel.");
      return;
    }
    const manualExpiresDate = manualExpiresAt ? new Date(`${manualExpiresAt}T23:59:59`) : null;

    setError(null);
    setSaving(true);
    try {
      await setDoc(
        doc(db, "families", familyId, "members", uid),
        {
          role: "responsible",
          canEditChildren: true,
          canEditHabits: true,
          canMarkHabits: true,
          ...(manualExpiresDate ? { expiresAt: manualExpiresDate } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setNewUid("");
    } catch (err) {
      console.error("Falha ao adicionar membro:", err);
      setError("Nao foi possivel salvar o membro.");
    } finally {
      setSaving(false);
    }
  };


  const handleToggle = async (
    uid: string,
    field: "canEditChildren" | "canEditHabits" | "canMarkHabits",
    value: boolean
  ) => {
    if (!familyId) return;
    try {
      await setDoc(
        doc(db, "families", familyId, "members", uid),
        { [field]: value, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error("Falha ao atualizar permissao:", err);
      setError("Nao foi possivel atualizar a permissao.");
    }
  };

  const handleRemove = async (uid: string, role?: string) => {
    if (!familyId || role === "owner") return;
    if (!window.confirm("Remover este membro da familia?")) return;
    try {
      await deleteDoc(doc(db, "families", familyId, "members", uid));
    } catch (err) {
      console.error("Falha ao remover membro:", err);
      setError("Nao foi possivel remover o membro.");
    }
  };

  const handleCreateInvite = async () => {
    if (!familyId) return;
    if (!canManageMembers) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setInviteStatus("Usuario nao autenticado.");
      return;
    }
    if (!inviteExpiresAt) {
      setInviteStatus("Informe a data limite do convite.");
      return;
    }

    setInviteLoading(true);
    setInviteStatus(null);
    setInviteCopied(false);
    try {
      const role = isFamilyOwner ? inviteRole : "caregiver";
      const permissions = role === "responsible"
        ? { canEditHabits: true, canMarkHabits: true }
        : { canEditHabits: inviteCanEditHabits, canMarkHabits: inviteCanMarkHabits };
      const expiresAt = inviteExpiresAt ? new Date(`${inviteExpiresAt}T23:59:59`) : null;

      const code = await createFamilyInvite({
        familyId,
        createdByUid: uid,
        role,
        permissions,
        expiresAt,
      });

      const link = `${window.location.origin}?invite=${code}`;
      setInviteLink(link);
      setInviteStatus("Convite gerado. Compartilhe o link.");
    } catch (err) {
      console.error("Falha ao gerar convite:", err);
      setInviteStatus("Nao foi possivel gerar o convite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const renderMemberRow = (member: MemberRow) => {
    const canEdit = canEditMember(member);
    const isSelf = member.uid === currentUid;
    const expiresAt = member.expiresAt?.toDate ? member.expiresAt.toDate() : null;
    return (
      <div
        key={member.uid}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 rounded-xl border border-gray-200 p-2"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-bold text-gray-800 truncate">
              {member.email || member.uid}
            </div>
            {isSelf && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                Seus dados
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-400">UID: {member.uid}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-600 font-bold">
            {formatRole(member.role)}
          </div>
          {expiresAt && (
            <div className="mt-0.5 text-[10px] text-gray-500">
              Funcao ate: {formatDate(expiresAt)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-semibold text-gray-600 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(member.canEditChildren)}
              onChange={(e) => handleToggle(member.uid, "canEditChildren", e.target.checked)}
              disabled={!canEdit}
            />
            Editar pessoas
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(member.canEditHabits)}
              onChange={(e) => handleToggle(member.uid, "canEditHabits", e.target.checked)}
              disabled={!canEdit}
            />
            Editar habitos
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(member.canMarkHabits)}
              onChange={(e) => handleToggle(member.uid, "canMarkHabits", e.target.checked)}
              disabled={!canEdit}
            />
            Marcar tarefas
          </label>
          <button
            onClick={() => handleRemove(member.uid, member.role)}
            disabled={!canEdit}
            className="text-[10px] font-bold text-red-600 hover:text-red-700 disabled:opacity-50 text-left"
          >
            Remover
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start md:items-center justify-center z-[150] p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-4 sm:p-6 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Membros da Familia</h2>
            <p className="text-sm text-gray-500 mt-1">
              Controle quem pode editar pessoas e habitos.
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-bold text-gray-500 hover:text-gray-700"
          >
            Fechar
          </button>
        </div>

        {!canManageMembers && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm font-semibold">
            Voce nao tem permissao para alterar membros.
          </div>
        )}

        <div className="mt-5 space-y-3">
          {!currentMember && otherMembers.length === 0 && (
            <div className="text-sm text-gray-500">Nenhum membro encontrado.</div>
          )}
          {currentMember && (
            <div>
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Seus dados</h3>
              {renderMemberRow(currentMember)}
            </div>
          )}
          {otherMembers.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Outros membros</h3>
              <div className="space-y-3">
                {otherMembers.map(renderMemberRow)}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-bold text-gray-700">Convites</h3>
          <p className="text-xs text-gray-500 mt-1">
            Gere um link para convidar um responsavel ou cuidador.
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de convite</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "responsible" | "caregiver")}
                disabled={!isFamilyOwner}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
              >
                <option value="caregiver">Cuidador</option>
                <option value="responsible">Responsavel</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ate o dia (fim do acesso)</label>
              <input
                type="date"
                value={inviteExpiresAt}
                onChange={(e) => setInviteExpiresAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                disabled={!canManageMembers}
              />
            </div>
            <div className="flex flex-col justify-center gap-2 text-[11px] font-semibold text-gray-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inviteCanMarkHabits}
                  onChange={(e) => setInviteCanMarkHabits(e.target.checked)}
                  disabled={!canManageMembers || inviteRole === "responsible"}
                />
                Permitir marcar tarefas
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inviteCanEditHabits}
                  onChange={(e) => setInviteCanEditHabits(e.target.checked)}
                  disabled={!canManageMembers || inviteRole === "responsible"}
                />
                Permitir adicionar habitos
              </label>
            </div>
          </div>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleCreateInvite}
            disabled={!canManageMembers || inviteLoading}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
          >
            {inviteLoading ? "Gerando..." : "Gerar convite"}
          </button>
            {inviteLink && (
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(inviteCopyText);
                  setInviteCopied(true);
                  setTimeout(() => setInviteCopied(false), 2000);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  inviteCopied
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {inviteCopied ? "Convite copiado" : "Copiar convite"}
              </button>
            )}
          </div>
          {inviteLink && (
            <>
              <div className="mt-3 text-xs text-gray-600">
                {inviteMessage}
              </div>
            </>
          )}
          {inviteStatus && <div className="mt-2 text-xs text-gray-500">{inviteStatus}</div>}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-bold text-gray-700">Adicionar membro (via UID)</h3>
          <p className="text-xs text-gray-500 mt-1">
            O membro precisa estar cadastrado no Habitus App. Informe o UID dele.
          </p>
          <div className="mt-3">
            <input
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
              placeholder="UID da pessoa que sera adicionada ao grupo familiar"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              disabled={!isFamilyOwner}
            />
          </div>
          <div className="mt-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ate o dia (fim do acesso)</label>
            <input
              type="date"
              value={manualExpiresAt}
              onChange={(e) => setManualExpiresAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              disabled={!isFamilyOwner}
            />
          </div>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleAddMember}
              disabled={!isFamilyOwner || saving}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageFamilyMembersModal;
