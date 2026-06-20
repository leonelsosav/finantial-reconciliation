import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { useFinancials } from '../hooks/useFinancials';
import type { StaffRecord } from '../types';
import { 
  TrendingUp, 
  Wallet, 
  AlertTriangle, 
  ArrowRight, 
  Filter, 
  Download,
  Percent
} from 'lucide-react';
import styles from './Dashboard.module.scss';

const CHART_DAYS = [
  { day: 'Nov 01', inflow: 40, outflow: 30 },
  { day: 'Nov 04', inflow: 55, outflow: 45 },
  { day: 'Nov 07', inflow: 45, outflow: 50 },
  { day: 'Nov 10', inflow: 70, outflow: 60 },
  { day: 'Nov 13', inflow: 60, outflow: 55 },
  { day: 'Nov 16', inflow: 85, outflow: 70 },
  { day: 'Nov 19', inflow: 75, outflow: 80 },
  { day: 'Nov 22', inflow: 90, outflow: 85, active: true },
  { day: 'Nov 25', inflow: 65, outflow: 50 },
  { day: 'Nov 28', inflow: 50, outflow: 40 },
  { day: 'Nov 30', inflow: 80, outflow: 75 },
  { day: 'Today', inflow: 95, outflow: 85 },
];

const RETAINER_HEALTH = [
  { name: 'Global Tech Solutions Corp', pct: 82, cap: '$1.2M Cap', used: '-$984k Used', variant: 'primary' },
  { name: 'Horizon Financial Partners', pct: 45, cap: '$850k Cap', used: '-$382k Used', variant: 'success' },
  { name: 'Nexus Logistics Group', pct: 95, cap: '$500k Cap', used: 'Low Balance', variant: 'danger' },
  { name: 'Stellar Media Systems', pct: 12, cap: '$1.5M Cap', used: '-$180k Used', variant: 'neutral' },
];

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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className={styles.container}>
      {/* Breadcrumbs */}
      <div className={styles.breadcrumbs}>
        <span>Main Hub</span>
        <span className={styles.separator}>/</span>
        <span className={styles.activePage}>Executive Dashboard</span>
      </div>

      {/* Top Row: Metric Cards */}
      <div className={styles.metricsGrid}>
        {/* Card 1: Total Bank Cash Flow */}
        <div className={`${styles.metricCard} ${styles.cardPrimary}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Total Bank Cash Flow</span>
            <div className={`${styles.cardIcon} ${styles.iconPrimary}`}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>{formatCurrency(financials.totalCashFlow)}</h2>
            <span className={styles.cardBadge}>+4.2%</span>
          </div>
          <p className={styles.cardSub}>Aggregate across 17 entities</p>
        </div>

        {/* Card 2: True Net Utility */}
        <div className={`${styles.metricCard} ${styles.cardSuccess}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>True Net Utility</span>
            <div className={`${styles.cardIcon} ${styles.iconSuccess}`}>
              <Percent size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>{formatCurrency(financials.netUtility)}</h2>
            <span className={styles.cardBadge}>+1.8%</span>
          </div>
          <p className={styles.cardSub}>Post commissions & fees</p>
        </div>

        {/* Card 3: Active Client Retainers */}
        <div className={`${styles.metricCard} ${styles.cardNeutral}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Active Client Retainers</span>
            <div className={`${styles.cardIcon} ${styles.iconNeutral}`}>
              <Wallet size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>{formatCurrency(financials.retainerBalance)}</h2>
            <span className={`${styles.cardBadge} ${styles.badgeStable}`}>STABLE</span>
          </div>
          <p className={styles.cardSub}>Current Escrow Capital</p>
        </div>

        {/* Card 4: Unreconciled Anomalies */}
        <div className={`${styles.metricCard} ${styles.cardDanger}`}>
          <div className={styles.cardIndicator}></div>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Unreconciled Anomalies</span>
            <div className={`${styles.cardIcon} ${styles.iconDanger}`}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className={styles.cardContent}>
            <h2 className={styles.cardValue}>{financials.unreconciledCount}</h2>
            <span className={`${styles.cardBadge} ${styles.badgeDanger}`}>CRITICAL</span>
          </div>
          <p className={styles.cardSub}>Immediate action required</p>
        </div>
      </div>

      {/* Main Body Grid */}
      <div className={styles.dashboardGrid}>
        {/* Daily Cash Inflow vs. Outflow Chart */}
        <section className={styles.chartSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Daily Cash Inflow vs. Outflow</h3>
              <p className={styles.sectionSub}>30-day liquidity visualization</p>
            </div>
            <div className={styles.chartControls}>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotPrimary}`}></span>
                <span>Inflow</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotSuccess}`}></span>
                <span>Outflow</span>
              </div>
              <select className={styles.chartSelect}>
                <option>Last 30 Days</option>
                <option>Last Quarter</option>
              </select>
            </div>
          </div>

          <div className={styles.chartContainer}>
            <div className={styles.chartBars}>
              {CHART_DAYS.map((d, index) => (
                <div key={index} className={styles.barGroup}>
                  <div className={styles.barWrapper}>
                    <div 
                      className={`${styles.barInflow} ${d.active ? styles.barActive : ''}`} 
                      style={{ height: `${d.inflow}%` }}
                      title={`Inflow: ${d.inflow}%`}
                    ></div>
                    <div 
                      className={`${styles.barOutflow} ${d.active ? styles.barActive : ''}`} 
                      style={{ height: `${d.outflow}%` }}
                      title={`Outflow: ${d.outflow}%`}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.chartLabels}>
              {CHART_DAYS.filter((_, i) => i % 3 === 0 || i === CHART_DAYS.length - 1).map((d, i) => (
                <span key={i}>{d.day}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Retainer Health Panel */}
        <section className={styles.healthSection}>
          <h3 className={styles.sectionTitle}>Retainer Health</h3>
          <p className={styles.sectionSub}>Balances vs. Disbursed Payroll</p>

          <div className={styles.healthList}>
            {RETAINER_HEALTH.map((item, index) => (
              <div key={index} className={styles.healthItem}>
                <div className={styles.healthMeta}>
                  <span className={styles.clientName}>{item.name}</span>
                  <span className={styles.healthPct}>{item.pct}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div 
                    className={`${styles.progressBar} ${styles[item.variant]}`}
                    style={{ width: `${item.pct}%` }}
                  ></div>
                </div>
                <div className={styles.healthDetails}>
                  <span>{item.cap}</span>
                  <span className={item.variant === 'danger' ? styles.lowText : ''}>{item.used}</span>
                </div>
              </div>
            ))}
          </div>

          <button className={styles.viewRetainersBtn}>
            <span>View All Client Retainers</span>
            <ArrowRight size={14} />
          </button>
        </section>
      </div>

      {/* Bottom Detail Table: Recent Large Volume Transactions */}
      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>Recent Large Volume Transactions</h3>
          <div className={styles.tableActions}>
            <button className={styles.tableBtn}>
              <Filter size={16} />
            </button>
            <button className={styles.tableBtn}>
              <Download size={16} />
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {loading ? (
            <p className={styles.loadingText}>Loading transactions...</p>
          ) : records.length === 0 ? (
            <p className={styles.emptyText}>No recent transactions found.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className={styles.textRight}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 5).map(record => (
                  <tr key={record.id} className={styles.row}>
                    <td className={styles.cellMono}>{record.operation_date}</td>
                    <td className={styles.cellBold}>{record.clients?.name || 'Unknown Entity'}</td>
                    <td>
                      <span className={styles.typeBadge}>
                        {record.entry_type === 'funding' 
                          ? 'CLIENT_RETAINER' 
                          : record.entry_type === 'fee' 
                          ? 'RECON_ADJUST' 
                          : 'PAYROLL_DISB'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.statusCell}>
                        <span className={`${styles.statusDot} ${record.is_reconciled ? styles.dotSuccess : styles.dotDanger}`}></span>
                        <span className={`${styles.statusText} ${record.is_reconciled ? styles.textSuccess : styles.textDanger}`}>
                          {record.is_reconciled ? 'Matched' : 'Flagged'}
                        </span>
                      </div>
                    </td>
                    <td className={`${styles.cellMono} ${styles.textRight} ${styles.cellBold}`}>
                      {formatCurrency(record.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
