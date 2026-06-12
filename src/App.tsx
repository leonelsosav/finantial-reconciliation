import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/MainLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

export const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route path="/" element={<Dashboard />} />
            {/* Placeholder routes for next phases */}
            <Route path="/ledger" element={<div>Libro Diario (Próximamente)</div>} />
            <Route path="/reconciliation" element={<div>Conciliación (Próximamente)</div>} />
            <Route path="/bank" element={<div>Bancos (Próximamente)</div>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};
