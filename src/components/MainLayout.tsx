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
            <p className={styles.logoSub}>Source of Truth</p>
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
              <span>Reconciliations</span>
            </NavLink>
          )}

          {(profile?.role === 'owner' || profile?.role === 'ops') && (
            <NavLink 
              to="/ledger" 
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <FileSpreadsheet size={18} />
              <span>Payroll Runs</span>
            </NavLink>
          )}

          {profile?.role === 'owner' && (
            <NavLink 
              to="/bank" 
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <Landmark size={18} />
              <span>Entity Manager</span>
            </NavLink>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <button 
            onClick={() => navigate('/reconciliation')} 
            className={styles.newReconBtn}
          >
            <Plus size={16} />
            <span>New Reconciliation</span>
          </button>

          <div className={styles.footerLink}>
            <User size={16} />
            <span>User Profile</span>
          </div>

          <button onClick={handleSignOut} className={styles.logoutBtn}>
            <LogOut size={16} />
            <span>Sign Out</span>
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
              <span className={styles.entityLabel}>Entity Selector:</span>
              <span className={styles.entityValue}>
                {profile?.role === 'owner' ? 'All Entities (17)' : 'Active Entity'}
              </span>
              <ChevronDown size={14} className={styles.chevron} />
            </div>
            <div className={styles.divider}></div>
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Search transactions, entities..." 
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
                <p className={styles.userName}>{profile?.full_name || 'User'}</p>
                <p className={styles.userRole}>
                  {profile?.role === 'owner' ? 'Exec. Owner' : 
                   profile?.role === 'ops' ? 'Ops Manager' : 'Auditor'}
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

