import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { getStates, getCitiesByState, type UF, type Municipio } from '../services/ibgeService';
import { AgeGroup, FamilyLocation, ProfileRole, UserProfile } from '../types';
import { ANIMAL_EMOJIS } from '../constants';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';
import { cropAndCompressAvatar, isAvatarImageSource } from '../utils/avatarUtils';
import ChildAvatar from './ChildAvatar';
import {
  HEALTH_COMPLAINT_OPTIONS,
  NEURO_CONDITION_OPTIONS,
  deriveSemanticTagsFromProfile,
} from '../utils/profileSemantic';

interface UserProfileModalProps {
  onClose: () => void;
  onEditSecondaryProfile?: (childId: string) => void;
}

const ROLE_OPTIONS: { value: ProfileRole; label: string }[] = [
  { value: 'kids_teens', label: 'Apenas criancas e adolescentes' },
  { value: 'adults', label: 'Apenas adultos' },
  { value: 'family', label: 'Toda a familia' },
];

const AGE_GROUPS: { value: AgeGroup; label: string }[] = [
  { value: '0-2', label: '0-2' },
  { value: '3-5', label: '3-5' },
  { value: '6-10', label: '6-10' },
  { value: '10-12', label: '10-12' },
  { value: '13-17', label: '13-17' },
  { value: '18+', label: '18+' },
];

const MAIN_GOALS = [
  'Rotina',
  'Sono',
  'Alimentacao',
  'Estudos',
  'Comportamento',
  'Saude',
  'Organizacao',
  'Autonomia',
];

const HABIT_TAGS = [
  'Sono',
  'Alimentacao',
  'Leitura',
  'Estudos',
  'Rotina',
  'Organizacao',
  'Tela',
  'Exercicios',
  'Higiene',
  'Responsabilidade',
  'Autonomia',
  'Convivencia',
  'Emocoes',
  'Saude',
  'Criatividade',
  'Natureza',
  'Tecnologia',
];

const REDUCE_TAGS = [
  'Procrastinacao',
  'Sedentarismo',
  'Excesso de telas',
  'Bagunca',
  'Sono irregular',
  'Alimentacao ruim',
  'Gastos por impulso',
  'Estresse',
  'Trabalho excessivo',
  'Falta de tempo em familia',
  'Pouco tempo ao ar livre',
  'Falta de organizacao',
  'Desconexao do trabalho',
  'Isolamento social',
];

const INTEREST_TAGS = [
  'Educacao positiva',
  'Disciplina e limites',
  'Controle de telas',
  'Saude mental',
  'Autismo e TEA',
  'TDAH',
  'Criancas pequenas',
  'Adolescentes',
  'Adultos sem filhos',
  'Vida sem filhos',
  'Rotina a dois',
  'Bem-estar do casal',
  'Vida a dois',
  'Organizacao da casa',
  'Produtividade',
  'Alimentacao saudavel',
  'Atividades ao ar livre',
  'Esportes',
  'Leitura e livros',
  'Tecnologia',
];

const PRODUCT_PREFS = [
  'Livros',
  'Brinquedos',
  'Cursos',
  'Tecnologia',
  'Materiais escolares',
  'Saude',
  'Esportes',
];

const TIME_GOALS = [
  'Mais tempo em familia',
  'Mais tempo a dois',
  'Fim de semana com qualidade',
  'Desligar do trabalho',
  'Tempo para descanso',
  'Tempo para lazer',
  'Menos correria no dia a dia',
];

const SEX_OPTIONS: Array<{ value: NonNullable<UserProfile["sex"]>; label: string }> = [
  { value: "female", label: "Feminino" },
  { value: "male", label: "Masculino" },
  { value: "non_binary", label: "Não-binário" },
  { value: "trans_female", label: "Mulher trans" },
  { value: "trans_male", label: "Homem trans" },
  { value: "intersex", label: "Intersexo" },
  { value: "other", label: "Outro" },
  { value: "prefer_not_to_say", label: "Prefiro não informar" },
];

