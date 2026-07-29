import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFurnitureSurfaceMesh,
  encodeFurnitureGlb,
  encodeFurnitureMtl,
  encodeFurnitureObj,
  encodeFurnitureObjZip,
  FURNITURE_EXPORT_METERS_PER_BASE_CELL,
  FURNITURE_EXPORT_THIN_SURFACE_METERS,
  makeFurniture3dExportMetadata,
} from "./export-3d.ts";
import type { FurnitureDefinition, FurnitureVoxel } from "./types.ts";

function furniture(
  voxels: FurnitureVoxel[],
  overrides: Partial<Pick<FurnitureDefinition, "placement" | "resolution" | "name">> = {},
): FurnitureDefinition {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: overrides.placement ?? "volume",
    resolution: overrides.resolution ?? 1,
    name: overrides.name ?? "초록 탁자",
    grid: { width: 8, depth: 8, height: 8 },
    voxels,
    provenance: {
      generatedImageModel: false,
      license: "CC-BY-4.0",
      credit: "테스트 제작자",
    },
  };
}

function parseGlb(bytes: Uint8Array): { json: Record<string, unknown>; binaryLength: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), bytes.length);
  const jsonLength = view.getUint32(12, true);
  assert.equal(view.getUint32(16, true), 0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)).trim());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = view.getUint32(binaryHeader, true);
  assert.equal(view.getUint32(binaryHeader + 4, true), 0x004e4942);
  assert.equal(binaryHeader + 8 + binaryLength, bytes.length);
  return { json, binaryLength };
}

function triangleDotNormal(
  positions: number[],
  normals: number[],
  indices: number[],
  offset: number,
): number {
  const a = indices[offset] * 3;
  const b = indices[offset + 1] * 3;
  const c = indices[offset + 2] * 3;
  const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
  const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return cross[0] * normals[a] + cross[1] * normals[a + 1] + cross[2] * normals[a + 2];
}

test("같은 재질의 2×2 상판은 내부면 없이 직육면체 여섯 면으로 합친다", () => {
  const mesh = buildFurnitureSurfaceMesh(furniture([
    { x: 0, y: 0, z: 0, material: "sage" },
    { x: 1, y: 0, z: 0, material: "sage" },
    { x: 0, y: 1, z: 0, material: "sage" },
    { x: 1, y: 1, z: 0, material: "sage" },
  ]));
  assert.equal(mesh.materialCount, 1);
  assert.equal(mesh.quadCount, 6);
  assert.equal(mesh.triangleCount, 12);
  assert.equal(mesh.vertexCount, 24);
  assert.deepEqual(mesh.bounds, {
    min: [-0.1, 0, -0.1],
    max: [0.1, 0.1, 0.1],
  });
  mesh.primitives.forEach((primitive) => {
    for (let index = 0; index < primitive.indices.length; index += 3) {
      assert.ok(triangleDotNormal(primitive.positions, primitive.normals, primitive.indices, index) > 0);
    }
  });
});

test("맞닿은 다른 재질은 내부면을 만들지 않고 외부 재질 경계를 보존한다", () => {
  const mesh = buildFurnitureSurfaceMesh(furniture([
    { x: 0, y: 0, z: 0, material: "wood" },
    { x: 1, y: 0, z: 0, material: "sage" },
  ]));
  assert.equal(mesh.materialCount, 2);
  assert.equal(mesh.quadCount, 10);
  assert.equal(mesh.triangleCount, 20);
});

