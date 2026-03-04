
import React, { useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ANIMAL_EMOJIS } from '../constants';
import { Child } from '../types';
import { getTodayDateString } from '../utils/dateUtils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../src/lib/firebase';
import { cropAndCompressAvatar, isAvatarImageSource } from '../utils/avatarUtils';
import ChildAvatar from './ChildAvatar';
import {
  HEALTH_COMPLAINT_OPTIONS,
  NEURO_CONDITION_OPTIONS,
  deriveSemanticTagsFromProfile,
} from '../utils/profileSemantic';

interface EditChildModalProps {
  child: Child;
  onClose: () => void;
}

const MAX_CHILD_NAME_LENGTH = 12;
const SEX_OPTIONS: Array<{ value: NonNullable<import('../types').Child["sex"]>; label: string }> = [
  { value: "female", label: "Feminino" },
  { value: "male", label: "Masculino" },
  { value: "non_binary", label: "Não-binário" },
  { value: "trans_female", label: "Mulher trans" },
  { value: "trans_male", label: "Homem trans" },
  { value: "intersex", label: "Intersexo" },
  { value: "other", label: "Outro" },
  { value: "prefer_not_to_say", label: "Prefiro não informar" },
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

const EditChildModal: React.FC<EditChildModalProps> = ({ child, onClose }) => {
  const { updateChild, deleteChild, resetChildStars, familyId } = useAppContext();
  const [fullName, setFullName] = useState(child.fullName || child.name);
  const [preferredName, setPreferredName] = useState(child.preferredName || '');
  const [phone, setPhone] = useState(child.phone || '');
  const [selectedAvatar, setSelectedAvatar] = useState(child.avatar);
  const [birthDate, setBirthDate] = useState(child.birthDate || '');
  const [sex, setSex] = useState<import('../types').Child["sex"]>(child.sex || "prefer_not_to_say");
  const [showAgeInfo, setShowAgeInfo] = useState(child.showAgeInfo ?? true);
  const [shareForProfessionalLink, setShareForProfessionalLink] = useState(child.shareForProfessionalLink ?? true);
  const [sharePersonalBlock, setSharePersonalBlock] = useState(child.shareBlocks?.personal ?? true);
  const [shareProfileBlock, setShareProfileBlock] = useState(child.shareBlocks?.profile ?? true);
  const [shareHealthBlock, setShareHealthBlock] = useState(child.shareBlocks?.health ?? true);
  const [mainGoals, setMainGoals] = useState<string[]>(child.mainGoals || []);
  const [habitsToBuild, setHabitsToBuild] = useState<string[]>(child.habitsToBuild || []);
  const [habitsToReduce, setHabitsToReduce] = useState<string[]>(child.habitsToReduce || []);
  const [interests, setInterests] = useState<string[]>(child.interests || []);
  const [shoppingPreferences, setShoppingPreferences] = useState<string[]>(child.shoppingPreferences || []);
  const [timeGoals, setTimeGoals] = useState<string[]>(child.timeGoals || []);
  const [healthComplaints, setHealthComplaints] = useState<string[]>(child.healthComplaints || []);
  const [neuroConditions, setNeuroConditions] = useState<string[]>(child.neuroConditions || []);
  const [formError, setFormError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const uploadAvatarFile = async (file: File) => {
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const processed = await cropAndCompressAvatar(file, 400, 0.82);
      const id = child.id || crypto.randomUUID();
      const path = `families/${familyId || 'guest'}/children-avatars/${id}-${Date.now()}.webp`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, processed, { contentType: 'image/webp' });
      const url = await getDownloadURL(fileRef);
      setSelectedAvatar(url);
    } catch (error) {
      console.error('Falha ao atualizar avatar da pessoa:', error);
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

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const full = fullName.trim();
    if (!full || full.length < 3) {
      setFormError('Informe o nome completo.');
      return;
    }
    const displayNameRaw = preferredName.trim() || full.split(/\s+/)[0] || full;
    const displayName = displayNameRaw.slice(0, MAX_CHILD_NAME_LENGTH);
    if (!selectedAvatar || isUploadingAvatar) return;

    const semantic = deriveSemanticTagsFromProfile({ healthComplaints, neuroConditions });
    updateChild(child.id, displayName, selectedAvatar, birthDate, showAgeInfo, sex, {
      fullName: full,
      preferredName: preferredName.trim() || undefined,
      phone: formatPhone(phone),
      phoneDigits: phone.replace(/\D/g, ''),
      shareForProfessionalLink,
      shareBlocks: {
        personal: sharePersonalBlock,
        profile: shareProfileBlock,
        health: shareHealthBlock,
      },
      mainGoals,
      habitsToBuild,
      habitsToReduce,
      interests,
      shoppingPreferences,
      timeGoals,
      healthComplaints,
      neuroConditions,
      ...semantic,
    });
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Tem certeza que deseja excluir ${child.name}? Esta acao nao pode ser desfeita.`)) {
        deleteChild(child.id);
        onClose();
    }
  };

  const handleResetStars = () => {
    if (window.confirm(`Zerar a pontuacao de ${child.name}? Esta acao nao pode ser desfeita.`)) {
        resetChildStars(child.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-2xl m-0 sm:m-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Editar Pessoa</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="child-full-name" className="block text-gray-700 font-semibold mb-2">Nome completo *</label>
              <input
                id="child-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            <div>
              <label htmlFor="child-preferred-name" className="block text-gray-700 font-semibold mb-2">Nome de preferencia</label>
              <input
                id="child-preferred-name"
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label htmlFor="child-phone" className="block text-gray-700 font-semibold mb-2">Telefone</label>
              <input
                id="child-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="birth-date" className="block text-gray-700 font-semibold mb-2">Data de Nascimento</label>
            <input
              id="birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              max={getTodayDateString()}
            />
          </div>
          <div>
            <label htmlFor="child-sex" className="block text-gray-700 font-semibold mb-2">Sexo</label>
            <select
              id="child-sex"
              value={sex || "prefer_not_to_say"}
              onChange={(e) => setSex(e.target.value as import('../types').Child["sex"])}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            >
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Vinculacao com profissionais</p>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={shareForProfessionalLink} onChange={(e) => setShareForProfessionalLink(e.target.checked)} />
              Autorizar receber solicitacao de vinculo por CPF
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sharePersonalBlock} onChange={(e) => setSharePersonalBlock(e.target.checked)} />
              Bloco 1: Informacoes pessoais
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={shareProfileBlock} onChange={(e) => setShareProfileBlock(e.target.checked)} />
              Bloco 2: Perfil
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={shareHealthBlock} onChange={(e) => setShareHealthBlock(e.target.checked)} />
              Bloco 3: Saude
            </label>
          </div>
          
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
             <label htmlFor="show-age-toggle" className="text-gray-700 font-semibold">Mostrar idade e aniversário</label>
             <label htmlFor="show-age-toggle" className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={showAgeInfo} onChange={(e) => setShowAgeInfo(e.target.checked)} id="show-age-toggle" className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-purple-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Escolha um Avatar</label>
            <div className="mb-3 flex items-center gap-3">
              <ChildAvatar
                avatar={selectedAvatar}
                alt={`Avatar de ${preferredName || fullName || child.name}`}
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
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Objetivos principais</h3>
            <div className="flex flex-wrap gap-2">
              {MAIN_GOALS.map((goal) => (
                <button key={goal} type="button" onClick={() => setMainGoals((prev) => toggleValue(prev, goal))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${mainGoals.includes(goal) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {goal}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Habitos que quer criar</h3>
            <div className="flex flex-wrap gap-2">
              {HABIT_TAGS.map((tag) => (
                <button key={`build-${tag}`} type="button" onClick={() => setHabitsToBuild((prev) => toggleValue(prev, tag))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${habitsToBuild.includes(tag) ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Habitos que quer reduzir</h3>
            <div className="flex flex-wrap gap-2">
              {REDUCE_TAGS.map((tag) => (
                <button key={`reduce-${tag}`} type="button" onClick={() => setHabitsToReduce((prev) => toggleValue(prev, tag))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${habitsToReduce.includes(tag) ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Interesses</h3>
            <div className="flex flex-wrap gap-2">
              {INTEREST_TAGS.map((tag) => (
                <button key={`interest-${tag}`} type="button" onClick={() => setInterests((prev) => toggleValue(prev, tag))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${interests.includes(tag) ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Preferencia de produtos</h3>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_PREFS.map((tag) => (
                <button key={`shop-${tag}`} type="button" onClick={() => setShoppingPreferences((prev) => toggleValue(prev, tag))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${shoppingPreferences.includes(tag) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Tempo e qualidade de vida</h3>
            <div className="flex flex-wrap gap-2">
              {TIME_GOALS.map((tag) => (
                <button key={`time-${tag}`} type="button" onClick={() => setTimeGoals((prev) => toggleValue(prev, tag))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${timeGoals.includes(tag) ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Queixas de saude atuais</h3>
            <div className="flex flex-wrap gap-2">
              {HEALTH_COMPLAINT_OPTIONS.map((item) => (
                <button key={`complaint-${item}`} type="button" onClick={() => setHealthComplaints((prev) => toggleValue(prev, item))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${healthComplaints.includes(item) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {item}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase">Condições neurodivergentes, sindromes e cronicas</h3>
            <div className="flex flex-wrap gap-2">
              {NEURO_CONDITION_OPTIONS.map((item) => (
                <button key={`condition-${item}`} type="button" onClick={() => setNeuroConditions((prev) => toggleValue(prev, item))} className={`px-3 py-1 rounded-full text-xs font-semibold border ${neuroConditions.includes(item) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {item}
                </button>
              ))}
            </div>
          </section>
          {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}
          <div className="flex flex-col gap-2 pt-3">
            <div className="flex flex-wrap items-center gap-3">
               <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                  Excluir Pessoa
               </button>
               <button type="button" onClick={handleResetStars} className="px-4 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200">
                  Zerar pontuacao
               </button>
            </div>
            <div className="flex justify-end gap-3">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Cancelar
                </button>
                <button type="submit" disabled={isUploadingAvatar} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60">
                Salvar Alteracoes
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditChildModal;





