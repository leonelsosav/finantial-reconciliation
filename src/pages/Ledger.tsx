import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { Client, StaffRecord, StaffEntryType } from '../types';
import { Plus, Search, Filter, Loader2 } from 'lucide-react';
import styles from './Ledger.module.scss';

export const Ledger = () => {
  const { profile } = useAuth();
  const { data: clients, fetchData: fetchClients } = useDatabase<Client>('clients');
  const { data: records, loading, fetchData: fetchRecords, createRecord } = useDatabase<StaffRecord>('staff_records');

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    client_id: '',
    amount: '',
    entry_type: 'funding' as StaffEntryType,
    description: '',
    operation_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (profile?.internal_company_id) {
      fetchClients({
        filters: [{ column: 'internal_company_id', operator: 'eq', value: profile.internal_company_id }]
      });
      loadRecords();
    }
  }, [profile]);

  const loadRecords = () => {
    if (profile?.internal_company_id) {
      fetchRecords({
        filters: [{ column: 'internal_company_id', operator: 'eq', value: profile.internal_company_id }],
        sort: { column: 'operation_date', direction: 'desc' },
        limit: 50,
        select: '*, clients(name)'
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.internal_company_id) return;

    try {
      await createRecord({
        ...formData,
        amount: parseFloat(formData.amount),
        internal_company_id: profile.internal_company_id,
        created_by: profile.id
      });
      setIsAdding(false);
      setFormData({
        client_id: '',
        amount: '',
        entry_type: 'funding',
        description: '',
        operation_date: new Date().toISOString().split('T')[0]
      });
      loadRecords();
    } catch (err) {
      console.error('Error creating record:', err);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>Libro Diario Operativo</h1>
          <p>Registro de movimientos y solicitudes de fondos</p>
        </div>
        <button className={styles.addBtn} onClick={() => setIsAdding(!isAdding)}>
          <Plus size={20} />
          <span>Nuevo Registro</span>
        </button>
      </header>

      {isAdding && (
        <section className={styles.formCard}>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Cliente</label>
                <select 
                  value={formData.client_id} 
                  onChange={(e) => setFormData({...formData, client_id: e.target.value})}
                  required
                >
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label>Tipo de Operación</label>
                <select 
                  value={formData.entry_type} 
                  onChange={(e) => setFormData({...formData, entry_type: e.target.value as StaffEntryType})}
                >
                  <option value="funding">Fondeo (Ingreso)</option>
                  <option value="fee">Comisión (Ingreso)</option>
                  <option value="payroll">Nómina (Egreso)</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Monto</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={formData.amount} 
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Fecha de Operación</label>
                <input 
                  type="date" 
                  value={formData.operation_date} 
                  onChange={(e) => setFormData({...formData, operation_date: e.target.value})}
                  required
                />
              </div>

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label>Descripción / Referencia</label>
                <input 
                  type="text" 
                  value={formData.description} 
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Detalles adicionales..."
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setIsAdding(false)}>
                Cancelar
              </button>
              <button type="submit" className={styles.submitBtn}>
                Guardar Registro
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input type="text" placeholder="Buscar movimientos..." disabled />
          </div>
          <button className={styles.filterBtn} disabled>
            <Filter size={18} />
            <span>Filtros</span>
          </button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th className={styles.alignRight}>Monto</th>
                <th className={styles.alignCenter}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className={styles.loadingCell}>
                    <Loader2 size={24} className={styles.spinner} />
                    <span>Cargando registros...</span>
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    No hay registros para mostrar.
                  </td>
                </tr>
              )}
              {!loading && records.map(record => (
                <tr key={record.id}>
                  <td>{record.operation_date}</td>
                  <td>{record.clients?.name}</td>
                  <td>
                    <span className={`${styles.typeBadge} ${styles[record.entry_type]}`}>
                      {record.entry_type === 'funding' ? 'Fondeo' : 
                       record.entry_type === 'fee' ? 'Comisión' : 'Nómina'}
                    </span>
                  </td>
                  <td>{record.description || '-'}</td>
                  <td className={`${styles.alignRight} ${record.entry_type === 'payroll' ? styles.negative : styles.positive}`}>
                    {record.entry_type === 'payroll' ? '-' : '+'}
                    ${record.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={styles.alignCenter}>
                    <span className={`${styles.statusBadge} ${record.is_reconciled ? styles.reconciled : styles.pending}`}>
                      {record.is_reconciled ? 'Conciliado' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
