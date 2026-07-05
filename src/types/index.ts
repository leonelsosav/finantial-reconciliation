export interface ClientGroup {
  id: string;
  group_name: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  internal_company_id: string;
  created_at: string;
  client_group_id: string | null;
  commercial_name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  commission_percentage: number;
  retainer_balance: number;
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

export type BillingEntryType = 'payroll_funding' | 'retainer_injection';

export interface BillingRecord {
  id: string;
  internal_company_id: string;
  client_id: string;
  invoice_uuid: string | null;
  is_invoiced: boolean;
  virtual_bucket_label: string | null;
  amount_gross: number;
  amount_commission: number;
  amount_net_payroll: number;
  entry_type: BillingEntryType;
  operation_date: string;
  description: string | null;
  is_reconciled: boolean;
  bank_transaction_id: string | null;
  imported_by: string | null;
  created_at: string;
  // Joined data
  clients?: {
    name: string;
  };
}

export type BankTransactionCategory = 'client_operation' | 'internal_transfer' | 'corporate_opex';
export type BankTransactionIngestionSource = 'daily_screenshot_assisted' | 'monthly_pdf_parsed';

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
  transaction_category: BankTransactionCategory | null;
  ingestion_source: BankTransactionIngestionSource | null;
  evidence_url: string | null;
}

export interface InternalCompany {
  id: string;
  name: string;
  tax_id: string | null;
  created_at: string;
}

