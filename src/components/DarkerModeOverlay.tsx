'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function DarkerModeOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const RADIUS = 120;

    const update = (x: number, y: number) => {
      if (!overlayRef.current) return;
      overlayRef.current.style.background = `radial-gradient(
        circle ${RADIUS}px at ${x}px ${y}px,
        rgba(0,0,0,0.15) 0%,
        rgba(0,0,0,0.55) 40%,
        rgba(0,0,0,0.92) 70%,
        rgba(0,0,0,0.97) 100%
      )`;
    };

    // Start at centre so the page isn't totally invisible on load
    update(window.innerWidth / 2, window.innerHeight / 2);

    const onMove = (e: MouseEvent) => update(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return createPortal(
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        transition: 'background 0.05s linear',
      }}
    />,
    document.body
  );
}
