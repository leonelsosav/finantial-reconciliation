import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { 
  LogOut, 
  LayoutDashboard, 
  FileSpreadsheet, 
  Landmark, 
  ShieldCheck, 
  Search, 
  Bell, 
  HelpCircle, 
  ChevronDown, 
  Building2, 
  User, 
  Plus 
} from 'lucide-react';
import styles from './MainLayout.module.scss';

export const MainLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

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
              to="/ledger" 
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <FileSpreadsheet size={18} />
              <span>Libro Diario</span>
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
            onClick={() => navigate('/reconciliation')} 
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
              <span className={styles.entityValue}>
                {profile?.role === 'owner' ? 'Todas las Entidades (17)' : 'Entidad Activa'}
              </span>
              <ChevronDown size={14} className={styles.chevron} />
            </div>
            <div className={styles.divider}></div>
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Buscar transacciones, entidades..." 
                className={styles.searchInput}
              />
            </div>
          </div>

          <div className={styles.headerRight}>
            <button className={styles.headerBtn}>
              <Bell size={18} />
              <span className={styles.notificationDot}></span>
            </button>
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

