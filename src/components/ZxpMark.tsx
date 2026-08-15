"use client";

import { MARCA_DOURADO, MARCA_ONYX } from "@/lib/marca";

/**
 * Logomark oficial da ZXP Solutions — mesmo componente do ZXP Market
 * (briefing-master/components/ZxpMark.tsx). Coordenadas do arquivo de
 * marca original, sem reescalar.
 */
export function ZxpMark({ size = 30, radius = 24 }: { size?: number; radius?: number }) {
  const rx = radius * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{ flexShrink: 0, display: "block" }}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="200" height="200" rx={rx} fill={MARCA_ONYX} />
      <polyline
        points="30,47 170,47 30,153 170,153"
        fill="none"
        stroke={MARCA_DOURADO}
        strokeWidth="34"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </svg>
  );
}
