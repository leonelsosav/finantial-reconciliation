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
  X
} from 'lucide-react';
import styles from './Dashboard.module.scss';

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

  // Aggregate stats using financials hook
  const {
    consolidatedTreasury,
    netUtility,
    activeEscrow,
    unreconciledInvoicesCount,
    unreconciledBankTxsCount
  } = useFinancials(filteredBillingRecords, filteredBankTxs, clients);

  const unreconciledCount = unreconciledInvoicesCount + unreconciledBankTxsCount;

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
      const groupClients = clients.filter(c => c.client_group_id === group.id);
      
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
    const ungroupedClients = clients.filter(c => !c.client_group_id);
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
  }, [clientGroups, clients, matrixColumns, filteredBillingRecords]);

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
          .filter(tx => tx.internal_company_id === col.id && tx.transaction_category !== 'internal_transfer')
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      } else {
        const recordsInCol = filteredBillingRecords
          .filter(r => !r.is_invoiced && r.virtual_bucket_label?.toUpperCase() === col.label);
        billed = recordsInCol.reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);
        
        const matchedTxIds = recordsInCol.map(r => r.bank_transaction_id).filter(Boolean) as string[];
        cash = filteredBankTxs
          .filter(tx => matchedTxIds.includes(tx.id))
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
      // 0. Ensure internal companies exist. If not, seed them first.
      let activeCompanies = [...companies];
      if (activeCompanies.length === 0) {
        const { data: newCompanies, error: compErr } = await supabase.from('internal_companies').insert([
          { name: 'Kardex Finanzas S.A. de C.V.', tax_id: 'KAR990812AA1' },
          { name: 'Operadora de Nóminas Alfa', tax_id: 'ONA041218BB2' }
        ]).select();
        if (compErr) throw compErr;
        activeCompanies = newCompanies || [];
      }

      const compAId = activeCompanies[0]?.id;
      const compBId = activeCompanies[1]?.id || compAId;

      if (!compAId) {
        alert('Error: No se pudo obtener o crear una empresa interna para asociar.');
        return;
      }

      // 1. Clean up existing records in cascading order to respect foreign key constraints
      await supabase.from('billing_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_groups').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 2. Insert Client Groups
      const { data: grpData, error: grpError } = await supabase.from('client_groups').insert([
        { group_name: 'Grupo Industrial Aceros' },
        { group_name: 'Consorcio Tecnológico' },
        { group_name: 'Corporativo Retail' }
      ]).select();
      if (grpError) throw grpError;

      const gIndId = grpData.find(g => g.group_name === 'Grupo Industrial Aceros')?.id;
      const gTechId = grpData.find(g => g.group_name === 'Consorcio Tecnológico')?.id;
      const gRetailId = grpData.find(g => g.group_name === 'Corporativo Retail')?.id;

      // 3. Insert Clients linked to groups and companies
      const { data: clientData, error: clientErr } = await supabase.from('clients').insert([
        { 
          name: 'Aceros del Bajío S.A. de C.V.',
          commercial_name: 'Aceros del Bajío',
          legal_name: 'Aceros del Bajío S.A. de C.V.',
          tax_id: 'ABA920801TR3',
          commission_percentage: 4,
          retainer_balance: 1250000,
          client_group_id: gIndId || null,
          internal_company_id: compAId
        },
        { 
          name: 'Metales del Norte S.A. de C.V.',
          commercial_name: 'Metales del Norte',
          legal_name: 'Metales del Norte S.A. de C.V.',
          tax_id: 'MNO951110HR4',
          commission_percentage: 4,
          retainer_balance: 450000,
          client_group_id: gIndId || null,
          internal_company_id: compAId
        },
        { 
          name: 'Tech Solutions Mexico S. de R.L.',
          commercial_name: 'Tech Solutions',
          legal_name: 'Tech Solutions Mexico S. de R.L. de C.V.',
          tax_id: 'TSM080220LA5',
          commission_percentage: 6,
          retainer_balance: 3200000,
          client_group_id: gTechId || null,
          internal_company_id: compBId
        },
        { 
          name: 'Software Express S.A.',
          commercial_name: 'Software Express',
          legal_name: 'Software Express S.A. de C.V.',
          tax_id: 'SEX120405PP6',
          commission_percentage: 5,
          retainer_balance: 850000,
          client_group_id: gTechId || null,
          internal_company_id: compBId
        },
        { 
          name: 'Distribuidora Mayorista S.A.',
          commercial_name: 'Distribuidora Mayorista',
          legal_name: 'Distribuidora Mayorista S.A. de C.V.',
          tax_id: 'DMA020909UU7',
          commission_percentage: 3,
          retainer_balance: 2100000,
          client_group_id: gRetailId || null,
          internal_company_id: compAId
        }
      ]).select();
      if (clientErr) throw clientErr;

      const clientA = clientData.find(c => c.name === 'Aceros del Bajío S.A. de C.V.');
      const clientB = clientData.find(c => c.name === 'Metales del Norte S.A. de C.V.');
      const clientC = clientData.find(c => c.name === 'Tech Solutions Mexico S. de R.L.');
      const clientD = clientData.find(c => c.name === 'Software Express S.A.');
      const clientE = clientData.find(c => c.name === 'Distribuidora Mayorista S.A.');

      const formatOffsetDate = (offsetDays: number) => {
        const d = new Date();
        d.setDate(d.getDate() - offsetDays);
        return DateEngine.getLocalYYYYMMDD(d);
      };

      const demoRecords = [];
      const demoBankTxs = [];

      // 1. Perfect Reconciled Flow (Aceros del Bajío)
      if (clientA) {
        const txId1 = crypto.randomUUID();
        demoBankTxs.push({
          id: txId1,
          internal_company_id: compAId,
          amount: 580000.00,
          transaction_date: formatOffsetDate(2),
          description: 'TRSP SPEI NOMINA ACEROS BAJIO',
          reference_number: 'SPEI8827391',
          is_reconciled: true,
          is_non_invoiced: false,
          transaction_category: 'client_operation',
          ingestion_source: 'daily_screenshot_assisted'
        });
        demoRecords.push({
          id: crypto.randomUUID(),
          client_id: clientA.id,
          internal_company_id: compAId,
          invoice_uuid: crypto.randomUUID(),
          is_invoiced: true,
          virtual_bucket_label: null,
          amount_gross: 580000.00,
          amount_commission: 23200.00,
          amount_net_payroll: 556800.00,
          entry_type: 'payroll_funding',
          description: 'Fondeo de Nómina Quincenal Invoiced',
          operation_date: formatOffsetDate(2),
          is_reconciled: true,
          bank_transaction_id: txId1
        });
      }

      // 2. Mismatched Value Exception (Metales del Norte)
      if (clientB) {
        demoBankTxs.push({
          id: crypto.randomUUID(),
          internal_company_id: compAId,
          amount: 210000.00,
          transaction_date: formatOffsetDate(3),
          description: 'ABONO NOMINA METALES NORTE',
          reference_number: 'SPEI009281',
          is_reconciled: false,
          is_non_invoiced: false,
          transaction_category: 'client_operation',
          ingestion_source: 'daily_screenshot_assisted'
        });
        demoRecords.push({
          id: crypto.randomUUID(),
          client_id: clientB.id,
          internal_company_id: compAId,
          invoice_uuid: crypto.randomUUID(),
          is_invoiced: true,
          virtual_bucket_label: null,
          amount_gross: 215000.00,
          amount_commission: 8600.00,
          amount_net_payroll: 206400.00,
          entry_type: 'payroll_funding',
          description: 'Fondeo de Nómina Blue Log Invoice',
          operation_date: formatOffsetDate(3),
          is_reconciled: false,
          bank_transaction_id: null
        });
      }

      // 3. Missing Document Reference Exception (Tech Solutions Mexico)
      if (clientC) {
        demoBankTxs.push({
          id: crypto.randomUUID(),
          internal_company_id: compBId,
          amount: 1200000.00,
          transaction_date: formatOffsetDate(1),
          description: 'SPEI COMPLETO TECH SOLUTIONS',
          reference_number: 'SPEI553928',
          is_reconciled: false,
          is_non_invoiced: false,
          transaction_category: 'client_operation',
          ingestion_source: 'daily_screenshot_assisted'
        });
      }

      // 4. Orphan Transaction Exception (System Fee)
      demoBankTxs.push({
        id: crypto.randomUUID(),
        internal_company_id: compAId,
        amount: -8500.00,
        transaction_date: formatOffsetDate(4),
        description: 'COMISION MENSUAL BANCA ELECTRONICA BBVA',
        reference_number: 'COM-8822',
        is_reconciled: false,
        is_non_invoiced: false,
        transaction_category: 'corporate_opex',
        ingestion_source: 'daily_screenshot_assisted'
      });

      // 5. Orphan Transaction Exception (Withdrawal)
      demoBankTxs.push({
        id: crypto.randomUUID(),
        internal_company_id: compAId,
        amount: -15000.00,
        transaction_date: formatOffsetDate(5),
        description: 'RETIRO EFECTIVO CAJERO AUTOMATICO SUC 12',
        reference_number: 'ATM-0091',
        is_reconciled: false,
        is_non_invoiced: false,
        transaction_category: 'corporate_opex',
        ingestion_source: 'daily_screenshot_assisted'
      });

      // 6. Auto-Scan Candidate (Software Express)
      if (clientD) {
        demoBankTxs.push({
          id: crypto.randomUUID(),
          internal_company_id: compBId,
          amount: 450000.00,
          transaction_date: formatOffsetDate(1),
          description: 'FONDEO SEMANAL SOFTWARE EXPRESS',
          reference_number: 'SPEI773612',
          is_reconciled: false,
          is_non_invoiced: false,
          transaction_category: 'client_operation',
          ingestion_source: 'daily_screenshot_assisted'
        });
        demoRecords.push({
          id: crypto.randomUUID(),
          client_id: clientD.id,
          internal_company_id: compBId,
          invoice_uuid: crypto.randomUUID(),
          is_invoiced: true,
          virtual_bucket_label: null,
          amount_gross: 450000.00,
          amount_commission: 22500.00,
          amount_net_payroll: 427500.00,
          entry_type: 'payroll_funding',
          description: 'Fondeo de Nómina Semanal Software Express',
          operation_date: formatOffsetDate(1),
          is_reconciled: false,
          bank_transaction_id: null
        });
      }

      // 7. General Operational Transactions (Distribuidora Mayorista)
      if (clientE) {
        const txId5 = crypto.randomUUID();
        demoBankTxs.push({
          id: txId5,
          internal_company_id: compAId,
          amount: 800000.00,
          transaction_date: formatOffsetDate(6),
          description: 'FONDEO NOMINA DISTRIBUIDORA MAYORISTA',
          reference_number: 'SPEI009212',
          is_reconciled: true,
          is_non_invoiced: false,
          transaction_category: 'client_operation',
          ingestion_source: 'daily_screenshot_assisted'
        });
        demoRecords.push({
          id: crypto.randomUUID(),
          client_id: clientE.id,
          internal_company_id: compAId,
          invoice_uuid: crypto.randomUUID(),
          is_invoiced: true,
          virtual_bucket_label: null,
          amount_gross: 800000.00,
          amount_commission: 24000.00,
          amount_net_payroll: 776000.00,
          entry_type: 'payroll_funding',
          description: 'Fondeo de Nómina Distribuidora Invoiced',
          operation_date: formatOffsetDate(6),
          is_reconciled: true,
          bank_transaction_id: txId5
        });

        // Add a payroll dispersal debit to match the outflow
        demoBankTxs.push({
          id: crypto.randomUUID(),
          internal_company_id: compAId,
          amount: -776000.00,
          transaction_date: formatOffsetDate(6),
          description: 'DISPERSION MASIVA NOMINA DISTRIBUIDORA BATCH',
          reference_number: 'DISP000985',
          is_reconciled: true,
          is_non_invoiced: false,
          transaction_category: 'client_operation',
          ingestion_source: 'daily_screenshot_assisted'
        });
      }

      const { error: insBankErr } = await supabase.from('bank_transactions').insert(demoBankTxs);
      if (insBankErr) throw insBankErr;

      const { error: insRecErr } = await supabase.from('billing_records').insert(demoRecords);
      if (insRecErr) throw insRecErr;

      alert('Datos de simulación cargados con éxito.');
      window.location.reload();
    } catch (err: any) {
      console.error('Error loading demo data:', err);
      alert('Error al cargar datos de demo: ' + err.message);
    }
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
          <button className={styles.redirectBtn} onClick={() => navigate('/audit')}>
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
          onClick={() => navigate('/audit')}
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
              {isLoading ? '...' : unreconciledCount}
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
            ) : clients.length === 0 ? (
              <p className={styles.emptyText}>No hay datos de clientes.</p>
            ) : (
              clients.slice(0, 4).map((client) => {
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
            <button className={styles.exportBtn} onClick={handleExportMatrixCSV}>
              <Download size={14} className="mr-1" /> Exportar CSV
            </button>
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
                  {clients.map(c => (
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
    </div>
  );
};
