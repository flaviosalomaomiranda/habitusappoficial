
import { HabitSchedule, AgeGroup } from "../types";

export const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Retorna a data da última segunda-feira
 */
export const getMondayOfCurrentWeek = (): Date => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // ajusta para segunda
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

/**
 * Retorna a data do primeiro dia do mês atual
 */
export const getFirstDayOfCurrentMonth = (): Date => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
};

/**
 * Calcula a idade inteira (anos completos)
 */
export const calculateAge = (birthDateString: string): number => {
  if (!birthDateString) return 0;
  
  // Suporta YYYY-MM-DD ou DD/MM/YYYY
  let birthDate: Date;
  if (birthDateString.includes('/')) {
    const [day, month, year] = birthDateString.split('/').map(Number);
    birthDate = new Date(year, month - 1, day);
  } else {
    birthDate = new Date(birthDateString);
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, age);
};

/**
 * Mapeia idade para o grupo etário conforme regra solicitada
 */
export const getAgeGroupFromAge = (age: number): AgeGroup => {
  if (age <= 2) return "0-2";
  if (age <= 5) return "3-5";
  if (age < 10) return "6-10"; // 6, 7, 8, 9
  if (age <= 12) return "10-12"; // 10, 11, 12
  return "13+";
};

export const daysUntilNextBirthday = (birthDateString: string): number => {
    if (!birthDateString) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const birthDate = new Date(birthDateString);
    const birthDay = birthDate.getDate();
    const birthMonth = birthDate.getMonth();

    let nextBirthday = new Date(today.getFullYear(), birthMonth, birthDay);

    if (nextBirthday < today) {
        nextBirthday.setFullYear(today.getFullYear() + 1);
    }
    
    if(nextBirthday.getTime() === today.getTime()){
        return 0;
    }

    const oneDay = 1000 * 60 * 60 * 24;
    const diffTime = nextBirthday.getTime() - today.getTime();
    return Math.ceil(diffTime / oneDay);
};

export const isFirstDayOfMonth = (): boolean => {
  const today = new Date();
  return today.getDate() === 1;
};

export const formatSchedule = (schedule: HabitSchedule): string => {
    switch (schedule.type) {
        case 'DAILY':
            return 'Diariamente';
        case 'WEEKLY':
            if (!schedule.days || schedule.days.length === 0) return 'Semanalmente';
            const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const sortedDays = [...schedule.days].sort((a,b) => a-b);
            return sortedDays.map(d => dayNames[d]).join(', ');
        case 'MONTHLY':
            const count = schedule.count || 1;
            return `${count} vez${count > 1 ? 'es' : ''} por mês`;
        default:
            return '';
    }
};

/**
 * Embaralha um array (Fisher-Yates)
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};
