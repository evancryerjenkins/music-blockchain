'use client';

import { useMemo } from 'react';

export default function StarField() {
  const stars = useMemo(() => {
    return Array.from({ length: 120 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() < 0.8 ? 1 : 2,
      opacity: 0.2 + Math.random() * 0.6,
      duration: 3 + Math.random() * 6,
      delay: Math.random() * 8,
    }));
  }, []);

  return (
    <div className="stars-container" aria-hidden>
      {stars.map(s => (
        <div
          key={s.id}
          className="star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            '--opacity': s.opacity,
            '--duration': `${s.duration}s`,
            '--delay': `${s.delay}s`,
          } as React.CSSProperties}
        />
      ))}
      {/* Nebula gradients */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.05) 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, rgba(236,72,153,0.04) 0%, transparent 40%)',
      }} />
    </div>
  );
}
