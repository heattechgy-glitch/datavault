import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Upload from './pages/Upload.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import Navbar from './components/Navbar.jsx';

function App() {
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0);

  const handleDataUploaded = () => {
    setDataRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/upload" element={<Upload onDataUploaded={handleDataUploaded} />} />
          <Route path="/dashboard" element={<Dashboard refreshTrigger={dataRefreshTrigger} />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;