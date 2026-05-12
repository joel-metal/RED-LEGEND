import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import CreateVault from './pages/CreateVault';
import VaultDetail from './pages/VaultDetail';
import ReleasePage from './pages/ReleasePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vault/new" element={<CreateVault />} />
        <Route path="/vault/:id" element={<VaultDetail />} />
        <Route path="/vault/:id/release" element={<ReleasePage />} />
      </Routes>
    </BrowserRouter>
  );
}
