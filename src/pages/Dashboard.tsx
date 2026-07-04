import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import type { StaffRecord, BankTransaction, Client, InternalCompany } from '../types';
import { 
  TrendingUp, 
  Wallet, 
  AlertTriangle, 
  ArrowRight, 
  Filter, 
  Download,
  Percent
} from 'lucide-react';
import styles from './Dashboard.module.scss';

export const Dashboard = () => {
  const { profile, selectedCompanyId } = useAuth();
  const navigate = useNavigate();

  const { data: records, loading: loadingRecords, fetchData: fetchRecords } = useDatabase<StaffRecord>('staff_records');
  const { data: bankTxs, loading: loadingTxs, fetchData: fetchTxs } = useDatabase<BankTransaction>('bank_transactions');
  const { data: clients, loading: loadingClients, fetchData: fetchClients } = useDatabase<Client>('clients');
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');

  const [timeframe, setTimeframe] = useState<'30days' | '7days' | '90days' | 'currentMonth'>('30days');
  const [statusFilter, setStatusFilter] = useState<'all' | 'reconciled' | 'pending'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const isLoading = loadingRecords || loadingTxs || loadingClients;

  useEffect(() => {
    const options: any = {
      select: '*, clients(name)',
      sort: { column: 'operation_date', direction: 'desc' }
    };
    if (selectedCompanyId) {
      options.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    }
    fetchRecords(options);
  }, [selectedCompanyId, fetchRecords]);

  useEffect(() => {
    const options: any = {
      sort: { column: 'transaction_date', direction: 'desc' }
    };
    if (selectedCompanyId) {
      options.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    }
    fetchTxs(options);
  }, [selectedCompanyId, fetchTxs]);

  useEffect(() => {
    const options: any = {};
    if (selectedCompanyId) {
      options.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    }
    fetchClients(options);
  }, [selectedCompanyId, fetchClients]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const activeCompanyName = useMemo(() => {
    if (!selectedCompanyId) return 'Todas las Entidades';
    const found = companies.find(c => c.id === selectedCompanyId);
    return found ? found.name : 'Cargando...';
  }, [companies, selectedCompanyId]);

  const handleResetDemoData = async () => {
    if (!window.confirm('¿Está seguro de que desea restablecer los datos de demostración? Esto eliminará todas las transacciones bancarias y registros del libro diario.')) {
      return;
    }
    try {
      const { error: error1 } = await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error1) throw error1;

      const { error: error2 } = await supabase.from('staff_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error2) throw error2;

      alert('Datos de demostración restablecidos con éxito.');
      window.location.reload();
    } catch (err: any) {
      console.error('Error resetting demo data:', err);
      alert('Error al restablecer datos: ' + err.message);
    }
  };

  const handleLoadDemoData = async () => {
    if (companies.length === 0 || clients.length === 0) {
      alert('Cargando entidades y clientes. Por favor intente de nuevo en un segundo.');
      return;
    }

    try {
      // Clean existing
      await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('staff_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      const today = new Date();
      const formatOffsetDate = (offsetDays: number) => {
        const d = new Date(today);
        d.setDate(today.getDate() - offsetDays);
        return d.toISOString().split('T')[0];
      };

      const demoRecords = [];
      const demoBankTxs = [];

      const targetClients = clients.slice(0, 3);
      if (targetClients.length === 0) {
        alert('No se encontraron clientes para cargar datos de prueba.');
        return;
      }

      for (let i = 0; i < targetClients.length; i++) {
        const client = targetClients[i];
        const companyId = client.internal_company_id;

        // Pair 1: Reconciled Funding
        const txId1 = crypto.randomUUID();
        const recordId1 = crypto.randomUUID();
        demoBankTxs.push({
          id: txId1,
          internal_company_id: companyId,
          amount: 500000.00,
          transaction_date: formatOffsetDate(10),
          description: `FONDEO RECIBIDO CLIENTE ${client.name.toUpperCase()}`,
          reference_number: `SPEI0092837${i}1`,
          is_reconciled: true,
          is_non_invoiced: false
        });
        demoRecords.push({
          id: recordId1,
          client_id: client.id,
          internal_company_id: companyId,
          amount: 500000.00,
          entry_type: 'funding',
          description: `Fondeo de reserva mensual - Factura F-99${i}`,
          operation_date: formatOffsetDate(10),
          created_by: profile?.id || '00000000-0000-0000-0000-000000000000',
          is_reconciled: true,
          bank_transaction_id: txId1
        });

        // Pair 2: Reconciled Payroll
        const txId2 = crypto.randomUUID();
        const recordId2 = crypto.randomUUID();
        demoBankTxs.push({
          id: txId2,
          internal_company_id: companyId,
          amount: -125000.00,
          transaction_date: formatOffsetDate(5),
          description: `DISPERSION MASIVA NOMINA CLIENTE ${i}`,
          reference_number: `TEF998811${i}2`,
          is_reconciled: true,
          is_non_invoiced: false
        });
        demoRecords.push({
          id: recordId2,
          client_id: client.id,
          internal_company_id: companyId,
          amount: -125000.00,
          entry_type: 'payroll',
          description: `Dispersión Quincenal Colaboradores`,
          operation_date: formatOffsetDate(5),
          created_by: profile?.id || '00000000-0000-0000-0000-000000000000',
          is_reconciled: true,
          bank_transaction_id: txId2
        });

        // Pair 3: Reconciled Commission
        const txId3 = crypto.randomUUID();
        const recordId3 = crypto.randomUUID();
        demoBankTxs.push({
          id: txId3,
          internal_company_id: companyId,
          amount: -15000.00,
          transaction_date: formatOffsetDate(5),
          description: `COMISION POR DISPERSION CLIENTE ${i}`,
          reference_number: `FEE001928${i}3`,
          is_reconciled: true,
          is_non_invoiced: false
        });
        demoRecords.push({
          id: recordId3,
          client_id: client.id,
          internal_company_id: companyId,
          amount: 15000.00,
          entry_type: 'fee',
          description: `Comisión por servicio de dispersión quincenal`,
          operation_date: formatOffsetDate(5),
          created_by: profile?.id || '00000000-0000-0000-0000-000000000000',
          is_reconciled: true,
          bank_transaction_id: txId3
        });

        // Pair 4: Unreconciled / Pending entries (Anomalies)
        demoBankTxs.push({
          id: crypto.randomUUID(),
          internal_company_id: companyId,
          amount: -8500.00,
          transaction_date: formatOffsetDate(2),
          description: `COMISION BANCARIA ANUAL BANORTE`,
          reference_number: `CARGO0192837${i}`,
          is_reconciled: false,
          is_non_invoiced: false
        });

        demoRecords.push({
          id: crypto.randomUUID(),
          client_id: client.id,
          internal_company_id: companyId,
          amount: -45000.00,
          entry_type: 'payroll',
          description: `Reembolso de gastos extraordinarios aprobados`,
          operation_date: formatOffsetDate(1),
          created_by: profile?.id || '00000000-0000-0000-0000-000000000000',
          is_reconciled: false,
          bank_transaction_id: null
        });
      }

      const { error: insertError1 } = await supabase.from('bank_transactions').insert(demoBankTxs);
      if (insertError1) throw insertError1;

      const { error: insertError2 } = await supabase.from('staff_records').insert(demoRecords);
      if (insertError2) throw insertError2;

      alert('Datos de simulación operativa cargados con éxito.');
      window.location.reload();
    } catch (err: any) {
      console.error('Error loading demo data:', err);
      alert('Error al cargar datos de demostración: ' + err.message);
    }
  };

  // Aggregated Metric Cards States
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const totalBankCashFlow = useMemo(() => {
    return bankTxs
      .filter(tx => tx.transaction_date <= todayStr)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
  }, [bankTxs, todayStr]);

  const netUtility = useMemo(() => {
    return records
      .filter(r => r.entry_type === 'fee')
      .reduce((sum, r) => sum + Number(r.amount), 0);
  }, [records]);

  const retainerBalance = useMemo(() => {
    return records.reduce((sum, r) => {
      if (r.entry_type === 'funding') return sum + Number(r.amount);
      if (r.entry_type === 'payroll' || r.entry_type === 'fee') return sum - Number(r.amount);
      return sum;
    }, 0);
  }, [records]);

  const unreconciledCount = useMemo(() => {
    return bankTxs.filter(tx => !tx.is_reconciled).length;
  }, [bankTxs]);

  // Generate chart data dynamically based on timeframe
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
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const filteredTxs = bankTxs.filter(tx => tx.transaction_date >= startDateStr && tx.transaction_date <= todayStr);
    
    filteredTxs.forEach(tx => {
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
      const dateStr = dateObj.toISOString().split('T')[0];
      
      let inflowSum = 0;
      let outflowSum = 0;
      
      for (let k = 0; k < stepDays; k++) {
        const subDate = new Date(dateObj);
        subDate.setDate(dateObj.getDate() + k);
        const subDateStr = subDate.toISOString().split('T')[0];
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

  // Clients Retainer Health tracker
  const retainerHealth = useMemo(() => {
    const health = clients.map(client => {
      const clientRecords = records.filter(r => r.client_id === client.id);
      const funding = clientRecords.filter(r => r.entry_type === 'funding').reduce((sum, r) => sum + Number(r.amount), 0);
      const payroll = clientRecords.filter(r => r.entry_type === 'payroll').reduce((sum, r) => sum + Number(r.amount), 0);
      const fee = clientRecords.filter(r => r.entry_type === 'fee').reduce((sum, r) => sum + Number(r.amount), 0);

      const cap = funding || 100000; 
      const used = payroll + fee;
      const pct = Math.min(Math.round((used / cap) * 100), 100);
      
      let variant: 'primary' | 'success' | 'danger' | 'neutral' = 'neutral';
      if (pct >= 90) variant = 'danger';
      else if (pct >= 50) variant = 'primary';
      else if (pct > 0) variant = 'success';

      return {
        name: client.name,
        pct,
        cap: `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' }).format(cap)} Límite`,
        used: pct >= 90 ? 'Saldo Bajo' : `-${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' }).format(used)} Usado`,
        variant
      };
    });

    return health.sort((a, b) => b.pct - a.pct).slice(0, 4);
  }, [clients, records]);

  // Filter & segment high-volume records (> $5,000)
  const highVolumeRecords = useMemo(() => {
    return records.filter(r => Math.abs(Number(r.amount)) >= 5000);
  }, [records]);

  const filteredRecords = useMemo(() => {
    return highVolumeRecords.filter(r => {
      if (statusFilter === 'reconciled') return r.is_reconciled;
      if (statusFilter === 'pending') return !r.is_reconciled;
      return true;
    });
  }, [highVolumeRecords, statusFilter]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;
    const headers = ['Fecha', 'Entidad', 'Tipo', 'Estado', 'Monto'];
    const rows = filteredRecords.map(r => [
      r.operation_date,
      r.clients?.name || 'Entidad Desconocida',
      r.entry_type === 'funding' ? 'FONDEO_RETAINER' : r.entry_type === 'fee' ? 'AJUSTE_COMISION' : 'DISPERSION_NOMINA',
      r.is_reconciled ? 'Conciliado' : 'Pendiente',
      r.amount.toString()
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Transacciones_Gran_Volumen_${profile?.full_name || 'Owner'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
              {isLoading ? '...' : formatCurrency(totalBankCashFlow)}
            </h2>
            <span className={styles.cardBadge}>+4.2%</span>
          </div>
          <p className={styles.cardSub}>Consolidado de transacciones históricas</p>
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
          <p className={styles.cardSub}>Acumulado de comisiones cobradas</p>
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
              {isLoading ? '...' : formatCurrency(retainerBalance)}
            </h2>
            <span className={`${styles.cardBadge} ${styles.badgeStable}`}>ESTABLE</span>
          </div>
          <p className={styles.cardSub}>Balance neto depositado en garantía</p>
        </div>

        {/* Card 4: Unreconciled Anomalies */}
        <div className={`${styles.metricCard} ${styles.cardDanger}`}>
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
            <span className={`${styles.cardBadge} ${styles.badgeDanger}`}>CRÍTICO</span>
          </div>
          <p className={styles.cardSub}>Acción inmediata requerida</p>
        </div>
      </div>

      {/* Main Body Grid */}
      <div className={styles.dashboardGrid}>
        {/* Daily Cash Inflow vs. Outflow Chart */}
        <section className={styles.chartSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Entradas vs. Salidas Diarias</h3>
              <p className={styles.sectionSub}>Flujos de cuenta liquidados</p>
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
                  {chartDays.filter((_, i) => timeframe === '7days' ? true : i % 2 === 0).map((d, i) => (
                    <span key={i}>{d.day}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Retainer Health Panel */}
        <section className={styles.healthSection}>
          <h3 className={styles.sectionTitle}>Salud de Retainers</h3>
          <p className={styles.sectionSub}>Capacidad y uso acumulado por cliente</p>

          <div className={styles.healthList}>
            {isLoading ? (
              <p className={styles.loadingText}>Cargando salud de retainers...</p>
            ) : retainerHealth.length === 0 ? (
              <p className={styles.emptyText}>No hay datos de clientes.</p>
            ) : (
              retainerHealth.map((item, index) => (
                <div key={index} className={styles.healthItem}>
                  <div className={styles.healthMeta}>
                    <span className={styles.clientName}>{item.name}</span>
                    <span className={styles.healthPct}>{item.pct}%</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div 
                      className={`${styles.progressBar} ${styles[item.variant]}`}
                      style={{ width: `${item.pct}%` }}
                    ></div>
                  </div>
                  <div className={styles.healthDetails}>
                    <span>{item.cap}</span>
                    <span className={item.variant === 'danger' ? styles.lowText : ''}>{item.used}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <button className={styles.viewRetainersBtn} onClick={() => navigate('/ledger')}>
            <span>Ver todos los Retainers de Clientes</span>
            <ArrowRight size={14} />
          </button>
        </section>
      </div>

      {/* Bottom Detail Table: Recent Large Volume Transactions */}
      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>Transacciones Recientes de Gran Volumen</h3>
          <div className={styles.tableActions} style={{ position: 'relative' }}>
            <button className={styles.tableBtn} onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              <Filter size={16} />
            </button>
            {showFilterDropdown && (
              <div className={styles.inlineFilterDropdown}>
                <button 
                  className={`${styles.filterOption} ${statusFilter === 'all' ? styles.activeOption : ''}`}
                  onClick={() => { setStatusFilter('all'); setShowFilterDropdown(false); }}
                >
                  Todos
                </button>
                <button 
                  className={`${styles.filterOption} ${statusFilter === 'reconciled' ? styles.activeOption : ''}`}
                  onClick={() => { setStatusFilter('reconciled'); setShowFilterDropdown(false); }}
                >
                  Conciliado
                </button>
                <button 
                  className={`${styles.filterOption} ${statusFilter === 'pending' ? styles.activeOption : ''}`}
                  onClick={() => { setStatusFilter('pending'); setShowFilterDropdown(false); }}
                >
                  Pendiente
                </button>
              </div>
            )}
            <button className={styles.tableBtn} onClick={handleExportCSV} disabled={filteredRecords.length === 0}>
              <Download size={16} />
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {isLoading ? (
            <p className={styles.loadingText}>Cargando transacciones...</p>
          ) : filteredRecords.length === 0 ? (
            <p className={styles.emptyText}>No se encontraron transacciones de gran volumen.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Entidad</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className={styles.textRight}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.slice(0, 5).map(record => (
                  <tr key={record.id} className={styles.row}>
                    <td className={styles.cellMono}>{record.operation_date}</td>
                    <td className={styles.cellBold}>{record.clients?.name || 'Entidad Desconocida'}</td>
                    <td>
                      <span className={styles.typeBadge}>
                        {record.entry_type === 'funding' 
                          ? 'FONDEO_RETAINER' 
                          : record.entry_type === 'fee' 
                          ? 'AJUSTE_COMISION' 
                          : 'DISPERSION_NOMINA'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.statusCell}>
                        <span className={`${styles.statusDot} ${record.is_reconciled ? styles.dotSuccess : styles.dotDanger}`}></span>
                        <span className={`${styles.statusText} ${record.is_reconciled ? styles.textSuccess : styles.textDanger}`}>
                          {record.is_reconciled ? 'Conciliado' : 'Pendiente'}
                        </span>
                      </div>
                    </td>
                    <td className={`${styles.cellMono} ${styles.textRight} ${styles.cellBold}`}>
                      {formatCurrency(record.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
