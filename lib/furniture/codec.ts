import type {
  FurnitureDefinition,
  FurnitureLicense,
  FurnitureMaterialId,
  FurniturePlacement,
  FurnitureResolution,
  FurnitureVoxel,
} from "./types";
import { normalizeFurnitureColor } from "./colors.ts";

const PREFIX = "FURN1";
const MAX_CODE_LENGTH = 180_000;
const MAX_INPUT_LENGTH = MAX_CODE_LENGTH + 4_096;
const MAX_VOXELS = 9_600;
const PLACEMENTS = new Set<FurniturePlacement>(["volume", "floor", "wall"]);
const MATERIALS = new Set<FurnitureMaterialId>([
  "wood",
  "woodDark",
  "sage",
  "cream",
  "rose",
  "metal",
]);
const LICENSES = new Set<FurnitureLicense>([
  "all-rights-reserved",
  "CC-BY-4.0",
  "CC0-1.0",
]);

function checksum(bytes: Uint8Array): string {
  let hash = 2166136261;
  bytes.forEach((byte) => {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  });
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("가구 코드의 Base64 데이터가 올바르지 않아요.");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("가구 코드의 Base64 데이터를 읽지 못했어요.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(label + " 값이 허용 범위를 벗어났어요.");
  }
  return Number(value);
}

function compareText(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

export function normalizeFurniture(value: unknown): FurnitureDefinition {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.rendererVersion !== 1) {
    throw new Error("지원하지 않는 가구 데이터 버전이에요.");
  }
  if (!isRecord(value.grid) || !Array.isArray(value.voxels) || !isRecord(value.provenance)) {
    throw new Error("가구 데이터의 필수 항목이 빠졌어요.");
  }
  if (typeof value.name !== "string") {
    throw new Error("가구 이름은 문자열이어야 해요.");
  }

  const placement = value.placement ?? "volume";
  if (!PLACEMENTS.has(placement as FurniturePlacement)) {
    throw new Error("지원하지 않는 가구 배치 면이에요.");
  }

  const resolution = value.resolution ?? 1;
  if (resolution !== 1 && resolution !== 2) {
    throw new Error("지원하지 않는 가구 조립 해상도예요.");
  }

  const width = readBoundedInteger(value.grid.width, 4, 16 * resolution, "가로 크기");
  const depth = readBoundedInteger(
    value.grid.depth,
    placement === "wall" ? 1 : 4,
    placement === "wall" ? 1 : 16 * resolution,
    "깊이 크기",
  );
  const height = readBoundedInteger(
    value.grid.height,
    placement === "floor" ? 1 : placement === "wall" ? 4 : 2,
    placement === "floor" ? 1 : 12 * resolution,
    "높이 크기",
  );
  if (value.voxels.length > Math.min(width * depth * height, MAX_VOXELS)) {
    throw new Error("가구 코드에 조립 칸이 너무 많아요.");
  }

  const voxelMap = new Map<string, FurnitureVoxel>();
  value.voxels.forEach((candidate) => {
    if (!isRecord(candidate) || !MATERIALS.has(candidate.material as FurnitureMaterialId)) {
      throw new Error("알 수 없는 재료가 포함되어 있어요.");
    }
    const x = readBoundedInteger(candidate.x, 0, width - 1, "복셀 x");
    const y = readBoundedInteger(candidate.y, 0, depth - 1, "복셀 y");
    const z = readBoundedInteger(candidate.z, 0, height - 1, "복셀 z");
    const color = candidate.color === undefined
      ? undefined
      : typeof candidate.color === "string"
        ? normalizeFurnitureColor(candidate.color)
        : null;
    if (candidate.color !== undefined && color === null) {
      throw new Error("표면색은 #RRGGBB 형식이어야 해요.");
    }
    voxelMap.set(`${x}:${y}:${z}`, {
      x,
      y,
      z,
      material: candidate.material as FurnitureMaterialId,
      ...(color ? { color } : {}),
    });
  });

  const license = value.provenance.license;
  if (!LICENSES.has(license as FurnitureLicense)) {
    throw new Error("지원하지 않는 라이선스 표기예요.");
  }
  if (value.provenance.generatedImageModel !== false) {
    throw new Error("이 공방은 생성형 이미지 에셋 코드를 불러오지 않아요.");
  }
  if (
    value.provenance.credit !== undefined &&
    typeof value.provenance.credit !== "string"
  ) {
    throw new Error("제작자 표기는 문자열이어야 해요.");
  }

  const credit = value.provenance.credit?.trim().slice(0, 80);
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: placement as FurniturePlacement,
    resolution: resolution as FurnitureResolution,
    name: value.name.trim().slice(0, 40) || "이름 없는 가구",
    grid: { width, depth, height },
    voxels: [...voxelMap.values()].sort(
      (first, second) =>
        first.z - second.z ||
        first.y - second.y ||
        first.x - second.x ||
        compareText(first.material, second.material),
    ),
    provenance: {
      generatedImageModel: false,
      license: license as FurnitureLicense,
      ...(credit ? { credit } : {}),
    },
  };
}

function serializeFurniture(furniture: FurnitureDefinition): object {
  return {
    schemaVersion: furniture.schemaVersion,
    rendererVersion: furniture.rendererVersion,
    ...(furniture.placement === "volume"
      ? {}
      : { placement: furniture.placement }),
    ...(furniture.resolution === 1 ? {} : { resolution: furniture.resolution }),
    name: furniture.name,
    grid: furniture.grid,
    voxels: furniture.voxels,
    provenance: furniture.provenance,
  };
}

export function encodeFurniture(furniture: FurnitureDefinition): string {
  const normalized = normalizeFurniture(furniture);
  const bytes = new TextEncoder().encode(
    JSON.stringify(serializeFurniture(normalized)),
  );
  const code = `${PREFIX}.${toBase64Url(bytes)}.${checksum(bytes)}`;
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error("가구 코드가 너무 커요. 조립 칸 수를 줄여주세요.");
  }
  return code;
}

function extractCode(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new Error("가구 코드나 공유 링크가 너무 커요.");
  }
  const hashIndex = trimmed.lastIndexOf("#");
  return (hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : trimmed).trim();
}

export function decodeFurniture(value: string): FurnitureDefinition {
  const code = extractCode(value);
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error("가구 코드가 너무 커요.");
  }

  const [prefix, payload, expectedChecksum, ...rest] = code.split(".");
  if (
    prefix !== PREFIX ||
    !payload ||
    !expectedChecksum ||
    rest.length > 0 ||
    !/^[0-9a-fA-F]{8}$/.test(expectedChecksum)
  ) {
    throw new Error("FURN1 가구 코드 형식이 아니에요.");
  }

  const bytes = fromBase64Url(payload);
  if (checksum(bytes) !== expectedChecksum.toLowerCase()) {
    throw new Error("가구 코드가 전송 중 손상된 것 같아요.");
  }

  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("가구 코드의 UTF-8 JSON 데이터를 읽지 못했어요.");
  }

  return normalizeFurniture(parsed);
}
