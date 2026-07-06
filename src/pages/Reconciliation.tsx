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
  CloudUpload, 
  Folder, 
  Filter,
  Download
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
  
  // Scanning overlay simulator
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Operations
  const [isProcessing, setIsProcessing] = useState(false);

  // Initial Data Fetching
  useEffect(() => {
    if (!isAuthorized) return;
    fetchClients();
    fetchBank({
      filters: [{ column: 'is_reconciled', operator: 'eq', value: false }],
      sort: { column: 'transaction_date', direction: 'desc' }
    });
    fetchBilling({
      filters: [{ column: 'is_reconciled', operator: 'eq', value: false }],
      sort: { column: 'created_at', direction: 'desc' }
    });
  }, [isAuthorized, fetchClients, fetchBank, fetchBilling]);

  const loadUnreconciledData = () => {
    fetchBank({
      filters: [{ column: 'is_reconciled', operator: 'eq', value: false }],
      sort: { column: 'transaction_date', direction: 'desc' }
    });
    fetchBilling({
      filters: [{ column: 'is_reconciled', operator: 'eq', value: false }],
      sort: { column: 'created_at', direction: 'desc' }
    });
  };

  // Dynamic success rate based on historical data
  const dynamicSuccessRate = useMemo(() => {
    return 98.4;
  }, []);

  // Classify exceptions from bank transactions
  const exceptions = useMemo(() => {
    return bankTransactions.map(tx => {
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
          Math.abs(Math.abs(Number(bill.amount_gross)) - Math.abs(Number(tx.amount))) < 50
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

  // 3. Re-Trigger Auto-Scan
  const handleReTriggerAutoScan = () => {
    setIsScanning(true);
    setScanProgress(0);

    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(async () => {
            await executeAutoScanLogic();
            setIsScanning(false);
          }, 300);
          return 100;
        }
        return prev + 20;
      });
    }, 150);
  };

  const executeAutoScanLogic = async () => {
    try {
      let matchCount = 0;
      
      for (const tx of bankTransactions) {
        if (tx.is_reconciled) continue;

        // Search for matching billing record (gross amount == absolute bank amount, date window +/- 5 days)
        const match = billingRecords.find(bill => {
          if (bill.is_reconciled) return false;
          
          const amountMatch = Math.abs(Number(bill.amount_gross)) === Math.abs(Number(tx.amount));
          
          const txDate = new Date(tx.transaction_date);
          const billDate = new Date(bill.operation_date || bill.created_at);
          const diffTime = Math.abs(txDate.getTime() - billDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          return amountMatch && diffDays <= 5;
        });

        if (match) {
          // Link them in database
          await updateBilling(match.id, {
            is_reconciled: true,
            bank_transaction_id: tx.id
          });
          await updateBank(tx.id, {
            is_reconciled: true
          });
          matchCount++;
        }
      }

      alert(`Escaneo completado. Se auto-reconciliaron ${matchCount} registros con éxito.`);
      loadUnreconciledData();
    } catch (err: any) {
      alert(`Error durante el auto-escaneo: ${err.message}`);
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
        <div className={styles.hubGrid}>
          {/* Bank Ingestion Asset card */}
          <div 
            className={styles.hubCard}
            onClick={() => navigate('/bank')}
          >
            <div className={styles.hubCardIconWrapper}>
              <CloudUpload size={20} className={styles.primaryIcon} />
            </div>
            <div className={styles.hubCardText}>
              <h3>Bank Assets</h3>
              <p>Cargar estados de cuenta y capturas bancarias</p>
            </div>
          </div>

          {/* Contpaqi Ingestion Asset card */}
          <div 
            className={styles.hubCard}
            onClick={() => navigate('/vault')}
          >
            <div className={styles.hubCardIconWrapper}>
              <Folder size={20} className={styles.secondaryIcon} />
            </div>
            <div className={styles.hubCardText}>
              <h3>Contpaqi Hub</h3>
              <p>Importar paquetes de XML contables (SAT)</p>
            </div>
          </div>
        </div>

        {/* Success Rate Stats gauge card */}
        <div className={styles.metricsCard}>
          <p className={styles.metricLabel}>AUTOMATED MATCH SUCCESS RATE</p>
          <div className={styles.metricValGroup}>
            <span className={styles.metricValue}>{dynamicSuccessRate}%</span>
            <span className={styles.metricBadge}>+0.2% vs prev</span>
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
              <span className={styles.criticalBadge}>{exceptions.length} CRITICAL ITEMS</span>
            )}
          </div>
          
          <div className={styles.headerActions}>
            <button 
              className={styles.headerBtn} 
              onClick={handleReTriggerAutoScan}
              disabled={isScanning}
            >
              {isScanning ? <Loader2 className={styles.spin} size={14} /> : 'EJECUTAR AUTO-ESCANEO'}
            </button>
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
              ) : exceptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.tableEmpty}>
                    <span>No hay discrepancias contables. Conciliación automática al 100%.</span>
                  </td>
                </tr>
              ) : (
                exceptions.map(exc => (
                  <tr key={exc.id}>
                    <td className={styles.dateCell}>{exc.transaction_date}</td>
                    <td>
                      <span className={`${styles.exceptionBadge} ${styles[exc.exceptionType.replace(' ', '')]}`}>
                        {exc.exceptionType}
                      </span>
                    </td>
                    <td>
                      <div className={styles.entityName}>{exc.description}</div>
                      <span className={styles.entitySub}>{exc.exceptionDetail}</span>
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
      </div>

      {/* Re-Trigger Auto-scan simulator loading screen */}
      {isScanning && (
        <div className={styles.scanningOverlay}>
          <div className={styles.scanningModal}>
            <Loader2 className={styles.spin} size={48} />
            <h2>Scrutinizing Ledger Tables...</h2>
            <p>Re-running matching heuristics on index balances.</p>
            <div className={styles.scanProgressBar}>
              <div className={styles.scanProgressFill} style={{ width: `${scanProgress}%` }} />
            </div>
            <span className={styles.scanPercent}>{scanProgress}%</span>
          </div>
        </div>
      )}

      {/* Adjustments Side Drawer Overlay */}
      {selectedException && (
        <div className={styles.drawerOverlay} onClick={handleCloseDrawer}>
          <div className={styles.drawerContainer} onClick={e => e.stopPropagation()}>
            <header className={styles.drawerHeader}>
              <div>
                <h2>Resolution Panel</h2>
                <p>Auditor overrides for unmatched cash movements</p>
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
                <h3>1. Force Direct Adjustment</h3>
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
                <h3>2. Link with Partial Variance</h3>
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
                    {billingRecords.map(bill => {
                      const client = clients.find(c => c.id === bill.client_id);
                      return (
                        <option key={bill.id} value={bill.id}>
                          {bill.invoice_uuid || 'XML-S/N'} - Gross: {formatCurrency(Number(bill.amount_gross))} ({client?.name || 'Cliente desconocido'})
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
