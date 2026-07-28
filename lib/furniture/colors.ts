export interface FurnitureColorChoice {
  name: string;
  value: string;
}

export const FURNITURE_COLOR_PALETTE: readonly FurnitureColorChoice[] = [
  { name: "종이", value: "#f4efe3" },
  { name: "크림", value: "#e8d8b9" },
  { name: "햇살", value: "#d7b760" },
  { name: "살구", value: "#d48c6a" },
  { name: "테라코타", value: "#a85f4f" },
  { name: "말린 장미", value: "#c38f87" },
  { name: "베리", value: "#8e5261" },
  { name: "자두", value: "#654459" },
  { name: "라일락", value: "#9a8aaa" },
  { name: "하늘", value: "#87a9b8" },
  { name: "청회색", value: "#56778a" },
  { name: "남색", value: "#34495b" },
  { name: "민트", value: "#99b6a1" },
  { name: "세이지", value: "#8da18d" },
  { name: "이끼", value: "#64775d" },
  { name: "숲", value: "#405b46" },
  { name: "참나무", value: "#8c6652" },
  { name: "호두나무", value: "#523b32" },
  { name: "돌", value: "#8b8a84" },
  { name: "먹색", value: "#3a3532" },
] as const;

export function normalizeFurnitureColor(value: string): string | null {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].length === 3
    ? [...match[1]].map((digit) => digit + digit).join("")
    : match[1];
  return `#${digits.toLowerCase()}`;
}
