import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { IconName, RewardType, Habit, ScheduleType, HabitSchedule, HabitScheduleMode, HabitFlexPeriod } from '../types';
import { StarIcon } from './icons/HabitIcons';
import ChildAvatar from './ChildAvatar';
import { ROUTINE_LIBRARY_AREAS } from '../data/routineLibraryData';

interface AddHabitModalProps {
  onClose: () => void;
  selectedChildId: string | null;
  viewedDate: string;
  importedTemplateIds: string[];
  onHabitAdded: (childIds: string[]) => void;
  onHabitExists: () => void;
  onNoChildSelected: () => void;
  onImportNow?: () => void;
}

const AddHabitModal: React.FC<AddHabitModalProps> = ({
  onClose,
  selectedChildId,
  viewedDate,
  importedTemplateIds,
  onHabitAdded,
  onHabitExists,
  onNoChildSelected,
  onImportNow,
}) => {
  const { children, addHabitToMultipleChildren, routineTemplates, settings } = useAppContext();
  const familyLocation = settings.familyLocation;
  const activeTemplates = routineTemplates.filter((template) => {
    if (template.isActive === false) return false;
    if (!template.uf && !template.cityId) return true;
    if (!familyLocation) return false;
    if (template.uf && template.uf !== familyLocation.uf) return false;
    if (template.cityId && template.cityId !== familyLocation.cityId) return false;
    return true;
  });
  const importedTemplateSet = new Set(importedTemplateIds);
  const importedTemplates = activeTemplates.filter((template) => importedTemplateSet.has(template.id));
  const [selectedTemplateArea, setSelectedTemplateArea] = useState<string>("all");
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<IconName>('Sparkles');
  const [selectedEmoji, setSelectedEmoji] = useState('✨');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'recurring' | 'once'>('recurring');
  const [eventDate, setEventDate] = useState(viewedDate);
  const [startDate, setStartDate] = useState(viewedDate);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('DAILY');
  const [scheduleExecutionMode, setScheduleExecutionMode] = useState<HabitScheduleMode>('flex');
  const [rigidTime, setRigidTime] = useState('07:30');
  const [flexPeriod, setFlexPeriod] = useState<HabitFlexPeriod>('morning');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(new Date(viewedDate + 'T00:00:00').getDate());

  const [rewardType, setRewardType] = useState<RewardType>(RewardType.STARS);
  const [starValue, setStarValue] = useState(1);
  const [activityName, setActivityName] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const EMOJI_ICON_OPTIONS: Array<{ emoji: string; icon: IconName }> = [
    { emoji: '✨', icon: 'Sparkles' },
    { emoji: '📘', icon: 'Book' },
    { emoji: '🪥', icon: 'Toothbrush' },
    { emoji: '🛌', icon: 'Bed' },
    { emoji: '🧹', icon: 'Broom' },
    { emoji: '🎒', icon: 'Backpack' },
    { emoji: '🍎', icon: 'Apple' },
    { emoji: '🎨', icon: 'Paintbrush' },
    { emoji: '⚽', icon: 'Soccer' },
    { emoji: '🐶', icon: 'Dog' },
    { emoji: '🐱', icon: 'Cat' },
    { emoji: '❤️', icon: 'Heart' },
    { emoji: '🎮', icon: 'GameController' },
    { emoji: '🎁', icon: 'Gift' },
    { emoji: '🏆', icon: 'Trophy' },
    { emoji: '📺', icon: 'Tv' },
    { emoji: '⭐', icon: 'Star' },
  ];

  const inferIconAndEmojiFromName = (rawName: string) => {
    const n = rawName.toLowerCase();
    if (n.includes('dente') || n.includes('escovar')) return { icon: 'Toothbrush' as IconName, emoji: '🪥' };
    if (n.includes('sono') || n.includes('dorm')) return { icon: 'Bed' as IconName, emoji: '🛌' };
    if (n.includes('estud') || n.includes('leitura') || n.includes('livro')) return { icon: 'Book' as IconName, emoji: '📘' };
    if (n.includes('comer') || n.includes('aliment') || n.includes('fruta') || n.includes('agua')) return { icon: 'Apple' as IconName, emoji: '🍎' };
    if (n.includes('arrumar') || n.includes('limp')) return { icon: 'Broom' as IconName, emoji: '🧹' };
    if (n.includes('jogo') || n.includes('game')) return { icon: 'GameController' as IconName, emoji: '🎮' };
    if (n.includes('tv') || n.includes('vídeo') || n.includes('video')) return { icon: 'Tv' as IconName, emoji: '📺' };
    if (n.includes('pet') || n.includes('cachorro')) return { icon: 'Dog' as IconName, emoji: '🐶' };
    if (n.includes('gato')) return { icon: 'Cat' as IconName, emoji: '🐱' };
    if (n.includes('esporte') || n.includes('fut')) return { icon: 'Soccer' as IconName, emoji: '⚽' };
    return { icon: 'Sparkles' as IconName, emoji: '✨' };
  };

  useEffect(() => {
    if (selectedChildId) {
      setSelectedChildIds([selectedChildId]);
    } else {
      setSelectedChildIds([]);
    }
  }, [selectedChildId]);

  const templateAreas = React.useMemo(() => {
    const byKey = new Map<string, string>();
    ROUTINE_LIBRARY_AREAS.forEach((area) => {
      byKey.set(area.key, area.label);
    });
    importedTemplates.forEach((template) => {
      const key = String(template.areaKey || "").trim();
      const label = String(template.areaLabel || "").trim();
      if (!key || !label || byKey.has(key)) return;
      byKey.set(key, label);
    });
    return [{ key: "all", label: "Todas áreas" }, ...Array.from(byKey.entries()).map(([key, label]) => ({ key, label }))];
  }, [importedTemplates]);

  useEffect(() => {
    if (templateAreas.some((area) => area.key === selectedTemplateArea)) return;
    setSelectedTemplateArea("all");
  }, [templateAreas, selectedTemplateArea]);

  const templatesForSelectedArea = React.useMemo(() => {
    if (selectedTemplateArea === "all") return importedTemplates;
    return importedTemplates.filter((template) => String(template.areaKey || "").trim() === selectedTemplateArea);
  }, [importedTemplates, selectedTemplateArea]);

  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
    if (formError) setFormError(null);
  };

  const daysOfWeek = [
    { label: 'D', value: 0 },
    { label: 'S', value: 1 },
    { label: 'T', value: 2 },
    { label: 'Q', value: 3 },
    { label: 'Q', value: 4 },
    { label: 'S', value: 5 },
    { label: 'S', value: 6 },
  ];

  const toggleWeeklyDay = (dayValue: number) => {
    setWeeklyDays((prev) => (prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue]));
  };

  const handleChildSelection = (childId: string) => {
    setSelectedChildIds((prev) => (prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]));
  };

  const handleSelectAllChildren = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedChildIds(children.map((c) => c.id));
    else setSelectedChildIds([]);
  };

  const saveHabit = () => {
    try {
      const trimmedName = name.trim();
      const trimmedActivity = activityName.trim();

      if (selectedChildIds.length === 0) {
        onNoChildSelected();
        setFormError('Selecione pelo menos uma pessoa.');
        return;
      }

      if (selectedTemplateIds.length > 0) {
        let addedCount = 0;
        const addedChildren = new Set<string>();

        selectedTemplateIds.forEach((templateId) => {
          const template = routineTemplates.find((t) => t.id === templateId);
          if (!template) return;

          const templateHabitData: Omit<Habit, 'id' | 'completions'> = {
            name: template.name.trim(),
            icon: 'Sparkles',
            imageUrl: template.imageUrl,
            semanticTags: template.semanticTags,
            sponsorNote: template.sponsorNote,
            leftSwipeActionType: template.leftSwipeActionType,
            leftSwipeActionLabel: template.leftSwipeActionLabel,
            leftSwipeActionUrl: template.leftSwipeActionUrl,
            leftSwipeActionWhatsapp: template.leftSwipeActionWhatsapp,
            source: 'template',
            schedule: template.schedule || { type: 'DAILY', mode: 'flex', period: 'morning', reminderEnabled: false },
            startDate: viewedDate,
            reward: { type: RewardType.STARS, value: 1 },
          };

          const addedToIds = addHabitToMultipleChildren(selectedChildIds, templateHabitData);
          if (addedToIds.length > 0) {
            addedCount += addedToIds.length;
            addedToIds.forEach((id) => addedChildren.add(id));
          }
        });

        if (addedCount > 0) onHabitAdded(Array.from(addedChildren));
        else onHabitExists();
        setFormError(null);
        onClose();
        return;
      }

      if (!trimmedName) {
        setFormError('Informe o nome da rotina/tarefa/evento.');
        return;
      }

      if (rewardType === RewardType.ACTIVITY && !trimmedActivity) {
        setFormError('Informe o nome da atividade.');
        return;
      }

      let schedule: HabitSchedule;
      let habitStartDate: string | undefined = undefined;

      if (scheduleMode === 'once') {
        schedule = { type: 'ONCE', date: eventDate };
      } else {
        habitStartDate = startDate;
        if (scheduleType === 'WEEKLY') {
          if (weeklyDays.length === 0) {
            setFormError('Selecione pelo menos um dia para a repeticao semanal.');
            return;
          }
          schedule = { type: 'WEEKLY', days: weeklyDays };
        } else if (scheduleType === 'MONTHLY') {
          schedule = { type: 'MONTHLY', dayOfMonth: dayOfMonth };
        } else {
          schedule = { type: 'DAILY' };
        }
      }

      if (scheduleExecutionMode === 'rigid') {
        if (!rigidTime || !/^\d{2}:\d{2}$/.test(rigidTime)) {
          setFormError('Informe um horário válido para rotina rígida.');
          return;
        }
        schedule = {
          ...schedule,
          mode: 'rigid',
          time: rigidTime,
          reminderEnabled,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        };
      } else {
        schedule = {
          ...schedule,
          mode: 'flex',
          period: flexPeriod,
          reminderEnabled: false,
          time: undefined,
        };
      }

      const habitData: Omit<Habit, 'id' | 'completions'> = {
        name: trimmedName,
        icon: selectedIcon,
        source: 'manual',
        schedule,
        startDate: habitStartDate,
        reward:
          rewardType === RewardType.STARS
            ? { type: RewardType.STARS, value: starValue }
            : { type: RewardType.ACTIVITY, value: 5, activityName: trimmedActivity },
      };

      const addedToIds = addHabitToMultipleChildren(selectedChildIds, habitData);
      if (addedToIds.length > 0) onHabitAdded(addedToIds);
      else if (selectedChildIds.length > 0) onHabitExists();
      setFormError(null);
      onClose();
    } catch (error) {
      console.error('Error saving habit:', error);
      setFormError('Nao foi possivel salvar o habito.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveHabit();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg m-4" style={{ maxHeight: '95vh', overflowY: 'auto' }}>
        <h2 className="text-xl font-bold mb-4">Adicionar</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-gray-800 font-semibold">Rotinas importadas</label>
              {importedTemplates.length === 0 && (
                <button
                  type="button"
                  onClick={onImportNow}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-600 text-white hover:bg-purple-700"
                >
                  Importe agora
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 mb-2">Escolha uma categoria e selecione rotinas já importadas.</p>
            <div className="mb-2">
              <select
                value={selectedTemplateArea}
                onChange={(e) => setSelectedTemplateArea(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white text-sm"
              >
                {templateAreas.map((area) => (
                  <option key={`template-area-${area.key}`} value={area.key}>
                    {area.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-44 overflow-y-auto border border-indigo-200 rounded-lg p-2 space-y-2 bg-white">
              {importedTemplates.length === 0 ? (
                <p className="text-sm text-indigo-700 p-2 font-medium">Você não possui rotinas copiadas da biblioteca ainda.</p>
              ) : (
                templatesForSelectedArea.map((template) => (
                  <label key={template.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg cursor-pointer gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg border bg-white overflow-hidden flex items-center justify-center shrink-0">
                        {template.imageUrl ? (
                          <img src={template.imageUrl} alt={template.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-gray-400">Sem</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block">{template.name}</span>
                        <span className="text-[10px] text-gray-500">
                          {template.areaLabel || "Sem área"} • {template.libraryType === "sponsored" ? "Patrocinada" : "Global"}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      checked={selectedTemplateIds.includes(template.id)}
                      onChange={() => toggleTemplateSelection(template.id)}
                    />
                  </label>
                ))
              )}
              {importedTemplates.length > 0 && templatesForSelectedArea.length === 0 && (
                <p className="text-sm text-gray-500 p-2">Nenhuma rotina importada para esta área.</p>
              )}
            </div>
          </div>
          <hr />
          <div>
            <label htmlFor="habit-name" className="block text-gray-700 font-semibold mb-2">Rotina personalizada</label>
            <div className="relative flex items-center gap-2">
              <input
                id="habit-name"
                type="text"
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  const inferred = inferIconAndEmojiFromName(next);
                  setSelectedIcon(inferred.icon);
                  setSelectedEmoji(inferred.emoji);
                  if (formError) setFormError(null);
                }}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Ex: Consulta no dentista"
              />
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="h-10 w-10 shrink-0 rounded-lg border border-purple-200 bg-purple-50 text-xl"
                title="Escolher emoji"
              >
                {selectedEmoji}
              </button>
              {showEmojiPicker && (
                <div className="absolute right-0 top-11 z-20 w-60 rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                  <div className="grid grid-cols-6 gap-1">
                    {EMOJI_ICON_OPTIONS.map((item) => (
                      <button
                        key={`${item.emoji}-${item.icon}`}
                        type="button"
                        onClick={() => {
                          setSelectedEmoji(item.emoji);
                          setSelectedIcon(item.icon);
                          setShowEmojiPicker(false);
                        }}
                        className="h-8 w-8 rounded-md hover:bg-gray-100 text-lg"
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Quando acontece?</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setScheduleMode('once'); if (formError) setFormError(null); }} className={`p-3 rounded-lg border-2 font-semibold ${scheduleMode === 'once' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'}`}>So neste dia</button>
              <button type="button" onClick={() => { setScheduleMode('recurring'); if (formError) setFormError(null); }} className={`p-3 rounded-lg border-2 font-semibold ${scheduleMode === 'recurring' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'}`}>Repetir</button>
            </div>

            {scheduleMode === 'once' && (
              <div className="mt-4">
                <label htmlFor="event-date" className="block text-sm font-semibold text-gray-600 mb-1">Data do evento</label>
                <input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            )}

            {scheduleMode === 'recurring' && (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="start-date" className="block text-sm font-semibold text-gray-600 mb-1">Comecar em</label>
                  <input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">Frequencia</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setScheduleType('DAILY')} className={`p-2 rounded-lg border text-sm font-semibold ${scheduleType === 'DAILY' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'bg-gray-100'}`}>Diário</button>
                    <button type="button" onClick={() => setScheduleType('WEEKLY')} className={`p-2 rounded-lg border text-sm font-semibold ${scheduleType === 'WEEKLY' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'bg-gray-100'}`}>Semanal</button>
                    <button type="button" onClick={() => setScheduleType('MONTHLY')} className={`p-2 rounded-lg border text-sm font-semibold ${scheduleType === 'MONTHLY' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'bg-gray-100'}`}>Mensal</button>
                  </div>
                </div>
                {scheduleType === 'WEEKLY' && (
                  <div className="mt-4 flex justify-around p-2 bg-gray-50 rounded-lg">
                    {daysOfWeek.map((day) => (
                      <button key={day.value} type="button" onClick={() => toggleWeeklyDay(day.value)} className={`w-10 h-10 rounded-full font-bold transition-colors ${weeklyDays.includes(day.value) ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{day.label}</button>
                    ))}
                  </div>
                )}
                {scheduleType === 'MONTHLY' && (
                  <div className="mt-4">
                    <label htmlFor="day-of-month" className="block text-sm font-semibold text-gray-600 mb-1">Dia do mes</label>
                    <input id="day-of-month" type="number" value={dayOfMonth} onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))} className="w-full px-4 py-2 border rounded-lg" min="1" max="31" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Tipo da rotina</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setScheduleExecutionMode('rigid'); if (formError) setFormError(null); }}
                className={`p-3 rounded-lg border-2 font-semibold ${scheduleExecutionMode === 'rigid' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'}`}
              >
                Rígida (horário)
              </button>
              <button
                type="button"
                onClick={() => { setScheduleExecutionMode('flex'); if (formError) setFormError(null); }}
                className={`p-3 rounded-lg border-2 font-semibold ${scheduleExecutionMode === 'flex' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'}`}
              >
                Flexível (período)
              </button>
            </div>

            {scheduleExecutionMode === 'rigid' ? (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">Horário</label>
                  <input
                    type="time"
                    value={rigidTime}
                    onChange={(e) => setRigidTime(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Ativar lembrete no horário
                </label>
              </div>
            ) : (
              <div className="mt-3">
                <label className="block text-sm font-semibold text-gray-600 mb-1">Período</label>
                <select
                  value={flexPeriod}
                  onChange={(e) => setFlexPeriod(e.target.value as HabitFlexPeriod)}
                  className="w-full px-4 py-2 border rounded-lg bg-white"
                >
                  <option value="morning">Manhã</option>
                  <option value="afternoon">Tarde</option>
                  <option value="night">Noite</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Recompensa</label>
            <div className="flex gap-4">
              <button type="button" onClick={() => setRewardType(RewardType.STARS)} className={`flex-1 p-2 rounded-lg border text-sm font-semibold ${rewardType === RewardType.STARS ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : ''}`}>Estrelas</button>
              <button type="button" onClick={() => setRewardType(RewardType.ACTIVITY)} className={`flex-1 p-2 rounded-lg border text-sm font-semibold ${rewardType === RewardType.ACTIVITY ? 'border-purple-500 bg-purple-50 text-purple-700' : ''}`}>Atividade</button>
            </div>
          </div>
          {rewardType === RewardType.STARS && (
            <div>
              <label htmlFor="star-value" className="block text-gray-700 font-semibold mb-2">Valor em estrelas</label>
              <div className="flex items-center gap-2">
                <input id="star-value" type="number" value={starValue} onChange={(e) => setStarValue(Math.max(1, parseInt(e.target.value, 10)))} className="w-24 px-4 py-2 border rounded-lg" min="1" />
                <StarIcon className="w-6 h-6 text-yellow-500" />
              </div>
            </div>
          )}
          {rewardType === RewardType.ACTIVITY && (
            <div>
              <label htmlFor="activity-name" className="block text-gray-700 font-semibold mb-2">Nome da atividade</label>
              <input id="activity-name" type="text" value={activityName} onChange={(e) => { setActivityName(e.target.value); if (formError) setFormError(null); }} className="w-full px-4 py-2 border rounded-lg" placeholder="Ex: Passeio no parque" />
            </div>
          )}
          <hr />
          {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Atribuir para</label>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                <label htmlFor="select-all" className="font-medium">Selecionar todos</label>
                <input type="checkbox" id="select-all" className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500" onChange={handleSelectAllChildren} checked={children.length > 0 && selectedChildIds.length === children.length} />
              </div>
              {children.map((child) => (
                <div key={child.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                  <label htmlFor={`child-${child.id}`} className="flex items-center gap-3">
                    <ChildAvatar
                      avatar={child.avatar}
                      alt={child.name}
                      emojiClassName="text-2xl"
                      imageClassName="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                    <span>{child.name}</span>
                  </label>
                  <input type="checkbox" id={`child-${child.id}`} className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500" checked={selectedChildIds.includes(child.id)} onChange={() => handleChildSelection(child.id)} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancelar</button>
            <button type="button" onClick={saveHabit} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddHabitModal;
