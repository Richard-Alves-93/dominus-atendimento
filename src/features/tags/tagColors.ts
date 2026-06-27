export const TAG_COLOR_PRESETS = [
  { v: "slate", l: "Cinza", hex: "#64748b" },
  { v: "blue", l: "Azul", hex: "#3b82f6" },
  { v: "emerald", l: "Verde", hex: "#10b981" },
  { v: "amber", l: "Amarelo", hex: "#f59e0b" },
  { v: "rose", l: "Rosa", hex: "#f43f5e" },
  { v: "purple", l: "Roxo", hex: "#a855f7" },
  { v: "cyan", l: "Ciano", hex: "#06b6d4" },
  { v: "pink", l: "Pink", hex: "#ec4899" },
];

export function tagColorHex(c?: string | null): string {
  const found = TAG_COLOR_PRESETS.find((p) => p.v === c);
  return found?.hex ?? "#94a3b8";
}
