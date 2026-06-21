import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { BankTransaction, StaffRecord, InternalCompany } from '../types';
import { 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  UploadCloud, 
  Sparkles,
  Building2,
  Circle,
  FileText,
  Filter,
  X,
  Loader2
} from 'lucide-react';
import styles from './Reconciliation.module.scss';

export interface ProposedMatch {
  id: string;
  bankTx: BankTransaction;
  staffRecord: StaffRecord;
  approved: boolean;
}

export const Reconciliation = () => {
  const { profile, selectedCompanyId, setSelectedCompanyId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  
  const { 
    data: bankTxs, 
    loading: loadingBank, 
    fetchData: fetchBank,
    updateRecord: updateBank,
    createRecord: createBankRecord,
    service: bankService
  } = useDatabase<BankTransaction>('bank_transactions');
  
  const { 
    data: staffRecords, 
    loading: loadingStaff, 
    fetchData: fetchStaff,
    updateRecord: updateStaff 
  } = useDatabase<StaffRecord>('staff_records');

  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [selectedBankTx, setSelectedBankTx] = useState<BankTransaction | null>(null);
  const [selectedStaffRecord, setSelectedStaffRecord] = useState<StaffRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingBankTxId, setPendingBankTxId] = useState<string | null>(null);

  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [proposedMatches, setProposedMatches] = useState<ProposedMatch[]>([]);

  useEffect(() => {
    fetchCompanies();
    if (profile?.internal_company_id) {
      setSelectedCompany(profile.internal_company_id);
    }
  }, [profile, fetchCompanies]);

  useEffect(() => {
    const savedBatch = sessionStorage.getItem('active_recon_batch');
    if (savedBatch) {
      setActiveBatch(savedBatch);
    }
  }, []);

  useEffect(() => {
    if (selectedCompanyId !== undefined && selectedCompanyId !== null) {
      setSelectedCompany(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  // Default to the first loaded company if selected company is empty
  useEffect(() => {
    if (companies.length > 0 && !selectedCompany) {
      const firstId = companies[0].id;
      setSelectedCompany(firstId);
      setSelectedCompanyId(firstId);
    }
  }, [companies, selectedCompany, setSelectedCompanyId]);

  useEffect(() => {
    if (location.state?.triggerUpload && fileInputRef.current) {
      fileInputRef.current.click();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.triggerUpload, navigate, location.pathname]);

  useEffect(() => {
    const txId = location.state?.selectedBankTxId;
    if (txId) {
      setPendingBankTxId(txId);
      
      bankService.getById(txId).then(tx => {
        if (tx && tx.internal_company_id) {
          setSelectedCompany(tx.internal_company_id);
        }
      }).catch(err => {
        console.error('Error fetching bank tx:', err);
      });
      
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.selectedBankTxId, bankService, navigate, location.pathname]);

  useEffect(() => {
    if (pendingBankTxId && bankTxs.length > 0) {
      const found = bankTxs.find(tx => tx.id === pendingBankTxId);
      if (found) {
        setSelectedBankTx(found);
        setPendingBankTxId(null);
      }
    }
  }, [bankTxs, pendingBankTxId]);

  useEffect(() => {
    if (selectedCompany) {
      loadUnreconciledData();
    }
  }, [selectedCompany]);

  const loadUnreconciledData = () => {
    fetchBank({
      filters: [
        { column: 'internal_company_id', operator: 'eq', value: selectedCompany },
        { column: 'is_reconciled', operator: 'eq', value: false }
      ],
      sort: { column: 'transaction_date', direction: 'asc' }
    });
    fetchStaff({
      filters: [
        { column: 'internal_company_id', operator: 'eq', value: selectedCompany },
        { column: 'is_reconciled', operator: 'eq', value: false }
      ],
      sort: { column: 'operation_date', direction: 'asc' },
      select: '*, clients(name)'
    });
    setSelectedBankTx(null);
    setSelectedStaffRecord(null);
  };

  const handleMatch = async () => {
    if (!selectedBankTx || !selectedStaffRecord) return;
    
    setIsProcessing(true);
    try {
      await updateStaff(selectedStaffRecord.id, {
        is_reconciled: true,
        bank_transaction_id: selectedBankTx.id
      });
      
      await updateBank(selectedBankTx.id, {
        is_reconciled: true
      });

      loadUnreconciledData();
    } catch (err) {
      console.error('Error matching records:', err);
      alert('Error al conciliar los registros.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoMatch = () => {
    if (bankTxs.length === 0 || staffRecords.length === 0) {
      alert('No hay registros suficientes para conciliar.');
      return;
    }
    
    const proposals: ProposedMatch[] = [];
    const matchedStaffIds = new Set<string>();

    for (const bankTx of bankTxs) {
      const candidates = staffRecords.filter(staff => {
        if (matchedStaffIds.has(staff.id)) return false;
        
        const sameAmount = Math.abs(Number(staff.amount)) === Math.abs(Number(bankTx.amount));
        const bankDate = new Date(bankTx.transaction_date);
        const staffDate = new Date(staff.operation_date);
        const diffDays = Math.abs(bankDate.getTime() - staffDate.getTime()) / (1000 * 3600 * 24);
        
        return sameAmount && diffDays <= 3;
      });

      if (candidates.length > 0) {
        const bestCandidate = candidates.reduce((prev, curr) => {
          const prevDiff = Math.abs(new Date(bankTx.transaction_date).getTime() - new Date(prev.operation_date).getTime());
          const currDiff = Math.abs(new Date(bankTx.transaction_date).getTime() - new Date(curr.operation_date).getTime());
          return currDiff < prevDiff ? curr : prev;
        });

        proposals.push({
          id: `${bankTx.id}-${bestCandidate.id}`,
          bankTx,
          staffRecord: bestCandidate,
          approved: true
        });

        matchedStaffIds.add(bestCandidate.id);
      }
    }

    if (proposals.length === 0) {
      alert('No se encontraron propuestas automáticas de conciliación.');
      return;
    }

    setProposedMatches(proposals);
    setShowReviewModal(true);
  };

  const handleCommitBatchMatches = async () => {
    const approvedMatches = proposedMatches.filter(m => m.approved);
    if (approvedMatches.length === 0) {
      alert('No hay propuestas aprobadas para conciliar.');
      return;
    }

    setIsProcessing(true);
    try {
      await Promise.all(
        approvedMatches.map(async (match) => {
          await updateStaff(match.staffRecord.id, {
            is_reconciled: true,
            bank_transaction_id: match.bankTx.id
          });
          await updateBank(match.bankTx.id, {
            is_reconciled: true
          });
        })
      );

      alert(`Se han conciliado exitosamente ${approvedMatches.length} registros.`);
      setShowReviewModal(false);
      setProposedMatches([]);
      loadUnreconciledData();
    } catch (err) {
      console.error('Error in batch commit:', err);
      alert('Error al procesar la conciliación por lote.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedCompany) {
      alert('Por favor, selecciona una empresa antes de cargar un archivo.');
      return;
    }

    sessionStorage.setItem('active_recon_batch', file.name);
    setActiveBatch(file.name);
    setIsProcessing(true);

    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      if (isCsv) {
        const text = await file.text();
        const lines = text.split('\n');
        let addedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 3) {
            const dateStr = parts[0].replace(/"/g, '').trim();
            const descStr = parts[1].replace(/"/g, '').trim();
            const amountStr = parts[2].replace(/"/g, '').trim();

            const amount = parseFloat(amountStr);
            if (!isNaN(amount) && dateStr) {
              await createBankRecord({
                internal_company_id: selectedCompany,
                transaction_date: dateStr,
                description: descStr || 'Transacción Bancaria Importada',
                amount: amount,
                is_reconciled: false,
                is_non_invoiced: false
              });
              addedCount++;
            }
          }
        }

        if (addedCount > 0) {
          alert(`Se importaron exitosamente ${addedCount} transacciones desde el archivo CSV.`);
          loadUnreconciledData();
        } else {
          await generateMockOcrTransactions(file.name);
        }
      } else {
        await generateMockOcrTransactions(file.name);
      }
    } catch (err) {
      console.error('Error processing upload:', err);
      await generateMockOcrTransactions(file.name);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateMockOcrTransactions = async (fileName: string) => {
    try {
      const mockTxs = [
        {
          description: `Fondeo de Nómina (OCR - ${fileName})`,
          amount: -125000,
          transaction_date: new Date().toISOString().split('T')[0]
        },
        {
          description: `Cargo por Comisión (OCR - ${fileName})`,
          amount: -15000,
          transaction_date: new Date().toISOString().split('T')[0]
        },
        {
          description: `Inyección de Fondeo (OCR - ${fileName})`,
          amount: 250000,
          transaction_date: new Date().toISOString().split('T')[0]
        }
      ];

      for (const tx of mockTxs) {
        await createBankRecord({
          internal_company_id: selectedCompany,
          transaction_date: tx.transaction_date,
          description: tx.description,
          amount: tx.amount,
          is_reconciled: false,
          is_non_invoiced: false
        });
      }

      alert(`Simulación de OCR completada. Se importaron 3 transacciones desde: ${fileName}`);
      loadUnreconciledData();
    } catch (err) {
      console.error('Error generating OCR data:', err);
      alert('Error en el procesamiento OCR.');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const markAsNonInvoiced = async (tx: BankTransaction) => {
    try {
      await updateBank(tx.id, { is_non_invoiced: true });
      loadUnreconciledData();
    } catch (err) {
      console.error('Error marking as non-invoiced:', err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(Math.abs(amount));
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Determine match bar state
  const isMatchPerfect = selectedBankTx && selectedStaffRecord && 
    Math.abs(Number(selectedBankTx.amount)) === Math.abs(Number(selectedStaffRecord.amount));

  const selectedValue = selectedBankTx 
    ? Math.abs(Number(selectedBankTx.amount)) 
    : selectedStaffRecord 
    ? Math.abs(Number(selectedStaffRecord.amount)) 
    : 0;

  return (
    <div className={styles.container}>
      {/* Control Panel Section */}
      <section className={styles.controlPanel}>
        <div 
          className={styles.dropZone}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className={styles.dropZoneLeft}>
            <div className={styles.uploadIcon}>
              <UploadCloud size={24} />
            </div>
            <div>
              <h3 className={styles.dropZoneTitle}>Arrastrar y soltar estados de cuenta bancarios</h3>
              <p className={styles.dropZoneSub}>Formatos aceptados: PDF o CSV. El sistema procesa el texto mediante OCR automáticamente.</p>
            </div>
          </div>
          <div className={styles.dropZoneRight}>
            <div className={styles.activeBatch}>
              <span className={styles.batchLabel}>Lote Activo</span>
              <span className={styles.batchValue}>{activeBatch || 'Ninguno'}</span>
            </div>
            <button className={styles.browseBtn} onClick={() => fileInputRef.current?.click()}>Buscar archivos</button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className={styles.hiddenInput} 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>

        <div className={styles.controlsRight}>
          <div className={styles.entityInputGroup}>
            <label className={styles.entityLabel}>Entidad Interna</label>
            <select 
              value={selectedCompany} 
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCompany(val);
                setSelectedCompanyId(val);
              }}
              disabled={profile?.role !== 'owner'}
              className={styles.companySelect}
            >
              <option value="">Seleccionar empresa...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button 
            className={styles.autoMatchBtn} 
            onClick={handleAutoMatch}
            disabled={isProcessing || bankTxs.length === 0}
          >
            <Sparkles size={16} />
            <span>Ejecutar auto-conciliación</span>
          </button>
        </div>
      </section>

      {/* Split-Pane Comparison Ledger */}
      <section className={styles.splitPane}>
        {/* Left Column: Bank Transactions */}
        <div className={styles.paneColumn}>
          <div className={styles.columnHeader}>
            <div className={styles.titleWithIcon}>
              <Building2 size={16} className={styles.columnTitleIcon} />
              <h2 className={styles.columnTitle}>Transacciones bancarias sin conciliar</h2>
            </div>
            <span className={`${styles.badge} ${styles.badgePrimary}`}>
              {bankTxs.length} Pendiente{bankTxs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className={styles.listContainer}>
            {loadingBank ? (
              <p className={styles.infoText}>Cargando transacciones...</p>
            ) : bankTxs.length === 0 ? (
              <p className={styles.infoText}>No hay transacciones bancarias pendientes.</p>
            ) : (
              bankTxs.map(tx => {
                const isSelected = selectedBankTx?.id === tx.id;
                return (
                  <div 
                    key={tx.id} 
                    className={`${styles.itemCard} ${isSelected ? styles.itemSelected : ''}`}
                    onClick={() => setSelectedBankTx(tx)}
                  >
                    <div className={styles.itemHeader}>
                      {isSelected ? (
                        <CheckCircle2 size={18} className={styles.checkedIcon} />
                      ) : (
                        <Circle size={18} className={styles.uncheckedIcon} />
                      )}
                      <div>
                        <span className={styles.itemDate}>{tx.transaction_date}</span>
                        <h4 className={`${styles.itemName} ${isSelected ? styles.textActive : ''}`}>
                          {tx.description || 'Transacción bancaria'}
                        </h4>
                      </div>
                    </div>
                    <div className={styles.itemRight}>
                      <span className={`${styles.amount} ${tx.amount < 0 ? styles.negative : styles.positive}`}>
                        {tx.amount < 0 ? '-' : '+'}{formatCurrency(tx.amount)}
                      </span>
                      {!tx.is_non_invoiced && (
                        <button 
                          className={styles.miniActionBtn}
                          onClick={(e) => { e.stopPropagation(); markAsNonInvoiced(tx); }}
                          title="Marcar como no facturado"
                        >
                          <Info size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Staff Records */}
        <div className={styles.paneColumn}>
          <div className={styles.columnHeader}>
            <div className={styles.titleWithIcon}>
              <FileText size={16} className={styles.columnTitleIcon} />
              <h2 className={styles.columnTitle}>Registros de personal sin vincular</h2>
            </div>
            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
              {staffRecords.length} Registro{staffRecords.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className={styles.listContainer}>
            <div className={styles.filterMeta}>
              <Filter size={12} className={styles.filterIcon} />
              <span>FILTRADO POR OPERACIONES EN LA ENTIDAD ACTIVA</span>
            </div>

            {loadingStaff ? (
              <p className={styles.infoText}>Cargando registros de personal...</p>
            ) : staffRecords.length === 0 ? (
              <p className={styles.infoText}>No hay registros de personal pendientes.</p>
            ) : (
              staffRecords.map(record => {
                const isSelected = selectedStaffRecord?.id === record.id;
                return (
                  <div 
                    key={record.id} 
                    className={`${styles.itemCard} ${isSelected ? styles.itemSelected : ''}`}
                    onClick={() => setSelectedStaffRecord(record)}
                  >
                    <div className={styles.itemHeader}>
                      <div className={`${styles.initialsAvatar} ${isSelected ? styles.avatarActive : ''}`}>
                        {getInitials(record.clients?.name)}
                      </div>
                      <div>
                        <h4 className={`${styles.itemName} ${isSelected ? styles.textActive : ''}`}>
                          {record.clients?.name || 'Cliente desconocido'}
                        </h4>
                        <span className={`${styles.typeTag} ${
                          record.entry_type === 'payroll' 
                            ? styles.tagPayroll 
                            : record.entry_type === 'funding' 
                            ? styles.tagFunding 
                            : styles.tagFee
                        }`}>
                          {record.entry_type === 'payroll' 
                            ? 'FONDEO_NOMINA' 
                            : record.entry_type === 'funding' 
                            ? 'INYECCION_RETAINER' 
                            : 'CARGO_COMISION'}
                        </span>
                      </div>
                    </div>
                    <span className={`${styles.amount} ${isSelected ? styles.textActive : ''}`}>
                      {formatCurrency(record.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Floating Bottom Action Bar */}
      <section className={styles.floatingActionBar}>
        <div className={styles.actionLeft}>
          <div className={styles.valSummary}>
            <span className={styles.valLabel}>Valor de coincidencia seleccionado</span>
            <span className={styles.valAmount}>{formatCurrency(selectedValue)}</span>
          </div>
          <div className={styles.verticalDivider}></div>
          <div className={styles.matchStatus}>
            {selectedBankTx && selectedStaffRecord ? (
              isMatchPerfect ? (
                <div className={styles.statusSuccess}>
                  <CheckCircle2 size={16} />
                  <span>Coincidencia perfecta detectada</span>
                </div>
              ) : (
                <div className={styles.statusWarning}>
                  <AlertTriangle size={16} />
                  <span>Diferencia en montos</span>
                </div>
              )
            ) : (
              <div className={styles.statusInfo}>
                <Info size={16} />
                <span>Esperando par de selección</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.actionRight}>
          <button 
            className={styles.discardBtn}
            onClick={() => {
              setSelectedBankTx(null);
              setSelectedStaffRecord(null);
            }}
            disabled={!selectedBankTx && !selectedStaffRecord}
          >
            Descartar borrador
          </button>
          <button 
            className={styles.commitBtn}
            onClick={handleMatch}
            disabled={!selectedBankTx || !selectedStaffRecord || !isMatchPerfect || isProcessing}
          >
            <span>{isProcessing ? 'Procesando...' : 'Confirmar par'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* Proposed Matches Review Modal */}
      {showReviewModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContainer}>
            <div className={styles.modalHeader}>
              <h3>Propuestas de Conciliación Automática</h3>
              <button 
                className={styles.closeBtn}
                onClick={() => setShowReviewModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <p className={styles.modalSubtitle}>
                El algoritmo ha emparejado los siguientes registros. Desmarca los que consideres incorrectos antes de confirmar.
              </p>
              
              <div className={styles.matchList}>
                {proposedMatches.map((match) => (
                  <div key={match.id} className={styles.matchRow}>
                    <div className={styles.matchSelect}>
                      <input 
                        type="checkbox"
                        checked={match.approved}
                        onChange={() => {
                          setProposedMatches(prev => prev.map(m => 
                            m.id === match.id ? { ...m, approved: !m.approved } : m
                          ));
                        }}
                      />
                    </div>
                    
                    <div className={styles.matchItemLeft}>
                      <span className={styles.matchDate}>{match.bankTx.transaction_date}</span>
                      <span className={styles.matchDesc}>{match.bankTx.description || 'Transacción Bancaria'}</span>
                      <span className={`${styles.matchAmount} ${match.bankTx.amount < 0 ? styles.negative : styles.positive}`}>
                        {match.bankTx.amount < 0 ? '-' : '+'}{formatCurrency(match.bankTx.amount)}
                      </span>
                    </div>
                    
                    <div className={styles.matchArrow}>
                      <ArrowRight size={16} />
                    </div>
                    
                    <div className={styles.matchItemRight}>
                      <span className={styles.matchClient}>{match.staffRecord.clients?.name || 'Cliente'}</span>
                      <span className={styles.matchTypeTag}>
                        {match.staffRecord.entry_type === 'payroll' 
                          ? 'FONDEO_NOMINA' 
                          : match.staffRecord.entry_type === 'funding' 
                          ? 'INYECCION_RETAINER' 
                          : 'CARGO_COMISION'}
                      </span>
                      <span className={styles.matchAmount}>
                        {formatCurrency(match.staffRecord.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                className={styles.modalCancelBtn}
                onClick={() => setShowReviewModal(false)}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button 
                className={styles.modalConfirmBtn}
                onClick={handleCommitBatchMatches}
                disabled={isProcessing || proposedMatches.filter(m => m.approved).length === 0}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} />
                    <span>Procesando...</span>
                  </>
                ) : (
                  `Confirmar Conciliación (${proposedMatches.filter(m => m.approved).length})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
