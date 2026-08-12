import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { usePeriod } from '../context/PeriodContext';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import type { BankTransaction, BillingRecord, Client } from '../types';
import { 
  AlertTriangle, 
  Loader2, 
  X, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import styles from './Reconciliation.module.scss';

export const Reconciliation = () => {
  const { profile } = useAuth();
  const { startDate, endDate } = usePeriod();
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
  const [showAllInvoices, setShowAllInvoices] = useState<boolean>(false);
  const [forceAdjustmentComment, setForceAdjustmentComment] = useState<string>('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // Operations
  const [isProcessing, setIsProcessing] = useState(false);

  const loadUnreconciledData = () => {
    fetchBank({
      filters: [
        { column: 'transaction_date', operator: 'gte', value: startDate },
        { column: 'transaction_date', operator: 'lte', value: endDate }
      ],
      sort: { column: 'transaction_date', direction: 'desc' }
    });
    fetchBilling({
      filters: [
        { column: 'is_reconciled', operator: 'eq', value: false },
        { column: 'operation_date', operator: 'gte', value: startDate },
        { column: 'operation_date', operator: 'lte', value: endDate }
      ],
      sort: { column: 'created_at', direction: 'desc' }
    });
  };

  // Initial Data Fetching
  useEffect(() => {
    if (!isAuthorized) return;
    fetchClients();
    loadUnreconciledData();
  }, [isAuthorized, startDate, endDate, fetchClients]);


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

  // Prioritized Invoices for matching drawer based on score
  const prioritizedInvoices = useMemo(() => {
    if (!selectedException) return [];

    const txAmount = Math.abs(selectedException.amount);
    const txDateStr = selectedException.transaction_date;
    const txDesc = (selectedException.description || '').toUpperCase();

    return billingRecords
      .filter(bill => !bill.is_canceled)
      .map(bill => {
        const client = clients.find(c => c.id === bill.client_id);
        const clientName = (client?.legal_name || client?.name || '').toUpperCase();

        // 1. Client Match score
        let clientScore = 0;
        if (clientName && (txDesc.includes(clientName) || clientName.includes(txDesc))) {
          clientScore = 100;
        }

        // 2. Amount Match score (exact gross matches deposit, or net matches opex)
        const billAmount = Number(bill.amount_gross || 0);
        const amountDiff = Math.abs(billAmount - txAmount);
        let amountScore = 0;
        if (amountDiff === 0) {
          amountScore = 50;
        } else if (amountDiff < 50) {
          amountScore = 20;
        }

        // 3. Date Match score
        let dateScore = 0;
        if (txDateStr && bill.operation_date) {
          const tDate = DateEngine.parseLocalDate(txDateStr);
          const bDate = DateEngine.parseLocalDate(bill.operation_date);
          const daysDiff = Math.abs((tDate.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff <= 5) {
            dateScore = 30;
          } else if (daysDiff <= 15) {
            dateScore = 15;
          } else if (daysDiff <= 30) {
            dateScore = 5;
          }
        }

        const totalScore = clientScore + amountScore + dateScore;

        return {
          bill,
          client,
          score: totalScore
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [selectedException, billingRecords, clients]);

  const displayedInvoices = useMemo(() => {
    if (showAllInvoices) {
      return prioritizedInvoices;
    }
    // Filter to only show records with some match score (score >= 15)
    const suggestions = prioritizedInvoices.filter(item => item.score >= 15);
    // If no suggestions, fallback to show all
    return suggestions.length > 0 ? suggestions : prioritizedInvoices;
  }, [prioritizedInvoices, showAllInvoices]);

  // Adjustments Drawer Handlers
  const handleOpenDrawer = (tx: BankTransaction) => {
    setSelectedException(tx);
    setSelectedInvoiceId('');
    setShowAllInvoices(false);
    setForceAdjustmentComment('');
  };

  const handleCloseDrawer = () => {
    setSelectedException(null);
    setSelectedInvoiceId('');
  };

  // 1. Force Direct Adjustment (Ajuste Directo)
  const handleForceAdjustment = async () => {
    if (!selectedException) return;
    if (!forceAdjustmentComment.trim()) {
      alert('Por favor ingrese una descripción/concepto para el ajuste forzado.');
      return;
    }

    setIsProcessing(true);
    try {
      const finalDescription = `${forceAdjustmentComment.trim()}${selectedException.description ? ` (${selectedException.description})` : ''}`;

      // Bypasses matching: sets category to corporate_opex, description, and is_reconciled = true
      await updateBank(selectedException.id, {
        transaction_category: 'corporate_opex',
        is_reconciled: true,
        description: finalDescription
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

      {/* Exceptions Area */}
      <div className={styles.exceptionsWorkspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.workspaceTitleGroup}>
            <h4>EXCEPCIONES Y DISCREPANCIAS PENDIENTES</h4>
            {exceptions.length > 0 && (
              <span className={styles.criticalBadge}>{exceptions.length} ELEMENTOS CRÍTICOS</span>
            )}
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
                      <div className={styles.entityName} title={exc.description || undefined}>{exc.description}</div>
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
                <h3>1. Marcar como gasto sin factura</h3>
                <p>Clasifique esta partida como un gasto contable ordinario o egreso sin comprobante fiscal de nómina (ej. tarifas bancarias).</p>
                <div className={styles.inputGroup}>
                  <label htmlFor="forceComment">Descripción/Concepto del Gasto (Requerido)</label>
                  <textarea
                    id="forceComment"
                    rows={2}
                    value={forceAdjustmentComment}
                    onChange={e => setForceAdjustmentComment(e.target.value)}
                    placeholder="Ej. Pago de servicio de comida de la oficina, tarifa de mantenimiento mensual..."
                    className={styles.commentInput}
                  />
                </div>
                <button 
                  className={styles.actionBtn}
                  onClick={handleForceAdjustment}
                  disabled={isProcessing || !forceAdjustmentComment.trim()}
                >
                  {isProcessing ? <Loader2 className={styles.spin} size={14} /> : 'Ajuste Directo (Opex)'}
                </button>
              </div>

              {/* Adjustment Action 2: Link with Partial Variance */}
              <div className={styles.adjustmentBlock}>
                <h3>2. Vincular con pago parcial de factura</h3>
                <p>Vincule esta transacción a una factura XML existente. Reste/asocie la varianza al fondo de garantía (retainer) del cliente.</p>
                
                <div className={styles.selectInvoiceGroup}>
                  <div className={styles.invoiceLabelBar}>
                    <label htmlFor="invoiceSelect">Facturas Pendientes</label>
                    <label className={styles.checkboxLabel}>
                      <input 
                        type="checkbox"
                        checked={showAllInvoices}
                        onChange={e => setShowAllInvoices(e.target.checked)}
                      />
                      Mostrar todas
                    </label>
                  </div>
                  <select 
                    id="invoiceSelect"
                    value={selectedInvoiceId}
                    onChange={e => setSelectedInvoiceId(e.target.value)}
                    className={styles.invoiceSelect}
                  >
                    <option value="">Seleccionar Factura...</option>
                    {displayedInvoices.map(({ bill, client, score }) => {
                      let displayLabel = '';
                      const isSuggested = score >= 15;

                      if (bill.virtual_bucket_label && bill.virtual_bucket_label.includes(':')) {
                        const [parentUuid, numParcialidad] = bill.virtual_bucket_label.split(':');
                        displayLabel = `PAGO: Parcialidad ${numParcialidad} de Factura: ${parentUuid.slice(0, 8)}...${parentUuid.slice(-6)} - Gross: ${formatCurrency(Number(bill.amount_gross))} (${client?.name || 'Cliente desconocido'})`;
                      } else {
                        displayLabel = `FACTURA: ${bill.invoice_uuid || 'XML-S/N'} - Gross: ${formatCurrency(Number(bill.amount_gross))} (${client?.name || 'Cliente desconocido'})`;
                      }

                      if (isSuggested) {
                        displayLabel = `⭐ [SUGERIDA] ${displayLabel}`;
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
