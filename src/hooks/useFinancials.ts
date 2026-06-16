import { useMemo } from 'react';
import type { StaffRecord } from '../types';

export const useFinancials = (records: StaffRecord[]) => {
  return useMemo(() => {
    const totals = records.reduce(
      (acc, record) => {
        const amount = Number(record.amount);
        
        if (record.entry_type === 'fee') {
          acc.netUtility += amount;
          acc.totalInflow += amount;
        } else if (record.entry_type === 'funding') {
          acc.retainerBalance += amount;
          acc.totalInflow += amount;
        } else if (record.entry_type === 'payroll') {
          acc.totalOutflow += amount;
        }
        
        return acc;
      },
      { netUtility: 0, retainerBalance: 0, totalInflow: 0, totalOutflow: 0 }
    );

    return {
      ...totals,
      totalCashFlow: totals.totalInflow - totals.totalOutflow,
      unreconciledCount: records.filter(r => !r.is_reconciled).length
    };
  }, [records]);
};
