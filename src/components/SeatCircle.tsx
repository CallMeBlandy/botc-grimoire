import type { ReactNode } from "react";

interface Props {
  count: number;
  renderSeat: (index: number) => ReactNode;
  center?: ReactNode;
}

// Lays out `count` seats evenly around a circle. Seat 0 sits at the top and
// they proceed clockwise (matching how you'd sit around a real table).
export function SeatCircle({ count, renderSeat, center }: Props) {
  const seats = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 42 * Math.sin(angle);
    seats.push(
      <div
        key={i}
        className="seat-slot"
        style={{ left: `${x}%`, top: `${y}%` }}
      >
        {renderSeat(i)}
      </div>,
    );
  }
  return (
    <div className="seat-circle">
      {seats}
      {center && <div className="seat-circle__center">{center}</div>}
    </div>
  );
}
