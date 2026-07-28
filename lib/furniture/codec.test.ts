import assert from "node:assert/strict";
import test from "node:test";
import { decodeFurniture, encodeFurniture } from "./codec.ts";
import { getFurnitureRenderGeometry } from "./placement.ts";
import { convertFurnitureResolution } from "./resolution.ts";
import type { FurnitureDefinition } from "./types.ts";

function makeFurniture(): FurnitureDefinition {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: "volume",
    resolution: 1,
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

test("정밀 2× 조립은 외형 크기를 유지하고 기존 셀을 세분화한다", () => {
  const standard = makeFurniture();
  const fine = convertFurnitureResolution(standard, 2);
  const restored = convertFurnitureResolution(fine, 1);
  const standardGeometry = getFurnitureRenderGeometry(standard);
  const fineGeometry = getFurnitureRenderGeometry(fine);

  assert.equal(fine.resolution, 2);
  assert.deepEqual(fine.grid, { width: 8, depth: 8, height: 4 });
  assert.equal(fine.voxels.length, standard.voxels.length * 8);
  assert.equal(fineGeometry.width, standardGeometry.width);
  assert.equal(fineGeometry.depth, standardGeometry.depth);
  assert.equal(fineGeometry.height, standardGeometry.height);
  assert.equal(encodeFurniture(restored), encodeFurniture(standard));
  assert.equal(decodeFurniture(encodeFurniture(fine)).resolution, 2);
});

test("초정밀 4× 조립은 sparse 가로 구간으로 공유하고 결정론적으로 복원한다", () => {
  const standard = makeFurniture();
  const ultra = convertFurnitureResolution(standard, 4);
  const code = encodeFurniture(ultra);
  const payload = JSON.parse(
    Buffer.from(code.split(".")[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;

  assert.equal(ultra.resolution, 4);
  assert.deepEqual(ultra.grid, { width: 16, depth: 16, height: 8 });
  assert.equal(ultra.voxels.length, standard.voxels.length * 64);
  assert.ok(Array.isArray(payload.runs));
  assert.equal(payload.voxels, undefined);
  assert.equal(decodeFurniture(code).voxels.length, ultra.voxels.length);
  assert.equal(encodeFurniture(decodeFurniture(code)), code);
  assert.equal(
    encodeFurniture(convertFurnitureResolution(ultra, 1)),
    encodeFurniture(standard),
  );

  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      const runs = value.runs as unknown[][];
      runs[0][3] = 999;
    })),
    /구간 길이/,
  );
  assert.throws(
    () => decodeFurniture(mutateCode(code, (value) => {
      value.voxels = [];
    })),
    /하나만/,
  );
});

test("바닥과 벽의 정밀 2× 조립은 각 조립면의 두 축을 모두 세분화한다", () => {
  const floor: FurnitureDefinition = {
    ...makeFurniture(),
    placement: "floor",
    grid: { width: 4, depth: 4, height: 1 },
    voxels: [{ x: 1, y: 2, z: 0, material: "rose" }],
  };
  const wall: FurnitureDefinition = {
    ...makeFurniture(),
    placement: "wall",
    grid: { width: 4, depth: 1, height: 4 },
    voxels: [{ x: 1, y: 0, z: 2, material: "woodDark" }],
  };

  const fineFloor = convertFurnitureResolution(floor, 2);
  const fineWall = convertFurnitureResolution(wall, 2);

  assert.deepEqual(fineFloor.grid, { width: 8, depth: 8, height: 1 });
  assert.deepEqual(fineFloor.voxels, [
    { x: 2, y: 4, z: 0, material: "rose" },
    { x: 2, y: 5, z: 0, material: "rose" },
    { x: 3, y: 4, z: 0, material: "rose" },
    { x: 3, y: 5, z: 0, material: "rose" },
  ]);
  assert.deepEqual(fineWall.grid, { width: 8, depth: 1, height: 8 });
  assert.deepEqual(fineWall.voxels, [
    { x: 2, y: 0, z: 4, material: "woodDark" },
    { x: 2, y: 0, z: 5, material: "woodDark" },
    { x: 3, y: 0, z: 4, material: "woodDark" },
    { x: 3, y: 0, z: 5, material: "woodDark" },
  ]);
  assert.equal(encodeFurniture(convertFurnitureResolution(fineFloor, 1)), encodeFurniture(floor));
  assert.equal(encodeFurniture(convertFurnitureResolution(fineWall, 1)), encodeFurniture(wall));
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
    () => decodeFurniture(mutateCode(code, (value) => { value.resolution = 3; })),
    /조립 해상도/,
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
  assert.throws(() => decodeFurniture("x".repeat(184_097)), /너무 커요/);

  const oversized = makeFurniture();
  oversized.resolution = 2;
  oversized.grid = { width: 32, depth: 32, height: 24 };
  oversized.voxels = Array.from({ length: 9_600 }, (_, index) => ({
    x: index % 32,
    y: Math.floor(index / 32) % 32,
    z: Math.floor(index / 1024),
    material: "woodDark" as const,
  }));
  assert.throws(() => encodeFurniture(oversized), /코드가 너무 커요/);
});
