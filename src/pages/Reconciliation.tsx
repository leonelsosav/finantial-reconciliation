import { useState, useEffect } from 'react';
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
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  
  const { 
    data: bankTxs, 
    loading: loadingBank, 
    fetchData: fetchBank,
    updateRecord: updateBank 
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

  useEffect(() => {
    fetchCompanies();
    if (profile?.internal_company_id) {
      setSelectedCompany(profile.internal_company_id);
    }
  }, [profile, fetchCompanies]);

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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
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
              <h3 className={styles.dropZoneTitle}>Drag & Drop Bank Statements</h3>
              <p className={styles.dropZoneSub}>PDF or CSV formats accepted. System parses text via OCR automatically.</p>
            </div>
          </div>
          <div className={styles.dropZoneRight}>
            <div className={styles.activeBatch}>
              <span className={styles.batchLabel}>Active Batch</span>
              <span className={styles.batchValue}>Q3_Chase_Sept_2023.pdf</span>
            </div>
            <button className={styles.browseBtn}>Browse Files</button>
          </div>
        </div>

        <div className={styles.controlsRight}>
          <div className={styles.entityInputGroup}>
            <label className={styles.entityLabel}>Internal Entity</label>
            <select 
              value={selectedCompany} 
              onChange={(e) => setSelectedCompany(e.target.value)}
              className={styles.companySelect}
            >
              <option value="">Select Enterprise...</option>
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
            <span>Execute Auto-Match</span>
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
              <h2 className={styles.columnTitle}>Unreconciled Bank Transactions</h2>
            </div>
            <span className={`${styles.badge} ${styles.badgePrimary}`}>
              {bankTxs.length} Pending
            </span>
          </div>

          <div className={styles.listContainer}>
            {loadingBank ? (
              <p className={styles.infoText}>Loading transactions...</p>
            ) : bankTxs.length === 0 ? (
              <p className={styles.infoText}>No pending bank transactions.</p>
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
                          {tx.description || 'Bank Transaction'}
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
                          title="Mark as Non-Invoiced"
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
              <h2 className={styles.columnTitle}>Unlinked Staff Records</h2>
            </div>
            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
              {staffRecords.length} Records
            </span>
          </div>

          <div className={styles.listContainer}>
            <div className={styles.filterMeta}>
              <Filter size={12} className={styles.filterIcon} />
              <span>FILTERED BY OPERATIONS IN ACTIVE ENTITY</span>
            </div>

            {loadingStaff ? (
              <p className={styles.infoText}>Loading staff records...</p>
            ) : staffRecords.length === 0 ? (
              <p className={styles.infoText}>No pending staff records.</p>
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
                          {record.clients?.name || 'Unknown Client'}
                        </h4>
                        <span className={`${styles.typeTag} ${
                          record.entry_type === 'payroll' 
                            ? styles.tagPayroll 
                            : record.entry_type === 'funding' 
                            ? styles.tagFunding 
                            : styles.tagFee
                        }`}>
                          {record.entry_type === 'payroll' 
                            ? 'payroll_funding' 
                            : record.entry_type === 'funding' 
                            ? 'retainer_injection' 
                            : 'fee_charge'}
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
            <span className={styles.valLabel}>Selected Matching Value</span>
            <span className={styles.valAmount}>{formatCurrency(selectedValue)}</span>
          </div>
          <div className={styles.verticalDivider}></div>
          <div className={styles.matchStatus}>
            {selectedBankTx && selectedStaffRecord ? (
              isMatchPerfect ? (
                <div className={styles.statusSuccess}>
                  <CheckCircle2 size={16} />
                  <span>Perfect Match Detected</span>
                </div>
              ) : (
                <div className={styles.statusWarning}>
                  <AlertTriangle size={16} />
                  <span>Amount Mismatch</span>
                </div>
              )
            ) : (
              <div className={styles.statusInfo}>
                <Info size={16} />
                <span>Awaiting Selection Pair</span>
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
            Discard Draft
          </button>
          <button 
            className={styles.commitBtn}
            onClick={handleMatch}
            disabled={!selectedBankTx || !selectedStaffRecord || isProcessing}
          >
            <span>{isProcessing ? 'Processing...' : 'Commit Pair'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
};
