import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { Client, StaffRecord, StaffEntryType } from '../types';
import { Plus, Search, Filter, Loader2, X } from 'lucide-react';
import styles from './Ledger.module.scss';

export const Ledger = () => {
  const { profile, selectedCompanyId } = useAuth();
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

  const [searchParams, setSearchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';
  const [searchVal, setSearchVal] = useState(searchParam);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<StaffEntryType[]>(['funding', 'fee', 'payroll']);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['reconciled', 'pending']);

  // Sync searchVal with URL search param
  useEffect(() => {
    setSearchVal(searchParam);
  }, [searchParam]);

  const loadRecords = () => {
    const recordOptions: any = {
      sort: { column: 'operation_date', direction: 'desc' },
      limit: 100,
      select: '*, clients(name)'
    };

    if (selectedCompanyId) {
      recordOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    } else if (profile?.role !== 'owner' && profile?.internal_company_id) {
      recordOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: profile.internal_company_id }];
    }

    fetchRecords(recordOptions);
  };

  useEffect(() => {
    const clientOptions: any = {};
    if (selectedCompanyId) {
      clientOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId }];
    } else if (profile?.role !== 'owner' && profile?.internal_company_id) {
      clientOptions.filters = [{ column: 'internal_company_id', operator: 'eq', value: profile.internal_company_id }];
    }
    
    fetchClients(clientOptions);
    loadRecords();
  }, [profile, selectedCompanyId, fetchClients]);

  const handleSearchChange = (val: string) => {
    setSearchVal(val);
    if (val) {
      setSearchParams({ search: val });
    } else {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('search');
      setSearchParams(nextParams);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const selectedClient = clients.find(c => c.id === formData.client_id);
    if (!selectedClient) {
      alert('Por favor, selecciona un cliente válido.');
      return;
    }

    const companyId = selectedClient.internal_company_id;
    if (!companyId) {
      alert('El cliente seleccionado no tiene una entidad asociada.');
      return;
    }

    try {
      await createRecord({
        ...formData,
        amount: parseFloat(formData.amount),
        internal_company_id: companyId,
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(Math.abs(amount));
  };

  // Client-side filtering via useMemo
  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      // 1. Search filter
      if (searchVal.trim() !== '') {
        const query = searchVal.toLowerCase();
        const clientName = record.clients?.name?.toLowerCase() || '';
        const description = record.description?.toLowerCase() || '';
        if (!clientName.includes(query) && !description.includes(query)) {
          return false;
        }
      }

      // 2. Type filter
      if (!selectedTypes.includes(record.entry_type)) {
        return false;
      }

      // 3. Status filter
      const statusKey = record.is_reconciled ? 'reconciled' : 'pending';
      if (!selectedStatuses.includes(statusKey)) {
        return false;
      }

      return true;
    });
  }, [records, searchVal, selectedTypes, selectedStatuses]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1>Libro Diario Operativo</h1>
          <p>Registro de movimientos y solicitudes de fondos</p>
        </div>
        <button className={styles.addBtn} onClick={() => setIsAdding(true)}>
          <Plus size={20} />
          <span>Nuevo Registro</span>
        </button>
      </header>

      {isAdding && (
        <div className={styles.modalOverlay} onClick={() => setIsAdding(false)}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>Nuevo Registro Operativo</h2>
              <button className={styles.closeBtn} onClick={() => setIsAdding(false)}>
                <X size={20} />
              </button>
            </header>
            <div className={styles.modalContent}>
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
            </div>
          </div>
        </div>
      )}

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar movimientos..." 
              value={searchVal}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className={styles.filterContainer}>
            <button 
              className={`${styles.filterBtn} ${showFilters ? styles.active : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={18} />
              <span>Filtros</span>
            </button>

            {showFilters && (
              <div className={styles.filterPopover}>
                <div className={styles.filterGroup}>
                  <h4>Tipo de Operación</h4>
                  <label className={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={selectedTypes.includes('funding')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTypes([...selectedTypes, 'funding']);
                        } else {
                          setSelectedTypes(selectedTypes.filter(t => t !== 'funding'));
                        }
                      }}
                    />
                    <span>Fondeo</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={selectedTypes.includes('fee')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTypes([...selectedTypes, 'fee']);
                        } else {
                          setSelectedTypes(selectedTypes.filter(t => t !== 'fee'));
                        }
                      }}
                    />
                    <span>Comisión</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={selectedTypes.includes('payroll')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTypes([...selectedTypes, 'payroll']);
                        } else {
                          setSelectedTypes(selectedTypes.filter(t => t !== 'payroll'));
                        }
                      }}
                    />
                    <span>Nómina</span>
                  </label>
                </div>

                <div className={styles.filterGroup}>
                  <h4>Estado de Conciliación</h4>
                  <label className={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={selectedStatuses.includes('reconciled')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStatuses([...selectedStatuses, 'reconciled']);
                        } else {
                          setSelectedStatuses(selectedStatuses.filter(s => s !== 'reconciled'));
                        }
                      }}
                    />
                    <span>Conciliado</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={selectedStatuses.includes('pending')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStatuses([...selectedStatuses, 'pending']);
                        } else {
                          setSelectedStatuses(selectedStatuses.filter(s => s !== 'pending'));
                        }
                      }}
                    />
                    <span>Pendiente</span>
                  </label>
                </div>
              </div>
            )}
          </div>
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
              {!loading && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    No hay registros para mostrar.
                  </td>
                </tr>
              )}
              {!loading && filteredRecords.map(record => (
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
                    {formatCurrency(record.amount)}
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

