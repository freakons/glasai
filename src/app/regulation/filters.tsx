'use client';

import { useState } from 'react';

const TYPES = ['All', 'Laws', 'Bills', 'Exec Orders', 'Policy', 'Reports'];

export function RegulationFilters() {
  const [active, setActive] = useState('All');

  return (
    <div className="filters">
      {TYPES.map((type) => (
        <button
          key={type}
          className={`fp${active === type ? ' on' : ''}`}
          onClick={() => setActive(type)}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
