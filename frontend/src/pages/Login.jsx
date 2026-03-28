import { useState } from 'react';
import axios from 'axios';

export default function Login({ onLogin }) {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username.trim()) return;

        try {
            const API_BASE = '/api';
            const res = await axios.post(`${API_BASE}/login`, { username });
            onLogin(res.data);
        } catch (err) {
            setError('Login failed');
        }
    };

    return (
        <div className="card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
            <h2>Login to IRCTC Dismantled</h2>
            {error && <p className="alert alert-error">{error}</p>}
            <form onSubmit={handleLogin}>
                <input
                    type="text"
                    placeholder="Enter your username (e.g. Aditi)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <button type="submit" style={{ width: '100%' }}>Login / Register</button>
            </form>
        </div>
    );
}
