export default function TrainList({ trains, selectedTrain, onSelect }) {
    if (trains.length === 0) return <p>No trains available.</p>;

    return (
        <div className="train-list">
            {trains.map(train => (
                <div
                    key={train.id}
                    className={`train-item ${selectedTrain?.id === train.id ? 'selected' : ''}`}
                    onClick={() => onSelect(train)}
                >
                    <div className="train-info">
                        <h3>{train.name}</h3>
                        <p>{train.source} → {train.destination}</p>
                    </div>
                    <div className="train-date">
                        {new Date(train.date).toLocaleDateString()}
                    </div>
                </div>
            ))}
        </div>
    );
}
