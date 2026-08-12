import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import type { BankTransaction, BillingRecord, Client } from '../types';
import { 
  AlertTriangle, 
  Loader2, 
  X, 
  Filter,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import styles from './Reconciliation.module.scss';

export const Reconciliation = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Role wall: accessible to owner and auditor
  const isAuthorized = profile?.role === 'owner' || profile?.role === 'auditor';

  // Supabase Database Hooks
  const { data: bankTransactions, loading: loadingBank, fetchData: fetchBank, updateRecord: updateBank } = useDatabase<BankTransaction>('bank_transactions');
  const { data: billingRecords, loading: loadingBilling, fetchData: fetchBilling, updateRecord: updateBilling } = useDatabase<BillingRecord>('billing_records');
  const { data: clients, fetchData: fetchClients } = useDatabase<Client>('clients');

  // Page States
  const [selectedException, setSelectedException] = useState<BankTransaction | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Operations
  const [isProcessing, setIsProcessing] = useState(false);

  // Initial Data Fetching
  useEffect(() => {
    if (!isAuthorized) return;
    fetchClients();
    fetchBank({
      sort: { column: 'transaction_date', direction: 'desc' }
    });
    fetchBilling({
      filters: [{ column: 'is_reconciled', operator: 'eq', value: false }],
      sort: { column: 'created_at', direction: 'desc' }
    });
  }, [isAuthorized, fetchClients, fetchBank, fetchBilling]);

  const loadUnreconciledData = () => {
    fetchBank({
      sort: { column: 'transaction_date', direction: 'desc' }
    });
    fetchBilling({
      filters: [{ column: 'is_reconciled', operator: 'eq', value: false }],
      sort: { column: 'created_at', direction: 'desc' }
    });
  };

  // Dynamic success rate based on historical data
  const dynamicSuccessRate = useMemo(() => {
    const total = bankTransactions.length;
    if (total === 0) return '100.0';
    const reconciled = bankTransactions.filter(tx => tx.is_reconciled).length;
    return ((reconciled / total) * 100).toFixed(1);
  }, [bankTransactions]);

  // Classify exceptions from bank transactions
  const exceptions = useMemo(() => {
    return bankTransactions
      .filter(tx => !tx.is_reconciled)
      .map(tx => {
        const desc = tx.description?.toUpperCase() || '';
        let exceptionType: 'Orphan Transaction' | 'Missing Invoice' | 'Amount Mismatch' = 'Missing Invoice';
        let exceptionDetail = 'Payment received without XML linkage';
        let severity: 'High' | 'Medium' | 'Low' = 'Medium';

        if (tx.amount < 0) {
          exceptionType = 'Orphan Transaction';
          exceptionDetail = 'Outflow lacking matching opex invoice';
          severity = 'High';
          if (desc.includes('COMISION') || desc.includes('FEE') || desc.includes('IVA') || desc.includes('MANTENIMIENTO')) {
            exceptionDetail = 'System fee - Standalone banking charge';
            severity = 'High';
          } else if (desc.includes('RETIRO') || desc.includes('ATM')) {
            exceptionDetail = 'Cash withdrawal - Missing Receipt';
            severity = 'High';
          }
        } else {
          // Look for close matching billing record (same client/reference or close amount)
          const closeAmountRecord = billingRecords.find(bill => 
            !bill.is_canceled && Math.abs(Math.abs(Number(bill.amount_gross)) - Math.abs(Number(tx.amount))) < 50
          );
          if (closeAmountRecord && Math.abs(Number(closeAmountRecord.amount_gross)) !== Math.abs(Number(tx.amount))) {
            exceptionType = 'Amount Mismatch';
            exceptionDetail = `Bank: $${Math.abs(Number(tx.amount))} vs XML: $${Math.abs(Number(closeAmountRecord.amount_gross))}`;
            severity = 'Low';
          }
        }

        return {
          ...tx,
          exceptionType,
          exceptionDetail,
          severity
        };
      });
  }, [bankTransactions, billingRecords]);

  // Paginated Exceptions
  const paginatedExceptions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return exceptions.slice(startIndex, startIndex + itemsPerPage);
  }, [exceptions, currentPage]);

  // Reset page when exceptions list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [exceptions.length]);

  // Adjustments Drawer Handlers
  const handleOpenDrawer = (tx: BankTransaction) => {
    setSelectedException(tx);
    setSelectedInvoiceId('');
  };

  const handleCloseDrawer = () => {
    setSelectedException(null);
    setSelectedInvoiceId('');
  };

  // 1. Force Direct Adjustment (Ajuste Directo)
  const handleForceAdjustment = async () => {
    if (!selectedException) return;
    setIsProcessing(true);
    try {
      // Bypasses matching: sets category to corporate_opex and is_reconciled = true
      await updateBank(selectedException.id, {
        transaction_category: 'corporate_opex',
        is_reconciled: true
      });

      alert('Ajuste Directo Exitoso: Transacción clasificada como Gasto Corporativo y conciliada.');
      handleCloseDrawer();
      loadUnreconciledData();
    } catch (err: any) {
      alert(`Error al procesar el ajuste forzado: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Link with Partial Variance
  const handleLinkPartialVariance = async () => {
    if (!selectedException || !selectedInvoiceId) {
      alert('Por favor, seleccione una factura de la lista.');
      return;
    }
    
    setIsProcessing(true);
    try {
      const selectedInvoice = billingRecords.find(bill => bill.id === selectedInvoiceId);
      if (!selectedInvoice) throw new Error('Factura no encontrada.');

      // 1. Link invoice to bank transaction
      await updateBilling(selectedInvoice.id, {
        is_reconciled: true,
        bank_transaction_id: selectedException.id
      });

      // 2. Link bank transaction
      await updateBank(selectedException.id, {
        is_reconciled: true
      });

      // 3. Update client retainer cushion balance by amount of cash received
      const client = clients.find(c => c.id === selectedInvoice.client_id);
      if (client) {
        const amountReceived = Math.abs(Number(selectedException.amount));
        const newBalance = Number(client.retainer_balance || 0) + amountReceived;
        
        const { error: clientErr } = await supabase
          .from('clients')
          .update({ retainer_balance: newBalance })
          .eq('id', client.id);
        
        if (clientErr) throw clientErr;
      }

      alert('Vinculación por Varianza Exitosa: Factura enlazada y fondo de garantía del cliente actualizado.');
      handleCloseDrawer();
      loadUnreconciledData();
    } catch (err: any) {
      alert(`Error al realizar vinculación: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };



  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(Math.abs(amount));
  };

  // Access Wall check
  if (!isAuthorized) {
    return (
      <div className={styles.accessWall}>
        <div className={styles.wallCard}>
          <div className={styles.wallIcon}>
            <AlertTriangle size={48} />
          </div>
          <h2>Acceso Restringido</h2>
          <p>El escritorio de auditoría contable y resolución de discrepancias está reservado para personal de control interno.</p>
          <p className={styles.roleNotice}>Solo usuarios con roles de <strong>Auditor</strong> o <strong>Propietario (Owner)</strong> están autorizados a ingresar.</p>
          <button className={styles.redirectBtn} onClick={() => navigate('/')}>
            Volver al Panel Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Top Header Hub */}
      <section className={styles.topHub}>
        {/* Success Rate Stats gauge card */}
        <div className={styles.metricsCard}>
          <p className={styles.metricLabel}>TASA DE CONCILIACIÓN AUTOMÁTICA</p>
          <div className={styles.metricValGroup}>
            <span className={styles.metricValue}>{dynamicSuccessRate}%</span>
            <span className={styles.metricBadge}>+0.2% vs anterior</span>
          </div>
          <div className={styles.progressRail}>
            <div className={styles.progressBar} style={{ width: `${dynamicSuccessRate}%` }} />
          </div>
        </div>
      </section>

      {/* Exceptions Area */}
      <div className={styles.exceptionsWorkspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.workspaceTitleGroup}>
            <h4>EXCEPCIONES Y DISCREPANCIAS PENDIENTES</h4>
            {exceptions.length > 0 && (
              <span className={styles.criticalBadge}>{exceptions.length} ELEMENTOS CRÍTICOS</span>
            )}
          </div>
          
          <div className={styles.headerActions}>
            <button className={styles.iconActionBtn}><Filter size={16} /></button>
            <button className={styles.iconActionBtn}><Download size={16} /></button>
          </div>
        </header>

        {/* Exceptions Table Grid */}
        <div className={styles.tableWrapper}>
          <table className={styles.exceptionsTable}>
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Fecha</th>
                <th style={{ width: '180px' }}>Tipo de Excepción</th>
                <th>Descripción / Entidad</th>
                <th style={{ width: '150px' }} className={styles.alignRight}>Monto</th>
                <th style={{ width: '100px' }} className={styles.alignCenter}>Gravedad</th>
                <th style={{ width: '100px' }} className={styles.alignRight}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loadingBank || loadingBilling ? (
                <tr>
                  <td colSpan={6} className={styles.tableLoading}>
                    <Loader2 className={styles.spin} size={24} />
                    <span>Buscando inconsistencias y discrepancias...</span>
                  </td>
                </tr>
              ) : paginatedExceptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.tableEmpty}>
                    <span>No hay discrepancias contables. Conciliación automática al 100%.</span>
                  </td>
                </tr>
              ) : (
                paginatedExceptions.map(exc => (
                  <tr key={exc.id}>
                    <td className={styles.dateCell}>{exc.transaction_date}</td>
                    <td>
                      <span className={`${styles.exceptionBadge} ${styles[exc.exceptionType.replace(' ', '')]}`}>
                        {exc.exceptionType === 'Orphan Transaction' 
                          ? 'Transacción Huérfana' 
                          : exc.exceptionType === 'Missing Invoice' 
                          ? 'Factura Faltante' 
                          : 'Diferencia de Monto'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.entityName} title={exc.description}>{exc.description}</div>
                      <span className={styles.entitySub}>
                        {exc.exceptionDetail === 'Payment received without XML linkage' 
                          ? 'Pago recibido sin vínculo XML'
                          : exc.exceptionDetail === 'Outflow lacking matching opex invoice'
                          ? 'Egreso sin factura de gastos correspondiente'
                          : exc.exceptionDetail === 'System fee - Standalone banking charge'
                          ? 'Comisión del sistema - Cargo bancario independiente'
                          : exc.exceptionDetail === 'Cash withdrawal - Missing Receipt'
                          ? 'Retiro de efectivo - Falta comprobante'
                          : exc.exceptionDetail}
                      </span>
                    </td>
                    <td className={`${styles.amountCell} ${exc.amount >= 0 ? styles.positiveText : styles.negativeText}`}>
                      {exc.amount >= 0 ? '+' : '-'}
                      {formatCurrency(exc.amount)}
                    </td>
                    <td className={styles.alignCenter}>
                      <span className={`${styles.severityBar} ${styles[exc.severity]}`}>
                        {exc.severity === 'High' ? 'Alto' : exc.severity === 'Medium' ? 'Medio' : 'Bajo'}
                      </span>
                    </td>
                    <td className={styles.alignRight}>
                      <button 
                        className={styles.resolverBtn}
                        onClick={() => handleOpenDrawer(exc)}
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        {exceptions.length > 0 && (
          <div className={styles.tableFooter}>
            <p className={styles.paginationText}>
              Mostrando {Math.min(exceptions.length, currentPage * itemsPerPage)} de {exceptions.length} excepciones
            </p>
            <div className={styles.paginationButtons}>
              <button 
                className={styles.pagerBtn} 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '12px', fontWeight: 'bold', alignSelf: 'center', padding: '0 8px', color: '#475569' }}>
                {currentPage}
              </span>
              <button 
                className={styles.pagerBtn} 
                disabled={currentPage * itemsPerPage >= exceptions.length}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Adjustments Side Drawer Overlay */}
      {selectedException && (
        <div className={styles.drawerOverlay} onClick={handleCloseDrawer}>
          <div className={styles.drawerContainer} onClick={e => e.stopPropagation()}>
            <header className={styles.drawerHeader}>
              <div>
                <h2>Panel de Resolución</h2>
                <p>Anulaciones de auditores para movimientos de efectivo no coincidentes</p>
              </div>
              <button className={styles.closeBtn} onClick={handleCloseDrawer}>
                <X size={20} />
              </button>
            </header>

            <div className={styles.drawerBody}>
              {/* Selected Exception Details Card */}
              <div className={styles.detailCard}>
                <p className={styles.cardSectionTitle}>DETALLE DE LA EXCEPCIÓN</p>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <label>Concepto / Referencia</label>
                    <span>{selectedException.description}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Fecha del Movimiento</label>
                    <span>{selectedException.transaction_date}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Valor Bancario</label>
                    <span className={selectedException.amount >= 0 ? styles.positiveText : styles.negativeText}>
                      {selectedException.amount >= 0 ? '+' : '-'}
                      {formatCurrency(selectedException.amount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Adjustment Action 1: Force Direct Adjustment */}
              <div className={styles.adjustmentBlock}>
                <h3>1. Ajuste Directo Forzado</h3>
                <p>Clasifique esta partida como un gasto contable ordinario o egreso sin comprobante fiscal de nómina (ej. tarifas bancarias).</p>
                <button 
                  className={styles.actionBtn}
                  onClick={handleForceAdjustment}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className={styles.spin} size={14} /> : 'Ajuste Directo (Opex)'}
                </button>
              </div>

              {/* Adjustment Action 2: Link with Partial Variance */}
              <div className={styles.adjustmentBlock}>
                <h3>2. Vincular con Varianza Parcial</h3>
                <p>Vincule esta transacción a una factura XML existente. Reste/asocie la varianza al fondo de garantía (retainer) del cliente.</p>
                
                <div className={styles.selectInvoiceGroup}>
                  <label htmlFor="invoiceSelect">Facturas Pendientes</label>
                  <select 
                    id="invoiceSelect"
                    value={selectedInvoiceId}
                    onChange={e => setSelectedInvoiceId(e.target.value)}
                    className={styles.invoiceSelect}
                  >
                    <option value="">Seleccionar Factura...</option>
                    {billingRecords.filter(bill => !bill.is_canceled).map(bill => {
                      const client = clients.find(c => c.id === bill.client_id);
                      let displayLabel = '';

                      if (bill.virtual_bucket_label && bill.virtual_bucket_label.includes(':')) {
                        const [parentUuid, numParcialidad] = bill.virtual_bucket_label.split(':');
                        displayLabel = `PAGO: Parcialidad ${numParcialidad} de Factura: ${parentUuid.slice(0, 8)}...${parentUuid.slice(-6)} - Gross: ${formatCurrency(Number(bill.amount_gross))} (${client?.name || 'Cliente desconocido'})`;
                      } else {
                        displayLabel = `FACTURA: ${bill.invoice_uuid || 'XML-S/N'} - Gross: ${formatCurrency(Number(bill.amount_gross))} (${client?.name || 'Cliente desconocido'})`;
                      }

                      return (
                        <option key={bill.id} value={bill.id}>
                          {displayLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <button 
                  className={`${styles.actionBtn} ${styles.secondary}`}
                  onClick={handleLinkPartialVariance}
                  disabled={isProcessing || !selectedInvoiceId}
                >
                  {isProcessing ? <Loader2 className={styles.spin} size={14} /> : 'Vincular y Liquidar Varianza'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
