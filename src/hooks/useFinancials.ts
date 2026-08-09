import { useMemo } from 'react';
import type { BillingRecord, BankTransaction, Client } from '../types';

export const useFinancials = (
  billingRecords: BillingRecord[],
  bankTransactions: BankTransaction[],
  clients: Client[]
) => {
  return useMemo(() => {
    // 1. Consolidated Treasury Balance: Accumulated true cash across bank transactions (excluding internal transfers)
    const consolidatedTreasury = bankTransactions
      .filter(tx => tx.transaction_category !== 'internal_transfer')
      .reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );

    // 2. True Net Corporate Utility: Total revenue earned from commission percentages on reconciled billing records
    const netUtility = billingRecords.reduce(
      (sum, br) => (br.is_reconciled && !br.is_canceled) ? sum + Number(br.amount_commission || 0) : sum,
      0
    );

    // 3. Active Escrow Provisions: Total safety cushion cash held (sum of clients' retainer balances)
    const activeEscrow = clients.reduce(
      (sum, client) => sum + Number(client.retainer_balance || 0),
      0
    );

    // Unreconciled counts for indicators
    const unreconciledInvoicesCount = billingRecords.filter(br => !br.is_reconciled && !br.is_canceled).length;
    const unreconciledBankTxsCount = bankTransactions.filter(tx => !tx.is_reconciled).length;

    return {
      consolidatedTreasury,
      netUtility,
      activeEscrow,
      unreconciledInvoicesCount,
      unreconciledBankTxsCount
    };
  }, [billingRecords, bankTransactions, clients]);
};
