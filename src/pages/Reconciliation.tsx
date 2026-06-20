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
  Filter
} from 'lucide-react';
import styles from './Reconciliation.module.scss';

export const Reconciliation = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  
  const { 
    data: bankTxs, 
    loading: loadingBank, 
    fetchData: fetchBank,
    updateRecord: updateBank,
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

  useEffect(() => {
    fetchCompanies();
    if (profile?.internal_company_id) {
      setSelectedCompany(profile.internal_company_id);
    }
  }, [profile, fetchCompanies]);

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

  const handleAutoMatch = async () => {
    if (bankTxs.length === 0 || staffRecords.length === 0) return;
    
    setIsProcessing(true);
    let matchCount = 0;

    try {
      for (const bankTx of bankTxs) {
        const candidates = staffRecords.filter(staff => {
          const sameAmount = Math.abs(Number(staff.amount)) === Math.abs(Number(bankTx.amount));
          const bankDate = new Date(bankTx.transaction_date);
          const staffDate = new Date(staff.operation_date);
          const diffDays = Math.abs(bankDate.getTime() - staffDate.getTime()) / (1000 * 3600 * 24);
          
          return sameAmount && diffDays <= 3 && !staff.is_reconciled;
        });

        if (candidates.length === 1) {
          const match = candidates[0];
          await updateStaff(match.id, {
            is_reconciled: true,
            bank_transaction_id: bankTx.id
          });
          await updateBank(bankTx.id, {
            is_reconciled: true
          });
          matchCount++;
          match.is_reconciled = true; 
        }
      }
      
      if (matchCount > 0) {
        alert(`Se han conciliado automáticamente ${matchCount} registros.`);
        loadUnreconciledData();
      } else {
        alert('No se encontraron coincidencias automáticas claras.');
      }
    } catch (err) {
      console.error('Error in auto-match:', err);
    } finally {
      setIsProcessing(false);
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
        <div className={styles.dropZone}>
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
              <span className={styles.batchValue}>Q3_Chase_Sept_2023.pdf</span>
            </div>
            <button className={styles.browseBtn} onClick={() => fileInputRef.current?.click()}>Buscar archivos</button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className={styles.hiddenInput} 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  alert(`Archivo seleccionado: ${e.target.files[0].name}`);
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
              onChange={(e) => setSelectedCompany(e.target.value)}
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
                            ? 'fondeo_nomina' 
                            : record.entry_type === 'funding' 
                            ? 'inyeccion_retainer' 
                            : 'cargo_comision'}
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
            disabled={!selectedBankTx || !selectedStaffRecord || isProcessing}
          >
            <span>{isProcessing ? 'Procesando...' : 'Confirmar par'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
};
