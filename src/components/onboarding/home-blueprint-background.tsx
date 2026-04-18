"use client";

import { useMemo } from "react";

interface HomeBlueprintBackgroundProps {
  accent: string;
  accentSoft: string;
  paper: string;
}

interface Wall {
  d: string;
  len: number;
  delay: number;
}

interface Room {
  label: string;
  cx: number;
  cy: number;
  appearAt: number;
  cabinets: Cabinet[];
}

interface Cabinet {
  x: number;
  y: number;
  w: number;
  h: number;
  shelves: number;
  appearAt: number;
  kind?: "desk" | "shelf" | "sofa" | "plant" | "rug";
}

const VB_W = 1000;
const VB_H = 620;

const WALLS: Wall[] = [
  // Outer walls (drawn first, clockwise from top-left)
  { d: "M 60 60 L 940 60", len: 880, delay: 0 },
  { d: "M 940 60 L 940 560", len: 500, delay: 0.22 },
  { d: "M 940 560 L 60 560", len: 880, delay: 0.44 },
  { d: "M 60 560 L 60 60", len: 500, delay: 0.66 },

  // Interior — horizontal divider between upper row and lower row
  // Broken into segments to leave a "doorway" gap
  { d: "M 60 320 L 340 320", len: 280, delay: 1.05 },
  { d: "M 380 320 L 660 320", len: 280, delay: 1.2 },
  { d: "M 700 320 L 940 320", len: 240, delay: 1.35 },

  // Interior vertical walls (upper row) — 3 rooms on top
  { d: "M 340 60 L 340 180", len: 120, delay: 1.55 },
  { d: "M 340 220 L 340 320", len: 100, delay: 1.65 },
  { d: "M 660 60 L 660 200", len: 140, delay: 1.75 },
  { d: "M 660 240 L 660 320", len: 80, delay: 1.85 },

  // Interior vertical wall (lower row) — split family room vs lab/blank
  { d: "M 580 320 L 580 440", len: 120, delay: 1.98 },
  { d: "M 580 480 L 580 560", len: 80, delay: 2.08 },
];

// Door arcs (small quarter-circle strokes)
const DOORS = [
  { d: "M 340 180 A 40 40 0 0 1 380 220", delay: 1.58 },
  { d: "M 660 200 A 40 40 0 0 1 700 240", delay: 1.78 },
  { d: "M 580 440 A 40 40 0 0 1 620 480", delay: 2.02 },
  { d: "M 340 320 A 40 40 0 0 1 380 320", delay: 1.15 },
  { d: "M 660 320 A 40 40 0 0 1 700 320", delay: 1.3 },
];

const ROOMS: Room[] = [
  {
    label: "OFFICE",
    cx: 200,
    cy: 100,
    appearAt: 2.3,
    cabinets: [
      { x: 90, y: 200, w: 160, h: 40, shelves: 3, appearAt: 2.7, kind: "desk" },
      { x: 90, y: 250, w: 70, h: 50, shelves: 2, appearAt: 2.85, kind: "shelf" },
    ],
  },
  {
    label: "STUDY",
    cx: 500,
    cy: 100,
    appearAt: 2.4,
    cabinets: [
      { x: 380, y: 200, w: 90, h: 100, shelves: 4, appearAt: 2.8, kind: "shelf" },
      { x: 490, y: 240, w: 140, h: 60, shelves: 2, appearAt: 2.95, kind: "desk" },
    ],
  },
  {
    label: "LAB",
    cx: 800,
    cy: 100,
    appearAt: 2.5,
    cabinets: [
      { x: 700, y: 200, w: 140, h: 36, shelves: 5, appearAt: 2.9, kind: "desk" },
      { x: 860, y: 200, w: 60, h: 90, shelves: 3, appearAt: 3.05, kind: "shelf" },
      { x: 700, y: 260, w: 60, h: 50, shelves: 0, appearAt: 3.15, kind: "plant" },
    ],
  },
  {
    label: "FAMILY  ROOM",
    cx: 320,
    cy: 360,
    appearAt: 2.65,
    cabinets: [
      { x: 90, y: 440, w: 200, h: 60, shelves: 0, appearAt: 3.05, kind: "sofa" },
      { x: 310, y: 440, w: 100, h: 60, shelves: 0, appearAt: 3.18, kind: "sofa" },
      { x: 150, y: 510, w: 220, h: 30, shelves: 0, appearAt: 3.3, kind: "rug" },
    ],
  },
  {
    label: "BLANK",
    cx: 760,
    cy: 360,
    appearAt: 2.75,
    cabinets: [
      { x: 620, y: 440, w: 120, h: 60, shelves: 2, appearAt: 3.15, kind: "shelf" },
      { x: 780, y: 440, w: 140, h: 70, shelves: 3, appearAt: 3.25, kind: "desk" },
      { x: 620, y: 510, w: 50, h: 40, shelves: 0, appearAt: 3.35, kind: "plant" },
    ],
  },
];

