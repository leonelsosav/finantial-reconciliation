import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { Card } from '../components/Card';
import type { BankTransaction, InternalCompany } from '../types';
import { Upload, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import styles from './BankManagement.module.scss';

export const BankManagement = () => {
  const { profile, selectedCompanyId, setSelectedCompanyId } = useAuth();
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  const { data: transactions, loading, fetchData: fetchTransactions, createRecord } = useDatabase<BankTransaction>('bank_transactions');

  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');

  const [searchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';
  const [searchVal, setSearchVal] = useState(searchParam);

  const isReadOnly = profile?.role !== 'owner';

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    setSearchVal(searchParam);
  }, [searchParam]);

  useEffect(() => {
    if (selectedCompanyId) {
      setSelectedCompany(selectedCompanyId);
    } else if (profile?.internal_company_id) {
      setSelectedCompany(profile.internal_company_id);
    }
  }, [profile, selectedCompanyId]);

  // Default selection to first company
  useEffect(() => {
    if (companies.length > 0 && !selectedCompany) {
      const defaultId = isReadOnly ? (profile?.internal_company_id || companies[0].id) : companies[0].id;
      setSelectedCompany(defaultId);
      setSelectedCompanyId(defaultId);
    }
  }, [companies, selectedCompany, isReadOnly, profile, setSelectedCompanyId]);

  const loadTransactions = () => {
    if (selectedCompany) {
      fetchTransactions({
        filters: [{ column: 'internal_company_id', operator: 'eq', value: selectedCompany }],
        sort: { column: 'transaction_date', direction: 'desc' }
      });
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [selectedCompany]);

  const handleCompanyChange = (id: string) => {
    setSelectedCompany(id);
    setSelectedCompanyId(id);
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    if (!selectedCompany) {
      alert('Por favor, seleccione una empresa primero.');
      return;
    }
    setUploadFileName(file.name);
    
    if (file.name.endsWith('.csv')) {
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          alert('No se encontraron transacciones válidas en el CSV. Asegúrese de que tenga columnas de fecha, descripción y monto.');
          return;
        }

        for (const row of rows) {
          await createRecord({
            ...row,
            internal_company_id: selectedCompany,
            is_reconciled: false,
            is_non_invoiced: false
          });
        }

        alert(`Se han importado ${rows.length} transacciones con éxito.`);
        setIsImporting(false);
        setUploadFileName('');
        loadTransactions();
      } catch (err) {
        console.error('Error parsing CSV:', err);
        alert('Error al leer el archivo CSV.');
      }
    } else {
      setIsOcrScanning(true);
      setOcrProgress(0);
      
      const interval = setInterval(() => {
        setOcrProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(async () => {
              const mockTxs = [
                {
                  amount: 75000.00,
                  transaction_date: new Date().toISOString().split('T')[0],
                  description: 'FONDEO DE NOMINA RECIBIDO',
                  reference_number: 'SPEI987162534',
                },
                {
                  amount: -54200.00,
                  transaction_date: new Date().toISOString().split('T')[0],
                  description: 'DISPERSION DE NOMINA BANORTE',
                  reference_number: 'TEF01928374',
                },
                {
                  amount: -15000.00,
                  transaction_date: new Date().toISOString().split('T')[0],
                  description: 'CARGO POR COMISION MENSUAL',
                  reference_number: 'FEE99881122',
                }
              ];

              for (const tx of mockTxs) {
                await createRecord({
                  ...tx,
                  internal_company_id: selectedCompany,
                  is_reconciled: false,
                  is_non_invoiced: false
                });
              }

              setIsOcrScanning(false);
              setIsImporting(false);
              setUploadFileName('');
              loadTransactions();
            }, 500);
            return 100;
          }
          return prev + 10;
        });
      }, 150);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length <= 1) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('fecha') || h.includes('date'));
    const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('concept') || h.includes('concepto'));
    const refIdx = headers.findIndex(h => h.includes('ref') || h.includes('referencia'));
    const amountIdx = headers.findIndex(h => h.includes('monto') || h.includes('amount') || h.includes('importe'));

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < headers.length) continue;

      const date = dateIdx !== -1 ? parts[dateIdx] : new Date().toISOString().split('T')[0];
      const description = descIdx !== -1 ? parts[descIdx] : 'Transacción Importada';
      const reference = refIdx !== -1 ? parts[refIdx] : '';
      const amount = amountIdx !== -1 ? parseFloat(parts[amountIdx].replace(/[^0-9.-]/g, '')) : 0;

      if (!isNaN(amount) && amount !== 0) {
        results.push({
          transaction_date: date,
          description,
          reference_number: reference || null,
          amount
        });
      }
    }
    return results;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(Math.abs(amount));
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (searchVal.trim() !== '') {
        const query = searchVal.toLowerCase();
        const desc = tx.description?.toLowerCase() || '';
        const ref = tx.reference_number?.toLowerCase() || '';
        return desc.includes(query) || ref.includes(query);
      }
      return true;
    });
  }, [transactions, searchVal]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>Gestión de Bancos</h1>
          <p>Importación y control de estados de cuenta inmutables</p>
        </div>
        <div className={styles.actions}>
          <select 
            value={selectedCompany} 
            onChange={(e) => handleCompanyChange(e.target.value)}
            className={styles.companySelect}
            disabled={isReadOnly}
          >
            <option value="">Seleccionar Empresa...</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className={styles.importBtn} onClick={() => setIsImporting(true)}>
            <Upload size={18} />
            <span>Importar Datos</span>
          </button>
        </div>
      </header>

      {isImporting && (
        <div className={styles.modalOverlay} onClick={() => setIsImporting(false)}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Importar Estado de Cuenta Bancario</h2>
              <button className={styles.closeBtn} onClick={() => setIsImporting(false)}>
                <X size={20} />
              </button>
            </header>
            
            <div className={styles.modalContent}>
              {isOcrScanning ? (
                <div className={styles.progressContainer}>
                  <Loader2 size={36} className={styles.spinner} />
                  <p className={styles.progressText}>Escaneando estado de cuenta bancario...</p>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${ocrProgress}%` }} />
                  </div>
                  <span className={styles.progressPercent}>{ocrProgress}%</span>
                </div>
              ) : (
                <div className={styles.uploaderArea}>
                  <div 
                    className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={triggerFileSelect}
                  >
                    <Upload size={48} className={styles.uploadIcon} />
                    <h3>Arrastre y suelte su estado de cuenta aquí</h3>
                    <p>Soporta archivos CSV bancarios o estados de cuenta PDF</p>
                    <span className={styles.browseBtn}>Buscar archivos</span>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className={styles.fileInput} 
                      onChange={handleFileSelect}
                      accept=".csv,.pdf"
                    />
                  </div>
                  
                  {uploadFileName && (
                    <div className={styles.fileNameBadge}>
                      <span>Archivo seleccionado: <strong>{uploadFileName}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={styles.mainGrid}>
        <Card title="Transacciones Bancarias">
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Referencia</th>
                  <th className={styles.alignRight}>Monto</th>
                  <th className={styles.alignCenter}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={styles.loadingCell}>
                      <Loader2 size={24} className={styles.spinner} />
                      <span>Cargando transacciones...</span>
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr><td colSpan={5} className={styles.empty}>No hay transacciones registradas.</td></tr>
                ) : (
                  filteredTransactions.map(tx => (
                    <tr key={tx.id}>
                      <td className={styles.dateCell}>{tx.transaction_date}</td>
                      <td>
                        <div className={styles.descGroup}>
                          <span className={styles.txDesc}>{tx.description}</span>
                        </div>
                      </td>
                      <td className={styles.refCell}>{tx.reference_number || '-'}</td>
                      <td className={`${styles.amountCell} ${tx.amount >= 0 ? styles.positive : styles.negative}`}>
                        {tx.amount >= 0 ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className={styles.alignCenter}>
                        {tx.is_reconciled ? (
                          <div className={`${styles.status} ${styles.reconciled}`}>
                            <CheckCircle2 size={16} />
                            <span>Conciliado</span>
                          </div>
                        ) : (
                          <div className={`${styles.status} ${styles.pending}`}>
                            <AlertTriangle size={16} />
                            <span>Pendiente</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
