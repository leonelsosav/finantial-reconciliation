import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import type { BankTransaction, InternalCompany } from '../types';
import { 
  Upload, 
  Lock, 
  Edit, 
  Trash2, 
  Copy, 
  Plus, 
  AlertTriangle, 
  MoreVertical, 
  ShieldCheck, 
  Loader2, 
  FileImage,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import styles from './BankManagement.module.scss';

interface RapidRow {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: string;
}

export const BankManagement = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Role wall: accessible to owner and auditor
  const isAuthorized = profile?.role === 'owner' || profile?.role === 'auditor';

  // Supabase hooks
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  const { data: transactions, loading, fetchData: fetchTransactions, updateRecord, deleteRecord } = useDatabase<BankTransaction>('bank_transactions');

  // Account / Company filter context
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  // Screenshot Upload pane states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [activeUploadFile, setActiveUploadFile] = useState<string | null>(null);
  const [systemPayloadId, setSystemPayloadId] = useState<string>('');

  // Draggable split-pane width (in percentage)
  const [splitWidth, setSplitWidth] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Rapid entry grid state
  const [rapidRows, setRapidRows] = useState<RapidRow[]>([
    { id: '1', date: '', description: '', reference: '', amount: '' }
  ]);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Historical ledger state
  const [menuOpenRowId, setMenuOpenRowId] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Fetch companies initially
  useEffect(() => {
    if (!isAuthorized) return;
    fetchCompanies();
  }, [isAuthorized, fetchCompanies]);

  // Set default company select context
  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      // Default to user's assigned company or first company
      const defaultId = profile?.internal_company_id || companies[0].id;
      setSelectedCompanyId(defaultId);
    }
  }, [companies, selectedCompanyId, profile]);

  // Load transaction history when company context changes
  const loadTransactions = () => {
    if (selectedCompanyId) {
      fetchTransactions({
        filters: [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }],
        sort: { column: 'transaction_date', direction: 'desc' }
      });
    }
  };

  useEffect(() => {
    loadTransactions();
    // Clear states when company switches
    setCaptureUrl(null);
    setActiveUploadFile(null);
    setSystemPayloadId('');
  }, [selectedCompanyId]);

  // Draggable Pane Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const percentage = (relativeX / containerRect.width) * 100;
      
      // Enforce bounds between 20% and 80%
      if (percentage >= 20 && percentage <= 80) {
        setSplitWidth(percentage);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isResizing]);

  // Screenshot Upload Handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setCaptureUrl(url);
      setActiveUploadFile(file.name);
      
      // Generate system payload ID (e.g., BXC-992-ALPHA)
      const randomNum = Math.floor(Math.random() * 900) + 100;
      const alphaSuffix = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'][Math.floor(Math.random() * 4)];
      setSystemPayloadId(`BXC-${randomNum}-${alphaSuffix}`);
    }
  };

  // Keyboard navigation & grids cell updates
  const updateRowField = (id: string, field: keyof RapidRow, value: string) => {
    setRapidRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string, rowIndex: number, field: keyof RapidRow) => {
    const fieldsOrder: (keyof RapidRow)[] = ['date', 'description', 'reference', 'amount'];
    const currentFieldIndex = fieldsOrder.indexOf(field);

    if (e.key === 'Enter') {
      e.preventDefault();
      // If we are at the amount input of the last row, insert a new row
      if (field === 'amount' && rowIndex === rapidRows.length - 1) {
        const newId = String(Date.now());
        setRapidRows(prev => [...prev, { id: newId, date: '', description: '', reference: '', amount: '' }]);
        
        // Focus first cell of new row in next tick
        setTimeout(() => {
          inputRefs.current[`${newId}-date`]?.focus();
        }, 50);
      } else if (currentFieldIndex < fieldsOrder.length - 1) {
        // Focus next cell in the same row
        const nextField = fieldsOrder[currentFieldIndex + 1];
        inputRefs.current[`${id}-${nextField}`]?.focus();
      }
    } else if (e.key === 'ArrowDown' && rowIndex < rapidRows.length - 1) {
      const nextRowId = rapidRows[rowIndex + 1].id;
      inputRefs.current[`${nextRowId}-${field}`]?.focus();
    } else if (e.key === 'ArrowUp' && rowIndex > 0) {
      const prevRowId = rapidRows[rowIndex - 1].id;
      inputRefs.current[`${prevRowId}-${field}`]?.focus();
    }
  };

  const handleAddRow = () => {
    const newId = String(Date.now());
    setRapidRows(prev => [...prev, { id: newId, date: '', description: '', reference: '', amount: '' }]);
    setTimeout(() => {
      inputRefs.current[`${newId}-date`]?.focus();
    }, 50);
  };

  const handleCopyRow = (row: RapidRow) => {
    const newId = String(Date.now());
    setRapidRows(prev => [...prev, { ...row, id: newId }]);
  };

  const handleDeleteRow = (id: string) => {
    if (rapidRows.length === 1) {
      setRapidRows([{ id: '1', date: '', description: '', reference: '', amount: '' }]);
    } else {
      setRapidRows(prev => prev.filter(r => r.id !== id));
    }
  };

  // Live total calculations
  const totalIngested = useMemo(() => {
    return rapidRows.reduce((sum, r) => {
      const val = parseFloat(r.amount);
      return isNaN(val) ? sum : sum + val;
    }, 0);
  }, [rapidRows]);

  // Parsing date from DD/MM/YY or DD/MM/YYYY into YYYY-MM-DD
  const parseDateInput = (str: string): string => {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) {
        year = '20' + year;
      }
      return `${year}-${month}-${day}`;
    }
    return DateEngine.getLocalYYYYMMDD(new Date());
  };

  // Validate & Commit to Supabase
  const handleValidateAndCommit = async () => {
    // 1. Validation check
    const emptyFieldExists = rapidRows.some(r => !r.date || !r.description || !r.amount);
    if (emptyFieldExists) {
      alert('Error de validación: Asegúrese de que todos los registros tengan Fecha, Descripción y Monto.');
      return;
    }

    if (!selectedCompanyId) {
      alert('Seleccione un perfil de empresa bancario primero.');
      return;
    }

    try {
      // Form payload
      const payload = rapidRows.map(r => ({
        internal_company_id: selectedCompanyId,
        transaction_date: parseDateInput(r.date),
        description: r.description,
        reference_number: r.reference || null,
        amount: parseFloat(r.amount),
        transaction_category: 'client_operation' as const, // default category
        ingestion_source: 'daily_screenshot_assisted',
        evidence_url: activeUploadFile || null,
        is_reconciled: false
      }));

      // Insert batch to Supabase
      const { error } = await supabase.from('bank_transactions').insert(payload);
      if (error) throw error;

      alert(`Se han ingestado ${rapidRows.length} registros bancarios exitosamente.`);
      
      // Clean workspace
      setRapidRows([{ id: String(Date.now()), date: '', description: '', reference: '', amount: '' }]);
      loadTransactions();
    } catch (err: any) {
      console.error('Error committing transactions:', err);
      alert(`Error al persistir transacciones: ${err.message}`);
    }
  };

  // Triple dot menu updates
  const handleUpdateCategory = async (id: string, category: 'client_operation' | 'internal_transfer' | 'corporate_opex') => {
    try {
      await updateRecord(id, { transaction_category: category });
      setMenuOpenRowId(null);
      loadTransactions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleToggleReconciliation = async (id: string, state: boolean) => {
    try {
      await updateRecord(id, { is_reconciled: state });
      setMenuOpenRowId(null);
      loadTransactions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteLedgerRow = async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar esta transacción de forma permanente?')) return;
    try {
      await deleteRecord(id);
      setMenuOpenRowId(null);
      loadTransactions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(Math.abs(amount));
  };

  // Close menus on click outside
  useEffect(() => {
    const handleOutsideClick = () => setMenuOpenRowId(null);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Pagination helper
  const paginatedTxs = useMemo(() => {
    const start = (ledgerPage - 1) * itemsPerPage;
    return transactions.slice(start, start + itemsPerPage);
  }, [transactions, ledgerPage]);

  // Access Wall check
  if (!isAuthorized) {
    return (
      <div className={styles.accessWall}>
        <div className={styles.wallCard}>
          <div className={styles.wallIcon}>
            <AlertTriangle size={48} />
          </div>
          <h2>Acceso Restringido</h2>
          <p>La carga de balances y verificación de estados de cuenta bancarios está restringida a personal de auditoría e interventoría.</p>
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
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.breadcrumbs}>
            <span>Inicio</span>
            <span className={styles.separator}>/</span>
            <span className={styles.activePage}>Gestión de Bancos</span>
          </div>
          <h1 className={styles.pageTitle}>Bank Ingestion Workspace</h1>
          <p className={styles.pageSub}>Manual reconciliation matching for high-security internal accounts.</p>
        </div>

        <div className={styles.actions}>
          <div className={styles.selectWrapper}>
            <select 
              value={selectedCompanyId} 
              onChange={e => setSelectedCompanyId(e.target.value)}
              className={styles.companySelect}
            >
              <option value="">Seleccionar Cuenta...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} - Accounts
                </option>
              ))}
            </select>
          </div>

          <button 
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            <span>CARGAR CAPTURA</span>
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileInput} 
            accept="image/*" 
            className={styles.hiddenInput} 
          />
        </div>
      </div>

      {/* Ingestion Split view */}
      <div className={styles.splitWorkspace} ref={containerRef}>
        
        {/* Left Pane: Visual Screenshot Proof */}
        <section 
          className={styles.capturePane} 
          style={{ flex: `0 0 ${splitWidth}%` }}
        >
          <div className={styles.paneHeader}>
            <span className={styles.paneTitle}>
              <Lock size={12} className={styles.paneTitleIcon} />
              RAW BANK PORTAL CAPTURE
            </span>
            {systemPayloadId && (
              <span className={styles.payloadId}>ID: {systemPayloadId}</span>
            )}
          </div>

          <div className={styles.paneBody}>
            {captureUrl ? (
              <div 
                className={styles.captureImage}
                style={{ backgroundImage: `url(${captureUrl})` }}
              />
            ) : (
              <div className={styles.emptyCapture}>
                <FileImage size={48} className={styles.emptyIcon} />
                <h3>Ninguna Captura Cargada</h3>
                <p>Cargue una captura de pantalla del portal bancario usando el botón superior "Cargar Captura" para utilizar la referencia visual.</p>
              </div>
            )}
          </div>
        </section>

        {/* Draggable handle bar */}
        <div 
          className={`${styles.splitDivider} ${isResizing ? styles.dragging : ''}`}
          onMouseDown={handleMouseDown}
        />

        {/* Right Pane: Rapid Entry Spreadsheet Grid */}
        <section 
          className={styles.entryPane}
          style={{ flex: 1 }}
        >
          <div className={styles.paneHeader}>
            <span className={`${styles.paneTitle} ${styles.primaryAccent}`}>
              <Edit size={12} className={styles.paneTitleIcon} />
              RAPID ENTRY WORKSPACE
            </span>
          </div>

          <div className={styles.entryTableWrapper}>
            <table className={styles.entryTable}>
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Fecha</th>
                  <th>Descripción</th>
                  <th style={{ width: '140px' }}>Referencia</th>
                  <th style={{ width: '130px' }} className={styles.alignRight}>Monto</th>
                  <th style={{ width: '80px' }} className={styles.alignCenter}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {rapidRows.map((row, idx) => (
                  <tr key={row.id}>
                    <td>
                      <input 
                        type="text" 
                        placeholder="DD/MM/YY"
                        value={row.date}
                        ref={el => { inputRefs.current[`${row.id}-date`] = el; }}
                        onChange={e => updateRowField(row.id, 'date', e.target.value)}
                        onKeyDown={e => handleCellKeyDown(e, row.id, idx, 'date')}
                        className={styles.gridInput}
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        placeholder="Nomina/Servicios/Gasto..."
                        value={row.description}
                        ref={el => { inputRefs.current[`${row.id}-description`] = el; }}
                        onChange={e => updateRowField(row.id, 'description', e.target.value)}
                        onKeyDown={e => handleCellKeyDown(e, row.id, idx, 'description')}
                        className={styles.gridInput}
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        placeholder="REF-0000"
                        value={row.reference}
                        ref={el => { inputRefs.current[`${row.id}-reference`] = el; }}
                        onChange={e => updateRowField(row.id, 'reference', e.target.value)}
                        onKeyDown={e => handleCellKeyDown(e, row.id, idx, 'reference')}
                        className={`${styles.gridInput} ${styles.monoText}`}
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        placeholder="0.00"
                        value={row.amount}
                        ref={el => { inputRefs.current[`${row.id}-amount`] = el; }}
                        onChange={e => updateRowField(row.id, 'amount', e.target.value)}
                        onKeyDown={e => handleCellKeyDown(e, row.id, idx, 'amount')}
                        className={`${styles.gridInput} ${styles.monoText} ${styles.alignRight} ${parseFloat(row.amount) >= 0 ? styles.positiveText : styles.negativeText}`}
                      />
                    </td>
                    <td className={styles.alignCenter}>
                      <div className={styles.rowActions}>
                        <button 
                          className={styles.rowBtn}
                          onClick={() => handleCopyRow(row)}
                          title="Duplicar registro"
                        >
                          <Copy size={12} />
                        </button>
                        <button 
                          className={`${styles.rowBtn} ${styles.danger}`}
                          onClick={() => handleDeleteRow(row.id)}
                          title="Eliminar registro"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button 
              className={styles.addRecordBtn}
              onClick={handleAddRow}
            >
              <Plus size={14} />
              <span>Añadir Registro (Enter)</span>
            </button>
          </div>

          <div className={styles.entryFooter}>
            <div className={styles.batchInfo}>
              <span>Lote: <strong>{rapidRows.length} items</strong></span>
              <span className={styles.dividerDot}></span>
              <span>Total Ingestado: <strong className={totalIngested >= 0 ? styles.positiveText : styles.negativeText}>{formatCurrency(totalIngested)}</strong></span>
            </div>
            <button 
              className={styles.commitBtn}
              onClick={handleValidateAndCommit}
            >
              Validate & Commit
            </button>
          </div>
        </section>

      </div>

      {/* Historical Bank Ledger */}
      <section className={styles.ledgerSection}>
        <div className={styles.ledgerHeader}>
          <h3 className={styles.ledgerTitle}>HISTORICAL BANK LEDGER</h3>
          <div className={styles.ledgerBadges}>
            <div className={styles.badgeItem}>
              <span className={`${styles.badgeDot} ${styles.pendingDot}`}></span>
              <span>PENDIENTE</span>
            </div>
            <div className={styles.badgeItem}>
              <span className={`${styles.badgeDot} ${styles.reconciledDot}`}></span>
              <span>CONCILIADO</span>
            </div>
          </div>
        </div>

        <div className={styles.ledgerTableWrapper}>
          <table className={styles.ledgerTable}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Fecha</th>
                <th>Descripción</th>
                <th style={{ width: '150px' }}>Referencia</th>
                <th style={{ width: '150px' }} className={styles.alignRight}>Monto</th>
                <th style={{ width: '100px' }} className={styles.alignCenter}>Categoría</th>
                <th style={{ width: '130px' }} className={styles.alignCenter}>Estado</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className={styles.ledgerLoading}>
                    <Loader2 className={styles.spin} size={20} />
                    <span>Cargando transacciones...</span>
                  </td>
                </tr>
              ) : paginatedTxs.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.ledgerEmpty}>
                    <span>No hay registros financieros en este perfil.</span>
                  </td>
                </tr>
              ) : (
                paginatedTxs.map(tx => (
                  <tr key={tx.id} className={tx.is_reconciled ? '' : styles.pendingRow}>
                    <td className={styles.ledgerDate}>{tx.transaction_date}</td>
                    <td className={styles.ledgerDesc}>{tx.description}</td>
                    <td className={`${styles.ledgerRef} ${styles.monoText}`}>{tx.reference_number || '-'}</td>
                    <td className={`${styles.ledgerAmount} ${styles.monoText} ${tx.amount >= 0 ? styles.positiveText : styles.negativeText}`}>
                      {tx.amount >= 0 ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className={styles.alignCenter}>
                      <span className={`${styles.categoryBadge} ${styles[tx.transaction_category || 'client_operation']}`}>
                        {tx.transaction_category === 'internal_transfer' ? 'Transf. Interna' :
                         tx.transaction_category === 'corporate_opex' ? 'Gasto Corp' : 'Operación'}
                      </span>
                    </td>
                    <td className={styles.alignCenter}>
                      <span className={`${styles.statusPill} ${tx.is_reconciled ? styles.reconciled : styles.pending}`}>
                        {tx.is_reconciled ? 'CONCILIADO' : 'PENDIENTE'}
                      </span>
                    </td>
                    <td className={styles.alignCenter} style={{ position: 'relative' }}>
                      <button 
                        className={styles.menuAnchor}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenRowId(menuOpenRowId === tx.id ? null : tx.id);
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      
                      {menuOpenRowId === tx.id && (
                        <div className={styles.actionMenu} onClick={e => e.stopPropagation()}>
                          <p className={styles.menuTitle}>Categoría Contable</p>
                          <button 
                            onClick={() => handleUpdateCategory(tx.id, 'client_operation')}
                            className={`${styles.menuItem} ${tx.transaction_category === 'client_operation' ? styles.active : ''}`}
                          >
                            Operación de Cliente
                          </button>
                          <button 
                            onClick={() => handleUpdateCategory(tx.id, 'internal_transfer')}
                            className={`${styles.menuItem} ${tx.transaction_category === 'internal_transfer' ? styles.active : ''}`}
                          >
                            Transferencia Interna
                          </button>
                          <button 
                            onClick={() => handleUpdateCategory(tx.id, 'corporate_opex')}
                            className={`${styles.menuItem} ${tx.transaction_category === 'corporate_opex' ? styles.active : ''}`}
                          >
                            Gasto Corporativo
                          </button>

                          <div className={styles.menuDivider}></div>
                          
                          <p className={styles.menuTitle}>Reconciliación</p>
                          <button 
                            onClick={() => handleToggleReconciliation(tx.id, !tx.is_reconciled)}
                            className={styles.menuItem}
                          >
                            {tx.is_reconciled ? 'Cambiar a Pendiente' : 'Forzar Conciliación'}
                          </button>

                          <div className={styles.menuDivider}></div>

                          <button 
                            onClick={() => handleDeleteLedgerRow(tx.id)}
                            className={`${styles.menuItem} ${styles.dangerItem}`}
                          >
                            <Trash2 size={12} className={styles.dangerIcon} />
                            Eliminar Transacción
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Ledger Pagination */}
        <div className={styles.ledgerFooter}>
          <span className={styles.footerSpan}>
            Mostrando {Math.min(transactions.length, ledgerPage * itemsPerPage)} de {transactions.length} registros
          </span>
          <div className={styles.paginationControls}>
            <button 
              className={styles.pagerBtn} 
              disabled={ledgerPage === 1}
              onClick={() => setLedgerPage(prev => Math.max(prev - 1, 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className={styles.currentPageLabel}>{ledgerPage}</span>
            <button 
              className={styles.pagerBtn} 
              disabled={ledgerPage * itemsPerPage >= transactions.length}
              onClick={() => setLedgerPage(prev => prev + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Protocol Memo */}
      <div className={styles.protocolMemo}>
        <ShieldCheck size={16} className={styles.protocolIcon} />
        <p><strong>Protocolo de Captura y Registro (SAT Coherencia):</strong> Todos los registros insertados en este workspace son inyectados con `ingestion_source = 'daily_screenshot_assisted'`. Para mantener la integridad fiscal, las discrepancias en sumas de control con el Libro Mayor del SAT serán reportadas automáticamente al Auditor en Jefe.</p>
      </div>
    </div>
  );
};