export function HomeBlueprintBackground({
  accent,
  accentSoft,
  paper,
}: HomeBlueprintBackgroundProps) {
  const gridId = useMemo(
    () => `bp-grid-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  return (
    <div className="bp-root pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes bp-draw {
          from { stroke-dashoffset: var(--bp-len, 200); }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes bp-appear {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: var(--bp-op, 1); transform: translateY(0); }
        }
        @keyframes bp-pop {
          0%   { opacity: 0; transform: scale(0.6); }
          60%  { opacity: 1; transform: scale(1.04); }
          100% { opacity: var(--bp-op, 1); transform: scale(1); }
        }
        @keyframes bp-pulse {
          0%, 100% { opacity: var(--bp-op, 0.5); }
          50%      { opacity: calc(var(--bp-op, 0.5) * 1.6); }
        }
        @keyframes bp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .bp-wall {
          stroke-dasharray: var(--bp-len, 200);
          stroke-dashoffset: var(--bp-len, 200);
          animation: bp-draw 0.75s cubic-bezier(0.2, 0.9, 0.2, 1) var(--bp-d, 0s) forwards;
        }
        .bp-door {
          stroke-dasharray: 70;
          stroke-dashoffset: 70;
          animation: bp-draw 0.55s ease-out var(--bp-d, 0s) forwards;
        }
        .bp-label {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation: bp-appear 0.7s ease-out var(--bp-d, 0s) forwards;
        }
        .bp-cabinet {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation: bp-pop 0.55s cubic-bezier(0.3, 1.3, 0.5, 1) var(--bp-d, 0s) forwards;
        }
        .bp-dot {
          opacity: 0;
          animation: bp-fade-in 0.4s linear var(--bp-d, 0s) forwards,
                     bp-pulse 3.2s ease-in-out var(--bp-d, 0s) infinite;
          --bp-op: 0.6;
        }
        .bp-grid-fade {
          animation: bp-fade-in 1s ease-out 0s forwards;
          opacity: 0;
        }
        .bp-tick {
          stroke-dasharray: 10;
          stroke-dashoffset: 10;
          animation: bp-draw 0.4s ease-out var(--bp-d, 0s) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .bp-wall, .bp-door, .bp-tick { stroke-dashoffset: 0; animation: none; }
          .bp-label, .bp-cabinet, .bp-dot { opacity: var(--bp-op, 1); transform: none; animation: none; }
          .bp-grid-fade { opacity: 1; animation: none; }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        style={{ color: accent }}
      >
        <defs>
          <pattern
            id={gridId}
            x={0}
            y={0}
            width={24}
            height={24}
            patternUnits="userSpaceOnUse"
          >
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={accent} strokeWidth={0.4} opacity={0.35} />
          </pattern>
          <radialGradient id={`${gridId}-mask`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity={1} />
            <stop offset="70%" stopColor="white" stopOpacity={0.65} />
            <stop offset="100%" stopColor="white" stopOpacity={0.1} />
          </radialGradient>
          <mask id={`${gridId}-vignette`}>
            <rect width="100%" height="100%" fill={`url(#${gridId}-mask)`} />
          </mask>
        </defs>

        {/* Grid paper across the full frame */}
        <g mask={`url(#${gridId}-vignette)`} className="bp-grid-fade">
          <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#${gridId})`} />
        </g>

        {/* Corner brackets (blueprint-style callouts) */}
        <g stroke={accent} strokeWidth={1.25} fill="none" opacity={0.55}>
          <path
            d="M 40 72 L 40 40 L 72 40"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.05s" } as React.CSSProperties}
          />
          <path
            d="M 960 40 L 960 72"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.1s" } as React.CSSProperties}
          />
          <path
            d="M 928 40 L 960 40"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.12s" } as React.CSSProperties}
          />
          <path
            d="M 40 548 L 40 580 L 72 580"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.14s" } as React.CSSProperties}
          />
          <path
            d="M 928 580 L 960 580 L 960 548"
            className="bp-tick"
            style={{ ["--bp-d" as string]: "0.16s" } as React.CSSProperties}
          />
        </g>

        {/* Outer + interior walls */}
        <g stroke={accent} strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.95}>
          {WALLS.map((w, i) => (
            <path
              key={`wall-${i}`}
              d={w.d}
              className="bp-wall"
              style={
                {
                  ["--bp-len" as string]: w.len,
                  ["--bp-d" as string]: `${w.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </g>

        {/* Door arcs */}
        <g stroke={accent} strokeWidth={1.2} fill="none" opacity={0.65} strokeLinecap="round">
          {DOORS.map((door, i) => (
            <path
              key={`door-${i}`}
              d={door.d}
              className="bp-door"
              style={{ ["--bp-d" as string]: `${door.delay}s` } as React.CSSProperties}
            />
          ))}
        </g>

        {/* Measurement ticks along the top edge */}
        <g stroke={accent} strokeWidth={0.8} opacity={0.35}>
          {Array.from({ length: 9 }, (_, i) => {
            const x = 60 + i * 110;
            return (
              <line
                key={`tick-${i}`}
                x1={x}
                y1={32}
                x2={x}
                y2={46}
                className="bp-tick"
                style={{ ["--bp-d" as string]: `${0.2 + i * 0.04}s` } as React.CSSProperties}
              />
            );
          })}
        </g>

        {/* Cabinets + details (per room) */}
        <g>
          {ROOMS.flatMap((room) =>
            room.cabinets.map((c, idx) => (
              <g
                key={`cab-${room.label}-${idx}`}
                className="bp-cabinet"
                style={
                  {
                    ["--bp-d" as string]: `${c.appearAt}s`,
                    ["--bp-op" as string]: 0.78,
                  } as React.CSSProperties
                }
              >
                {c.kind === "plant" ? (
                  <>
                    <circle
                      cx={c.x + c.w / 2}
                      cy={c.y + c.h / 2 - 4}
                      r={Math.min(c.w, c.h) / 2 - 6}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.3}
                    />
                    <path
                      d={`M ${c.x + c.w / 2} ${c.y + c.h / 2 + 2} L ${c.x + c.w / 2} ${c.y + c.h - 2}`}
                      stroke={accent}
                      strokeWidth={1.1}
                    />
                  </>
                ) : c.kind === "rug" ? (
                  <>
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      rx={6}
                      fill={accentSoft}
                      opacity={0.35}
                      stroke={accent}
                      strokeWidth={0.8}
                      strokeDasharray="3 4"
                    />
                  </>
                ) : c.kind === "sofa" ? (
                  <>
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      rx={10}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.4}
                    />
                    <rect
                      x={c.x + 8}
                      y={c.y + 10}
                      width={c.w - 16}
                      height={c.h - 20}
                      rx={6}
                      fill={accentSoft}
                      opacity={0.3}
                    />
                  </>
                ) : (
                  <>
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      fill="none"
                      stroke={accent}
                      strokeWidth={1.35}
                    />
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      fill={accentSoft}
                      opacity={0.18}
                    />
                    {Array.from({ length: c.shelves }, (_, i) => {
                      const y = c.y + ((i + 1) * c.h) / (c.shelves + 1);
                      return (
                        <line
                          key={`shelf-${i}`}
                          x1={c.x + 4}
                          y1={y}
                          x2={c.x + c.w - 4}
                          y2={y}
                          stroke={accent}
                          strokeWidth={0.8}
                          opacity={0.7}
                        />
                      );
                    })}
                  </>
                )}
              </g>
            ))
          )}
        </g>

        {/* Small decorative dots scattered in each room (books/papers/sparks) */}
        <g fill={accent}>
          {[
            { cx: 160, cy: 160, delay: 3.4 },
            { cx: 280, cy: 135, delay: 3.55 },
            { cx: 480, cy: 160, delay: 3.45 },
            { cx: 550, cy: 145, delay: 3.6 },
            { cx: 760, cy: 155, delay: 3.5 },
            { cx: 870, cy: 150, delay: 3.65 },
            { cx: 220, cy: 410, delay: 3.75 },
            { cx: 420, cy: 400, delay: 3.85 },
            { cx: 700, cy: 405, delay: 3.9 },
            { cx: 860, cy: 395, delay: 3.95 },
          ].map((d, i) => (
            <circle
              key={`dot-${i}`}
              cx={d.cx}
              cy={d.cy}
              r={2}
              className="bp-dot"
              style={{ ["--bp-d" as string]: `${d.delay}s` } as React.CSSProperties}
            />
          ))}
        </g>

        {/* Room labels */}
        <g fontFamily="'JetBrains Mono', ui-monospace, monospace" fill={accent}>
          {ROOMS.map((room) => (
            <g
              key={`label-${room.label}`}
              className="bp-label"
              style={
                {
                  ["--bp-d" as string]: `${room.appearAt}s`,
                  ["--bp-op" as string]: 1,
                } as React.CSSProperties
              }
            >
              <text
                x={room.cx}
                y={room.cy}
                textAnchor="middle"
                fontSize={17}
                letterSpacing={4}
                fontWeight={700}
              >
                {room.label}
              </text>
              <line
                x1={room.cx - 32}
                y1={room.cy + 8}
                x2={room.cx + 32}
                y2={room.cy + 8}
                stroke={accent}
                strokeWidth={1.2}
                opacity={0.8}
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
