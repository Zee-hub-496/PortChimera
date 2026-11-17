import { Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing.jsx';

// Routes for the other pages are added as their specs are implemented.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
    </Routes>
  );
}
