import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import type { BankTransaction, InternalCompany, Client } from '../types';
import { PredictionService } from '../services/prediction.service';
import { ReconciliationService } from '../services/reconciliation.service';
import { 
  Upload, 
  Lock, 
  AlertTriangle, 
  MoreVertical, 
  Loader2, 
  FileImage,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Trash2
} from 'lucide-react';
import styles from './BankManagement.module.scss';

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  lowConfidence: boolean;
  client_id?: string;
}

export const BankManagement = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Role wall: accessible to owner and auditor
  const isAuthorized = profile?.role === 'owner' || profile?.role === 'auditor';

  // Supabase hooks
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  const { data: clients = [], fetchData: fetchClients } = useDatabase<Client>('clients');
  const { data: transactions, loading, fetchData: fetchTransactions, updateRecord, deleteRecord } = useDatabase<BankTransaction>('bank_transactions');

  // Account / Company filter context
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  // OCR/Screenshot states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [activeUploadFile, setActiveUploadFile] = useState<string | null>(null);
  const [systemPayloadId, setSystemPayloadId] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Draggable split-pane width (in percentage)
  const [splitWidth, setSplitWidth] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Parsed grid state
  const [parsedBatch, setParsedBatch] = useState<ParsedTransaction[]>([]);
  const [mockType, setMockType] = useState<'main' | 'missing'>('main');

  // Historical ledger state
  const [menuOpenRowId, setMenuOpenRowId] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Fetch companies and clients initially
  useEffect(() => {
    if (!isAuthorized) return;
    fetchCompanies();
    fetchClients();
  }, [isAuthorized, fetchCompanies, fetchClients]);

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
    setParsedBatch([]);
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

  // File drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const processMockOCR = async (fileName: string) => {
    setActiveUploadFile(fileName);
    
    // Generate system payload ID (e.g., BXC-992-ALPHA)
    const randomNum = Math.floor(Math.random() * 900) + 100;
    const alphaSuffix = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'][Math.floor(Math.random() * 4)];
    setSystemPayloadId(`BXC-${randomNum}-${alphaSuffix}`);
    
    setIsProcessing(true);
    setProcessingProgress(0);
    setParsedBatch([]);

    // Progress simulation
    let currentProgress = 0;
    const interval = setInterval(async () => {
      currentProgress += 10;
      setProcessingProgress(currentProgress);
      if (currentProgress >= 100) {
        clearInterval(interval);
        
        // Use local system date formatted as DD/MM/YYYY
        const todayStr = DateEngine.getLocalYYYYMMDD(new Date());
        const dateParts = todayStr.split('-');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '15/05/2024';

        // Predefined mock statement transactions designed to perfectly align with Vault.tsx
        // - Deposit: +125,000.00 (matches Vault's first invoice)
        // - Fee: -5,000.00 (matches Vault's third invoice)
        // - Withdrawal: -3,000.00 (unmatched opex exception)
        // - Deposit: +72,400.00 (matches Vault's fourth invoice)
        // - Deposit: +45,200.00 (matches Vault's fifth invoice)
        // - Fee: -1,500.00 (matches Vault's sixth invoice)
        // NOTE: Vault's second invoice (+95,000.00) remains unmatched.
        const mockBatch: ParsedTransaction[] = mockType === 'main' ? [
          {
            id: '1',
            date: formattedDate,
            description: 'TRANSFERENCIA INTERBANCARIA SPEI RECIBIDA',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 125000.00,
            lowConfidence: false
          },
          {
            id: '3',
            date: formattedDate,
            description: 'RETIRO EFECTIVO CAJERO AUTOMATICO',
            reference: `ATM-${Math.floor(1000 + Math.random() * 9000)}`,
            amount: -3000.00,
            lowConfidence: false
          },
          {
            id: '4',
            date: formattedDate,
            description: 'TRANSFERENCIA INTERBANCARIA SPEI RECIBIDA',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 72400.00,
            lowConfidence: false
          },
          {
            id: '5',
            date: formattedDate,
            description: 'TRANSFERENCIA INTERBANCARIA SPEI RECIBIDA',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 45200.00,
            lowConfidence: false
          },
          {
            id: '7',
            date: formattedDate,
            description: 'PAGO DE NOMINA SPEI',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: -118750.00,
            lowConfidence: false
          },
          {
            id: '8',
            date: formattedDate,
            description: 'PAGO DE NOMINA SPEI',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: -68780.00,
            lowConfidence: false
          },
          {
            id: '9',
            date: formattedDate,
            description: 'PAGO DE NOMINA SPEI',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: -42940.00,
            lowConfidence: false
          }
        ] : [
          {
            id: '10',
            date: formattedDate,
            description: 'TRANSFERENCIA INTERBANCARIA SPEI RECIBIDA',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 95000.00,
            lowConfidence: false
          },
          {
            id: '11',
            date: formattedDate,
            description: 'PAGO DE NOMINA SPEI',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: -90250.00,
            lowConfidence: false
          },
          {
            id: '12',
            date: formattedDate,
            description: 'TRANSFERENCIA INTERBANCARIA SPEI RECIBIDA',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 5000.00,
            lowConfidence: false
          },
          {
            id: '13',
            date: formattedDate,
            description: 'PAGO DE NOMINA SPEI',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: -4750.00,
            lowConfidence: false
          },
          {
            id: '14',
            date: formattedDate,
            description: 'TRANSFERENCIA INTERBANCARIA SPEI RECIBIDA',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: 3000.00,
            lowConfidence: false
          },
          {
            id: '15',
            date: formattedDate,
            description: 'PAGO DE NOMINA SPEI',
            reference: `SPEI-${Math.floor(10000 + Math.random() * 90000)}`,
            amount: -2850.00,
            lowConfidence: false
          }
        ];
        
        try {
          const enrichedBatch = await Promise.all(
            mockBatch.map(async (row) => {
              const prediction = await PredictionService.predictClientFromDescription(row.description, row.amount);
              return {
                ...row,
                client_id: prediction?.client_id || ''
              };
            })
          );
          setParsedBatch(enrichedBatch);
        } catch (err) {
          console.error('[BankManagement] Prediction failed, using fallback', err);
          setParsedBatch(mockBatch);
        }
        setIsProcessing(false);
      }
    }, 150);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const url = URL.createObjectURL(file);
      setCaptureUrl(url);
      processMockOCR(file.name);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setCaptureUrl(url);
      processMockOCR(file.name);
    }
  };

  // Live total calculations
  const totalInflow = useMemo(() => {
    return parsedBatch.reduce((sum, r) => r.amount > 0 ? sum + r.amount : sum, 0);
  }, [parsedBatch]);

  const totalOutflow = useMemo(() => {
    return parsedBatch.reduce((sum, r) => r.amount < 0 ? sum + r.amount : sum, 0);
  }, [parsedBatch]);

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

  // Commit to Supabase
  const handleValidateAndCommit = async () => {
    if (parsedBatch.length === 0) {
      alert('Error: No hay transacciones extraídas para confirmar.');
      return;
    }

    if (!selectedCompanyId) {
      alert('Seleccione un perfil de empresa bancario primero.');
      return;
    }

    setIsCommitting(true);
    try {
      // Form payload
      const payload = parsedBatch.map(r => ({
        internal_company_id: selectedCompanyId,
        transaction_date: parseDateInput(r.date),
        description: r.description,
        reference_number: r.reference || null,
        amount: r.amount,
        transaction_category: (r.amount < 0 && r.description.includes('HONORARIOS')) ? 'corporate_opex' as const : 'client_operation' as const,
        ingestion_source: 'daily_screenshot_assisted',
        evidence_url: activeUploadFile || null,
        is_reconciled: false
      }));

      // Insert batch to Supabase
      const { data: insertedData, error } = await supabase
        .from('bank_transactions')
        .insert(payload)
        .select('*');

      if (error) throw error;

      // Run reconciliation service for each inserted transaction passing client_id from the UI state
      if (insertedData && insertedData.length > 0) {
        for (let i = 0; i < insertedData.length; i++) {
          const tx = insertedData[i];
          const originalRow = parsedBatch[i];
          if (originalRow && originalRow.client_id) {
            await ReconciliationService.processReconciliationEvent(tx.id, 'bank_transaction', originalRow.client_id);
          }
        }
      }

      alert(`Se han ingestado y procesado ${parsedBatch.length} registros bancarios exitosamente.`);
      
      // Clean workspace
      setParsedBatch([]);
      setCaptureUrl(null);
      setActiveUploadFile(null);
      setSystemPayloadId('');
      loadTransactions();
    } catch (err: any) {
      console.error('Error committing transactions:', err);
      alert(`Error al persistir transacciones: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

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
            onClick={() => {
              setMockType('main');
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
          >
            <Upload size={14} />
            <span>CARGAR CAPTURA PRINCIPAL</span>
          </button>

          <button 
            className={styles.uploadBtn}
            style={{ color: '#6366f1', borderColor: '#c7d2fe' }}
            onClick={() => {
              setMockType('missing');
              setTimeout(() => fileInputRef.current?.click(), 50);
            }}
          >
            <Sparkles size={14} />
            <span>CARGAR TRANS. FALTANTES</span>
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
        
        {/* Left Pane: Drag-and-Drop Area & OCR Loader */}
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
            {isProcessing ? (
              <div className={styles.processingOverlay}>
                <Loader2 size={36} className={styles.loader} />
                <h3>Procesando OCR Vision Engine</h3>
                <p>Extrayendo metadatos de la captura bancaria...</p>
                <div className={styles.progressContainer}>
                  <div 
                    className={styles.progressBar} 
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
              </div>
            ) : captureUrl ? (
              <div 
                className={styles.captureImage}
                style={{ backgroundImage: `url(${captureUrl})` }}
              />
            ) : (
              <div 
                className={`${styles.dropZone} ${isDragActive ? styles.dragActive : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileImage size={48} className={styles.uploadIcon} />
                <h3>Arrastre y suelte su captura de pantalla aquí</h3>
                <p>O haga clic para examinar archivos. Se procesarán y auto-completarán los registros mediante OCR local.</p>
              </div>
            )}
          </div>
        </section>

        {/* Draggable handle bar */}
        <div 
          className={`${styles.splitDivider} ${isResizing ? styles.dragging : ''}`}
          onMouseDown={handleMouseDown}
        />

        {/* Right Pane: Parsed Preview Stream */}
        <section 
          className={styles.entryPane}
          style={{ flex: 1 }}
        >
          <div className={styles.paneHeader}>
            <span className={`${styles.paneTitle} ${styles.primaryAccent}`}>
              <Sparkles size={12} className={styles.paneTitleIcon} />
              PARSED PREVIEW STREAM
            </span>
          </div>

          <div className={styles.entryTableWrapper}>
            {parsedBatch.length === 0 ? (
              <div className={styles.emptyWorkspaceText}>
                {isProcessing ? 'Procesando captura visual...' : 'Esperando captura para extracción de metadatos...'}
              </div>
            ) : (
              <table className={styles.entryTable}>
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Fecha</th>
                    <th>Descripción</th>
                    <th style={{ width: '140px' }}>Referencia</th>
                    <th style={{ width: '180px' }}>Cliente Predicho / Asignado</th>
                    <th style={{ width: '130px' }} className={styles.alignRight}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedBatch.map((row) => (
                    <tr key={row.id}>
                      <td className={row.lowConfidence ? styles.lowConfidenceCell : ''}>
                        {row.date}
                        {row.lowConfidence && (
                          <span className={styles.warningIcon} title="Confianza Baja (82%)">
                            <AlertTriangle size={12} />
                          </span>
                        )}
                      </td>
                      <td>{row.description}</td>
                      <td>
                        <span className={styles.monoText}>{row.reference}</span>
                      </td>
                      <td>
                        <select
                          className={styles.clientSelect}
                          value={row.client_id || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedBatch(prev =>
                              prev.map(item =>
                                item.id === row.id ? { ...item, client_id: val } : item
                              )
                            );
                          }}
                        >
                          <option value="">-- No asignado (Opex/Excepción) --</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`${styles.alignRight} ${row.amount >= 0 ? styles.positiveText : styles.negativeText} ${styles.monoText}`}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span>{row.amount >= 0 ? '+' : '-'}{formatCurrency(row.amount)}</span>
                          {row.amount >= 0 && <CheckCircle2 size={12} className={styles.positiveText} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {parsedBatch.length > 0 && (
            <div className={styles.entryFooter}>
              <div className={styles.batchInfo}>
                <span>Lote: <strong>{parsedBatch.length} items</strong></span>
                <span className={styles.dividerDot}></span>
                <span>Fondeo: <strong className={styles.positiveText}>+{formatCurrency(totalInflow)}</strong></span>
                <span className={styles.dividerDot}></span>
                <span>Retiro: <strong className={styles.negativeText}>-{formatCurrency(totalOutflow)}</strong></span>
              </div>
              <button 
                className={styles.commitBtn}
                onClick={handleValidateAndCommit}
                disabled={isCommitting}
              >
                {isCommitting ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                    <Loader2 size={16} className={styles.spin} />
                    <span>Confirmando...</span>
                  </div>
                ) : (
                  <span>Confirmar y Guardar Lote</span>
                )}
              </button>
            </div>
          )}
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
    </div>
  );
};
