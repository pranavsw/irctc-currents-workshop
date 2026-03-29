import { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import TrainList from './components/TrainList';
import SeatMap from './components/SeatMap';
import Login from './pages/Login';
import BookingsPage from './pages/BookingsPage';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:43000/api';

function App() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  const handleLogout = () => {
    setUser(null);
    navigate('/');
  };

  if (!user) {
    return (
      <div className="container">
        <Login onLogin={setUser} />
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>🚆 IRCTC Dismantled</h1>
          <p>Concurrency & Scaling Workshop</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span>Welcome, <strong>{user.name}</strong></span>
          <Link to="/" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold' }}>Book Tickets</Link>
          <Link to="/bookings" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 'bold' }}>Ledger</Link>
          <button onClick={handleLogout} style={{ background: '#ef4444', padding: '0.5rem 1rem' }}>Logout</button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<BookingSystem user={user} />} />
        <Route path="/bookings" element={<BookingsPage />} />
      </Routes>
    </div>
  );
}

function BookingSystem({ user }) {
  const [trains, setTrains] = useState([]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [bookingMode, setBookingMode] = useState('naive');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchStrategy = async () => {
    try {
      const res = await axios.get(`${API_BASE}/strategy`);
      setBookingMode(res.data.strategy);
    } catch (err) { }
  };

  useEffect(() => {
    fetchTrains();
    fetchStrategy();
    const interval = setInterval(fetchStrategy, 5000); // Polling for strategy updates
    return () => clearInterval(interval);
  }, []);

  const handleStrategyChange = async (e) => {
    const newStrategy = e.target.value;
    try {
      await axios.post(`${API_BASE}/strategy`, { strategy: newStrategy, username: user.name });
      setBookingMode(newStrategy);
      showMessage('success', `Strategy changed to ${newStrategy}`);
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to change strategy');
      fetchStrategy(); // revert
    }
  };

  useEffect(() => {
    if (selectedTrain) {
      fetchSeats(selectedTrain.id);
      const interval = setInterval(() => { fetchSeats(selectedTrain.id) }, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTrain]);

  const fetchTrains = async () => {
    try {
      const res = await axios.get(`${API_BASE}/trains`);
      setTrains(res.data);
    } catch (err) {
      showMessage('error', 'Failed to load trains');
    }
  };

  const fetchSeats = async (trainId) => {
    try {
      const res = await axios.get(`${API_BASE}/trains/${trainId}/seats`);
      setSeats(res.data);

      if (selectedSeat) {
        const updatedSeat = res.data.find(s => s.id === selectedSeat?.id);
        if (updatedSeat && updatedSeat.status === 'booked') setSelectedSeat(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBook = async () => {
    if (!selectedTrain || !selectedSeat) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await axios.post(`${API_BASE}/book`, {
        userId: user.id,
        trainId: selectedTrain.id,
        seatId: selectedSeat.id
      });
      showMessage('success', `Booking successful! ID: ${res.data.bookingId}`);
      setSelectedSeat(null);
      fetchSeats(selectedTrain.id);
    } catch (err) {
      showMessage('error', err.response?.data?.error || err.message);
      fetchSeats(selectedTrain.id);
      setSelectedSeat(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await axios.post(`${API_BASE}/reset`);
      showMessage('success', 'Database reset successful');
      if (selectedTrain) fetchSeats(selectedTrain.id);
    } catch (err) {
      showMessage('error', 'Failed to reset DB');
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <>
      <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
        <button onClick={handleReset} style={{ background: '#64748b', padding: '0.5rem 1rem' }}>Reset DB Data</button>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="card">
        <h2>Select Train</h2>
        <TrainList
          trains={trains}
          selectedTrain={selectedTrain}
          onSelect={(t) => { setSelectedTrain(t); setSelectedSeat(null); }}
        />
      </div>

      {selectedTrain && (
        <div className="card">
          <h2>Select Seat for {selectedTrain.name}</h2>
          <SeatMap seats={seats} selectedSeat={selectedSeat} onSelect={setSelectedSeat} />

          <div className="controls">
            <div className="mode-selector">
              <label htmlFor="mode"><strong>Booking Mode (Concurrency Strategy)</strong></label>
              {user.name === 'Admin' ? (
                <select id="mode" value={bookingMode} onChange={handleStrategyChange}>
                  <option value="naive">Naive Mode (No Lock - Race Conditions)</option>
                  <option value="db-lock">Database Lock (Pessimistic Row Lock)</option>
                  <option value="redis-lock">Redis Distributed Lock</option>
                </select>
              ) : (
                <div style={{ padding: '0.5rem', background: '#e2e8f0', borderRadius: '4px', marginTop: '0.5rem' }}>
                  {bookingMode === 'naive' ? 'Naive Mode (No Lock - Race Conditions)' : 
                   bookingMode === 'db-lock' ? 'Database Lock (Pessimistic Row Lock)' : 
                   'Redis Distributed Lock'}
                </div>
              )}
            </div>

            <button onClick={handleBook} disabled={!selectedSeat || loading}>
              {loading ? 'Booking...' : `Book Selected Seat as ${user.name}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
