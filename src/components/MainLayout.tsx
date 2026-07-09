import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { InternalCompany } from '../types';
import {
  LogOut,
  LayoutDashboard,
  Landmark,
  ShieldCheck,
  Building2,
  Plus,
  CloudUpload,
  Users
} from 'lucide-react';
import styles from './MainLayout.module.scss';

export const MainLayout = () => {
  const { profile, signOut, selectedCompanyId, setSelectedCompanyId } = useAuth();
  const navigate = useNavigate();

  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
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
          {profile?.role === 'owner' && (
            <NavLink
              to="/"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
          )}

          {profile?.role === 'owner' && (
            <NavLink
              to="/directory"
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <Users size={18} />
              <span>Directorio</span>
            </NavLink>
          )}

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
              <span>Cargar Facturas</span>
            </NavLink>
          )}

          {(profile?.role === 'owner' || profile?.role === 'auditor') && (
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
          {profile?.role !== 'ops' && (
            <button
              onClick={() => navigate('/reconciliation', { state: { triggerUpload: true } })}
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

