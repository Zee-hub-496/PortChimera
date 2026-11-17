import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

export default function Landing() {
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    apiGet('/api/health')
      .then((data) => setApiStatus(data.status))
      .catch(() => setApiStatus('unreachable'));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold">PortChimera</h1>
      <p className="max-w-xl text-center text-slate-300">
        AI reads the documents. Deterministic code checks them. A* routes the cargo.
      </p>
      <p className="text-sm text-slate-400">
        API status: <span className="font-mono">{apiStatus}</span>
      </p>
    </main>
  );
}
