import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { getStates, getCitiesByState, type UF, type Municipio } from '../services/ibgeService';
import { AgeGroup, FamilyLocation, ProfileRole, UserProfile } from '../types';
import {
  HEALTH_COMPLAINT_OPTIONS,
  NEURO_CONDITION_OPTIONS,
  deriveSemanticTagsFromProfile,
} from '../utils/profileSemantic';

interface UserProfileModalProps {
  onClose: () => void;
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

const UserProfileModal: React.FC<UserProfileModalProps> = ({ onClose }) => {
  const { settings, userProfile, updateUserProfile, setFamilyLocation } = useAppContext();
  const [states, setStates] = useState<UF[]>([]);
  const [cities, setCities] = useState<Municipio[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initialCity = userProfile?.city ?? settings.familyLocation;

  const [selectedState, setSelectedState] = useState(initialCity?.uf || '');
  const [selectedCityId, setSelectedCityId] = useState(initialCity?.cityId || '');
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

  const toggleValue = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const toggleAgeGroup = (value: AgeGroup) =>
    setAgeGroups((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));

  const handleSave = async () => {
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
      await updateUserProfile(profile);
      setFamilyLocation(city);
      onClose();
    } catch (err) {
      console.error("Falha ao salvar perfil:", err);
      setFormError("Nao foi possivel salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCityName = useMemo(() => {
    const cityObj = cities.find((c) => String(c.id) === selectedCityId);
    return cityObj?.nome;
  }, [cities, selectedCityId]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Perfil do usuario</h2>
            <p className="text-sm text-gray-500 mt-1">Preencha para personalizar habitos, conteudos e anuncios.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">Fechar</button>
        </div>

        <div className="mt-6 space-y-8">
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase">Localizacao</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Estado (UF)</label>
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
                <label className="block text-xs font-bold text-gray-500 mb-1">Cidade</label>
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
            disabled={isSaving}
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

