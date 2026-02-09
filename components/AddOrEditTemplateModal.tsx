import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { HABIT_ICONS } from '../constants';
import { IconName, RewardType, RoutineTemplate, ScheduleType, HabitSchedule } from '../types';
import { StarIcon } from './icons/HabitIcons';

interface AddOrEditTemplateModalProps {
  template: RoutineTemplate | null;
  onClose: () => void;
}

const AddOrEditTemplateModal: React.FC<AddOrEditTemplateModalProps> = ({ template, onClose }) => {
  const { addRoutineTemplate, updateRoutineTemplate, deleteRoutineTemplate } = useAppContext();

  const isEditing = template !== null;

  const [name, setName] = useState(template?.name || '');
  const [selectedIcon, setSelectedIcon] = useState<IconName>(template?.icon || 'Book');

  const [scheduleType, setScheduleType] = useState<ScheduleType>(template?.schedule?.type || 'DAILY');
  const [weeklyDays, setWeeklyDays] = useState<number[]>(template?.schedule?.days || []);
  const [monthlyCount, setMonthlyCount] = useState(template?.schedule?.count || 1);

  const [rewardType, setRewardType] = useState<RewardType>(template?.reward.type || RewardType.STARS);
  const [starValue, setStarValue] = useState(template?.reward.type === RewardType.STARS ? template.reward.value : 1);
  const [activityName, setActivityName] = useState(
    template?.reward.type === RewardType.ACTIVITY ? template.reward.activityName || '' : ''
  );
  const [formError, setFormError] = useState<string | null>(null);

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
    setWeeklyDays((prev) =>
      prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue]
    );
  };

  const saveTemplate = () => {
    const trimmedName = name.trim();
    const trimmedActivity = activityName.trim();

    if (!trimmedName) {
      setFormError('Informe o nome do modelo.');
      return;
    }

    if (scheduleType === 'WEEKLY' && weeklyDays.length === 0) {
      setFormError('Selecione pelo menos um dia da semana.');
      return;
    }

    if (rewardType === RewardType.ACTIVITY && !trimmedActivity) {
      setFormError('Informe o nome da atividade.');
      return;
    }

    setFormError(null);

    let schedule: HabitSchedule;
    switch (scheduleType) {
      case 'WEEKLY':
        schedule = { type: 'WEEKLY', days: weeklyDays };
        break;
      case 'MONTHLY':
        schedule = { type: 'MONTHLY', count: monthlyCount };
        break;
      default:
        schedule = { type: 'DAILY' };
    }

    const reward =
      rewardType === RewardType.STARS
        ? { type: RewardType.STARS, value: starValue }
        : { type: RewardType.ACTIVITY, value: 5, activityName: trimmedActivity };

    const templateData = { name: trimmedName, icon: selectedIcon, reward, schedule };

    try {
      if (isEditing && template) {
        updateRoutineTemplate({ ...template, ...templateData });
      } else {
        addRoutineTemplate(templateData);
      }
      onClose();
    } catch (error) {
      console.error('Falha ao salvar modelo:', error);
      setFormError('Nao foi possivel salvar o modelo.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveTemplate();
  };

  const handleDelete = () => {
    if (template && window.confirm(`Tem certeza que deseja excluir o modelo "${template.name}"?`)) {
      deleteRoutineTemplate(template.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[51]">
      <div
        className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg m-4"
        style={{ maxHeight: '95vh', overflowY: 'auto' }}
      >
        <h2 className="text-2xl font-bold mb-6">{isEditing ? 'Editar modelo' : 'Criar novo modelo'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="habit-name" className="block text-gray-700 font-semibold mb-2">
              Nome do modelo
            </label>
            <input
              id="habit-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formError) setFormError(null);
              }}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: Regar as plantas"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Frequencia padrao</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScheduleType('DAILY')}
                className={`p-3 rounded-lg border-2 font-semibold ${
                  scheduleType === 'DAILY' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'
                }`}
              >
                Diario
              </button>
              <button
                type="button"
                onClick={() => setScheduleType('WEEKLY')}
                className={`p-3 rounded-lg border-2 font-semibold ${
                  scheduleType === 'WEEKLY' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'
                }`}
              >
                Semanal
              </button>
              <button
                type="button"
                onClick={() => setScheduleType('MONTHLY')}
                className={`p-3 rounded-lg border-2 font-semibold ${
                  scheduleType === 'MONTHLY' ? 'border-purple-500 bg-purple-50' : 'bg-gray-100'
                }`}
              >
                Mensal
              </button>
            </div>
            {scheduleType === 'WEEKLY' && (
              <div className="mt-4 flex justify-around p-2 bg-gray-50 rounded-lg">
                {daysOfWeek.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeeklyDay(day.value)}
                    className={`w-10 h-10 rounded-full font-bold transition-colors ${
                      weeklyDays.includes(day.value)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            )}
            {scheduleType === 'MONTHLY' && (
              <div className="mt-4">
                <label htmlFor="monthly-count" className="block text-gray-700 font-semibold mb-2">
                  Vezes por mes
                </label>
                <input
                  id="monthly-count"
                  type="number"
                  value={monthlyCount}
                  onChange={(e) => {
                    setMonthlyCount(Math.max(1, parseInt(e.target.value, 10) || 1));
                    if (formError) setFormError(null);
                  }}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="1"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Icone</label>
            <div className="grid grid-cols-6 gap-3">
              {(Object.keys(HABIT_ICONS) as IconName[]).map((iconName) => {
                const Icon = HABIT_ICONS[iconName];
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => {
                      setSelectedIcon(iconName);
                      if (formError) setFormError(null);
                    }}
                    className={`p-3 rounded-lg flex items-center justify-center transition-colors ${
                      selectedIcon === iconName ? 'bg-purple-200 ring-2 ring-purple-500' : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-8 h-8 text-gray-700" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Tipo de recompensa</label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setRewardType(RewardType.STARS);
                  if (formError) setFormError(null);
                }}
                className={`flex-1 p-3 rounded-lg border-2 ${
                  rewardType === RewardType.STARS ? 'border-purple-500 bg-purple-50' : ''
                }`}
              >
                Estrelas
              </button>
              <button
                type="button"
                onClick={() => {
                  setRewardType(RewardType.ACTIVITY);
                  if (formError) setFormError(null);
                }}
                className={`flex-1 p-3 rounded-lg border-2 ${
                  rewardType === RewardType.ACTIVITY ? 'border-purple-500 bg-purple-50' : ''
                }`}
              >
                Atividade
              </button>
            </div>
          </div>

          {rewardType === RewardType.STARS && (
            <div>
              <label htmlFor="star-value" className="block text-gray-700 font-semibold mb-2">
                Recompensa em estrelas
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="star-value"
                  type="number"
                  value={starValue}
                  onChange={(e) => {
                    setStarValue(Math.max(1, parseInt(e.target.value, 10)));
                    if (formError) setFormError(null);
                  }}
                  className="w-24 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="1"
                />
                <StarIcon className="w-6 h-6 text-yellow-500" />
              </div>
            </div>
          )}

          {rewardType === RewardType.ACTIVITY && (
            <div>
              <label htmlFor="activity-name" className="block text-gray-700 font-semibold mb-2">
                Nome da atividade
              </label>
              <input
                id="activity-name"
                type="text"
                value={activityName}
                onChange={(e) => {
                  setActivityName(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Ex: Passeio no parque"
              />
            </div>
          )}

          {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}

          <div className="flex justify-between items-center pt-4">
            {isEditing ? (
              <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                Excluir modelo
              </button>
            ) : (
              <div />
            )}
            <div className="flex justify-end gap-4">
              <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                onTouchStart={saveTemplate}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                {isEditing ? 'Salvar alteracoes' : 'Criar modelo'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddOrEditTemplateModal;
