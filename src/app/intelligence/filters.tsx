'use client';

import { useState } from 'react';

const CATEGORIES = ['All', 'Models', 'Agents', 'Funding', 'Research', 'Regulation', 'Products'];

export function IntelligenceFilters() {
  const [active, setActive] = useState('All');

  return (
    <div className="filters">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          className={`fp${active === cat ? ' on' : ''}`}
          onClick={() => setActive(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
