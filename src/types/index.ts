export interface InternalCompany {
  id: string;
  name: string;
  tax_id: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  internal_company_id: string;
  created_at: string;
}

export type StaffEntryType = 'funding' | 'fee' | 'payroll';

export interface StaffRecord {
  id: string;
  client_id: string;
  internal_company_id: string;
  amount: number;
  entry_type: StaffEntryType;
  description: string | null;
  operation_date: string;
  created_by: string;
  is_reconciled: boolean;
  bank_transaction_id: string | null;
  created_at: string;
  // Joined data
  clients?: {
    name: string;
  };
}

export interface BankTransaction {
  id: string;
  internal_company_id: string;
  amount: number;
  transaction_date: string;
  description: string | null;
  reference_number: string | null;
  is_reconciled: boolean;
  is_non_invoiced: boolean;
  created_at: string;
}
