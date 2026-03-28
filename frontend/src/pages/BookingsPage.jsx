import { useState, useEffect } from 'react';
import axios from 'axios';
import BookingList from '../components/BookingList';

export default function BookingsPage() {
    const [bookings, setBookings] = useState([]);
    const [trains, setTrains] = useState([]);
    const [selectedTrainId, setSelectedTrainId] = useState('');

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:43000/api';

    useEffect(() => {
        axios.get(`${API_BASE}/trains`).then(res => {
            setTrains(res.data);
            if (res.data.length > 0) {
                setSelectedTrainId(res.data[0].id);
            }
        });
    }, [API_BASE]);

    useEffect(() => {
        if (selectedTrainId) {
            fetchBookings();
            const interval = setInterval(fetchBookings, 2000);
            return () => clearInterval(interval);
        }
    }, [selectedTrainId]);

    const fetchBookings = async () => {
        try {
            const res = await axios.get(`${API_BASE}/trains/${selectedTrainId}/bookings`);
            setBookings(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Live System Bookings Ledger</h2>
                <select
                    value={selectedTrainId}
                    onChange={e => setSelectedTrainId(e.target.value)}
                    style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px' }}
                >
                    {trains.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
            </div>
            <BookingList bookings={bookings} />
        </div>
    );
}
