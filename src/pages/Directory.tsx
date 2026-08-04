import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import type { Client, ClientGroup, InternalCompany, BillingRecord, BankTransaction } from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  ChevronDown, 
  ChevronRight, 
  X, 
  Info, 
  ShieldAlert, 
  CheckCircle2, 
  Trash,
  TrendingUp,
  TrendingDown,
  Edit2,
  Database,
  Loader2
} from 'lucide-react';
import styles from './Directory.module.scss';

export const Directory = () => {
  const { profile, selectedCompanyId } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab state: 'clients' or 'internal'
  const activeTab = searchParams.get('tab') === 'internal' ? 'internal' : 'clients';

  // Role Access Guard
  const isOwner = profile?.role === 'owner';

  // DB Hooks
  const { 
    data: clientGroups, 
    loading: loadingGroups, 
    fetchData: fetchGroups,
    createRecord: createGroup,
    deleteRecord: deleteGroup 
  } = useDatabase<ClientGroup>('client_groups');

  const { 
    data: clients, 
    loading: loadingClients, 
    fetchData: fetchClients,
    createRecord: createClient,
    updateRecord: updateClient,
    deleteRecord: deleteClient 
  } = useDatabase<Client>('clients');

  const { 
    data: companies, 
    loading: loadingCompanies,
    fetchData: fetchCompanies,
    createRecord: createCompany,
    updateRecord: updateCompany,
    deleteRecord: deleteCompany 
  } = useDatabase<InternalCompany>('internal_companies');

  const { 
    data: billingRecords, 
    fetchData: fetchBilling 
  } = useDatabase<BillingRecord>('billing_records');

  const { 
    data: bankTxs, 
    fetchData: fetchTxs 
  } = useDatabase<BankTransaction>('bank_transactions');

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isSeedingData, setIsSeedingData] = useState(false);
  
  // Modals & Drawers States
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [isClientDrawerOpen, setIsClientDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [drawerParentGroup, setDrawerParentGroup] = useState<ClientGroup | null>(null);
  
  const [clientFormCommercialName, setClientFormCommercialName] = useState('');
  const [clientFormLegalName, setClientFormLegalName] = useState('');
  const [clientFormTaxId, setClientFormTaxId] = useState('');
  const [clientFormCommission, setClientFormCommission] = useState('0.00');
  const [clientFormCompanyId, setClientFormCompanyId] = useState('');

  // Internal Company Drawer States
  const [isCompanyDrawerOpen, setIsCompanyDrawerOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<InternalCompany | null>(null);
  const [companyFormName, setFormCompanyName] = useState('');
  const [companyFormTaxId, setFormCompanyTaxId] = useState('');

  // Dropdown active menus
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (isOwner) {
      fetchGroups();
      fetchClients();
      fetchCompanies();
      fetchBilling();
      fetchTxs();
    }
  }, [fetchGroups, fetchClients, fetchCompanies, fetchBilling, fetchTxs, isOwner]);

  // Expand first row by default if loaded
  useEffect(() => {
    if (clientGroups.length > 0 && Object.keys(expandedGroups).length === 0) {
      setExpandedGroups({ [clientGroups[0].id]: true });
    }
  }, [clientGroups, expandedGroups]);

  // Tab switcher helper
  const handleTabChange = (tabName: 'clients' | 'internal') => {
    setSearchParams({ tab: tabName });
    setSearchQuery('');
    setActiveMenuId(null);
  };

  // Local description mapper for internal companies
  const getCompanySubtitle = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('servicios operativos')) return 'Holding Principal';
    if (lower.includes('logística transnacional')) return 'Subsidiaria Norte';
    if (lower.includes('inmobiliaria del centro')) return 'Gestión de Activos';
    if (lower.includes('kardex')) return 'Servicios Financieros';
    if (lower.includes('operadora de nóminas')) return 'Operación de Personal';
    return 'Entidad Operativa';
  };

  // Toggle Group Collapse
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // --- CLIENTS TAB CALCULATIONS ---
  const totalAssets = useMemo(() => {
    return clients.reduce((sum, c) => sum + Number(c.retainer_balance || 0), 0);
  }, [clients]);

  const filteredGroupsWithClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return clientGroups.map(group => ({
        ...group,
        subs: clients.filter(c => c.client_group_id === group.id)
      }));
    }

    return clientGroups.map(group => {
      const groupMatches = group.group_name.toLowerCase().includes(q);
      const subs = clients.filter(c => c.client_group_id === group.id && (
        c.name.toLowerCase().includes(q) ||
        (c.commercial_name && c.commercial_name.toLowerCase().includes(q)) ||
        (c.legal_name && c.legal_name.toLowerCase().includes(q)) ||
        (c.tax_id && c.tax_id.toLowerCase().includes(q))
      ));

      if (groupMatches || subs.length > 0) {
        return {
          ...group,
          subs: groupMatches ? clients.filter(c => c.client_group_id === group.id) : subs
        };
      }
      return null;
    }).filter(Boolean) as (ClientGroup & { subs: Client[] })[];
  }, [clientGroups, clients, searchQuery]);

  // --- INTERNAL COMPANIES TAB CALCULATIONS ---
  const mtdBilled = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return billingRecords.reduce((sum, r) => {
      const date = new Date(r.operation_date || r.created_at);
      if (date >= startOfMonth && date <= now) {
        return sum + Number(r.amount_gross || 0);
      }
      return sum;
    }, 0);
  }, [billingRecords]);

  const pendingAudits = useMemo(() => {
    return bankTxs.filter(tx => !tx.is_reconciled).length;
  }, [bankTxs]);

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.tax_id && c.tax_id.toLowerCase().includes(q))
    );
  }, [companies, searchQuery]);

  const getCompanyBilledTotal = (companyId: string) => {
    return billingRecords
      .filter(r => r.internal_company_id === companyId)
      .reduce((sum, r) => sum + Number(r.amount_gross || 0), 0);
  };

  const getCompanyLiquidBalance = (companyId: string) => {
    return bankTxs
      .filter(t => t.internal_company_id === companyId)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  };

  // --- CLIENT ACTIONS ---
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      await createGroup({ group_name: newGroupName.trim() });
      setNewGroupName('');
      setIsGroupModalOpen(false);
      fetchGroups();
    } catch (err: any) {
      console.error('Error creating group:', err);
      alert('Error al crear el grupo: ' + err.message);
    }
  };

  const handleDeleteGroup = async (group: ClientGroup) => {
    const hasSubs = clients.some(c => c.client_group_id === group.id);
    if (hasSubs) {
      alert('No se puede eliminar un grupo que contiene razones sociales activas. Elimine las razones sociales primero.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar el grupo "${group.group_name}"?`)) {
      return;
    }

    try {
      await deleteGroup(group.id);
      fetchGroups();
    } catch (err: any) {
      console.error('Error deleting group:', err);
      alert('Error al eliminar el grupo: ' + err.message);
    }
  };

  const handleOpenAddClient = (group: ClientGroup) => {
    setEditingClient(null);
    setDrawerParentGroup(group);
    setClientFormCommercialName('');
    setClientFormLegalName('');
    setClientFormTaxId('');
    setClientFormCommission('0.00');
    setClientFormCompanyId(selectedCompanyId || (companies[0]?.id || ''));
    setIsClientDrawerOpen(true);
    setActiveMenuId(null);
  };

  const handleOpenEditClient = (client: Client, group: ClientGroup) => {
    setEditingClient(client);
    setDrawerParentGroup(group);
    setClientFormCommercialName(client.commercial_name || client.name || '');
    setClientFormLegalName(client.legal_name || '');
    setClientFormTaxId(client.tax_id || '');
    setClientFormCommission(Number(client.commission_percentage || 0).toFixed(2));
    setClientFormCompanyId(client.internal_company_id || (companies[0]?.id || ''));
    setIsClientDrawerOpen(true);
    setActiveMenuId(null);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerParentGroup) return;

    if (!clientFormCommercialName.trim()) {
      alert('Por favor ingrese el Nombre Comercial.');
      return;
    }

    const payload: Partial<Client> = {
      name: clientFormCommercialName.trim(),
      commercial_name: clientFormCommercialName.trim(),
      legal_name: clientFormLegalName.trim() || null,
      tax_id: clientFormTaxId.trim().toUpperCase() || null,
      internal_company_id: clientFormCompanyId,
      client_group_id: drawerParentGroup.id
    };

    const newPercentage = Number(clientFormCommission);
    
    if (editingClient) {
      const oldPercentage = Number(editingClient.commission_percentage || 0);
      if (newPercentage !== oldPercentage) {
        const confirmChange = window.confirm(
          `ALERTA DE SEGURIDAD: ¿Está seguro de que desea cambiar el porcentaje de comisión de ${oldPercentage.toFixed(2)}% a ${newPercentage.toFixed(2)}%?\n\nEsta actualización afectará inmediatamente los cálculos de comisiones para todas las transacciones futuras.`
        );
        if (!confirmChange) return;
      }
      payload.commission_percentage = newPercentage;

      try {
        await updateClient(editingClient.id, payload);
        alert('Razón social actualizada con éxito.');
        setIsClientDrawerOpen(false);
        fetchClients();
      } catch (err: any) {
        console.error('Error updating client:', err);
        alert('Error al guardar: ' + err.message);
      }
    } else {
      payload.commission_percentage = newPercentage;
      payload.retainer_balance = 0;

      try {
        await createClient(payload);
        alert('Nueva razón social registrada con éxito.');
        setIsClientDrawerOpen(false);
        fetchClients();
      } catch (err: any) {
        console.error('Error creating client:', err);
        alert('Error al registrar: ' + err.message);
      }
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la razón social "${client.name}"?\n\nEsta acción es irreversible.`)) {
      return;
    }

    try {
      await deleteClient(client.id);
      fetchClients();
    } catch (err: any) {
      console.error('Error deleting client:', err);
      alert('Error al eliminar la razón social: ' + err.message);
    }
  };

  // --- INTERNAL COMPANY ACTIONS ---
  const handleOpenAddCompany = () => {
    setEditingCompany(null);
    setFormCompanyName('');
    setFormCompanyTaxId('');
    setIsCompanyDrawerOpen(true);
  };

  const handleOpenEditCompany = (company: InternalCompany) => {
    setEditingCompany(company);
    setFormCompanyName(company.name);
    setFormCompanyTaxId(company.tax_id || '');
    setIsCompanyDrawerOpen(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyFormName.trim()) {
      alert('Por favor ingrese el Identificador Comercial.');
      return;
    }

    const payload: Partial<InternalCompany> = {
      name: companyFormName.trim(),
      tax_id: companyFormTaxId.trim().toUpperCase() || null
    };

    try {
      if (editingCompany) {
        await updateCompany(editingCompany.id, payload);
        alert('Empresa interna actualizada con éxito.');
      } else {
        await createCompany(payload);
        alert('Empresa interna registrada con éxito.');
      }
      setIsCompanyDrawerOpen(false);
      fetchCompanies();
    } catch (err: any) {
      console.error('Error saving company:', err);
      alert('Error al guardar empresa interna: ' + err.message);
    }
  };

  const handleDeleteCompany = async (company: InternalCompany) => {
    const hasTransactions = bankTxs.some(t => t.internal_company_id === company.id);
    const hasBilling = billingRecords.some(r => r.internal_company_id === company.id);
    const hasClients = clients.some(c => c.internal_company_id === company.id);

    if (hasTransactions || hasBilling || hasClients) {
      alert('ERROR DE INTEGRIDAD: No se puede eliminar la empresa interna porque existen transacciones bancarias, facturas contables o clientes vinculados a ella.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar la empresa interna "${company.name}"?\n\nEsta acción es irreversible.`)) {
      return;
    }

    try {
      await deleteCompany(company.id);
      alert('Empresa interna eliminada con éxito.');
      fetchCompanies();
    } catch (err: any) {
      console.error('Error deleting company:', err);
      alert('Error al eliminar empresa interna: ' + err.message);
    }
  };

  const handleLoadRealCSVData = async () => {
    const confirmed = window.confirm(
      '¿Está seguro de cargar los datos reales? Esto eliminará todos los registros de clientes, grupos de clientes, empresas internas, transacciones bancarias y cargas contables existentes para realizar una importación limpia.'
    );
    if (!confirmed) return;

    setIsSeedingData(true);
    try {
      const commRes = await fetch('/csv/comisiones.csv');
      const clientsRes = await fetch('/csv/clientes.csv');

      if (!commRes.ok || !clientsRes.ok) {
        throw new Error('No se pudieron descargar los archivos CSV de comisiones o clientes. Verifique que estén en la carpeta public/csv.');
      }

      const commBuffer = await commRes.arrayBuffer();
      const clientsBuffer = await clientsRes.arrayBuffer();
      const decoder = new TextDecoder('macintosh');
      const commText = decoder.decode(commBuffer);
      const clientsText = decoder.decode(clientsBuffer);

      const parseCSV = (text: string): string[][] => {
        const lines = text.split(/\r?\n/);
        return lines
          .map(line => {
            const cells: string[] = [];
            let insideQuote = false;
            let currentCell = '';
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                insideQuote = !insideQuote;
              } else if (char === ',' && !insideQuote) {
                cells.push(currentCell);
                currentCell = '';
              } else {
                currentCell += char;
              }
            }
            cells.push(currentCell);
            return cells;
          })
          .filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));
      };

      const commRows = parseCSV(commText);
      const clientsRows = parseCSV(clientsText);

      const commissionsMap: Record<string, number> = {};

      const cleanStr = (str: string): string => {
        if (!str) return '';
        return str
          .toLowerCase()
          .replace(/[áàâä]/gi, 'a')
          .replace(/[éèêë]/gi, 'e')
          .replace(/[íìîï]/gi, 'i')
          .replace(/[óòôö]/gi, 'o')
          .replace(/[úùûü]/gi, 'u')
          .replace(/[ñ]/gi, 'n')
          .replace(/–/g, 'n')
          .replace(/„/g, 'n')
          .replace(/’/g, 'i')
          .replace(/—/g, 'o')
          .replace(/œ/g, 'u')
          .replace(/[.,]/g, '')
          .trim();
      };

      for (let i = 1; i < commRows.length; i++) {
        const row = commRows[i];
        if (row.length >= 2) {
          const rawClientName = row[0];
          const pctStr = row[1].replace('%', '').trim();
          const pct = parseFloat(pctStr);
          if (rawClientName && !isNaN(pct)) {
            commissionsMap[cleanStr(rawClientName)] = pct;
          }
        }
      }

      const getCommissionPercentage = (clientName: string): number => {
        const cleaned = cleanStr(clientName);
        if (!cleaned) return 0;

        const manualLookups: Record<string, number> = {
          'alberto compean': commissionsMap[cleanStr('COPEAN')] ?? 2.0,
          'compean': commissionsMap[cleanStr('COPEAN')] ?? 2.0,
          'arq eddy': commissionsMap[cleanStr('EDDY')] ?? 13.0,
          'arq patatuchi': commissionsMap[cleanStr('PATATUCHI')] ?? 6.0,
          'edith garcia': commissionsMap[cleanStr('EDITH')] ?? 10.0,
          'golxer ovigol': commissionsMap[cleanStr('OVIGOL')] ?? 6.0,
          'manuel nunez avaluo': commissionsMap[cleanStr('MANUEL NUÑEZ')] ?? 6.0,
          'manuel nunez': commissionsMap[cleanStr('MANUEL NUÑEZ')] ?? 6.0,
          'fabricio mendoza': commissionsMap[cleanStr('FABRICIO')] ?? 6.0,
          'lic eduardo borja': commissionsMap[cleanStr('LIC EDUARDO')] ?? 4.5,
          'lic luis diaz': commissionsMap[cleanStr('LIC LUIS DIAZ')] ?? 4.5,
          'lic pedro pablo': commissionsMap[cleanStr('LIC PEDRO PABLO')] ?? 4.5,
          'raul diaz': commissionsMap[cleanStr('RAUL DIRE')] ?? 9.0,
          'jimena bdia': commissionsMap[cleanStr('JIMENA BUEN DIA')] ?? 7.0,
          'suegra fabricio': commissionsMap[cleanStr('SUEGRA FABRIZIO')] ?? 6.0,
          'suegra de fabricio': commissionsMap[cleanStr('FABRICIO')] ?? 6.0,
          'rafael medrano': commissionsMap[cleanStr('MEDRANO')] ?? 12.0,
          'rafael sanz': commissionsMap[cleanStr('SACRAMENTO')] ?? 4.0,
          'neida hna yami': commissionsMap[cleanStr('NEIDA')] ?? 6.0,
          'lic juan carlos': commissionsMap[cleanStr('JUAN CARLOS')] ?? 6.5,
          'edmon jesus garcia': commissionsMap[cleanStr('JESUS GARCIA')] ?? 5.0,
          'edmon': commissionsMap[cleanStr('JESUS GARCIA')] ?? 5.0,
          'jorge garcia': commissionsMap[cleanStr('JESUS GARCIA')] ?? 5.0,
        };

        if (manualLookups[cleaned] !== undefined) {
          return manualLookups[cleaned];
        }

        if (commissionsMap[cleaned] !== undefined) {
          return commissionsMap[cleaned];
        }

        for (const [key, value] of Object.entries(commissionsMap)) {
          if (cleaned.includes(key) || key.includes(cleaned)) {
            return value;
          }
        }

        return 0;
      };

      const { error: errBilling } = await supabase.from('billing_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (errBilling) throw errBilling;

      const { error: errTxs } = await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (errTxs) throw errTxs;

      const { error: errClients } = await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (errClients) throw errClients;

      const { error: errGroups } = await supabase.from('client_groups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (errGroups) throw errGroups;

      await supabase.from('profiles').update({ internal_company_id: null }).neq('id', '00000000-0000-0000-0000-000000000000');

      const { error: errCompanies } = await supabase.from('internal_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (errCompanies) throw errCompanies;

      const uniqueCompaniesMap: Record<string, { name: string; tax_id: string }> = {};
      for (let i = 1; i < clientsRows.length; i++) {
        const row = clientsRows[i];
        if (row.length >= 5) {
          const empName = row[0].trim();
          const rfcEmp = row[1] ? row[1].replace('RFC:', '').trim() : '';
          if (empName && rfcEmp && empName !== 'CANCELADO') {
            uniqueCompaniesMap[rfcEmp] = { name: empName, tax_id: rfcEmp };
          }
        }
      }

      const insertedCompaniesMap: Record<string, string> = {};
      for (const comp of Object.values(uniqueCompaniesMap)) {
        const { data, error } = await supabase
          .from('internal_companies')
          .insert({ name: comp.name, tax_id: comp.tax_id })
          .select('id')
          .single();
        if (error) throw error;
        if (data) {
          insertedCompaniesMap[comp.tax_id] = data.id;
        }
      }

      const getNormalizedClientName = (rfc: string, originalName: string): string => {
        const cleanedRfc = rfc.trim().toUpperCase();
        if (cleanedRfc === 'REVP730606BD3') return 'Notaria 94';
        if (cleanedRfc === 'SACR760704INA') return 'Rafael Sanz';
        if (cleanedRfc === 'ESI181101FI1') return 'ERF';
        if (cleanedRfc === 'DCO1704275ZA') return 'Lic. Luis Diaz';
        return originalName.trim();
      };

      const getNormalizedGroupName = (name: string): string => {
        const cleaned = name.trim();
        const lower = cleaned.toLowerCase();
        if (lower === 'raul buitron') return 'Raul Buitron';
        if (lower === 'ramon solis') return 'Ramon Solis';
        if (lower === 'cadu') return 'CADU';
        return cleaned;
      };

      const uniqueGroups = new Set<string>();
      for (let i = 1; i < clientsRows.length; i++) {
        const row = clientsRows[i];
        if (row.length >= 5) {
          const clientName = row[2].trim();
          let clientRfc = row[3].trim();
          if (clientRfc === 'CCO780104EW') clientRfc = 'CCO780104EW1';
          if (clientRfc === 'FER210219V3') clientRfc = 'FER210219V30';

          if (clientName && clientName !== 'CANCELADO' && clientName !== '') {
            const correctedName = getNormalizedClientName(clientRfc, clientName);
            uniqueGroups.add(getNormalizedGroupName(correctedName));
          }
        }
      }

      const insertedGroupsMap: Record<string, string> = {};
      for (const groupName of uniqueGroups) {
        const { data, error } = await supabase
          .from('client_groups')
          .insert({ group_name: groupName })
          .select('id')
          .single();
        if (error) throw error;
        if (data) {
          insertedGroupsMap[groupName] = data.id;
        }
      }

      const clientsPayloads: any[] = [];
      const processedClientKeys = new Set<string>();

      for (let i = 1; i < clientsRows.length; i++) {
        const row = clientsRows[i];
        if (row.length >= 5) {
          const rfcEmp = row[1] ? row[1].replace('RFC:', '').trim() : '';
          const clientFriendly = row[2].trim();
          let clientRfc = row[3].trim();
          let clientRazon = row[4].trim();

          if (!clientFriendly || clientFriendly === 'CANCELADO' || !clientRfc || clientRfc === 'CANCELADO') {
            continue;
          }

          // Correct cut-off RFC typos
          if (clientRfc === 'CCO780104EW') {
            clientRfc = 'CCO780104EW1';
          }
          if (clientRfc === 'FER210219V3') {
            clientRfc = 'FER210219V30';
          }

          // Discard incorrect Marketing Digital for RFC CMA160510LU4
          if (clientRfc === 'CMA160510LU4' && clientRazon === 'MARKETING DIGITAL') {
            continue;
          }

          // Format CCO780104EW1 to always have 'SA DE CV'
          if (clientRfc === 'CCO780104EW1') {
            clientRazon = 'CHAG CONSTRUCCIONES SA DE CV';
          }

          const correctedClientName = getNormalizedClientName(clientRfc, clientFriendly);
          const normalizedGroupName = getNormalizedGroupName(correctedClientName);

          const companyId = insertedCompaniesMap[rfcEmp];
          const groupId = insertedGroupsMap[normalizedGroupName];

          if (!companyId || !groupId) continue;

          // Unique key: if generic RFC, include clientRazon to preserve public/foreign general clients
          const key = (clientRfc === 'XAXX010101000' || clientRfc === 'XEXX010101000')
            ? `${companyId}-${clientRfc}-${clientRazon}`
            : `${companyId}-${clientRfc}`;

          if (processedClientKeys.has(key)) continue;
          processedClientKeys.add(key);

          const commPct = getCommissionPercentage(normalizedGroupName);

          clientsPayloads.push({
            name: normalizedGroupName,
            internal_company_id: companyId,
            client_group_id: groupId,
            commercial_name: normalizedGroupName,
            legal_name: clientRazon,
            tax_id: clientRfc,
            commission_percentage: commPct,
            retainer_balance: 0.00
          });
        }
      }

      for (let offset = 0; offset < clientsPayloads.length; offset += 50) {
        const chunk = clientsPayloads.slice(offset, offset + 50);
        const { error } = await supabase.from('clients').insert(chunk);
        if (error) throw error;
      }

      const firstCompanyId = Object.values(insertedCompaniesMap)[0];
      if (firstCompanyId && profile) {
        await supabase
          .from('profiles')
          .update({ internal_company_id: firstCompanyId })
          .eq('id', profile.id);
      }

      alert('Base de datos real cargada exitosamente.');

      fetchGroups();
      fetchClients();
      fetchCompanies();
      fetchBilling();
      fetchTxs();

    } catch (err: any) {
      console.error('Error seeding real database:', err);
      alert('Error al cargar la base de datos real: ' + err.message);
    } finally {
      setIsSeedingData(false);
    }
  };

  // Access Wall Guard
  if (!isOwner) {
    return (
      <div className={styles.accessWall}>
        <div className={styles.wallCard}>
          <div className={styles.wallIcon}>
            <ShieldAlert size={48} />
          </div>
          <h2>Acceso Restringido</h2>
          <p>Este Directorio contiene información financiera confidencial de comisiones, balances y entidades.</p>
          <p className={styles.roleNotice}>Solo usuarios con el rol de <strong>Propietario (Owner)</strong> están autorizados a visualizar este panel.</p>
          <button className={styles.redirectBtn} onClick={() => navigate('/')}>
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Hero Header */}
      <div className={styles.heroSection}>
        <div className={styles.heroLeft}>
          <nav className={styles.breadcrumbs}>
            <span>Directorio</span>
            <span className={styles.separator}>/</span>
            <span className={styles.activeLink}>
              {activeTab === 'clients' ? 'Grupos de Clientes' : 'Empresas'}
            </span>
          </nav>
          <h2 className={styles.title}>Clientes & Onboarding</h2>
          <p className={styles.subtitle}>
            {activeTab === 'clients' 
              ? 'Administre la jerarquía institucional y enlace las razones sociales con los grupos de clientes.'
              : 'Gestiona y consulta el estatus fiscal y financiero de las entidades del grupo.'
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className={styles.primaryActionBtn} 
            onClick={handleLoadRealCSVData}
            disabled={isSeedingData}
            style={{ 
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)' 
            }}
          >
            {isSeedingData ? <Loader2 className={styles.spin} size={16} /> : <Database size={16} />}
            <span>{isSeedingData ? 'Cargando...' : 'Cargar DB Real (CSV)'}</span>
          </button>

          {activeTab === 'clients' ? (
            <button 
              className={styles.primaryActionBtn} 
              onClick={() => setIsGroupModalOpen(true)}
            >
              <Plus size={16} />
              <span>Crear Grupo Cliente</span>
            </button>
          ) : (
            <button 
              className={styles.primaryActionBtn} 
              onClick={handleOpenAddCompany}
            >
              <Plus size={16} />
              <span>Registrar Empresa Interna</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div className={styles.tabSelectorBar}>
        <button 
          onClick={() => handleTabChange('clients')}
          className={`${styles.tabBtn} ${activeTab === 'clients' ? styles.active : ''}`}
        >
          CLIENTES
        </button>
        <button 
          onClick={() => handleTabChange('internal')}
          className={`${styles.tabBtn} ${activeTab === 'internal' ? styles.active : ''}`}
        >
          EMPRESAS INTERNAS
        </button>
      </div>

      {/* --- TAB CLIENTS VIEW --- */}
      {activeTab === 'clients' && (
        <>
          {/* Bento Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Activos en Garantía</p>
              <p className={styles.statValuePrimary}>
                ${totalAssets.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Grupos Activos</p>
              <p className={styles.statValue}>
                {clientGroups.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Revisiones de Cumplimiento</p>
              <p className={`${styles.statValue} ${styles.warning}`}>
                03
              </p>
            </div>
            <div className={styles.statCardInteractive}>
              <div className={styles.interactiveContent}>
                <TrendingUp size={20} className={styles.interactiveIcon} />
                <span>MÉTRICAS EN TIEMPO REAL</span>
              </div>
            </div>
          </div>

          {/* Master Directory Grid */}
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Directorio Maestro</h3>
              <div className={styles.headerFilters}>
                <div className={styles.searchWrapper}>
                  <Search size={14} className={styles.searchIcon} />
                  <input 
                    type="text" 
                    placeholder="Buscar RFC, Empresa o Grupo..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
                <button className={styles.filterBtn}>
                  <Filter size={14} />
                  <span>Filtrar</span>
                </button>
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.directoryTable}>
                <thead>
                  <tr>
                    <th>Jerarquía de Entidad</th>
                    <th>Estado</th>
                    <th>Sub-empresas Activas</th>
                    <th className={styles.alignRight}>Fondo Acumulado</th>
                    <th style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingGroups || loadingClients ? (
                    <tr>
                      <td colSpan={5} className={styles.tableLoading}>
                        <span>Cargando directorio...</span>
                      </td>
                    </tr>
                  ) : filteredGroupsWithClients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.tableEmpty}>
                        <span>No se encontraron grupos de clientes o empresas que coincidan.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredGroupsWithClients.map(group => {
                      const isExpanded = !!expandedGroups[group.id];
                      const groupBalance = group.subs.reduce((sum, c) => sum + Number(c.retainer_balance || 0), 0);
                      const isMenuOpen = activeMenuId === group.id;

                      return (
                        <tr key={group.id} className={styles.parentRowWrapper}>
                          <td colSpan={5} className={styles.parentRowContainer}>
                            <div 
                              className={styles.parentRow}
                              onClick={() => toggleGroup(group.id)}
                            >
                              <div className={styles.parentTitleGroup}>
                                {isExpanded ? (
                                  <ChevronDown size={18} className={styles.expandIcon} />
                                ) : (
                                  <ChevronRight size={18} className={styles.expandIcon} />
                                )}
                                <span className={styles.groupName}>{group.group_name}</span>
                              </div>
                              <div className={styles.parentStatus}>
                                <span className={styles.verifiedBadge}>Verificado</span>
                              </div>
                              <div className={styles.parentSubsCount}>
                                {group.subs.length} {group.subs.length === 1 ? 'Razón Social' : 'Razones Sociales'}
                              </div>
                              <div className={`${styles.parentBalance} ${styles.alignRight}`}>
                                ${groupBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div 
                                className={styles.parentActions}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(isMenuOpen ? null : group.id);
                                }}
                              >
                                <MoreVertical size={16} />
                                {isMenuOpen && (
                                  <div className={styles.contextDropdown}>
                                    <button onClick={() => handleOpenAddClient(group)}>
                                      <Plus size={12} />
                                      <span>Agregar Razón Social</span>
                                    </button>
                                    <button onClick={() => handleDeleteGroup(group)} className={styles.dangerAction}>
                                      <Trash size={12} />
                                      <span>Eliminar Grupo</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className={styles.childTableContainer}>
                                {group.subs.length === 0 ? (
                                  <div className={styles.noChildren}>
                                    <span>No hay razones sociales enlazadas. Haga clic en el menú del grupo para agregar una.</span>
                                  </div>
                                ) : (
                                  <table className={styles.childTable}>
                                    <thead>
                                      <tr>
                                        <th>Nombre Comercial</th>
                                        <th>RFC / Razón Social</th>
                                        <th>Comisión (%)</th>
                                        <th className={styles.alignRight}>Fondo de Garantía</th>
                                        <th style={{ width: '80px' }}>Acción</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.subs.map(client => (
                                        <tr key={client.id} className={styles.childRow}>
                                          <td className={styles.childName}>{client.name}</td>
                                          <td>
                                            <div className={styles.rfcGroup}>
                                              <span className={styles.rfcCode}>{client.tax_id || 'SIN RFC'}</span>
                                              {client.legal_name && (
                                                <span className={styles.legalName}>{client.legal_name}</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className={styles.commissionVal}>
                                            {Number(client.commission_percentage || 0).toFixed(2)}%
                                          </td>
                                          <td className={`${styles.retainerVal} ${styles.alignRight}`}>
                                            ${Number(client.retainer_balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </td>
                                          <td className={styles.childActions}>
                                            <button 
                                              className={styles.editBtn}
                                              onClick={() => handleOpenEditClient(client, group)}
                                            >
                                              EDITAR
                                            </button>
                                            <button 
                                              className={styles.deleteSubBtn}
                                              onClick={() => handleDeleteClient(client)}
                                            >
                                              <Trash size={12} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --- TAB INTERNAL COMPANIES VIEW --- */}
      {activeTab === 'internal' && (
        <>
          {/* Bento Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Entidades</p>
              <p className={styles.statValue}>
                {companies.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Facturado (MTD)</p>
              <p className={styles.statValuePrimary}>
                ${mtdBilled.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Pendientes Auditoría</p>
              <p className={`${styles.statValue} ${styles.warning}`}>
                {pendingAudits} <span className={styles.urgencyLabel}>URGENTE</span>
              </p>
            </div>
            <div className={styles.statCardInteractive}>
              <div className={styles.interactiveContent}>
                <TrendingUp size={20} className={styles.interactiveIcon} />
                <span>MÉTRICAS CONSOLIDADAS</span>
              </div>
            </div>
          </div>

          {/* Internal Companies Grid Table */}
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Directorio de Empresas Internas</h3>
              <div className={styles.headerFilters}>
                <div className={styles.searchWrapper}>
                  <Search size={14} className={styles.searchIcon} />
                  <input 
                    type="text" 
                    placeholder="Buscar RFC o Empresa..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
                <button className={styles.filterBtn}>
                  <Filter size={14} />
                  <span>Filtrar</span>
                </button>
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.directoryTable}>
                <thead>
                  <tr>
                    <th>Identificador Comercial</th>
                    <th>RFC / Tax ID</th>
                    <th className={styles.alignRight}>Total Facturado</th>
                    <th className={styles.alignRight}>Saldo Bancario Líquido</th>
                    <th style={{ width: '80px' }} className={styles.alignCenter}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCompanies ? (
                    <tr>
                      <td colSpan={5} className={styles.tableLoading}>
                        <span>Cargando empresas internas...</span>
                      </td>
                    </tr>
                  ) : filteredCompanies.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.tableEmpty}>
                        <span>No se encontraron empresas internas que coincidan.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredCompanies.map(comp => {
                      const billedTotal = getCompanyBilledTotal(comp.id);
                      const liquidBalance = getCompanyLiquidBalance(comp.id);
                      const initialLetter = comp.name.charAt(0).toUpperCase();

                      return (
                        <tr key={comp.id} className={styles.companyRow}>
                          <td className={styles.companyNameCell}>
                            <div className={styles.avatarBox}>
                              {initialLetter}
                            </div>
                            <div className={styles.companyMeta}>
                              <span className={styles.companyNameText}>{comp.name}</span>
                              <span className={styles.companySub}>{getCompanySubtitle(comp.name)}</span>
                            </div>
                          </td>
                          <td className={styles.rfcCell}>
                            {comp.tax_id || 'SIN RFC'}
                          </td>
                          <td className={`${styles.billedCell} ${styles.alignRight}`}>
                            ${billedTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`${styles.balanceCell} ${styles.alignRight}`}>
                            <div className={styles.liquidBalanceWrapper}>
                              <span className={liquidBalance > 0 ? styles.positive : liquidBalance < 0 ? styles.negative : ''}>
                                ${liquidBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {liquidBalance > 0 ? (
                                <TrendingUp size={14} className={styles.trendUpIcon} />
                              ) : liquidBalance < 0 ? (
                                <TrendingDown size={14} className={styles.trendDownIcon} />
                              ) : (
                                <span className={styles.neutralDash}>—</span>
                              )}
                            </div>
                          </td>
                          <td className={styles.companyActionsCell}>
                            <div className={styles.actionIconGroup}>
                              <button 
                                className={styles.iconEditBtn}
                                onClick={() => handleOpenEditCompany(comp)}
                                title="Editar"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                className={styles.iconDeleteBtn}
                                onClick={() => handleDeleteCompany(comp)}
                                title="Eliminar"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --- MODALS & DRAWERS --- */}

      {/* Create Client Group Modal */}
      {isGroupModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Crear Nuevo Grupo de Clientes</h3>
              <button onClick={() => setIsGroupModalOpen(false)} className={styles.closeModalBtn}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Nombre Identificador Maestro (Dueño / Grupo)</label>
                <input 
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ej. ELIAS, CAROLINA..." 
                  className={styles.modalInput}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className={styles.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Guardar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Subsidiary Drawer */}
      {isClientDrawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setIsClientDrawerOpen(false)} />
          <div className={styles.sideDrawer}>
            <div className={styles.drawerHeader}>
              <div>
                <h2>{editingClient ? 'Modificar Razón Social' : 'Agregar Razón Social'}</h2>
                <p>Grupo: {drawerParentGroup?.group_name}</p>
              </div>
              <button className={styles.closeDrawerBtn} onClick={() => setIsClientDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className={styles.drawerForm}>
              <div className={styles.drawerBody}>
                <div className={styles.formItem}>
                  <label>Nombre Comercial</label>
                  <input 
                    type="text" 
                    value={clientFormCommercialName}
                    onChange={(e) => setClientFormCommercialName(e.target.value)}
                    placeholder="Ej. Omega Logistics" 
                    className={styles.drawerInput}
                    required
                  />
                </div>

                <div className={styles.formItem}>
                  <label>Razón Social (Legal)</label>
                  <input 
                    type="text" 
                    value={clientFormLegalName}
                    onChange={(e) => setClientFormLegalName(e.target.value)}
                    placeholder="Ej. Omega Logistics S.A. de C.V." 
                    className={styles.drawerInput}
                  />
                </div>

                <div className={styles.formItem}>
                  <label>RFC / ID Fiscal</label>
                  <input 
                    type="text" 
                    value={clientFormTaxId}
                    onChange={(e) => setClientFormTaxId(e.target.value)}
                    placeholder="Ej. OLO980312TR3" 
                    className={styles.drawerInput}
                  />
                </div>

                <div className={styles.gridFormRow}>
                  <div className={styles.formItem}>
                    <label>Porcentaje Comisión</label>
                    <div className={styles.inputWithUnit}>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        max="100"
                        value={clientFormCommission}
                        onChange={(e) => setClientFormCommission(e.target.value)}
                        placeholder="0.00" 
                        className={styles.drawerInput}
                        required
                      />
                      <span className={styles.unit}>%</span>
                    </div>
                  </div>

                  <div className={styles.formItem}>
                    <label>Cuenta Destino (Interna)</label>
                    <select
                      value={clientFormCompanyId}
                      onChange={(e) => setClientFormCompanyId(e.target.value)}
                      className={styles.drawerSelect}
                      required
                    >
                      {companies.map(comp => (
                        <option key={comp.id} value={comp.id}>
                          {comp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.securityNoteCard}>
                  <h4 className={styles.noteTitle}>
                    <Info size={14} />
                    <span>NOTA DE SEGURIDAD</span>
                  </h4>
                  <p className={styles.noteContent}>
                    Los cambios en comisiones y razones fiscales de clientes quedan registrados en la bitácora de auditoría vinculada a su UID de operador.
                  </p>
                </div>

                <div className={styles.securityEncryptionBanner}>
                  <span className={styles.bannerText}>CANAL DE TRANSACCIÓN ENCRIPTADO</span>
                </div>
              </div>

              <div className={styles.drawerFooter}>
                <button type="button" className={styles.discardBtn} onClick={() => setIsClientDrawerOpen(false)}>
                  Descartar
                </button>
                <button type="submit" className={styles.saveBtn}>
                  <CheckCircle2 size={16} />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Internal Company Onboarding Drawer */}
      {isCompanyDrawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setIsCompanyDrawerOpen(false)} />
          <div className={styles.sideDrawer}>
            <div className={styles.drawerHeader}>
              <div>
                <h2>{editingCompany ? 'Modificar Empresa Interna' : 'Registrar Empresa Interna'}</h2>
                <p>{editingCompany ? 'Edite los parámetros fiscales y comerciales' : 'Añada una nueva razón social al pool corporativo'}</p>
              </div>
              <button className={styles.closeDrawerBtn} onClick={() => setIsCompanyDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className={styles.drawerForm}>
              <div className={styles.drawerBody}>
                <div className={styles.formItem}>
                  <label>Identificador Comercial / Nombre</label>
                  <input 
                    type="text" 
                    value={companyFormName}
                    onChange={(e) => setFormCompanyName(e.target.value)}
                    placeholder="Ej. Servicios Operativos SA" 
                    className={styles.drawerInput}
                    required
                  />
                </div>

                <div className={styles.formItem}>
                  <label>RFC / ID Fiscal (Tax ID)</label>
                  <input 
                    type="text" 
                    value={companyFormTaxId}
                    onChange={(e) => setFormCompanyTaxId(e.target.value)}
                    placeholder="Ej. SOP120304MN3" 
                    className={styles.drawerInput}
                    required
                  />
                </div>

                <div className={styles.securityNoteCard}>
                  <h4 className={styles.noteTitle}>
                    <Info size={14} />
                    <span>NOTA DE CUMPLIMIENTO FISCAL</span>
                  </h4>
                  <p className={styles.noteContent}>
                    El RFC proporcionado debe coincidir exactamente con el RFC Emisor de las facturas XML cargadas en la bóveda para permitir el auto-reconocimiento del flujo.
                  </p>
                </div>
              </div>

              <div className={styles.drawerFooter}>
                <button type="button" className={styles.discardBtn} onClick={() => setIsCompanyDrawerOpen(false)}>
                  Descartar
                </button>
                <button type="submit" className={styles.saveBtn}>
                  <CheckCircle2 size={16} />
                  <span>Guardar Empresa</span>
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
