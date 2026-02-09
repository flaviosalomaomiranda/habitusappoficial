import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { HABIT_CATEGORIES, HABIT_ICONS } from '../constants';
import { HabitCategory, IconName, RewardType, Habit, ScheduleType, HabitSchedule } from '../types';
import { StarIcon } from './icons/HabitIcons';

interface AddHabitModalProps {
  onClose: () => void;
  selectedChildId: string | null;
  viewedDate: string;
  onHabitAdded: (childIds: string[]) => void;
  onHabitExists: () => void;
  onNoChildSelected: () => void;
}

const AddHabitModal: React.FC<AddHabitModalProps> = ({
  onClose,
  selectedChildId,
  viewedDate,
  onHabitAdded,
  onHabitExists,
  onNoChildSelected,
}) => {
  const { children, addHabitToMultipleChildren, routineTemplates } = useAppContext();
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<IconName>('Book');
  const [scheduleMode, setScheduleMode] = useState<'recurring' | 'once'>('recurring');
  const [eventDate, setEventDate] = useState(viewedDate);
  const [startDate, setStartDate] = useState(viewedDate);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('DAILY');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(new Date(viewedDate + 'T00:00:00').getDate());

  const [rewardType, setRewardType] = useState<RewardType>(RewardType.STARS);
  const [starValue, setStarValue] = useState(1);
  const [activityName, setActivityName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [category, setCategory] = useState<HabitCategory | ''>('');

  useEffect(() => {
    if (selectedChildId) {
      setSelectedChildIds([selectedChildId]);
    } else {
      setSelectedChildIds([]);
    }
  }, [selectedChildId]);

  useEffect(() => {
    if (selectedTemplateId === 'custom') {
      setName('');
      setSelectedIcon('Book');
      setRewardType(RewardType.STARS);
      setStarValue(1);
      setActivityName('');
      setScheduleMode('recurring');
      setScheduleType('DAILY');
      setWeeklyDays([]);
      setDayOfMonth(new Date(viewedDate + 'T00:00:00').getDate());
      setEventDate(viewedDate);
      setStartDate(viewedDate);
      setCategory('');
      return;
    }

    const template = routineTemplates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    setName(template.name);
    setSelectedIcon(template.icon);
    setRewardType(template.reward.type);
    if (template.reward.type === RewardType.STARS) {
      setStarValue(template.reward.value);
      setActivityName('');
    } else {
      setActivityName(template.reward.activityName || '');
      setStarValue(1);
    }

    if (template.schedule) {
      setScheduleMode(template.schedule.type === 'ONCE' ? 'once' : 'recurring');
      setScheduleType(template.schedule.type === 'ONCE' ? 'DAILY' : template.schedule.type);
      setWeeklyDays(template.schedule.days || []);
      setDayOfMonth(template.schedule.dayOfMonth || new Date(viewedDate + 'T00:00:00').getDate());
      setEventDate(template.schedule.date || viewedDate);
    }
    setCategory('');
  }, [selectedTemplateId, routineTemplates, viewedDate]);

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

      if (!trimmedName || selectedChildIds.length === 0) {
        onNoChildSelected();
        setFormError('Selecione pelo menos uma pessoa e um nome.');
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

      const habitData: Omit<Habit, 'id' | 'completions'> = {
        name: trimmedName,
        icon: selectedIcon,
        category: category || undefined,
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
        <h2 className="text-2xl font-bold mb-6">Adicionar habito ou evento</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="template-select" className="block text-gray-700 font-semibold mb-2">Comece com um modelo (opcional)</label>
            <select
              id="template-select"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            >
              <option value="custom">-- Criar personalizado --</option>
              {routineTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
          <hr />
          <div>
            <label htmlFor="habit-name" className="block text-gray-700 font-semibold mb-2">Nome do habito/evento</label>
            <input
              id="habit-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (formError) setFormError(null); }}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: Consulta no dentista"
            />
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
                    <button type="button" onClick={() => setScheduleType('DAILY')} className={`p-3 rounded-lg border-2 font-semibold ${scheduleType === 'DAILY' ? 'border-blue-500 bg-blue-50' : 'bg-gray-100'}`}>Diario</button>
                    <button type="button" onClick={() => setScheduleType('WEEKLY')} className={`p-3 rounded-lg border-2 font-semibold ${scheduleType === 'WEEKLY' ? 'border-blue-500 bg-blue-50' : 'bg-gray-100'}`}>Semanal</button>
                    <button type="button" onClick={() => setScheduleType('MONTHLY')} className={`p-3 rounded-lg border-2 font-semibold ${scheduleType === 'MONTHLY' ? 'border-blue-500 bg-blue-50' : 'bg-gray-100'}`}>Mensal</button>
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
            <label className="block text-gray-700 font-semibold mb-2">Icone</label>
            <div className="grid grid-cols-6 gap-3">
              {(Object.keys(HABIT_ICONS) as IconName[]).map((iconName) => {
                const Icon = HABIT_ICONS[iconName];
                return (
                  <button key={iconName} type="button" onClick={() => setSelectedIcon(iconName)} className={`p-3 rounded-lg flex items-center justify-center transition-colors ${selectedIcon === iconName ? 'bg-purple-200 ring-2 ring-purple-500' : 'bg-gray-100 hover:bg-gray-200'}`}>
                    <Icon className="w-8 h-8 text-gray-700" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Categoria (opcional)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as HabitCategory)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            >
              <option value="">Sem categoria</option>
              {HABIT_CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Recompensa</label>
            <div className="flex gap-4">
              <button type="button" onClick={() => setRewardType(RewardType.STARS)} className={`flex-1 p-3 rounded-lg border-2 ${rewardType === RewardType.STARS ? 'border-purple-500 bg-purple-50' : ''}`}>Estrelas</button>
              <button type="button" onClick={() => setRewardType(RewardType.ACTIVITY)} className={`flex-1 p-3 rounded-lg border-2 ${rewardType === RewardType.ACTIVITY ? 'border-purple-500 bg-purple-50' : ''}`}>Atividade</button>
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
                    <span className="text-2xl">{child.avatar}</span>
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
