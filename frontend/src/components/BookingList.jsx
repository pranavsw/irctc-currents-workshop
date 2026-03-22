export default function BookingList({ bookings }) {
    if (!bookings || bookings.length === 0) return <p>No bookings yet.</p>;

    return (
        <div className="booking-list">
            <h3>📜 Recent Bookings Record</h3>
            <table>
                <thead>
                    <tr>
                        <th>Booking ID</th>
                        <th>Seat Number</th>
                        <th>Booked By (User)</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    {bookings.map(b => (
                        <tr key={b.booking_id}>
                            <td>#{b.booking_id}</td>
                            <td><strong>{b.seat_number}</strong></td>
                            <td>{b.user_name}</td>
                            <td>{new Date(b.booking_time).toLocaleTimeString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
