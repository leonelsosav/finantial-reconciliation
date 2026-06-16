import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { useFinancials } from '../hooks/useFinancials';
import { StatCard } from '../components/StatCard';
import { Card } from '../components/Card';
import type { StaffRecord } from '../types';
import { TrendingUp, Wallet, AlertCircle, BarChart3, Building2 } from 'lucide-react';
import styles from './Dashboard.module.scss';

export const Dashboard = () => {
  const { profile } = useAuth();
  const { data: records, loading, fetchData: fetchRecords } = useDatabase<StaffRecord>('staff_records');
  const financials = useFinancials(records);

  useEffect(() => {
    const options: any = {
      select: '*, clients(name)',
      sort: { column: 'created_at', direction: 'desc' }
    };

    if (profile?.role !== 'owner' && profile?.internal_company_id) {
      options.filters = [{ column: 'internal_company_id', operator: 'eq', value: profile.internal_company_id }];
    }

    fetchRecords(options);
  }, [profile, fetchRecords]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.welcome}>
          <h1>Hola, {profile?.full_name?.split(' ')[0] || 'Usuario'}</h1>
          <p>Resumen de operaciones financieras para {profile?.role === 'owner' ? 'todas las entidades' : 'tu entidad'}</p>
        </div>
        {profile?.role === 'owner' && (
          <div className={styles.entityTag}>
            <Building2 size={16} />
            <span>Vista Global (17 Entidades)</span>
          </div>
        )}
      </header>

      <div className={styles.statsGrid}>
        <StatCard 
          title="Utilidad Neta (Honorarios)" 
          value={formatCurrency(financials.netUtility)} 
          subtitle="Ingresos devengados"
          icon={<BarChart3 size={24} />}
          variant="blue"
        />
        <StatCard 
          title="Saldos a Favor (Retainers)" 
          value={formatCurrency(financials.retainerBalance)} 
          subtitle="Pasivo operativo"
          icon={<Wallet size={24} />}
          variant="green"
        />
        <StatCard 
          title="Flujo de Caja Total" 
          value={formatCurrency(financials.totalCashFlow)} 
          subtitle="Saldo disponible proyectado"
          icon={<TrendingUp size={24} />}
          variant="purple"
        />
        <StatCard 
          title="Alertas de Conciliación" 
          value={financials.unreconciledCount.toString()} 
          subtitle="Registros pendientes"
          icon={<AlertCircle size={24} />}
          variant={financials.unreconciledCount > 0 ? 'orange' : 'gray'}
        />
      </div>

      <Card 
        title="Actividad Reciente" 
        headerAction={<button className={styles.viewAll}>Ver todo</button>}
      >
        <div className={styles.activityList}>
          {loading ? (
            <p className={styles.empty}>Cargando actividad...</p>
          ) : records.length === 0 ? (
            <p className={styles.empty}>No hay movimientos recientes.</p>
          ) : (
            records.slice(0, 5).map(record => (
              <div key={record.id} className={styles.activityItem}>
                <div className={styles.activityMain}>
                  <p className={styles.activityTitle}>{record.clients?.name}</p>
                  <p className={styles.activityMeta}>
                    {record.entry_type === 'funding' ? 'Fondeo' : record.entry_type === 'fee' ? 'Comisión' : 'Nómina'} • {record.operation_date}
                  </p>
                </div>
                <div className={`${styles.activityAmount} ${record.entry_type === 'payroll' ? styles.negative : styles.positive}`}>
                  {record.entry_type === 'payroll' ? '-' : '+'} {formatCurrency(record.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
