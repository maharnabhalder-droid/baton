"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function HeroConstellation() {
  const shouldReduceMotion = useReducedMotion();
  const [mousePos, setMousePos] = useState({ x: 300, y: 200 });

  // Constellation star nodes (evidence claims)
  const nodes = [
    { id: 1, x: 80, y: 220, label: "RFC-042", size: 6, verified: true },
    { id: 2, x: 210, y: 110, label: "Core Runtime", size: 8, verified: true },
    { id: 3, x: 360, y: 140, label: "Cluster Specs", size: 7, verified: true },
    { id: 4, x: 500, y: 220, label: "Sponsor API", size: 7, verified: false },
    { id: 5, x: 390, y: 310, label: "Telemetry Bus", size: 8, verified: true },
    { id: 6, x: 200, y: 300, label: "Vendor SLA", size: 6, verified: true },
  ];

  // Constellation lines (pathways along which the baton travels)
  const lines = [
    { from: 1, to: 2, d: "M 80 220 L 210 110" },
    { from: 2, to: 3, d: "M 210 110 L 360 140" },
    { from: 3, to: 4, d: "M 360 140 L 500 220" },
    { from: 4, to: 5, d: "M 500 220 L 390 310" },
    { from: 5, to: 6, d: "M 390 310 L 200 300" },
    { from: 6, to: 1, d: "M 200 300 L 80 220" },
    { from: 2, to: 5, d: "M 210 110 L 390 310" },
  ];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="relative w-full max-w-[580px] h-[380px] mx-auto select-none">
      {/* Soft cursor-following glow behind SVG */}
      <div
        className="pointer-events-none absolute w-56 h-56 rounded-full bg-amber-500/10 blur-3xl transition-transform duration-300 ease-out -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${mousePos.x}px`,
          top: `${mousePos.y}px`,
        }}
      />

      <svg
        viewBox="0 0 580 380"
        className="w-full h-full overflow-visible"
        onMouseMove={handleMouseMove}
      >
        <defs>
          <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Constellation Connection Lines */}
        {lines.map((l, idx) => (
          <motion.path
            key={`line-${idx}`}
            d={l.d}
            stroke="currentColor"
            strokeWidth="1.25"
            strokeDasharray="2 3"
            className="text-amber-500/30 dark:text-amber-400/25"
            initial={shouldReduceMotion ? { pathLength: 1, opacity: 0.6 } : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.8 }}
            transition={{ duration: 1.2, delay: 0.2 + idx * 0.15, ease: "easeOut" }}
          />
        ))}

        {/* Traveling Amber "Baton" Light Particle */}
        {!shouldReduceMotion && (
          <motion.circle
            r="4.5"
            fill="#f59e0b"
            className="filter drop-shadow-[0_0_8px_#f59e0b]"
            animate={{
              cx: [80, 210, 360, 500, 390, 200, 80],
              cy: [220, 110, 140, 220, 310, 300, 220],
            }}
            transition={{
              duration: 9,
              ease: "linear",
              repeat: Infinity,
            }}
          />
        )}

        {/* Star Nodes */}
        {nodes.map((n, idx) => (
          <g key={`node-${n.id}`}>
            {/* Pulsing halo */}
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={n.size * 2.8}
              fill="url(#starGlow)"
              initial={{ scale: 0.8, opacity: 0.4 }}
              animate={
                shouldReduceMotion
                  ? {}
                  : {
                      scale: [0.8, 1.25, 0.8],
                      opacity: [0.3, 0.7, 0.3],
                    }
              }
              transition={{
                duration: 3 + (idx % 3),
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Solid Star Core */}
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={n.size}
              strokeDasharray={n.verified ? undefined : "3 3"}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 + idx * 0.1, duration: 0.4 }}
              className={
                n.verified
                  ? "fill-amber-400 stroke-amber-200/90 dark:fill-amber-400 dark:stroke-amber-100/80 stroke-2"
                  : "fill-transparent stroke-amber-400/80 stroke-2"
              }
            />

            {/* Label */}
            <text
              x={n.x}
              y={n.y + (n.y > 200 ? 18 : -14)}
              textAnchor="middle"
              className="text-[10px] font-mono tracking-wider fill-foreground/70 dark:fill-foreground/80 pointer-events-none select-none"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
