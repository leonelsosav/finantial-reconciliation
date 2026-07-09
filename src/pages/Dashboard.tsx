import { useEffect, useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { useFinancials } from '../hooks/useFinancials';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import type { BillingRecord, BankTransaction, Client, InternalCompany, ClientGroup } from '../types';
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  ArrowRight,
  Download,
  Percent,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  X,
  ChevronsUpDown,
  HelpCircle,
  Info
} from 'lucide-react';
import styles from './Dashboard.module.scss';
import demoData from '../assets/data.json';

export const Dashboard = () => {
  const { profile, selectedCompanyId } = useAuth();
  const navigate = useNavigate();

  // Redirect or block if not owner
  const isOwner = profile?.role === 'owner';

  // Supabase hooks
  const { data: billingRecords, loading: loadingBilling, fetchData: fetchBilling } = useDatabase<BillingRecord>('billing_records');
  const { data: bankTxs, loading: loadingTxs, fetchData: fetchTxs } = useDatabase<BankTransaction>('bank_transactions');
  const { data: clients, loading: loadingClients, fetchData: fetchClients } = useDatabase<Client>('clients');
  const { data: clientGroups, loading: loadingGroups, fetchData: fetchClientGroups } = useDatabase<ClientGroup>('client_groups');
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  const { updateRecord } = useDatabase<Client>('clients');

  const [timeframe, setTimeframe] = useState<'30days' | '7days' | '90days' | 'currentMonth'>('30days');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showExplainers, setShowExplainers] = useState<boolean>(false);
  const [reconciliationModal, setReconciliationModal] = useState<{
    isOpen: boolean;
    type: 'utility' | 'opex' | 'anomalies' | null;
  }>({ isOpen: false, type: null });

  // Drawer states for editing client provisions
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({
    commercialName: '',
    legalName: '',
    commissionPercentage: 0,
    retainerBalance: 0
  });

  const isLoading = loadingBilling || loadingTxs || loadingClients || loadingGroups;

  // Fetch initial data
  useEffect(() => {
    if (!isOwner) return;

    const billingOptions: any = {
      select: '*, clients(name)',
      sort: { column: 'operation_date', direction: 'desc' }
    };
    if (selectedCompanyId) {
      billingOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    }
    fetchBilling(billingOptions);
  }, [selectedCompanyId, fetchBilling, isOwner]);

  useEffect(() => {
    if (!isOwner) return;

    const txOptions: any = {
      sort: { column: 'transaction_date', direction: 'desc' }
    };
    if (selectedCompanyId) {
      txOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    }
    fetchTxs(txOptions);
  }, [selectedCompanyId, fetchTxs, isOwner]);

  useEffect(() => {
    if (!isOwner) return;

    const clientOptions: any = {};
    if (selectedCompanyId) {
      clientOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    }
    fetchClients(clientOptions);
  }, [selectedCompanyId, fetchClients, isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    fetchClientGroups();
    fetchCompanies();
  }, [fetchClientGroups, fetchCompanies, isOwner]);

  // active company label
  const activeCompanyName = useMemo(() => {
    if (!selectedCompanyId) return 'Todas las Entidades';
    const found = companies.find(c => c.id === selectedCompanyId);
    return found ? found.name : 'Cargando...';
  }, [companies, selectedCompanyId]);

  // Timeframe date boundary helper
  const todayStr = useMemo(() => DateEngine.getLocalYYYYMMDD(new Date()), []);

  // Filtered lists reactive to timeframe
  const filteredBillingRecords = useMemo(() => {
    const startDate = new Date();
    if (timeframe === '7days') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (timeframe === '30days') {
      startDate.setDate(startDate.getDate() - 29);
    } else if (timeframe === '90days') {
      startDate.setDate(startDate.getDate() - 89);
    } else if (timeframe === 'currentMonth') {
      startDate.setDate(1);
    }
    const startStr = DateEngine.getLocalYYYYMMDD(startDate);
    return billingRecords.filter(r => r.operation_date >= startStr && r.operation_date <= todayStr);
  }, [billingRecords, timeframe, todayStr]);

  const filteredBankTxs = useMemo(() => {
    const startDate = new Date();
    if (timeframe === '7days') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (timeframe === '30days') {
      startDate.setDate(startDate.getDate() - 29);
    } else if (timeframe === '90days') {
      startDate.setDate(startDate.getDate() - 89);
    } else if (timeframe === 'currentMonth') {
      startDate.setDate(1);
    }
    const startStr = DateEngine.getLocalYYYYMMDD(startDate);
    return bankTxs.filter(tx => tx.transaction_date >= startStr && tx.transaction_date <= todayStr);
  }, [bankTxs, timeframe, todayStr]);

  // Dynamic client provisions: Calculate balance based on reconciled billing records in the DB.
  // If there are no reconciled billing records at all in the database, all client balances default to 0.00.
  // Otherwise, a client's balance is the sum of the gross amount of their reconciled billing records of type 'retainer_injection' (safety cushion).
  // Pass-through payroll funding records are excluded as they are disbursed to employees.
  const processedClients = useMemo(() => {
    return clients.map(client => {
      const clientRecords = billingRecords.filter(br => br.client_id === client.id);
      const dynamicBalance = clientRecords.reduce((sum, r) =>
        (r.is_reconciled && r.entry_type === 'retainer_injection') ? sum + Number(r.amount_gross || 0) : sum, 0
      );
      return {
        ...client,
        retainer_balance: dynamicBalance
      };
    });
  }, [clients, billingRecords]);

  // Aggregate stats using financials hook
  const {
    consolidatedTreasury,
    netUtility,
    activeEscrow,
    unreconciledBankTxsCount
  } = useFinancials(filteredBillingRecords, filteredBankTxs, processedClients);

  // 1. Corporate OPEX in the current timeframe
  const corporateOpex = useMemo(() => {
    return filteredBankTxs
      .filter(tx => tx.transaction_category === 'corporate_opex')
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  }, [filteredBankTxs]);

  // 2. Sum of pending/unreconciled bank transactions in the current timeframe
  const pendingReconciliationAmount = useMemo(() => {
    return filteredBankTxs
      .filter(tx => !tx.is_reconciled)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [filteredBankTxs]);

  // 3. Own Corporate Treasury Balance (Caja Propia de la Empresa)
  const ownCompanyCash = useMemo(() => {
    return Math.max(0, consolidatedTreasury - activeEscrow);
  }, [consolidatedTreasury, activeEscrow]);

  // Chart timeline builder: Outflow vs Inflow (30D Timeline)
  const chartDays = useMemo(() => {
    const today = new Date();
    const grouped: Record<string, { inflow: number; outflow: number }> = {};

    const startDate = new Date();
    if (timeframe === '7days') {
      startDate.setDate(today.getDate() - 6);
    } else if (timeframe === '30days') {
      startDate.setDate(today.getDate() - 29);
    } else if (timeframe === '90days') {
      startDate.setDate(today.getDate() - 89);
    } else if (timeframe === 'currentMonth') {
      startDate.setDate(1);
    }

    const startDateStr = DateEngine.getLocalYYYYMMDD(startDate);
    // Filter only client operation transactions
    const clientOpsTxs = bankTxs.filter(tx =>
      tx.transaction_category === 'client_operation' &&
      tx.transaction_date >= startDateStr &&
      tx.transaction_date <= todayStr
    );

    clientOpsTxs.forEach(tx => {
      const date = tx.transaction_date;
      if (!grouped[date]) {
        grouped[date] = { inflow: 0, outflow: 0 };
      }
      const amount = Number(tx.amount);
      if (amount > 0) {
        grouped[date].inflow += amount;
      } else {
        grouped[date].outflow += Math.abs(amount);
      }
    });

    const result: { day: string; inflow: number; outflow: number; active?: boolean }[] = [];
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' };

    let stepDays = 1;
    let daysToLoop = 30;

    if (timeframe === '7days') {
      stepDays = 1;
      daysToLoop = 7;
    } else if (timeframe === '30days') {
      stepDays = 3;
      daysToLoop = 30;
    } else if (timeframe === '90days') {
      stepDays = 9;
      daysToLoop = 90;
    } else if (timeframe === 'currentMonth') {
      stepDays = Math.max(Math.ceil(today.getDate() / 10), 1);
      daysToLoop = today.getDate();
    }

    for (let i = 0; i < daysToLoop; i += stepDays) {
      const dateObj = new Date(startDate);
      dateObj.setDate(startDate.getDate() + i);
      const dateStr = DateEngine.getLocalYYYYMMDD(dateObj);

      let inflowSum = 0;
      let outflowSum = 0;

      for (let k = 0; k < stepDays; k++) {
        const subDate = new Date(dateObj);
        subDate.setDate(dateObj.getDate() + k);
        const subDateStr = DateEngine.getLocalYYYYMMDD(subDate);
        const dataForDay = grouped[subDateStr];
        if (dataForDay) {
          inflowSum += dataForDay.inflow;
          outflowSum += dataForDay.outflow;
        }
      }

      const isToday = dateStr === todayStr;
      result.push({
        day: isToday ? 'Hoy' : dateObj.toLocaleDateString('es-MX', options),
        inflow: inflowSum,
        outflow: outflowSum,
        active: isToday
      });
    }

    const maxVal = Math.max(...result.map(r => Math.max(r.inflow, r.outflow)), 1);
    return result.map(r => ({
      ...r,
      inflowPct: Math.min((r.inflow / maxVal) * 90, 90),
      outflowPct: Math.min((r.outflow / maxVal) * 90, 90)
    }));
  }, [bankTxs, timeframe, todayStr]);

  // Billing Matrix columns
  const matrixColumns = useMemo(() => {
    const companyCols = companies.map(comp => ({
      id: comp.id,
      header: comp.name.toUpperCase().replace(' S.A.', '').replace(' SERVICIOS', '').slice(0, 8),
      isVirtual: false,
      label: null
    }));

    return [
      ...companyCols,
      { id: 'seivon', header: 'S.F. SEIVON', isVirtual: true, label: 'SEIVON' },
      { id: 'quinto', header: 'S.F. QUINTO', isVirtual: true, label: 'QUINTO' }
    ];
  }, [companies]);

  // Interactive Invoicing & Billing Matrix calculations
  const matrixData = useMemo(() => {
    const groups = clientGroups.map(group => {
      const groupClients = processedClients.filter(c => c.client_group_id === group.id);

      const clientsData = groupClients.map(client => {
        const colValues: Record<string, number> = {};
        let clientTotal = 0;

        matrixColumns.forEach(col => {
          let val = 0;
          if (!col.isVirtual) {
            val = filteredBillingRecords
              .filter(r => r.client_id === client.id && r.internal_company_id === col.id && r.is_invoiced)
              .reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);
          } else {
            val = filteredBillingRecords
              .filter(r => r.client_id === client.id && !r.is_invoiced && r.virtual_bucket_label?.toUpperCase() === col.label)
              .reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);
          }
          colValues[col.id] = val;
          clientTotal += val;
        });

        return {
          id: client.id,
          name: client.name,
          values: colValues,
          total: clientTotal
        };
      });

      const groupValues: Record<string, number> = {};
      let groupTotal = 0;

      matrixColumns.forEach(col => {
        const sum = clientsData.reduce((acc, c) => acc + (c.values[col.id] || 0), 0);
        groupValues[col.id] = sum;
        groupTotal += sum;
      });

      return {
        id: group.id,
        name: group.group_name,
        clients: clientsData,
        values: groupValues,
        total: groupTotal,
        isGroup: true
      };
    });

    // Group clients with no parent group
    const ungroupedClients = processedClients.filter(c => !c.client_group_id);
    if (ungroupedClients.length > 0) {
      const clientsData = ungroupedClients.map(client => {
        const colValues: Record<string, number> = {};
        let clientTotal = 0;

        matrixColumns.forEach(col => {
          let val = 0;
          if (!col.isVirtual) {
            val = filteredBillingRecords
              .filter(r => r.client_id === client.id && r.internal_company_id === col.id && r.is_invoiced)
              .reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);
          } else {
            val = filteredBillingRecords
              .filter(r => r.client_id === client.id && !r.is_invoiced && r.virtual_bucket_label?.toUpperCase() === col.label)
              .reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);
          }
          colValues[col.id] = val;
          clientTotal += val;
        });

        return {
          id: client.id,
          name: client.name,
          values: colValues,
          total: clientTotal
        };
      });

      const groupValues: Record<string, number> = {};
      let groupTotal = 0;

      matrixColumns.forEach(col => {
        const sum = clientsData.reduce((acc, c) => acc + (c.values[col.id] || 0), 0);
        groupValues[col.id] = sum;
        groupTotal += sum;
      });

      groups.push({
        id: 'ungrouped',
        name: 'Otros Clientes',
        clients: clientsData,
        values: groupValues,
        total: groupTotal,
        isGroup: true
      });
    }

    return groups;
  }, [clientGroups, processedClients, matrixColumns, filteredBillingRecords]);

  // Calculate DIFERENCIA delta row
  const matrixTotals = useMemo(() => {
    const totals: Record<string, { billed: number; cash: number; delta: number }> = {};
    let grantTotalBilled = 0;
    let grantTotalCash = 0;

    matrixColumns.forEach(col => {
      let billed = 0;
      let cash = 0;

      if (!col.isVirtual) {
        billed = filteredBillingRecords
          .filter(r => r.internal_company_id === col.id && r.is_invoiced)
          .reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);

        cash = filteredBankTxs
          .filter(tx => tx.internal_company_id === col.id && tx.transaction_category !== 'internal_transfer' && Number(tx.amount || 0) > 0)
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      } else {
        const recordsInCol = filteredBillingRecords
          .filter(r => !r.is_invoiced && r.virtual_bucket_label?.toUpperCase() === col.label);
        billed = recordsInCol.reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);

        const matchedTxIds = recordsInCol.map(r => r.bank_transaction_id).filter(Boolean) as string[];
        cash = filteredBankTxs
          .filter(tx => matchedTxIds.includes(tx.id) && Number(tx.amount || 0) > 0)
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      }

      const delta = cash - billed;
      totals[col.id] = { billed, cash, delta };
      grantTotalBilled += billed;
      grantTotalCash += cash;
    });

    return {
      columns: totals,
      grantTotalBilled,
      grantTotalCash,
      grantTotalDelta: grantTotalCash - grantTotalBilled
    };
  }, [matrixColumns, filteredBillingRecords, filteredBankTxs]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const areAllCollapsed = useMemo(() => {
    if (matrixData.length === 0) return false;
    return matrixData.every(group => collapsedGroups[group.id]);
  }, [matrixData, collapsedGroups]);

  const handleToggleAllGroups = () => {
    if (areAllCollapsed) {
      setCollapsedGroups({});
    } else {
      const newCollapsed: Record<string, boolean> = {};
      matrixData.forEach(group => {
        newCollapsed[group.id] = true;
      });
      setCollapsedGroups(newCollapsed);
    }
  };

  // Currency Formatter
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  // Matrix Exporter
  const handleExportMatrixCSV = () => {
    const headers = ['ENTITY', ...matrixColumns.map(col => col.header), 'TOTAL'];
    const rows: string[][] = [];

    matrixData.forEach(group => {
      rows.push([
        group.name,
        ...matrixColumns.map(col => (group.values[col.id] || 0).toString()),
        group.total.toString()
      ]);

      group.clients.forEach(client => {
        rows.push([
          `  ${client.name}`,
          ...matrixColumns.map(col => (client.values[col.id] || 0).toString()),
          client.total.toString()
        ]);
      });
    });

    rows.push([
      'TOTAL FACTURADO (INVOICED)',
      ...matrixColumns.map(col => (matrixTotals.columns[col.id]?.billed || 0).toString()),
      matrixTotals.grantTotalBilled.toString()
    ]);

    rows.push([
      'FLUJO BANCARIO (CASH MOVEMENT)',
      ...matrixColumns.map(col => (matrixTotals.columns[col.id]?.cash || 0).toString()),
      matrixTotals.grantTotalCash.toString()
    ]);

    rows.push([
      'DIFERENCIA (DELTA)',
      ...matrixColumns.map(col => (matrixTotals.columns[col.id]?.delta || 0).toString()),
      matrixTotals.grantTotalDelta.toString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Matriz_Facturacion_Ejecutiva_${DateEngine.getLocalYYYYMMDD(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Edit Drawer handlers
  const handleOpenDrawer = (client: Client) => {
    setEditingClient(client);
    setEditForm({
      commercialName: client.commercial_name || '',
      legalName: client.legal_name || '',
      commissionPercentage: Number(client.commission_percentage || 0),
      retainerBalance: Number(client.retainer_balance || 0)
    });
    setIsDrawerOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    try {
      await updateRecord(editingClient.id, {
        commercial_name: editForm.commercialName,
        legal_name: editForm.legalName,
        commission_percentage: Number(editForm.commissionPercentage),
        retainer_balance: Number(editForm.retainerBalance)
      });

      // Reload clients
      fetchClients();
      setIsDrawerOpen(false);
      alert('Perfil de cliente actualizado con éxito.');
    } catch (err: any) {
      console.error('Error updating client profile:', err);
      alert('Error al guardar: ' + err.message);
    }
  };

  // Demo data handlers
  const handleResetDemoData = async () => {
    if (!window.confirm('¿Está seguro de que desea restablecer los datos de demostración? Esto eliminará de forma permanente todos los registros contables, transacciones bancarias, clientes y grupos de clientes de la base de datos.')) {
      return;
    }
    try {
      // Delete in correct order to respect foreign key constraints
      await supabase.from('billing_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_groups').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      alert('Datos de simulación borrados con éxito.');
      window.location.reload();
    } catch (err: any) {
      console.error('Error resetting demo data:', err);
      alert('Error al restablecer datos: ' + err.message);
    }
  };

  const handleLoadDemoData = async () => {
    try {
      // 0. Decouple profiles from internal companies
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ internal_company_id: null }).eq('id', user.id);
      }

      // 1. Clean up existing records in cascading order to respect foreign key constraints
      await supabase.from('billing_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_groups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('internal_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 2. Insert Internal Companies from data.json
      const { data: insertedCompanies, error: compErr } = await supabase
        .from('internal_companies')
        .insert(demoData.internal_companies)
        .select();
      if (compErr) throw compErr;

      const companyMap = new Map<string, string>();
      insertedCompanies?.forEach(c => {
        companyMap.set(c.name, c.id);
      });

      // 3. Insert Client Groups
      const groupNames = demoData.client_directory.map(g => ({ group_name: g.group_name }));
      const { data: insertedGroups, error: grpError } = await supabase
        .from('client_groups')
        .insert(groupNames)
        .select();
      if (grpError) throw grpError;

      const groupMap = new Map<string, string>();
      insertedGroups?.forEach(g => {
        groupMap.set(g.group_name, g.id);
      });

      // 4. Insert Client Subsidiaries
      const clientsToInsert: any[] = [];

      // Map to keep track of subsidiaries in a group to link billing records later
      const groupClientsMap = new Map<string, any[]>();

      for (const group of demoData.client_directory) {
        const groupId = groupMap.get(group.group_name) || null;

        // Find which internal company to link to. 
        // We look at the first billing record of the group that specifies an internal company.
        let targetCompanyId = insertedCompanies[0]?.id;
        for (const br of group.billing_records) {
          if ('internal_company' in br && br.internal_company) {
            const compId = companyMap.get(br.internal_company);
            if (compId) {
              targetCompanyId = compId;
              break;
            }
          }
        }

        const groupSubs = [];
        for (const sub of group.subsidiaries) {
          const clientData = {
            id: crypto.randomUUID(),
            name: sub.legal_name || sub.commercial_name,
            commercial_name: sub.commercial_name,
            legal_name: sub.legal_name,
            tax_id: sub.tax_id,
            commission_percentage: sub.commission_percentage,
            retainer_balance: sub.retainer_balance,
            client_group_id: groupId,
            internal_company_id: targetCompanyId
          };
          clientsToInsert.push(clientData);
          groupSubs.push(clientData);
        }
        groupClientsMap.set(group.group_name, groupSubs);
      }

      const { error: clientErr } = await supabase
        .from('clients')
        .insert(clientsToInsert);
      if (clientErr) throw clientErr;

      const formatOffsetDate = (offsetDays: number) => {
        const d = new Date();
        d.setDate(d.getDate() - offsetDays);
        return DateEngine.getLocalYYYYMMDD(d);
      };

      const demoRecords: any[] = [];
      const demoBankTxs: any[] = [];

      // Helper function to create matching bank transaction
      const createBankTx = (
        amount: number,
        offsetDays: number,
        description: string,
        category: 'client_operation' | 'corporate_opex',
        companyId: string,
        isReconciled: boolean
      ) => {
        const txId = crypto.randomUUID();
        demoBankTxs.push({
          id: txId,
          internal_company_id: companyId,
          amount,
          transaction_date: formatOffsetDate(offsetDays),
          description,
          reference_number: 'SPEI' + Math.floor(1000000 + Math.random() * 9000000),
          is_reconciled: isReconciled,
          is_non_invoiced: false,
          transaction_category: category,
          ingestion_source: 'daily_screenshot_assisted'
        });
        return txId;
      };

      // 5. Populate Billing Records and Bank Transactions
      let recordIndex = 0;
      for (const group of demoData.client_directory) {
        const subs = groupClientsMap.get(group.group_name) || [];
        if (subs.length === 0) continue;

        // Default to the first client in the group for linking billing records
        const primaryClient = subs[0];

        for (const br of group.billing_records) {
          recordIndex++;
          const grossAmount = br.amount_gross;
          const commPercent = primaryClient.commission_percentage;
          const commission = grossAmount * (commPercent / 100);
          const netPayroll = grossAmount - commission;

          // Determine internal company for this billing record
          let billingCompanyId = primaryClient.internal_company_id;
          if ('internal_company' in br && br.internal_company) {
            const compId = companyMap.get(br.internal_company);
            if (compId) billingCompanyId = compId;
          }

          const offsetDays = (recordIndex % 10) + 1; // spread dates between 1 and 10 days ago

          let bankTxId: string | null = null;
          let isReconciled = false;

          // Build scenarios based on group
          if (group.group_name === 'Alberto Compean') {
            // Perfect Reconciled Flow
            isReconciled = true;
            bankTxId = createBankTx(
              grossAmount,
              offsetDays,
              `TRSP SPEI NOMINA ${primaryClient.commercial_name?.toUpperCase()}`,
              'client_operation',
              billingCompanyId,
              true
            );
          } else if (group.group_name === 'Jaguar') {
            // Mismatched amount
            isReconciled = false;
            createBankTx(
              grossAmount - 100, // 100 less
              offsetDays,
              `SPEI FDO ${primaryClient.commercial_name?.toUpperCase()}`,
              'client_operation',
              billingCompanyId,
              false
            );
          } else if (group.group_name === 'Carolina') {
            // Mix of reconciled, mismatched and missing
            if (recordIndex % 3 === 0) {
              // Perfect Match
              isReconciled = true;
              bankTxId = createBankTx(
                grossAmount,
                offsetDays,
                `ABONO ${primaryClient.commercial_name?.toUpperCase()}`,
                'client_operation',
                billingCompanyId,
                true
              );
            } else if (recordIndex % 3 === 1) {
              // Mismatched
              isReconciled = false;
              createBankTx(
                grossAmount + 500, // 500 more
                offsetDays,
                `ABONO COMPLEMENTO ${primaryClient.commercial_name?.toUpperCase()}`,
                'client_operation',
                billingCompanyId,
                false
              );
            } else {
              // Missing Bank Transaction
              isReconciled = false;
            }
          } else if (group.group_name === 'Leonel') {
            // Perfect Reconciled
            isReconciled = true;
            bankTxId = createBankTx(
              grossAmount,
              offsetDays,
              `TRANSF ${primaryClient.commercial_name?.toUpperCase()}`,
              'client_operation',
              billingCompanyId,
              true
            );
          } else if (group.group_name === 'Daniel Castillo') {
            // Missing bank transaction
            isReconciled = false;
          } else if (group.group_name === 'Elias') {
            // 2 Reconciled, 2 Unreconciled
            if (recordIndex % 2 === 0) {
              isReconciled = true;
              bankTxId = createBankTx(
                grossAmount,
                offsetDays,
                `DEPOSITO ${primaryClient.commercial_name?.toUpperCase()}`,
                'client_operation',
                billingCompanyId,
                true
              );
            } else {
              isReconciled = false;
            }
          } else if (group.group_name === 'Arc patatuchi') {
            // 1 Reconciled, 1 Mismatched
            if (recordIndex % 2 === 0) {
              isReconciled = true;
              bankTxId = createBankTx(
                grossAmount,
                offsetDays,
                `TRSP ${primaryClient.commercial_name?.toUpperCase()}`,
                'client_operation',
                billingCompanyId,
                true
              );
            } else {
              isReconciled = false;
              createBankTx(
                grossAmount - 50,
                offsetDays,
                `TRSP PARCIAL ${primaryClient.commercial_name?.toUpperCase()}`,
                'client_operation',
                billingCompanyId,
                false
              );
            }
          } else if (group.group_name === 'Tomas Bernal') {
            // Perfect Reconciled
            isReconciled = true;
            bankTxId = createBankTx(
              grossAmount,
              offsetDays,
              `SPEI FDO ${primaryClient.commercial_name?.toUpperCase()}`,
              'client_operation',
              billingCompanyId,
              true
            );
          } else if (group.group_name === 'Favorito') {
            // Perfect Reconciled (large amount)
            isReconciled = true;
            bankTxId = createBankTx(
              grossAmount,
              offsetDays,
              `TRSP COMPLETO ${primaryClient.commercial_name?.toUpperCase()}`,
              'client_operation',
              billingCompanyId,
              true
            );
          } else {
            // Default fallback
            isReconciled = false;
          }

          demoRecords.push({
            id: crypto.randomUUID(),
            client_id: primaryClient.id,
            internal_company_id: billingCompanyId,
            invoice_uuid: crypto.randomUUID(),
            is_invoiced: br.is_invoiced,
            virtual_bucket_label: 'virtual_bucket_label' in br ? br.virtual_bucket_label : null,
            amount_gross: grossAmount,
            amount_commission: commission,
            amount_net_payroll: netPayroll,
            entry_type: 'payroll_funding',
            description: `Fondeo de Nómina - ${primaryClient.commercial_name}`,
            operation_date: formatOffsetDate(offsetDays),
            is_reconciled: isReconciled,
            bank_transaction_id: bankTxId
          });
        }
      }

      // Add a few corporate opex & general bank transactions (outflows/inflows)
      const mainCompId = insertedCompanies[0]?.id || '';
      if (mainCompId) {
        createBankTx(-12500.00, 4, 'COMISION MENSUAL BANCA ELECTRONICA', 'corporate_opex', mainCompId, false);
        createBankTx(-35000.00, 5, 'PAGO RENTA OFICINAS CORP', 'corporate_opex', mainCompId, false);
        createBankTx(-450000.00, 2, 'DISPERSION MASIVA NOMINA BATCH', 'client_operation', mainCompId, true);
        createBankTx(8500.00, 8, 'RENDIMIENTOS INVERSION MOCK', 'corporate_opex', mainCompId, false);
      }

      // Insert bank transactions and billing records
      const { error: insBankErr } = await supabase.from('bank_transactions').insert(demoBankTxs);
      if (insBankErr) throw insBankErr;

      const { error: insRecErr } = await supabase.from('billing_records').insert(demoRecords);
      if (insRecErr) throw insRecErr;

      // 6. Recouple current user's profile to the first internal company
      if (user && insertedCompanies.length > 0) {
        await supabase.from('profiles').update({ internal_company_id: insertedCompanies[0].id }).eq('id', user.id);
      }

      alert('Datos de simulación cargados con éxito.');
      window.location.reload();
    } catch (err: any) {
      console.error('Error loading demo data:', err);
      alert('Error al cargar datos de demo: ' + err.message);
    }
  };

  const renderReconciliationDetailModal = () => {
    if (!reconciliationModal.isOpen || !reconciliationModal.type) return null;

    let title = '';
    let contentTable = null;
    let totalAmount = 0;

    if (reconciliationModal.type === 'utility') {
      title = 'Detalle de Utilidades Real (Comisiones)';
      const utilityRecords = billingRecords.filter(br => br.is_reconciled && Number(br.amount_commission || 0) > 0);
      totalAmount = utilityRecords.reduce((sum, r) => sum + Number(r.amount_commission || 0), 0);

      contentTable = (
        <table className={styles.modalTable}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Descripción</th>
              <th className={styles.numCol}>Monto Bruto</th>
              <th className={styles.numCol}>Comisión</th>
            </tr>
          </thead>
          <tbody>
            {utilityRecords.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>No hay comisiones reconciliadas en este período.</td>
              </tr>
            ) : (
              utilityRecords.map(r => (
                <tr key={r.id}>
                  <td>{r.operation_date}</td>
                  <td>{clients.find(c => c.id === r.client_id)?.name || 'Cliente'}</td>
                  <td>{r.description || 'Comisión por Nómina'}</td>
                  <td className={styles.numCol}>{formatCurrency(r.amount_gross)}</td>
                  <td className={`${styles.numCol} ${styles.positive}`}>{formatCurrency(r.amount_commission)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    } else if (reconciliationModal.type === 'opex') {
      title = 'Detalle de Gastos Operativos (Opex)';
      const opexTxs = filteredBankTxs.filter(tx => tx.transaction_category === 'corporate_opex');
      totalAmount = opexTxs.reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);

      contentTable = (
        <table className={styles.modalTable}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Referencia / Banco</th>
              <th>Descripción</th>
              <th className={styles.numCol}>Monto Gasto</th>
            </tr>
          </thead>
          <tbody>
            {opexTxs.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>No hay gastos operativos en este período.</td>
              </tr>
            ) : (
              opexTxs.map(tx => (
                <tr key={tx.id}>
                  <td>{tx.transaction_date}</td>
                  <td>{tx.reference_number || 'N/A'}</td>
                  <td>{tx.description || 'Gasto Operativo'}</td>
                  <td className={`${styles.numCol} ${styles.negative}`}>-{formatCurrency(tx.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    } else if (reconciliationModal.type === 'anomalies') {
      title = 'Detalle de Transacciones por Conciliar';
      const unreconciledTxs = filteredBankTxs.filter(tx => !tx.is_reconciled);
      totalAmount = unreconciledTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      contentTable = (
        <table className={styles.modalTable}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Referencia</th>
              <th>Descripción</th>
              <th className={styles.numCol}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {unreconciledTxs.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>No hay transacciones pendientes por conciliar.</td>
              </tr>
            ) : (
              unreconciledTxs.map(tx => (
                <tr key={tx.id}>
                  <td>{tx.transaction_date}</td>
                  <td>{tx.reference_number || 'N/A'}</td>
                  <td>{tx.description || 'Transacción Bancaria'}</td>
                  <td className={`${styles.numCol} ${Number(tx.amount) >= 0 ? styles.positive : styles.negative}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    }

    return (
      <div className={styles.modalOverlay} onClick={() => setReconciliationModal({ isOpen: false, type: null })}>
        <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h3>{title}</h3>
            <button className={styles.closeBtn} onClick={() => setReconciliationModal({ isOpen: false, type: null })}>
              <X size={20} />
            </button>
          </div>
          
          <div className={styles.modalBody}>
            {contentTable}
          </div>

          <div className={styles.modalFooter}>
            <span className={styles.footerLabel}>Total Consolidado:</span>
            <span className={`${styles.footerVal} ${reconciliationModal.type === 'opex' ? styles.negative : reconciliationModal.type === 'utility' ? styles.positive : ''}`}>
              {reconciliationModal.type === 'opex' ? '-' : ''}{formatCurrency(totalAmount)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Access Wall
  if (!isOwner) {
    return (
      <div className={styles.accessWall}>
        <div className={styles.wallCard}>
          <div className={styles.wallIcon}>
            <ShieldAlert size={48} />
          </div>
          <h2>Acceso Restringido</h2>
          <p>Este Panel de Control Ejecutivo contiene información financiera confidencial de utilidades y flujo de caja.</p>
          <p className={styles.roleNotice}>Solo usuarios con el rol de <strong>Propietario (Owner)</strong> están autorizados a visualizar este panel.</p>
          <button className={styles.redirectBtn} onClick={() => navigate('/reconciliation')}>
            Ir a Conciliación (Auditoría)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.breadcrumbs}>
            <span>Inicio</span>
            <span className={styles.separator}>/</span>
            <span className={styles.activePage}>Panel Ejecutivo</span>
          </div>
          <h1 className={styles.pageTitle}>
            Panel Ejecutivo de Conciliación
            <span className={styles.entityBadge}>{activeCompanyName}</span>
          </h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.loadBtn} onClick={handleLoadDemoData}>
            Cargar Datos de Demo
          </button>
          <button className={styles.resetBtn} onClick={handleResetDemoData}>
            Restablecer Demo
          </button>
        </div>
      </div>

      {/* Top Row: Metric Cards */}
      <div className={styles.metricsGrid}>
        {/* Card 1: Total Bank Cash Flow */}
        <div className={`${styles.metricCard} ${styles.cardPrimary}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Flujo de Caja Bancario Total</span>
            <div className={`${styles.cardIcon} ${styles.iconPrimary}`}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>
              {isLoading ? '...' : formatCurrency(consolidatedTreasury)}
            </h2>
            <span className={styles.cardBadge}>+4.2%</span>
          </div>
          <p className={styles.cardSub}>Consolidado de flujo real neto (excluye transferencias internas)</p>
        </div>

        {/* Card 2: True Net Utility */}
        <div className={`${styles.metricCard} ${styles.cardSuccess}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Utilidad Neta Real</span>
            <div className={`${styles.cardIcon} ${styles.iconSuccess}`}>
              <Percent size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>
              {isLoading ? '...' : formatCurrency(netUtility)}
            </h2>
            <span className={styles.cardBadge}>+1.8%</span>
          </div>
          <p className={styles.cardSub}>Comisiones netas cobradas de nóminas conciliadas</p>
        </div>

        {/* Card 3: Active Client Retainers */}
        <div className={`${styles.metricCard} ${styles.cardNeutral}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Retainers Activos de Clientes</span>
            <div className={`${styles.cardIcon} ${styles.iconNeutral}`}>
              <Wallet size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>
              {isLoading ? '...' : formatCurrency(activeEscrow)}
            </h2>
            <span className={`${styles.cardBadge} ${styles.badgeStable}`}>ESTABLE</span>
          </div>
          <p className={styles.cardSub}>Cojín financiero / provisión acumulada en garantía</p>
        </div>

        {/* Card 4: Unreconciled Anomalies */}
        <div
          className={`${styles.metricCard} ${styles.cardDanger} ${styles.clickableCard}`}
          onClick={() => navigate('/reconciliation')}
        >
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Anomalías sin Conciliar</span>
            <div className={`${styles.cardIcon} ${styles.iconDanger}`}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>
              {isLoading ? '...' : unreconciledBankTxsCount}
            </h2>
            <span className={`${styles.cardBadge} ${styles.badgeDanger}`}>REVISIÓN</span>
          </div>
          <p className={styles.cardSub}>Pendiente de conciliación manual (click para auditar)</p>
        </div>
      </div>

      {/* Main Body Grid */}
      <div className={styles.dashboardGrid}>
        {/* Daily Cash Inflow vs. Outflow Chart */}
        <section className={styles.chartSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Entradas vs. Salidas Diarias</h3>
              <p className={styles.sectionSub}>Operación de clientes liquidada (30D Timeline)</p>
            </div>
            <div className={styles.chartControls}>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotPrimary}`}></span>
                <span>Créditos (Entradas)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotSuccess}`}></span>
                <span>Débitos (Salidas)</span>
              </div>
              <select
                className={styles.chartSelect}
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as any)}
              >
                <option value="7days">Últimos 7 Días</option>
                <option value="30days">Últimos 30 Días</option>
                <option value="90days">Últimos 90 Días</option>
                <option value="currentMonth">Mes Actual</option>
              </select>
            </div>
          </div>

          <div className={styles.chartContainer}>
            {isLoading ? (
              <div className={styles.chartLoading}>Cargando gráfico...</div>
            ) : chartDays.length === 0 ? (
              <div className={styles.chartEmpty}>No hay datos en este período.</div>
            ) : (
              <>
                <div className={styles.chartBars}>
                  {chartDays.map((d, index) => (
                    <div key={index} className={styles.barGroup}>
                      <div className={styles.barWrapper}>
                        <div
                          className={`${styles.barInflow} ${d.active ? styles.barActive : ''}`}
                          style={{ height: `${d.inflowPct}%` }}
                          title={`Entradas: ${formatCurrency(d.inflow)}`}
                        ></div>
                        <div
                          className={`${styles.barOutflow} ${d.active ? styles.barActive : ''}`}
                          style={{ height: `${d.outflowPct}%` }}
                          title={`Salidas: ${formatCurrency(d.outflow)}`}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.chartLabels}>
                  {chartDays.map((d, i) => (
                    <span key={i}>{d.day}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Retainer Health Panel / Provisions Directory */}
        <section className={styles.healthSection}>
          <h3 className={styles.sectionTitle}>Directorio de Provisiones</h3>
          <p className={styles.sectionSub}>Saldos en garantía para dispersión de nóminas</p>

          <div className={styles.healthList}>
            {isLoading ? (
              <p className={styles.loadingText}>Cargando provisiones...</p>
            ) : processedClients.length === 0 ? (
              <p className={styles.emptyText}>No hay datos de clientes.</p>
            ) : (
              processedClients.slice(0, 4).map((client) => {
                const limit = 1000000;
                const pct = Math.min(Math.round(((client.retainer_balance || 0) / limit) * 100), 100);

                return (
                  <div key={client.id} className={styles.healthItem} onClick={() => handleOpenDrawer(client)}>
                    <div className={styles.healthMeta}>
                      <span className={styles.clientName}>{client.commercial_name || client.name}</span>
                      <span className={styles.healthPct}>{formatCurrency(client.retainer_balance || 0)}</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressBar} ${pct < 20 ? styles.danger : pct < 60 ? styles.neutral : styles.success}`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                    <div className={styles.healthDetails}>
                      <span>Comisión: {client.commission_percentage || 0}%</span>
                      <span className={styles.editLink}>Editar Perfil</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button className={styles.viewRetainersBtn} onClick={() => setIsDrawerOpen(true)}>
            <span>Ver y Gestionar Entidades</span>
            <ArrowRight size={14} />
          </button>
        </section>

        {/* Billing Matrix Component */}
        <div className={styles.matrixContainer}>
          <div className={styles.matrixHeader}>
            <h4 className={styles.matrixTitle}>Interactive Invoicing &amp; Billing Matrix</h4>
            <div className={styles.matrixActions}>
              <button className={styles.collapseBtn} onClick={handleToggleAllGroups}>
                <ChevronsUpDown size={14} className="mr-1" />
                {areAllCollapsed ? 'Expandir Todo' : 'Contraer Todo'}
              </button>
              <button className={styles.exportBtn} onClick={handleExportMatrixCSV}>
                <Download size={14} className="mr-1" /> Exportar CSV
              </button>
            </div>
          </div>

          <div className={styles.matrixScroll}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th className={styles.stickyColumn}>ENTIDAD / CLIENTE</th>
                  {matrixColumns.map(col => (
                    <th key={col.id}>{col.header}</th>
                  ))}
                  <th className={styles.totalHeader}>TOTAL FACTURADO</th>
                </tr>
              </thead>
              <tbody>
                {matrixData.map(group => {
                  const isCollapsed = collapsedGroups[group.id];

                  return (
                    <Fragment key={group.id}>
                      {/* Parent Group Row */}
                      <tr className={`${styles.parentRow} ${isCollapsed ? styles.collapsed : ''}`} onClick={() => toggleGroup(group.id)}>
                        <td className={styles.stickyColumn}>
                          <div className={styles.entityName}>
                            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            <span>{group.name}</span>
                          </div>
                        </td>
                        {matrixColumns.map(col => (
                          <td key={col.id} className={styles.numCell}>
                            {formatCurrency(group.values[col.id] || 0)}
                          </td>
                        ))}
                        <td className={`${styles.numCell} ${styles.totalCell}`}>
                          {formatCurrency(group.total)}
                        </td>
                      </tr>

                      {/* Relational Child Rows */}
                      {!isCollapsed && group.clients.map(client => (
                        <tr key={client.id} className={styles.childRow}>
                          <td className={styles.stickyColumn}>
                            <span className={styles.childName}>{client.name}</span>
                          </td>
                          {matrixColumns.map(col => (
                            <td key={col.id} className={styles.numCell}>
                              {formatCurrency(client.values[col.id] || 0)}
                            </td>
                          ))}
                          <td className={styles.numCell}>
                            {formatCurrency(client.total)}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>

              <tfoot>
                {/* Differential Delta validation Row */}
                <tr className={styles.footerRow}>
                  <td className={styles.stickyColumn}>TOTAL FACTURADO (INVOICES)</td>
                  {matrixColumns.map(col => (
                    <td key={col.id} className={styles.numCell}>
                      {formatCurrency(matrixTotals.columns[col.id]?.billed || 0)}
                    </td>
                  ))}
                  <td className={styles.numCell}>{formatCurrency(matrixTotals.grantTotalBilled)}</td>
                </tr>
                <tr className={styles.footerRow}>
                  <td className={styles.stickyColumn}>DEPOSITOS BANCARIOS (CASH)</td>
                  {matrixColumns.map(col => (
                    <td key={col.id} className={styles.numCell}>
                      {formatCurrency(matrixTotals.columns[col.id]?.cash || 0)}
                    </td>
                  ))}
                  <td className={styles.numCell}>{formatCurrency(matrixTotals.grantTotalCash)}</td>
                </tr>
                <tr className={styles.deltaRow}>
                  <td className={styles.stickyColumn}>DIFERENCIA</td>
                  {matrixColumns.map(col => {
                    const delta = matrixTotals.columns[col.id]?.delta || 0;
                    const hasDiscrepancy = Math.abs(delta) > 0.01;
                    return (
                      <td key={col.id} className={`${styles.numCell} ${hasDiscrepancy ? styles.shortfall : styles.balanced}`}>
                        {formatCurrency(delta)}
                      </td>
                    );
                  })}
                  <td className={`${styles.numCell} ${Math.abs(matrixTotals.grantTotalDelta) > 0.01 ? styles.shortfall : styles.balanced}`}>
                    {formatCurrency(matrixTotals.grantTotalDelta)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Sección de Conciliación de Caja y Utilidades */}
      <section className={styles.reconciliationSection}>
        <div className={styles.reconciliationHeader}>
          <div>
            <h3>Conciliación de Caja y Utilidades</h3>
            <p>Desglose matemático y explicativo de la procedencia de los fondos corporativos</p>
          </div>
          <button 
            className={styles.formulaBtn}
            onClick={() => setShowExplainers(!showExplainers)}
          >
            <Info size={14} />
            {showExplainers ? 'Ocultar Explicaciones' : 'Mostrar Explicaciones'}
          </button>
        </div>

        <div className={styles.waterfallTree}>
          {/* Nodo 1: Flujo de Caja Total */}
          <div className={styles.treeRow}>
            <div className={styles.treeNode}>
              <div className={styles.nodeMeta}>
                <div className={styles.nodeTitleGroup}>
                  <span className={styles.nodeLabel}>Punto de Partida</span>
                  <div className={styles.helpIcon} title="El saldo consolidado físico de todas tus cuentas bancarias, excluyendo traspasos entre cuentas propias.">
                    <HelpCircle size={14} />
                  </div>
                </div>
                <span className={styles.nodeName}>Flujo de Caja Bancario Total</span>
                <span className={styles.nodeDesc}>Total de dinero real en cuentas corporativas</span>
              </div>
              <div className={styles.nodeValueGroup}>
                <span className={styles.nodeValue}>{formatCurrency(consolidatedTreasury)}</span>
                <span className={`${styles.nodeOp} ${styles.opEqual}`}>Caja Base</span>
              </div>
            </div>
          </div>

          {/* Conector 1 */}
          <div className={styles.treeConnector}>
            <div className={styles.connectorLine}></div>
            <div className={styles.connectorIcon}>➖</div>
            <div className={styles.connectorLine}></div>
          </div>

          {/* Nodo 2: Retainers de Clientes */}
          <div className={styles.treeRow}>
            <div className={`${styles.treeNode} ${styles.negative}`}>
              <div className={styles.nodeMeta}>
                <div className={styles.nodeTitleGroup}>
                  <span className={styles.nodeLabel}>Pasivo / Garantías</span>
                  <div className={styles.helpIcon} title="Fondo en garantía aportado por tus clientes para la dispersión de sus nóminas. Está en tu banco, pero les pertenece a ellos.">
                    <HelpCircle size={14} />
                  </div>
                </div>
                <span className={styles.nodeName}>Retainers y Garantías de Clientes</span>
                <span className={styles.nodeDesc}>Provisión acumulada bajo custodia (Escrow)</span>
              </div>
              <div className={styles.nodeValueGroup}>
                <span className={`${styles.nodeValue} ${styles.negative}`}>-{formatCurrency(activeEscrow)}</span>
                <span className={`${styles.nodeOp} ${styles.opSub}`}>Restar</span>
              </div>
            </div>
          </div>

          {/* Conector 2 */}
          <div className={styles.treeConnector}>
            <div className={styles.connectorLine}></div>
            <div className={styles.connectorIcon}>🟰</div>
            <div className={styles.connectorLine}></div>
          </div>

          {/* Nodo 3: Caja Propia */}
          <div className={styles.treeRow}>
            <div className={`${styles.treeNode} ${styles.highlighted}`}>
              <div className={styles.nodeMeta}>
                <div className={styles.nodeTitleGroup}>
                  <span className={styles.nodeLabel}>Tesorería Propia</span>
                  <div className={styles.helpIcon} title="El saldo de caja que pertenece enteramente a la empresa después de separar las provisiones de los clientes.">
                    <HelpCircle size={14} />
                  </div>
                </div>
                <span className={styles.nodeName}>Caja Útil y Libre de la Empresa</span>
                <span className={styles.nodeDesc}>Capital de trabajo libre para operación propia</span>
              </div>
              <div className={styles.nodeValueGroup}>
                <span className={`${styles.nodeValue} ${styles.positive}`}>{formatCurrency(ownCompanyCash)}</span>
                <span className={`${styles.nodeOp} ${styles.opEqual}`}>Resultado</span>
              </div>
            </div>
          </div>

          {/* Conector 3 */}
          <div className={styles.treeConnector}>
            <div className={styles.connectorLine}></div>
            <div className={styles.connectorIcon}>➕ / ➖</div>
            <div className={styles.connectorLine}></div>
          </div>

          {/* Fila Doble de Desglose de Caja Propia */}
          <div className={styles.treeRow} style={{ gap: '16px' }}>
            {/* Utilidad Neta */}
            <div 
              className={`${styles.treeNode} ${styles.highlighted} ${styles.clickableTreeNode}`} 
              style={{ flex: 1 }}
              onClick={() => setReconciliationModal({ isOpen: true, type: 'utility' })}
            >
              <div className={styles.nodeMeta}>
                <div className={styles.nodeTitleGroup}>
                  <span className={styles.nodeLabel}>Ingresos Corporativos</span>
                  <div className={styles.helpIcon} title="Las comisiones acumuladas ganadas por la dispersión de nóminas ya reconciliadas.">
                    <HelpCircle size={14} />
                  </div>
                </div>
                <span className={styles.nodeName}>Utilidad Neta Real</span>
                <span className={styles.nodeDesc}>Comisiones netas por nóminas liquidadas</span>
              </div>
              <div className={styles.nodeValueGroup}>
                <span className={`${styles.nodeValue} ${styles.positive}`}>{formatCurrency(netUtility)}</span>
                <span className={`${styles.nodeOp} ${styles.opAdd}`}>Ganancia</span>
              </div>
            </div>

            {/* Opex */}
            <div 
              className={`${styles.treeNode} ${styles.negative} ${styles.clickableTreeNode}`} 
              style={{ flex: 1 }}
              onClick={() => setReconciliationModal({ isOpen: true, type: 'opex' })}
            >
              <div className={styles.nodeMeta}>
                <div className={styles.nodeTitleGroup}>
                  <span className={styles.nodeLabel}>Gastos Corporativos</span>
                  <div className={styles.helpIcon} title="Egresos operativos reales de la empresa, tales como pago de comisiones bancarias, software o impuestos.">
                    <HelpCircle size={14} />
                  </div>
                </div>
                <span className={styles.nodeName}>Gastos Operativos (Opex)</span>
                <span className={styles.nodeDesc}>Gastos administrativos pagados desde banco</span>
              </div>
              <div className={styles.nodeValueGroup}>
                <span className={`${styles.nodeValue} ${styles.negative}`}>-{formatCurrency(corporateOpex)}</span>
                <span className={`${styles.nodeOp} ${styles.opSub}`}>Gasto</span>
              </div>
            </div>

            {/* Pendiente/Anomalías */}
            <div 
              className={`${styles.treeNode} ${styles.clickableTreeNode}`} 
              style={{ flex: 1 }}
              onClick={() => setReconciliationModal({ isOpen: true, type: 'anomalies' })}
            >
              <div className={styles.nodeMeta}>
                <div className={styles.nodeTitleGroup}>
                  <span className={styles.nodeLabel}>Ajuste Temporal</span>
                  <div className={styles.helpIcon} title="Transacciones de banco (depósitos o retiros) pendientes de conciliar con facturas o contratos.">
                    <HelpCircle size={14} />
                  </div>
                </div>
                <span className={styles.nodeName}>Flujo Pendiente / Anomalías</span>
                <span className={styles.nodeDesc}>Movimientos sin factura asignada</span>
              </div>
              <div className={styles.nodeValueGroup}>
                <span className={styles.nodeValue}>
                  {pendingReconciliationAmount >= 0 ? '+' : ''}
                  {formatCurrency(pendingReconciliationAmount)}
                </span>
                <span className={styles.nodeOp} style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                  {pendingReconciliationAmount >= 0 ? 'Depósito' : 'Retiro'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Explainer Box */}
        {showExplainers && (
          <div className={styles.explainerBox}>
            <h4>Fórmulas de Conciliación Financiera</h4>
            <p>
              Para mantener la salud de tu tesorería, el sistema concilia de manera transparente la diferencia entre lo que ves en tu banco y tus ganancias reales.
            </p>
            <div className={styles.formulaGrid}>
              <div className={styles.formulaCard}>
                <h5>1. Caja Libre de la Empresa</h5>
                <code>Caja Libre = Flujo de Caja Total - Saldos de Retainer (Garantía)</code>
              </div>
              <div className={styles.formulaCard}>
                <h5>2. Cuadrante de Caja Útil</h5>
                <code>Caja Libre = Utilidad Neta Real - Gastos (Opex) ± Flujo por Conciliar</code>
              </div>
              <div className={styles.formulaCard}>
                <h5>3. Significado de Anomalías</h5>
                <code>Si el Flujo por Conciliar es positivo, significa que ingresó dinero al banco que aún no ha sido facturado o asignado a un cliente.</code>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Side-Drawer Overlay for Client Provisions Profile Edit */}
      {isDrawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setIsDrawerOpen(false)}>
          <div className={styles.drawerContent} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h3>{editingClient ? 'Editar Perfil del Cliente' : 'Directorio de Clientes'}</h3>
              <button className={styles.closeBtn} onClick={() => setIsDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {editingClient ? (
                <form onSubmit={handleSaveClient} className={styles.editForm}>
                  <div className={styles.formGroup}>
                    <label>Nombre Comercial</label>
                    <input
                      type="text"
                      value={editForm.commercialName}
                      onChange={e => setEditForm({ ...editForm, commercialName: e.target.value })}
                      placeholder="e.g. Blue Logistics"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Razón Social (Legal Name)</label>
                    <input
                      type="text"
                      value={editForm.legalName}
                      onChange={e => setEditForm({ ...editForm, legalName: e.target.value })}
                      placeholder="e.g. Blue Ocean Logistics S.A. de C.V."
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Porcentaje de Comisión (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.commissionPercentage}
                      onChange={e => setEditForm({ ...editForm, commissionPercentage: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Saldo de Garantía / Provisión ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.retainerBalance}
                      onChange={e => setEditForm({ ...editForm, retainerBalance: Number(e.target.value) })}
                    />
                  </div>

                  <div className={styles.formActions}>
                    <button type="button" className={styles.cancelBtn} onClick={() => setEditingClient(null)}>
                      Volver a la lista
                    </button>
                    <button type="submit" className={styles.saveBtn}>
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.clientList}>
                  <p className={styles.subText}>Seleccione una entidad para modificar sus coeficientes y saldos.</p>
                  {processedClients.map(c => (
                    <div key={c.id} className={styles.clientItem} onClick={() => handleOpenDrawer(c)}>
                      <div className={styles.clientInfo}>
                        <strong>{c.commercial_name || c.name}</strong>
                        <span>{c.legal_name || 'Sin Razón Social'}</span>
                      </div>
                      <div className={styles.clientStats}>
                        <span className={styles.balance}>{formatCurrency(c.retainer_balance || 0)}</span>
                        <span className={styles.badge}>{c.commission_percentage || 0}% Comisión</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {renderReconciliationDetailModal()}
    </div>
  );
};
