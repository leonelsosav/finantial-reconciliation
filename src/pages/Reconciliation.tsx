import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { Card } from '../components/Card';
import type { BankTransaction, StaffRecord, InternalCompany } from '../types';
import { ArrowLeftRight, CheckCircle2, Info } from 'lucide-react';
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
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(Math.abs(amount));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>Conciliación Bancaria</h1>
          <p>Cruce de transacciones bancarias contra registros operativos</p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.autoMatchBtn} 
            onClick={handleAutoMatch}
            disabled={isProcessing || bankTxs.length === 0}
          >
            <CheckCircle2 size={18} />
            <span>Auto-Conciliar</span>
          </button>
          <select 
            value={selectedCompany} 
            onChange={(e) => setSelectedCompany(e.target.value)}
            className={styles.companySelect}
          >
            <option value="">Seleccionar Empresa...</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className={styles.matchingBar}>
        <div className={styles.matchSlot}>
          <span className={styles.slotLabel}>Banco:</span>
          {selectedBankTx ? (
            <div className={styles.slotValue}>
              <strong>{formatCurrency(selectedBankTx.amount)}</strong>
              <span>{selectedBankTx.transaction_date}</span>
            </div>
          ) : <span className={styles.slotPlaceholder}>Seleccione una transacción</span>}
        </div>
        
        <ArrowLeftRight className={styles.matchIcon} size={24} />

        <div className={styles.matchSlot}>
          <span className={styles.slotLabel}>Sistema:</span>
          {selectedStaffRecord ? (
            <div className={styles.slotValue}>
              <strong>{formatCurrency(selectedStaffRecord.amount)}</strong>
              <span>{selectedStaffRecord.clients?.name}</span>
            </div>
          ) : <span className={styles.slotPlaceholder}>Seleccione un registro</span>}
        </div>

        <button 
          className={styles.matchBtn}
          disabled={!selectedBankTx || !selectedStaffRecord || isProcessing}
          onClick={handleMatch}
        >
          {isProcessing ? 'Procesando...' : 'Vincular Registros'}
        </button>
      </div>

      <div className={styles.columns}>
        <Card title="Transacciones de Banco (Pendientes)" className={styles.column}>
          <div className={styles.list}>
            {loadingBank ? <p className={styles.infoText}>Cargando...</p> : 
             bankTxs.length === 0 ? <p className={styles.infoText}>Sin pendientes bancarios.</p> :
             bankTxs.map(tx => (
              <div 
                key={tx.id} 
                className={`${styles.item} ${selectedBankTx?.id === tx.id ? styles.selected : ''}`}
                onClick={() => setSelectedBankTx(tx)}
              >
                <div className={styles.itemMain}>
                  <p className={styles.itemDate}>{tx.transaction_date}</p>
                  <p className={styles.itemDesc}>{tx.description}</p>
                </div>
                <div className={styles.itemSide}>
                  <p className={`${styles.itemAmount} ${tx.amount < 0 ? styles.negative : styles.positive}`}>
                    {formatCurrency(tx.amount)}
                  </p>
                  {!tx.is_non_invoiced && (
                    <button 
                      className={styles.miniAction} 
                      onClick={(e) => { e.stopPropagation(); markAsNonInvoiced(tx); }}
                      title="Marcar como No Facturado"
                    >
                      <Info size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Registros de Sistema (Pendientes)" className={styles.column}>
          <div className={styles.list}>
            {loadingStaff ? <p className={styles.infoText}>Cargando...</p> : 
             staffRecords.length === 0 ? <p className={styles.infoText}>Sin pendientes operativos.</p> :
             staffRecords.map(record => (
              <div 
                key={record.id} 
                className={`${styles.item} ${selectedStaffRecord?.id === record.id ? styles.selected : ''}`}
                onClick={() => setSelectedStaffRecord(record)}
              >
                <div className={styles.itemMain}>
                  <p className={styles.itemDate}>{record.operation_date}</p>
                  <p className={styles.itemDesc}>{record.clients?.name}</p>
                  <span className={styles.itemSub}>{record.description || record.entry_type}</span>
                </div>
                <div className={styles.itemSide}>
                  <p className={`${styles.itemAmount} ${record.entry_type === 'payroll' ? styles.negative : styles.positive}`}>
                    {formatCurrency(record.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