const getFirstName = (fullName: string) => {
  const token = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return token || "";
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({ onClose, onEditSecondaryProfile }) => {
  const { settings, userProfile, updateUserProfile, setFamilyLocation, children, familyId, deleteChild } = useAppContext();
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const initialCity = userProfile?.city ?? settings.familyLocation;

  const [selectedState, setSelectedState] = useState(initialCity?.uf || '');
  const [selectedCityId, setSelectedCityId] = useState(initialCity?.cityId || '');
  const [fullName, setFullName] = useState(userProfile?.fullName || '');
  const [preferredName, setPreferredName] = useState(userProfile?.preferredName || '');
  const [selectedAvatar, setSelectedAvatar] = useState(userProfile?.avatar || ANIMAL_EMOJIS[0]);
  const [cpf, setCpf] = useState(userProfile?.cpf || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [birthDate, setBirthDate] = useState(userProfile?.birthDate || '');
  const [sex, setSex] = useState<UserProfile["sex"]>(userProfile?.sex || "prefer_not_to_say");
  const [shareForProfessionalLink, setShareForProfessionalLink] = useState(Boolean(userProfile?.shareForProfessionalLink));
  const [sharePersonalBlock, setSharePersonalBlock] = useState(userProfile?.shareBlocks?.personal ?? true);
  const [shareProfileBlock, setShareProfileBlock] = useState(userProfile?.shareBlocks?.profile ?? true);
  const [shareHealthBlock, setShareHealthBlock] = useState(userProfile?.shareBlocks?.health ?? true);
  const [role, setRole] = useState<ProfileRole | ''>(userProfile?.role || '');
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>(userProfile?.ageGroups || []);
  const [mainGoals, setMainGoals] = useState<string[]>(userProfile?.mainGoals || []);
  const [habitsToBuild, setHabitsToBuild] = useState<string[]>(userProfile?.habitsToBuild || []);
  const [habitsToReduce, setHabitsToReduce] = useState<string[]>(userProfile?.habitsToReduce || []);
  const [interests, setInterests] = useState<string[]>(userProfile?.interests || []);
  const [shoppingPreferences, setShoppingPreferences] = useState<string[]>(
    userProfile?.shoppingPreferences || []
  );
  const [timeGoals, setTimeGoals] = useState<string[]>(userProfile?.timeGoals || []);
  const [healthComplaints, setHealthComplaints] = useState<string[]>(userProfile?.healthComplaints || []);
  const [neuroConditions, setNeuroConditions] = useState<string[]>(userProfile?.neuroConditions || []);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getStates().then((data) => {
      setStates(data);
      setIsLoadingStates(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      return;
    }
    setIsLoadingCities(true);
    getCitiesByState(selectedState).then((data) => {
      setCities(data);
      setIsLoadingCities(false);
    });
  }, [selectedState]);

  useEffect(() => {
    if (!userProfile) return;
    if (userProfile.city?.uf) setSelectedState(userProfile.city.uf);
    if (userProfile.city?.cityId) setSelectedCityId(userProfile.city.cityId);
    setFullName(userProfile.fullName || '');
    setPreferredName(userProfile.preferredName || '');
    setSelectedAvatar(userProfile.avatar || ANIMAL_EMOJIS[0]);
    setCpf(userProfile.cpf || '');
    setPhone(userProfile.phone || '');
    setBirthDate(userProfile.birthDate || '');
    setSex(userProfile.sex || "prefer_not_to_say");
    setShareForProfessionalLink(Boolean(userProfile.shareForProfessionalLink));
    setSharePersonalBlock(userProfile.shareBlocks?.personal ?? true);
    setShareProfileBlock(userProfile.shareBlocks?.profile ?? true);
    setShareHealthBlock(userProfile.shareBlocks?.health ?? true);
    setRole(userProfile.role || '');
    setAgeGroups(userProfile.ageGroups || []);
    const legacyGoal = (userProfile as any).mainGoal as string | undefined;
    setMainGoals(userProfile.mainGoals || (legacyGoal ? [legacyGoal] : []));
    setHabitsToBuild(userProfile.habitsToBuild || []);
    setHabitsToReduce(userProfile.habitsToReduce || []);
    setInterests(userProfile.interests || []);
    setShoppingPreferences(userProfile.shoppingPreferences || []);
    setTimeGoals(userProfile.timeGoals || []);
    setHealthComplaints(userProfile.healthComplaints || []);
    setNeuroConditions(userProfile.neuroConditions || []);
  }, [userProfile]);

  const uploadAvatarFile = async (file: File) => {
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const processed = await cropAndCompressAvatar(file, 400, 0.82);
      const id = familyId || 'guest';
      const path = `families/${id}/principal-avatars/${Date.now()}.webp`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, processed, { contentType: 'image/webp' });
      const url = await getDownloadURL(fileRef);
      setSelectedAvatar(url);
    } catch (error) {
      console.error('Falha ao enviar avatar do perfil principal:', error);
      setAvatarError('Nao foi possivel processar a foto. Tente outra imagem.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await uploadAvatarFile(file);
  };

  const toggleValue = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const toggleAgeGroup = (value: AgeGroup) =>
    setAgeGroups((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSave = async () => {
    const trimmedFullName = fullName.trim();
    const cpfDigits = cpf.replace(/\D/g, '');
    if (!trimmedFullName || trimmedFullName.length < 3) {
      setFormError('Informe o nome completo.');
      return;
    }
    if (cpfDigits.length !== 11) {
      setFormError('Informe um CPF válido com 11 dígitos.');
      return;
    }
    const cityObj = cities.find((c) => String(c.id) === selectedCityId);
    if (!selectedState || !cityObj) {
      setFormError('Selecione estado e cidade.');
      return;
    }

    const city: FamilyLocation = {
      uf: selectedState,
      cityId: String(cityObj.id),
      cityName: cityObj.nome,
    };

    const profile: UserProfile = {
      fullName: trimmedFullName,
      preferredName: preferredName.trim() || undefined,
      avatar: selectedAvatar || ANIMAL_EMOJIS[0],
      cpf: formatCpf(cpfDigits),
      cpfDigits,
      phone: formatPhone(phone),
      phoneDigits: phone.replace(/\D/g, ''),
      birthDate: birthDate || undefined,
      sex: sex || undefined,
      shareForProfessionalLink,
      shareBlocks: {
        personal: sharePersonalBlock,
        profile: shareProfileBlock,
        health: shareHealthBlock,
      },
      city,
      role: role || undefined,
      ageGroups,
      mainGoals,
      habitsToBuild,
      habitsToReduce,
      interests,
      shoppingPreferences,
      timeGoals,
      healthComplaints,
      neuroConditions,
      ...deriveSemanticTagsFromProfile({
        healthComplaints,
        neuroConditions,
      }),
      updatedAt: new Date().toISOString(),
    };

    setFormError(null);
    setIsSaving(true);
    try {
      const saveTimeoutMs = 15000;
      await Promise.race([
        updateUserProfile(profile),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout_profile_save")), saveTimeoutMs)
        ),
      ]);
      void setFamilyLocation(city);
      onClose();
    } catch (err) {
      console.error("Falha ao salvar perfil:", err);
      const code = err instanceof Error ? err.message : "";
      if (code === "timeout_profile_save") {
        setFormError("O salvamento demorou demais. Verifique a internet e tente novamente.");
      } else {
        setFormError("Nao foi possivel salvar. Tente novamente.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCityName = useMemo(() => {
    const cityObj = cities.find((c) => String(c.id) === selectedCityId);
    return cityObj?.nome;
  }, [cities, selectedCityId]);

  const principalDisplayName = useMemo(() => {
    const preferred = preferredName.trim();
    if (preferred) return preferred;
    return getFirstName(fullName) || "Perfil principal";
  }, [preferredName, fullName]);

  const additionalProfiles = useMemo(() => {
    return children
      .filter((child) => !String(child.id || '').startsWith('principal-'))
      .map((child) => {
      const missing: string[] = [];
      if (!child.birthDate) missing.push("data de nascimento");
      if (!child.sex) missing.push("sexo");

      return {
        id: child.id,
        name: child.name,
        missing,
        isComplete: missing.length === 0,
      };
    });
  }, [children]);

  const profileRows = useMemo(() => {
    const principalMissing: string[] = [];
    if (!birthDate) principalMissing.push("data de nascimento");
    if (!sex) principalMissing.push("sexo");
    return [
      {
        id: "principal",
        label: "Perfil Principal",
        name: principalDisplayName,
        isComplete: principalMissing.length === 0,
        missing: principalMissing,
      },
      ...additionalProfiles.map((profile) => ({
        id: profile.id,
        label: "Perfil Secundario",
        name: profile.name,
        isComplete: profile.isComplete,
        missing: profile.missing,
      })),
    ];
  }, [additionalProfiles, principalDisplayName, birthDate, sex]);

  const handleDeleteSecondaryProfile = (profileId: string, profileName: string) => {
    if (profileId === "principal") return;
    const confirmDelete = window.confirm(`Excluir o perfil "${profileName}"? Esta ação não pode ser desfeita.`);
    if (!confirmDelete) return;
    deleteChild(profileId);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Perfil do usuario</h2>
            <p className="text-sm text-gray-500 mt-1">Estado e cidade sao obrigatorios. Os demais campos sao opcionais.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">Fechar</button>
        </div>

        <div className="mt-6 space-y-8">
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Identificação</h3>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs text-gray-500 mb-2">Lista de perfis da conta (principal sempre primeiro).</p>
              <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                {profileRows.map((profile) => {
                  const isSecondary = profile.id !== "principal";
                  const canEditSecondary = Boolean(onEditSecondaryProfile && isSecondary);
                  const rowClass = `rounded-lg border bg-white px-3 py-2 flex items-center justify-between gap-2 w-full text-left ${
                    profile.id === "principal" ? "border-purple-200" : "border-gray-200"
                  }`;

                  if (canEditSecondary) {
                    return (
                      <div key={profile.id} className={rowClass}>
                        <button
                          type="button"
                          onClick={() => onEditSecondaryProfile?.(profile.id)}
                          className="flex-1 min-w-0 flex items-center justify-between gap-2 hover:opacity-90 transition text-left"
                        >
                          <div className="min-w-0">
                            <p className={`text-[11px] font-bold uppercase ${profile.id === "principal" ? "text-purple-700" : "text-gray-500"}`}>{profile.label}</p>
                            <p className="text-sm font-semibold text-gray-800 truncate">{profile.name}</p>
                            <p className="text-[11px] text-purple-600 mt-0.5">Toque para editar este perfil</p>
                          </div>
                          <span className={`text-xs font-bold text-right ${profile.isComplete ? "text-green-700" : "text-amber-700"}`}>
                            {profile.isComplete ? "Completo" : "Perfil incompleto"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSecondaryProfile(profile.id, profile.name)}
                          className="ml-2 px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-bold hover:bg-rose-100"
                        >
                          Apagar
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={profile.id} className={rowClass}>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-bold uppercase ${profile.id === "principal" ? "text-purple-700" : "text-gray-500"}`}>{profile.label}</p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{profile.name}</p>
                      </div>
                      <span className={`text-xs font-bold text-right ${profile.isComplete ? "text-green-700" : "text-amber-700"}`}>
                        {profile.isComplete ? "Completo" : "Perfil incompleto"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nome completo *</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">CPF *</label>
                <input
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nome de preferência</label>
                <input
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="Como você gosta de ser chamado(a)"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Telefone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Data de nascimento</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Sexo</label>
                <select
                  value={sex || "prefer_not_to_say"}
                  onChange={(e) => setSex(e.target.value as UserProfile["sex"])}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                >
                  {SEX_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-500 mb-2">Avatar ou foto do perfil principal</label>
              <div className="mb-3 flex items-center gap-3">
                <ChildAvatar
                  avatar={selectedAvatar}
                  alt={`Avatar de ${preferredName || fullName || 'Perfil principal'}`}
                  emojiClassName="text-5xl"
                  imageClassName="w-14 h-14 rounded-full object-cover border border-purple-200"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100"
                    disabled={isUploadingAvatar}
                  >
                    {isUploadingAvatar ? 'Processando...' : 'Tirar foto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100"
                    disabled={isUploadingAvatar}
                  >
                    Galeria
                  </button>
                  {isAvatarImageSource(selectedAvatar) && (
                    <button
                      type="button"
                      onClick={() => setSelectedAvatar(ANIMAL_EMOJIS[0])}
                      className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
                      disabled={isUploadingAvatar}
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </div>
              {avatarError && <p className="mb-2 text-xs text-red-600 font-semibold">{avatarError}</p>}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {ANIMAL_EMOJIS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`text-4xl p-2 rounded-lg transition-transform transform hover:scale-110 ${selectedAvatar === avatar ? 'bg-purple-200 ring-2 ring-purple-500' : 'bg-gray-100'}`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Vinculação com profissionais</h3>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={shareForProfessionalLink}
                onChange={(e) => setShareForProfessionalLink(e.target.checked)}
              />
              Autorizar receber solicitação de vínculo por CPF
            </label>
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-bold text-gray-600">Compartilhamento padrão por bloco</p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={sharePersonalBlock} onChange={(e) => setSharePersonalBlock(e.target.checked)} />
                Bloco 1: Informações pessoais
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={shareProfileBlock} onChange={(e) => setShareProfileBlock(e.target.checked)} />
                Bloco 2: Perfil
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={shareHealthBlock} onChange={(e) => setShareHealthBlock(e.target.checked)} />
                Bloco 3: Saúde
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Localizacao</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Estado (UF) *</label>
                {isLoadingStates ? (
                  <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
                ) : (
                  <select
                    value={selectedState}
                    onChange={(e) => { setSelectedState(e.target.value); setSelectedCityId(''); setFormError(null); }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                  >
                    <option value="">Selecione...</option>
                    {states.map((s) => (
                      <option key={s.id} value={s.sigla}>{s.nome}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Cidade *</label>
                <select
                  value={selectedCityId}
                  onChange={(e) => { setSelectedCityId(e.target.value); setFormError(null); }}
                  disabled={!selectedState || isLoadingCities}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">{isLoadingCities ? 'Carregando...' : 'Selecione...'}</option>
                  {cities.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            {selectedCityName && (
              <p className="text-xs text-gray-500">Cidade selecionada: <span className="font-semibold">{selectedCityName}</span></p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Quem usa o app</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Perfil de uso</label>
                <select
                  value={role}
                  onChange={(e) => { setRole(e.target.value as ProfileRole); setFormError(null); }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                >
                  <option value="">Selecione...</option>
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">Faixa etaria do grupo</label>
                <div className="flex flex-wrap gap-2">
                  {AGE_GROUPS.map((group) => (
                    <button
                      key={group.value}
                      type="button"
                      onClick={() => toggleAgeGroup(group.value)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        ageGroups.includes(group.value) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Objetivos principais</h3>
            <div className="flex flex-wrap gap-2">
              {MAIN_GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => { setMainGoals((prev) => toggleValue(prev, goal)); setFormError(null); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    mainGoals.includes(goal) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Habitos que quer criar</h3>
            <div className="flex flex-wrap gap-2">
              {HABIT_TAGS.map((tag) => (
                <button
                  key={`build-${tag}`}
                  type="button"
                  onClick={() => setHabitsToBuild((prev) => toggleValue(prev, tag))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    habitsToBuild.includes(tag) ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Habitos que quer reduzir</h3>
            <div className="flex flex-wrap gap-2">
              {REDUCE_TAGS.map((tag) => (
                <button
                  key={`reduce-${tag}`}
                  type="button"
                  onClick={() => setHabitsToReduce((prev) => toggleValue(prev, tag))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    habitsToReduce.includes(tag) ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Interesses</h3>
            <div className="flex flex-wrap gap-2">
              {INTEREST_TAGS.map((tag) => (
                <button
                  key={`interest-${tag}`}
                  type="button"
                  onClick={() => setInterests((prev) => toggleValue(prev, tag))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    interests.includes(tag) ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Preferencia de produtos</h3>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_PREFS.map((tag) => (
                <button
                  key={`shop-${tag}`}
                  type="button"
                  onClick={() => setShoppingPreferences((prev) => toggleValue(prev, tag))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    shoppingPreferences.includes(tag) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Tempo e qualidade de vida</h3>
            <div className="flex flex-wrap gap-2">
              {TIME_GOALS.map((tag) => (
                <button
                  key={`time-${tag}`}
                  type="button"
                  onClick={() => setTimeGoals((prev) => toggleValue(prev, tag))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    timeGoals.includes(tag) ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Queixas de saúde atuais</h3>
            <p className="text-xs text-gray-500">Selecione uma ou mais opções.</p>
            <div className="flex flex-wrap gap-2">
              {HEALTH_COMPLAINT_OPTIONS.map((item) => (
                <button
                  key={`complaint-${item}`}
                  type="button"
                  onClick={() => setHealthComplaints((prev) => toggleValue(prev, item))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    healthComplaints.includes(item) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Condições neurodivergentes, síndromes e crônicas</h3>
            <p className="text-xs text-gray-500">Selecione as opções que se aplicam.</p>
            <div className="flex flex-wrap gap-2">
              {NEURO_CONDITION_OPTIONS.map((item) => (
                <button
                  key={`condition-${item}`}
                  type="button"
                  onClick={() => setNeuroConditions((prev) => toggleValue(prev, item))}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    neuroConditions.includes(item) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        </div>

        {formError && <p className="text-sm font-semibold text-red-600 mt-4">{formError}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isUploadingAvatar}
            className="flex-1 px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? "Salvando..." : "Salvar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;

