import { TICKERS } from '@/lib/data/ticker';

export function Ticker() {
  // Duplicate items for seamless infinite scroll
  const items = [...TICKERS, ...TICKERS];

  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((tick, i) => (
          <span key={i}>
            <span className="tick-item">
              <span className={`tick-tag ${tick.tag}`}>{tick.tag}</span>
              {tick.text}
            </span>
            <span className="tick-sep">&middot;</span>
          </span>
        ))}
      </div>
    </div>
  );
}
