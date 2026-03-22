export default function SeatMap({ seats, selectedSeat, onSelect }) {
    if (seats.length === 0) return <p>Loading seats...</p>;

    return (
        <div className="seat-grid">
            {seats.map(seat => {
                const isBooked = seat.status === 'booked';
                const isSelected = selectedSeat?.id === seat.id;
                const bookingCount = parseInt(seat.booking_count) || 0;
                const isDoubleBooked = bookingCount > 1;

                let classes = ['seat'];
                if (isDoubleBooked) classes.push('double-booked');
                else if (isBooked) classes.push('booked');
                else if (isSelected) classes.push('selected');
                else classes.push('available');

                return (
                    <div
                        key={seat.id}
                        className={classes.join(' ')}
                        onClick={() => {
                            if (!isBooked) onSelect(seat);
                        }}
                        title={isDoubleBooked ? `CRITICAL: Seat booked by ${bookingCount} different people!` : ''}
                    >
                        {seat.seat_number}
                        {isDoubleBooked && <span className="warning-badge">x{bookingCount}</span>}
                    </div>
                );
            })}
        </div>
    );
}
