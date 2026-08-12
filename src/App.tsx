import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PeriodProvider } from './context/PeriodContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/MainLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { BankManagement } from './pages/BankManagement';
import { Reconciliation } from './pages/Reconciliation';
import { Vault } from './pages/Vault';
import { Directory } from './pages/Directory';
import { Help } from './pages/Help';

export const App = () => {
  return (
    <BrowserRouter>
      <PeriodProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route path="/" element={<ProtectedRoute allowedRoles={['owner']}><Dashboard /></ProtectedRoute>} />
              <Route path="/directory" element={<ProtectedRoute allowedRoles={['owner']}><Directory /></ProtectedRoute>} />
              <Route path="/bank" element={<ProtectedRoute allowedRoles={['owner', 'auditor']}><BankManagement /></ProtectedRoute>} />
              <Route path="/reconciliation" element={<ProtectedRoute allowedRoles={['owner', 'auditor']}><Reconciliation /></ProtectedRoute>} />
              <Route path="/vault" element={<ProtectedRoute allowedRoles={['owner', 'ops']}><Vault /></ProtectedRoute>} />
              <Route path="/help" element={<Help />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </PeriodProvider>
    </BrowserRouter>
  );
};