test("2× 해상도와 바닥·벽 표면은 실제 크기와 얇은 두께를 유지한다", () => {
  const volume = buildFurnitureSurfaceMesh(furniture(
    [{ x: 0, y: 0, z: 0, material: "cream" }],
    { resolution: 2 },
  ));
  assert.equal(volume.bounds.max[0] - volume.bounds.min[0], FURNITURE_EXPORT_METERS_PER_BASE_CELL / 2);

  const floor = buildFurnitureSurfaceMesh(furniture(
    [{ x: 0, y: 0, z: 0, material: "cream" }],
    { placement: "floor", resolution: 4 },
  ));
  assert.equal(floor.bounds.max[1] - floor.bounds.min[1], FURNITURE_EXPORT_THIN_SURFACE_METERS);

  const wall = buildFurnitureSurfaceMesh(furniture(
    [{ x: 0, y: 0, z: 0, material: "cream" }],
    { placement: "wall", resolution: 4 },
  ));
  assert.equal(wall.bounds.max[2], 0);
  assert.equal(wall.bounds.min[2], -FURNITURE_EXPORT_THIN_SURFACE_METERS);
});

test("GLB는 결정론적이며 재질, FURN1, 축·단위·권리 메타데이터를 보존한다", () => {
  const definition = furniture([
    { x: 0, y: 0, z: 0, material: "wood", color: "#6f4c3e" },
    { x: 1, y: 0, z: 0, material: "sage", color: "#91aa96" },
  ]);
  const first = encodeFurnitureGlb(definition);
  assert.deepEqual(first, encodeFurnitureGlb(definition));
  const parsed = parseGlb(first);
  const root = parsed.json as {
    asset: { version: string };
    extensionsUsed: string[];
    nodes: Array<{ extras: { characterRoomBuilder: Record<string, unknown> } }>;
    materials: unknown[];
  };
  assert.equal(root.asset.version, "2.0");
  assert.ok(root.extensionsUsed.includes("KHR_materials_unlit"));
  assert.equal(root.materials.length, 2);
  assert.match(String(root.nodes[0].extras.characterRoomBuilder.code), /^FURN1\./);
  assert.equal(root.nodes[0].extras.characterRoomBuilder.unit, "meter");
  assert.equal(root.nodes[0].extras.characterRoomBuilder.pivot, "ground-center");
  assert.equal(root.nodes[0].extras.characterRoomBuilder.generatedImageModel, false);
  assert.ok(parsed.binaryLength > 0);
});

test("OBJ·MTL과 ZIP 묶음은 공통 메시와 권리 파일을 결정론적으로 기록한다", () => {
  const definition = furniture([
    { x: 0, y: 0, z: 0, material: "wood" },
    { x: 1, y: 0, z: 0, material: "sage" },
  ]);
  const obj = encodeFurnitureObj(definition, "green-table.mtl");
  const mtl = encodeFurnitureMtl(definition);
  assert.match(obj, /^# Character Room Builder/m);
  assert.match(obj, /^mtllib green-table\.mtl$/m);
  assert.equal(obj.match(/^f /gm)?.length, 10);
  assert.match(mtl, /^newmtl material_sage_/m);
  assert.match(mtl, /^Kd /m);

  const first = encodeFurnitureObjZip(definition, "green-table");
  assert.deepEqual(first, encodeFurnitureObjZip(definition, "green-table"));
  const archiveText = new TextDecoder().decode(first);
  assert.equal(String.fromCharCode(...first.slice(0, 4)), "PK\u0003\u0004");
  assert.ok(archiveText.includes("green-table.obj"));
  assert.ok(archiveText.includes("green-table.mtl"));
  assert.ok(archiveText.includes("green-table.furn1.txt"));
  assert.ok(archiveText.includes("metadata.json"));
  assert.ok(archiveText.includes("LICENSE.txt"));
  assert.ok(archiveText.includes("테스트 제작자"));

  const metadata = makeFurniture3dExportMetadata(definition);
  assert.equal(metadata.mesh.quads, 10);
  assert.equal(metadata.rights.generatedImageModel, false);
});

test("빈 가구는 3D 파일로 내보내지 않는다", () => {
  assert.throws(() => encodeFurnitureGlb(furniture([])), /복셀이 없어요/);
  assert.throws(() => encodeFurnitureObjZip(furniture([]), "empty"), /복셀이 없어요/);
});
