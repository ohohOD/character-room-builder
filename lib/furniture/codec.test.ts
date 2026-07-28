import assert from "node:assert/strict";
import test from "node:test";
import { decodeFurniture, encodeFurniture } from "./codec.ts";
import type { FurnitureDefinition } from "./types.ts";

function makeFurniture(): FurnitureDefinition {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: "volume",
    name: "  한글 의자  ",
    grid: { width: 4, depth: 4, height: 2 },
    voxels: [
      { x: 2, y: 1, z: 1, material: "sage" },
      { x: 0, y: 0, z: 0, material: "wood" },
    ],
    provenance: {
      generatedImageModel: false,
      license: "CC-BY-4.0",
      credit: "  제작자 김가구  ",
    },
  };
}

function checksum(bytes: Uint8Array): string {
  let hash = 2166136261;
  bytes.forEach((byte) => {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  });
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mutateCode(
  code: string,
  mutate: (value: Record<string, unknown>) => void,
): string {
  const payload = code.split(".")[1];
  const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  mutate(value);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return `FURN1.${Buffer.from(bytes).toString("base64url")}.${checksum(bytes)}`;
}

test("UTF-8 FURN1 코드와 전체 URL을 결정론적으로 왕복한다", () => {
  const first = makeFurniture();
  const second = { ...first, voxels: [...first.voxels].reverse() };
  const code = encodeFurniture(first);

  assert.equal(encodeFurniture(second), code);
  assert.equal(encodeFurniture(decodeFurniture(code)), code);
  assert.deepEqual(decodeFurniture(`https://example.test/furniture#${code}`), {
    ...first,
    name: "한글 의자",
    voxels: [...first.voxels].reverse(),
    provenance: {
      ...first.provenance,
      credit: "제작자 김가구",
    },
  });
});

test("기존 입체 코드와 바닥·벽 배치 면을 함께 지원한다", () => {
  const volumeCode = encodeFurniture(makeFurniture());
  const volumePayload = JSON.parse(
    Buffer.from(volumeCode.split(".")[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  assert.equal(volumePayload.placement, undefined);
  assert.equal(decodeFurniture(volumeCode).placement, "volume");

  const floor: FurnitureDefinition = {
    ...makeFurniture(),
    placement: "floor",
    name: "바닥 러그",
    grid: { width: 4, depth: 4, height: 1 },
    voxels: [{ x: 2, y: 1, z: 0, material: "rose" }],
    provenance: { ...makeFurniture().provenance, credit: "제작자 김가구" },
  };
  const wall: FurnitureDefinition = {
    ...makeFurniture(),
    placement: "wall",
    name: "벽 액자",
    grid: { width: 4, depth: 1, height: 4 },
    voxels: [{ x: 2, y: 0, z: 1, material: "woodDark" }],
    provenance: { ...makeFurniture().provenance, credit: "제작자 김가구" },
  };

  assert.deepEqual(decodeFurniture(encodeFurniture(floor)), floor);
  assert.deepEqual(decodeFurniture(encodeFurniture(wall)), wall);
});

test("표면색을 정규화하고 FURN1에서 결정론적으로 왕복한다", () => {
  const colored: FurnitureDefinition = {
    ...makeFurniture(),
    voxels: [
      { x: 0, y: 0, z: 0, material: "wood", color: "#AbC" },
      { x: 2, y: 1, z: 1, material: "sage", color: "7A91b2" },
    ],
  };

  const decoded = decodeFurniture(encodeFurniture(colored));
  assert.deepEqual(decoded.voxels, [
    { x: 0, y: 0, z: 0, material: "wood", color: "#aabbcc" },
    { x: 2, y: 1, z: 1, material: "sage", color: "#7a91b2" },
  ]);
  assert.equal(encodeFurniture(decoded), encodeFurniture(colored));
});

test("체크섬과 URL-safe Base64 형식을 검증한다", () => {
  const code = encodeFurniture(makeFurniture());
  const damaged = code.slice(0, -1) + (code.endsWith("0") ? "1" : "0");

  assert.throws(() => decodeFurniture(damaged), /손상/);
  assert.throws(() => decodeFurniture("FURN1.bad+payload.00000000"), /Base64/);
  assert.throws(() => decodeFurniture("FURN1.payload.not-a-sum"), /형식/);
});

test("스키마, 좌표, 재료, 라이선스와 이미지 출처를 검증한다", () => {
  const code = encodeFurniture(makeFurniture());

  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => { value.schemaVersion = 2; })),
    /버전/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => { value.placement = "ceiling"; })),
    /배치 면/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      const voxels = value.voxels as Array<Record<string, unknown>>;
      voxels[0].x = 99;
    })),
    /복셀 x/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      const voxels = value.voxels as Array<Record<string, unknown>>;
      voxels[0].material = "unknown";
    })),
    /재료/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      const voxels = value.voxels as Array<Record<string, unknown>>;
      voxels[0].color = "tomato";
    })),
    /표면색/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      (value.provenance as Record<string, unknown>).license = "unknown";
    })),
    /라이선스/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      (value.provenance as Record<string, unknown>).generatedImageModel = true;
    })),
    /생성형 이미지/,
  );

  const floorCode = encodeFurniture({
    ...makeFurniture(),
    placement: "floor",
    grid: { width: 4, depth: 4, height: 1 },
    voxels: [],
  });
  assert.throws(
    () => decodeFurniture(mutateCode(floorCode, (value) => {
      (value.grid as Record<string, unknown>).height = 2;
    })),
    /높이 크기/,
  );
});

test("과도한 입력과 코드 크기를 거부한다", () => {
  assert.throws(() => decodeFurniture("x".repeat(52_097)), /너무 커요/);

  const oversized = makeFurniture();
  oversized.grid = { width: 16, depth: 16, height: 12 };
  oversized.voxels = Array.from({ length: 1_200 }, (_, index) => ({
    x: index % 16,
    y: Math.floor(index / 16) % 16,
    z: Math.floor(index / 256),
    material: "woodDark" as const,
  }));
  assert.throws(() => encodeFurniture(oversized), /코드가 너무 커요/);
});
