import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import { DateEngine } from '../utils/DateEngine';

interface PeriodContextType {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  startDate: string;
  endDate: string;
  monthOptions: { value: string; label: string }[];
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

export const PeriodProvider = ({ children }: { children: ReactNode }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return DateEngine.getLocalYYYYMM();
  });

  const dateRange = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }, [selectedMonth]);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    for (let i = 0; i < 24; i++) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const year = d.getFullYear();
      const monthNum = d.getMonth() + 1;
      const val = `${year}-${String(monthNum).padStart(2, '0')}`;
      
      const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
      
      options.push({ value: val, label: capitalizedLabel });
    }
    return options;
  }, []);

  return (
    <PeriodContext.Provider
      value={{
        selectedMonth,
        setSelectedMonth,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        monthOptions
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
};

export const usePeriod = () => {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error('usePeriod must be used within a PeriodProvider');
  }
  return context;
};
