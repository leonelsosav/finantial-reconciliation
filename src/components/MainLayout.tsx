import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { InternalCompany, BankTransaction } from '../types';
import { 
  LogOut, 
  LayoutDashboard, 
  Landmark, 
  ShieldCheck, 
  Bell, 
  HelpCircle, 
  Building2, 
  User, 
  Plus,
  CloudUpload
} from 'lucide-react';
import styles from './MainLayout.module.scss';

export const MainLayout = () => {
  const { profile, signOut, selectedCompanyId, setSelectedCompanyId } = useAuth();
  const navigate = useNavigate();

  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');
  const { data: anomalies, fetchData: fetchAnomalies } = useDatabase<BankTransaction>('bank_transactions');

  const [showNotifications, setShowNotifications] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    const filters: any[] = [{ column: 'is_reconciled', operator: 'eq', value: false }];
    if (selectedCompanyId) {
      filters.push({ column: 'internal_company_id', operator: 'eq', value: selectedCompanyId });
    }
    fetchAnomalies({
      filters,
      limit: 25,
      sort: { column: 'transaction_date', direction: 'desc' }
    });
  }, [selectedCompanyId, fetchAnomalies]);

  // Close notifications popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
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

  return (
    <div className={styles.layout}>
      {/* Global SideNavBar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}>
            <Building2 size={18} />
          </div>
          <div>
            <h1 className={styles.logoTitle}>Única Fuente</h1>
            <p className={styles.logoSub}>Fuente de Verdad</p>
          </div>
        </div>

        <nav className={styles.nav}>
          <NavLink 
            to="/" 
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>

          {(profile?.role === 'owner' || profile?.role === 'auditor') && (
            <NavLink 
              to="/reconciliation" 
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <ShieldCheck size={18} />
              <span>Conciliaciones</span>
            </NavLink>
          )}

          {(profile?.role === 'owner' || profile?.role === 'ops') && (
            <NavLink 
              to="/vault" 
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <CloudUpload size={18} />
              <span>Bóveda Ingestión</span>
            </NavLink>
          )}

          {profile?.role === 'owner' && (
            <NavLink 
              to="/bank" 
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <Landmark size={18} />
              <span>Gestión de Bancos</span>
            </NavLink>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <button 
            onClick={() => navigate('/reconciliation', { state: { triggerUpload: true } })} 
            className={styles.newReconBtn}
          >
            <Plus size={16} />
            <span>Nueva Conciliación</span>
          </button>

          <div className={styles.footerLink}>
            <User size={16} />
            <span>Perfil de Usuario</span>
          </div>

          <button onClick={handleSignOut} className={styles.logoutBtn}>
            <LogOut size={16} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className={styles.mainShell}>
        {/* TopNavBar */}
        <header className={styles.topHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.entitySelector}>
              <Building2 size={16} className={styles.entityIcon} />
              <span className={styles.entityLabel}>Selector de Entidad:</span>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                disabled={profile?.role !== 'owner'}
                className={styles.entitySelectDropdown}
              >
                {profile?.role === 'owner' && (
                  <option value="">Todas las Entidades</option>
                )}
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.notificationWrapper} ref={popoverRef}>
              <button 
                className={`${styles.headerBtn} ${showNotifications ? styles.btnActive : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={18} />
                {anomalies.length > 0 && <span className={styles.notificationDot}></span>}
              </button>
              
              {showNotifications && (
                <div className={styles.notificationsPopover}>
                  <div className={styles.popoverHeader}>
                    <h4>Anomalías sin Conciliar ({anomalies.length})</h4>
                  </div>
                  <div className={styles.popoverContent}>
                    {anomalies.length === 0 ? (
                      <p className={styles.emptyNotification}>No hay anomalías pendientes.</p>
                    ) : (
                      anomalies.map(anomaly => (
                        <div 
                          key={anomaly.id} 
                          className={styles.notificationItem}
                          onClick={() => {
                            setShowNotifications(false);
                            navigate('/reconciliation', { state: { selectedBankTxId: anomaly.id } });
                          }}
                        >
                          <div className={styles.notificationMeta}>
                            <span className={styles.notificationDate}>{anomaly.transaction_date}</span>
                            <span className={styles.notificationAmount}>
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(anomaly.amount)}
                            </span>
                          </div>
                          <p className={styles.notificationDesc}>{anomaly.description || 'Transacción Bancaria'}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button className={styles.headerBtn}>
              <HelpCircle size={18} />
            </button>
            <div className={styles.divider}></div>
            
            <div className={styles.userProfile}>
              <div className={styles.userMeta}>
                <p className={styles.userName}>{profile?.full_name || 'Usuario'}</p>
                <p className={styles.userRole}>
                  {profile?.role === 'owner' ? 'Propietario Ejecutivo' : 
                   profile?.role === 'ops' ? 'Gerente de Operaciones' : 'Auditor'}
                </p>
              </div>
              <div className={styles.avatar}>
                {getInitials(profile?.full_name)}
              </div>
            </div>
          </div>
        </header>

        {/* Workspace Content */}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

