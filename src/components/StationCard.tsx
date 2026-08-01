import type { ReactElement } from "react";
import { stationLabel } from "../lib/geo";
import type { EnrichedStation, StationCardUi } from "../types/metro";

export type StationCardProps = {
  station: EnrichedStation;
  ui: StationCardUi;
  onClose: () => void;
  onGo: (stationId: number) => void;
  onLeavingEnd: () => void;
};

export default function StationCard({
  station,
  ui,
  onClose,
  onGo,
  onLeavingEnd,
}: StationCardProps): ReactElement {
  return (
    <aside
      className={`stationCard${ui === "leaving" ? " isLeaving" : ""}`}
      aria-live="polite"
      onAnimationEnd={() => {
        if (ui === "leaving") onLeavingEnd();
      }}
    >
      <div className="stationCardHead">
        <div className="title">
          <strong>{stationLabel(station)}</strong>
          <small>{station.name}</small>
        </div>
        <button
          type="button"
          className="stationCardClose"
          aria-label="بستن"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.89 18.3 9.17 12 2.89 5.71 4.3 4.29l6.29 6.3 6.29-6.3z"
            />
          </svg>
        </button>
      </div>

      <div className="stationCardLines">
        {station.timing_lines.map((line) => (
          <b
            key={line.id}
            className="stationCardLine"
            style={{ backgroundColor: line.data.color }}
          >
            {line.data.title} · {stationLabel(line.start.data)} ←{" "}
            {stationLabel(line.end.data)}
          </b>
        ))}
      </div>

      <button
        type="button"
        className="stationCardGo"
        onClick={() => onGo(station.id)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
          />
        </svg>
        <span>رفتن به اینجا</span>
      </button>
    </aside>
  );
}
