import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { Card } from '../components/Card';
import type { BankTransaction, InternalCompany } from '../types';
import { Upload, Download, Landmark, FileText, CheckCircle2, XCircle } from 'lucide-react';
import styles from './BankManagement.module.scss';

export const BankManagement = () => {
  const { profile } = useAuth();
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  const { data: transactions, loading, fetchData: fetchTransactions, createRecord } = useDatabase<BankTransaction>('bank_transactions');

  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [importData, setImportData] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchCompanies();
    if (profile?.internal_company_id) {
      setSelectedCompany(profile.internal_company_id);
    }
  }, [profile, fetchCompanies]);

  useEffect(() => {
    if (selectedCompany) {
      fetchTransactions({
        filters: [{ column: 'internal_company_id', operator: 'eq', value: selectedCompany }],
        sort: { column: 'transaction_date', direction: 'desc' }
      });
    }
  }, [selectedCompany, fetchTransactions]);

  const handleImport = async () => {
    if (!selectedCompany || !importData) return;

    try {
      // Prototype Ingestion: Expecting JSON array of transactions
      // In Phase 4.2 we will replace this with the PDF Parser
      const parsed = JSON.parse(importData);
      
      for (const item of parsed) {
        await createRecord({
          ...item,
          internal_company_id: selectedCompany,
          is_reconciled: false
        });
      }

      setImportData('');
      setIsImporting(false);
      fetchTransactions({
        filters: [{ column: 'internal_company_id', operator: 'eq', value: selectedCompany }],
        sort: { column: 'transaction_date', direction: 'desc' }
      });
    } catch (err) {
      alert('Error al procesar los datos. Asegúrese de usar un formato JSON válido.');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

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
            onChange={(e) => setSelectedCompany(e.target.value)}
            className={styles.companySelect}
          >
            <option value="">Seleccionar Empresa...</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className={styles.importBtn} onClick={() => setIsImporting(!isImporting)}>
            <Upload size={18} />
            <span>Importar Datos</span>
          </button>
        </div>
      </header>

      {isImporting && (
        <Card title="Panel de Importación (Prototipo JSON)">
          <div className={styles.importArea}>
            <p className={styles.hint}>
              Pegue un arreglo JSON con: <code>amount, transaction_date, description, reference_number</code>
            </p>
            <textarea 
              value={importData} 
              onChange={(e) => setImportData(e.target.value)}
              placeholder='[{"amount": 5000, "transaction_date": "2023-06-01", "description": "EJEMPLO"}]'
              rows={6}
            />
            <div className={styles.importActions}>
              <button onClick={() => setIsImporting(false)} className={styles.cancelLink}>Cancelar</button>
              <button onClick={handleImport} className={styles.confirmBtn}>Procesar Transacciones</button>
            </div>
          </div>
        </Card>
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
                  <tr><td colSpan={5} className={styles.empty}>Cargando...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={5} className={styles.empty}>No hay transacciones registradas.</td></tr>
                ) : (
                  transactions.map(tx => (
                    <tr key={tx.id}>
                      <td className={styles.dateCell}>{tx.transaction_date}</td>
                      <td>
                        <div className={styles.descGroup}>
                          <span className={styles.txDesc}>{tx.description}</span>
                        </div>
                      </td>
                      <td className={styles.refCell}>{tx.reference_number || '-'}</td>
                      <td className={`${styles.amountCell} ${tx.amount < 0 ? styles.negative : styles.positive}`}>
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
                            <XCircle size={16} />
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
