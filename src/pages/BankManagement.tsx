import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import { ModalAlert } from '../components/ModalAlert';
import type { BankTransaction, InternalCompany, Client } from '../types';
import { StatementParserService } from '../services/statementParser.service';
export type BankType = 'Banorte' | 'BBVA' | 'STP' | 'Convenia' | 'Inbursa';
import { ReconciliationService } from '../services/reconciliation.service';
import { 
  Lock, 
  AlertTriangle, 
  Loader2, 
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles
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
  const { data: transactions, loading, fetchData: fetchTransactions } = useDatabase<BankTransaction>('bank_transactions');

  // Account / Company filter context
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<BankType>('Banorte');

  // OCR/Screenshot states
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'info' | 'success' | 'error' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'info' | 'success' | 'error' | 'confirm', title: string, message: string, onConfirm?: () => void) => {
    setModalConfig({
      isOpen: true,
      type,
      title,
      message,
      onConfirm
    });
  };

  // Parsed grid state
  const [parsedBatch, setParsedBatch] = useState<ParsedTransaction[]>([]);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);

  // Historical ledger state
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
    setActiveUploadFile(null);
    setSystemPayloadId('');
    setParsedBatch([]);
    setPdfPageCount(null);
    setFileSize(null);
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

  // Load PDF.js dynamically from CDN to parse PDF statements
  const loadPdfJs = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
      script.onload = () => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        resolve(pdfjsLib);
      };
      script.onerror = () => reject(new Error('No se pudo cargar la librería PDF.js de Cloudflare CDN.'));
      document.head.appendChild(script);
    });
  };
  const extractTextFromPdf = async (file: File, bank: BankType, onProgress: (pct: number) => void): Promise<{ text: string; pages: number }> => {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress(Math.round((i / pdf.numPages) * 100));
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Group items by Y coordinate (tolerance of 7.0 pt for row alignments)
      const items = textContent.items as any[];
      const lines: { y: number; items: any[] }[] = [];
      
      for (const item of items) {
        if (!item.str || item.str.trim() === '') continue;
        
        const x = item.transform[4];
        const y = item.transform[5];
        
        let foundLine = lines.find(l => Math.abs(l.y - y) < 7.0);
        if (!foundLine) {
          foundLine = { y, items: [] };
          lines.push(foundLine);
        }
        
        let str = item.str;
        if (bank === 'Inbursa' && str.includes('$')) {
          if (x <= 460) {
            str = '-' + str;
          } else if (x <= 530) {
            str = '+' + str;
          } else {
            str = '[S]' + str;
          }
        }
        
        foundLine.items.push({ x, width: item.width || 0, str });
      }
      
      // Sort lines descending (from top of page to bottom)
      lines.sort((a, b) => b.y - a.y);
      
      let pageText = '';
      for (const line of lines) {
        let lineStr = '';

        if (bank === 'BBVA') {
          // Strict 5-column boundary mapping for BBVA
          const cols = ['', '', '', '', ''];
          line.items.sort((a, b) => a.x - b.x);

          for (const item of line.items) {
            let colIndex = 4;
            if (item.x < 90) colIndex = 0;
            else if (item.x < 310) colIndex = 1;
            else if (item.x < 375) colIndex = 2;
            else if (item.x < 445) colIndex = 3;

            if (cols[colIndex]) {
              cols[colIndex] += ' ' + item.str;
            } else {
              cols[colIndex] = item.str;
            }
          }
          lineStr = cols.join('\t');
        } else if (bank === 'Convenia') {
          // Strict 7-column boundary mapping for Convenia
          const cols = ['', '', '', '', '', '', ''];
          line.items.sort((a, b) => a.x - b.x);
          
          for (const item of line.items) {
            let colIdx = 6;
            if (item.x < 60) colIdx = 0;
            else if (item.x < 133) colIdx = 1;
            else if (item.x < 280) colIdx = 2;
            else if (item.x < 380) colIdx = 3;
            else if (item.x < 430) colIdx = 4;
            else if (item.x < 500) colIdx = 5;

            if (cols[colIdx]) {
              cols[colIdx] += ' ' + item.str;
            } else {
              cols[colIdx] = item.str;
            }
          }
          lineStr = cols.join('\t');
        } else {
          // Standard tab-gap logic for other banks
          line.items.sort((a, b) => a.x - b.x);
          for (let k = 0; k < line.items.length; k++) {
            const item = line.items[k];
            if (k > 0) {
              const prev = line.items[k - 1];
              const gap = item.x - (prev.x + prev.width);
              
              if (gap > 20.0) {
                lineStr += '\t';
              } else if (gap > 3.0) {
                lineStr += ' ';
              } else {
                if (gap > 1.0 && !prev.str.endsWith(' ') && !item.str.startsWith(' ')) {
                  lineStr += ' ';
                }
              }
            }
            lineStr += item.str;
          }
        }
        pageText += lineStr + '\n';
      }
      
      fullText += pageText + '\n';
    }
    return { text: fullText, pages: pdf.numPages };
  };;

  const extractTextFromCsv = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo CSV.'));
      reader.readAsText(file, 'utf-8');
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processRealOCR = async (file: File) => {
    setActiveUploadFile(file.name);
    setFileSize(formatFileSize(file.size));
    setPdfPageCount(null);

    const randomNum = Math.floor(Math.random() * 900) + 100;
    const alphaSuffix = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'][Math.floor(Math.random() * 4)];
    setSystemPayloadId(`BXC-${randomNum}-${alphaSuffix}`);

    setIsProcessing(true);
    setProcessingProgress(0);
    setParsedBatch([]);

    try {
      let parsedTransactions: ParsedTransaction[] = [];

      if (selectedBank === 'STP') {
        if (!file.name.toLowerCase().endsWith('.csv')) {
          throw new Error('Para STP debe subir un archivo de formato CSV (.csv).');
        }
        const csvText = await extractTextFromCsv(file);
        parsedTransactions = StatementParserService.parseSTP(csvText);
      } else {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          throw new Error(`Para ${selectedBank} debe subir un archivo de formato PDF (.pdf).`);
        }
        const { text, pages } = await extractTextFromPdf(file, selectedBank, (pct) => {
          setProcessingProgress(pct);
        });
        setPdfPageCount(pages);

        // Run specific parser
        switch (selectedBank) {
          case 'Banorte':
            parsedTransactions = StatementParserService.parseBanorte(text);
            break;
          case 'BBVA':
            parsedTransactions = StatementParserService.parseBBVA(text);
            break;
          case 'Convenia':
            parsedTransactions = StatementParserService.parseConvenia(text);
            break;
          case 'Inbursa':
            parsedTransactions = StatementParserService.parseInbursa(text);
            break;
          default:
            throw new Error(`Banco no soportado: ${selectedBank}`);
        }
      }

      setParsedBatch(parsedTransactions);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[BankManagement] Ingestion failed:', message);
      showAlert('error', 'Error de Procesamiento', `No se pudo extraer la información del estado de cuenta: ${message}`);
      setActiveUploadFile(null);
      setSystemPayloadId('');
      setPdfPageCount(null);
      setFileSize(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processRealOCR(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processRealOCR(file);
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
      showAlert('error', 'Sin Transacciones', 'No hay transacciones extraídas para confirmar.');
      return;
    }

    if (!selectedCompanyId) {
      showAlert('error', 'Selección Requerida', 'Seleccione un perfil de empresa bancario primero.');
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

      showAlert('success', 'Ingestión Exitosa', `Se han ingestado y procesado ${parsedBatch.length} registros bancarios exitosamente.`);
      
      // Clean workspace
      setParsedBatch([]);
      setActiveUploadFile(null);
      setSystemPayloadId('');
      setPdfPageCount(null);
      setFileSize(null);
      loadTransactions();
    } catch (err: any) {
      console.error('Error committing transactions:', err);
      showAlert('error', 'Error de Ingestión', `Error al persistir transacciones: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(Math.abs(amount));
  };



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
          <h1 className={styles.pageTitle}>Espacio de Ingestión Bancaria</h1>
          <p className={styles.pageSub}>Conciliación y emparejamiento manual de cuentas internas.</p>
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
                  {c.name} - Cuentas
                </option>
              ))}
            </select>
          </div>

          <div className={styles.selectWrapper}>
            <select 
              value={selectedBank} 
              onChange={e => setSelectedBank(e.target.value as BankType)}
              className={styles.bankSelect}
            >
              <option value="Banorte">Banorte</option>
              <option value="BBVA">BBVA</option>
              <option value="STP">STP</option>
              <option value="Convenia">Convenia</option>
              <option value="Inbursa">Inbursa</option>
            </select>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileInput} 
            accept={selectedBank === 'STP' ? '.csv' : '.pdf'} 
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
              CAPTURA DE PORTAL BANCARIO
            </span>
            {systemPayloadId && (
              <span className={styles.payloadId}>ID: {systemPayloadId}</span>
            )}
          </div>

          <div className={styles.paneBody}>
            {isProcessing ? (
              <div className={styles.processingOverlay}>
                <Loader2 size={36} className={styles.loader} />
                <h3>Procesando Estado de Cuenta</h3>
                <p>Extrayendo metadatos del documento bancario...</p>
                <div className={styles.progressContainer}>
                  <div 
                    className={styles.progressBar} 
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
              </div>
            ) : activeUploadFile ? (
              <div className={styles.filePreviewCard}>
                <div className={styles.previewIconContainer}>
                  <FileText size={64} className={styles.previewFileIcon} />
                </div>
                <div className={styles.previewInfo}>
                  <h4 className={styles.fileName}>{activeUploadFile}</h4>
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Tamaño:</span>
                      <span className={styles.metaValue}>{fileSize || 'Desconocido'}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Banco:</span>
                      <span className={styles.metaValue}>{selectedBank}</span>
                    </div>
                    {pdfPageCount !== null && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Páginas:</span>
                        <span className={styles.metaValue}>{pdfPageCount}</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.statusBadge}>
                    <CheckCircle2 size={14} className={styles.badgeIcon} />
                    Documento Leído Exitosamente
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.changeFileButton}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Cambiar Archivo
                </button>
              </div>
            ) : (
              <div 
                className={`${styles.dropZone} ${isDragActive ? styles.dragActive : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText size={48} className={styles.uploadIcon} />
                <h3>Arrastre y suelte su archivo aquí</h3>
                <p>O haga clic para examinar archivos. Formatos aceptados: PDF (Banorte, BBVA, Convenia, Inbursa) y CSV (STP).</p>
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
              FLUJO DE VISTA PREVIA PROCESADA
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
                              {c.legal_name || c.name}
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
                <span>Lote: <strong>{parsedBatch.length} transacciones</strong></span>
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
          <h3 className={styles.ledgerTitle}>HISTORIAL DE TRANSACCIONES</h3>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className={styles.ledgerLoading}>
                    <Loader2 className={styles.spin} size={20} />
                    <span>Cargando transacciones...</span>
                  </td>
                </tr>
              ) : paginatedTxs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.ledgerEmpty}>
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
      <ModalAlert 
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
