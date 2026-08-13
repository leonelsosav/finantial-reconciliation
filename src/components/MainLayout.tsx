import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePeriod } from '../context/PeriodContext';
import { useDatabase } from '../hooks/useDatabase';
import type { Client } from '../types';
import {
  LogOut,
  LayoutDashboard,
  Landmark,
  ShieldCheck,
  Building2,
  Plus,
  CloudUpload,
  Users,
  HelpCircle,
  Menu,
  X
} from 'lucide-react';
import styles from './MainLayout.module.scss';

export const MainLayout = () => {
  const { profile, signOut } = useAuth();
  const { selectedMonth, setSelectedMonth, monthOptions } = usePeriod();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: clients = [], fetchData: fetchClients } = useDatabase<Client>('clients');

  useEffect(() => {
    if (profile?.role === 'owner') {
      fetchClients();
    }

    const handleClientsUpdated = () => {
      if (profile?.role === 'owner') {
        fetchClients();
      }
    };

    window.addEventListener('clients-updated', handleClientsUpdated);
    return () => {
      window.removeEventListener('clients-updated', handleClientsUpdated);
    };
  }, [profile, fetchClients]);

  const hasUngroupedClients = useMemo(() => {
    return clients.some(c => !c.client_group_id);
  }, [clients]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className={styles.layout}>
      {/* Backdrop overlay for mobile view */}
      {isMobileMenuOpen && (
        <div
          className={styles.sidebarBackdrop}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Global SideNavBar */}
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logoContainer}>
            <div className={styles.logoIcon}>
              <Building2 size={18} />
            </div>
            <div>
              <h1 className={styles.logoTitle}>Karpi</h1>
              <p className={styles.logoSub}>Karpi Finanzas</p>
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className={styles.sidebarCloseBtn}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className={styles.nav}>
          {profile?.role === 'owner' && (
            <NavLink
              to="/"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
          )}

          {profile?.role === 'owner' && (
            <NavLink
              to="/directory"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Users size={18} />
              {hasUngroupedClients && <span className={styles.navNotificationDot} />}
              <span>Directorio</span>
            </NavLink>
          )}

          {(profile?.role === 'owner' || profile?.role === 'auditor') && (
            <NavLink
              to="/reconciliation"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <ShieldCheck size={18} />
              <span>Conciliaciones</span>
            </NavLink>
          )}

          {(profile?.role === 'owner' || profile?.role === 'ops') && (
            <NavLink
              to="/vault"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <CloudUpload size={18} />
              <span>Cargar Facturas</span>
            </NavLink>
          )}

          {(profile?.role === 'owner' || profile?.role === 'auditor') && (
            <NavLink
              to="/bank"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Landmark size={18} />
              <span>Gestión de Bancos</span>
            </NavLink>
          )}

          <NavLink
            to="/help"
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <HelpCircle size={18} />
            <span>Soporte y Ayuda</span>
          </NavLink>
        </nav>

        <div className={styles.sidebarFooter}>
          {profile?.role !== 'ops' && (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                navigate('/reconciliation', { state: { triggerUpload: true } });
              }}
              className={styles.newReconBtn}
            >
              <Plus size={16} />
              <span>Nueva Conciliación</span>
            </button>
          )}

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
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className={styles.menuToggleBtn}
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
            <div className={styles.periodSelector}>
              <span className={styles.periodLabel}>Periodo Filtrado:</span>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className={styles.periodSelect}
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.headerRight}>
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

