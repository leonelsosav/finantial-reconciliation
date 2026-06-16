import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogOut, LayoutDashboard, FileText, Landmark, ShieldCheck } from 'lucide-react';
import styles from './MainLayout.module.scss';

export const MainLayout = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <h2>Conciliación</h2>
          <span className={styles.roleTag}>
            {profile?.role === 'owner' ? 'Administrador' : 
             profile?.role === 'ops' ? 'Operaciones' : 'Auditor'}
          </span>
        </div>

        <nav className={styles.nav}>
          <Link to="/" className={styles.navItem}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>

          {(profile?.role === 'owner' || profile?.role === 'ops') && (
            <Link to="/ledger" className={styles.navItem}>
              <FileText size={20} />
              <span>Operaciones</span>
            </Link>
          )}

          {(profile?.role === 'owner' || profile?.role === 'auditor') && (
            <Link to="/reconciliation" className={styles.navItem}>
              <ShieldCheck size={20} />
              <span>Conciliación</span>
            </Link>
          )}

          {profile?.role === 'owner' && (
            <Link to="/bank" className={styles.navItem}>
              <Landmark size={20} />
              <span>Bancos</span>
            </Link>
          )}
        </nav>

        <div className={styles.footer}>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{profile?.full_name || profile?.email}</p>
          </div>
          <button onClick={handleSignOut} className={styles.logoutBtn}>
            <LogOut size={18} />
            <span>Salir</span>
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Sistema de Gestión Financiera</h1>
        </header>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};
