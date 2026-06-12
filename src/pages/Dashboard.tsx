import { useAuth } from '../hooks/useAuth';

export const Dashboard = () => {
  const { profile } = useAuth();

  return (
    <div>
      <h2>Bienvenido, {profile?.full_name || 'Usuario'}</h2>
      <p>Este es el panel de control de conciliación financiera.</p>
      
      <div style={{ marginTop: '2rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#64748b' }}>Balance Total</h3>
          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>$0.00</p>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#64748b' }}>Pendiente de Conciliar</h3>
          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>0</p>
        </div>
      </div>
    </div>
  );
};
