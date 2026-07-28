import assert from "node:assert/strict";
import test from "node:test";
import {
  cellsInFurnitureSelection,
  eraseFurnitureSelection,
  floodFillFurniture,
  mirrorFurnitureSelection,
  moveFurnitureSelection,
  moveFurnitureSelectionLayer,
  moveFurnitureSelectionSlice,
  resizeFurnitureGrid,
  rotateFurnitureSelection,
  type FurnitureSelection,
} from "./editing.ts";
import type { FurnitureDefinition } from "./types.ts";

function makeFurniture(): FurnitureDefinition {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: "volume",
    resolution: 1,
    name: "편집 테스트",
    grid: { width: 6, depth: 6, height: 4 },
    voxels: [
      { x: 1, y: 1, z: 1, material: "sage", color: "#8da18d" },
      { x: 2, y: 1, z: 1, material: "wood" },
      { x: 5, y: 5, z: 3, material: "metal" },
    ],
    provenance: {
      generatedImageModel: false,
      license: "CC0-1.0",
    },
  };
}

const selection: FurnitureSelection = {
  start: { x: 1, y: 1, z: 1 },
  end: { x: 2, y: 2, z: 1 },
};

test("격자 크기 변경은 배치 면의 상한을 지키고 바깥 셀을 결정론적으로 자른다", () => {
  const resized = resizeFurnitureGrid(makeFurniture(), {
    width: 5,
    depth: 5,
    height: 3,
  });
  assert.deepEqual(resized.grid, { width: 5, depth: 5, height: 3 });
  assert.deepEqual(resized.voxels, makeFurniture().voxels.slice(0, 2));

  const wall = resizeFurnitureGrid(
    { ...makeFurniture(), placement: "wall", grid: { width: 6, depth: 1, height: 6 } },
    { width: 2, depth: 9, height: 2 },
  );
  assert.deepEqual(wall.grid, { width: 4, depth: 1, height: 4 });
});

test("선택 영역 이동과 복제는 선택한 층만 바꾸고 경계를 넘으면 차단한다", () => {
  const moved = moveFurnitureSelection(makeFurniture(), selection, 1, 1);
  assert.equal(moved.changed, true);
  assert.deepEqual(moved.furniture.voxels.slice(0, 2), [
    { x: 2, y: 2, z: 1, material: "sage", color: "#8da18d" },
    { x: 3, y: 2, z: 1, material: "wood" },
  ]);

  const duplicated = moveFurnitureSelection(makeFurniture(), selection, 0, 2, true);
  assert.equal(duplicated.furniture.voxels.length, 5);
  assert.equal(duplicated.blocked, false);

  const blocked = moveFurnitureSelection(makeFurniture(), selection, -2, 0);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.changed, false);
  assert.deepEqual(blocked.furniture, makeFurniture());
});

test("선택 영역은 회전·좌우 반전 후에도 재료와 색을 보존한다", () => {
  const rotated = rotateFurnitureSelection(makeFurniture(), selection);
  assert.equal(rotated.changed, true);
  assert.deepEqual(rotated.furniture.voxels.slice(0, 2), [
    { x: 2, y: 1, z: 1, material: "sage", color: "#8da18d" },
    { x: 2, y: 2, z: 1, material: "wood" },
  ]);

  const mirrored = mirrorFurnitureSelection(makeFurniture(), selection, "a");
  assert.deepEqual(mirrored.furniture.voxels.slice(0, 2), [
    { x: 1, y: 1, z: 1, material: "wood" },
    { x: 2, y: 1, z: 1, material: "sage", color: "#8da18d" },
  ]);
});

test("입체 선택 영역은 층 사이를 이동하고 높이 경계를 넘지 않는다", () => {
  const raised = moveFurnitureSelectionLayer(makeFurniture(), selection, 1);
  assert.equal(raised.changed, true);
  assert.equal(raised.selection.start.z, 2);
  assert.deepEqual(raised.furniture.voxels.slice(0, 2), [
    { x: 1, y: 1, z: 2, material: "sage", color: "#8da18d" },
    { x: 2, y: 1, z: 2, material: "wood" },
  ]);

  const topSelection = {
    start: { x: 5, y: 5, z: 3 },
    end: { x: 5, y: 5, z: 3 },
  };
  assert.equal(
    moveFurnitureSelectionLayer(makeFurniture(), topSelection, 1).blocked,
    true,
  );
});

test("채우기는 현재 편집면의 연결된 같은 스타일 영역만 바꾼다", () => {
  const floor: FurnitureDefinition = {
    ...makeFurniture(),
    placement: "floor",
    grid: { width: 4, depth: 4, height: 1 },
    voxels: [
      { x: 1, y: 0, z: 0, material: "wood" },
      { x: 1, y: 1, z: 0, material: "wood" },
      { x: 1, y: 2, z: 0, material: "wood" },
      { x: 1, y: 3, z: 0, material: "wood" },
    ],
  };
  const filled = floodFillFurniture(
    floor,
    { x: 0, y: 0, z: 0 },
    "rose",
    "#c38f87",
  );
  assert.equal(filled.voxels.filter((voxel) => voxel.material === "rose").length, 4);
  assert.equal(filled.voxels.filter((voxel) => voxel.material === "wood").length, 4);
});

test("벽 선택은 x·z 평면을 사용한다", () => {
  const wall: FurnitureDefinition = {
    ...makeFurniture(),
    placement: "wall",
    grid: { width: 6, depth: 1, height: 6 },
    voxels: [],
  };
  const cells = cellsInFurnitureSelection(wall, {
    start: { x: 1, y: 0, z: 2 },
    end: { x: 3, y: 0, z: 4 },
  });
  assert.equal(cells.length, 9);
  assert.deepEqual(cells[0], { x: 1, y: 0, z: 2 });
  assert.deepEqual(cells.at(-1), { x: 3, y: 0, z: 4 });
});

test("선택 영역 지우기는 다른 층을 보존한다", () => {
  const erased = eraseFurnitureSelection(makeFurniture(), selection);
  assert.deepEqual(erased.voxels, [
    { x: 5, y: 5, z: 3, material: "metal" },
  ]);
});

test("입체 가구의 정면 단면은 x·z에서 편집하고 깊이면 사이를 이동한다", () => {
  const frontSelection: FurnitureSelection = {
    start: { x: 1, y: 1, z: 1 },
    end: { x: 2, y: 1, z: 1 },
  };
  assert.deepEqual(
    cellsInFurnitureSelection(makeFurniture(), frontSelection, "xz"),
    [
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 1, z: 1 },
    ],
  );

  const raised = moveFurnitureSelection(
    makeFurniture(),
    frontSelection,
    0,
    1,
    false,
    "xz",
  );
  assert.deepEqual(raised.furniture.voxels.slice(0, 2), [
    { x: 1, y: 1, z: 2, material: "sage", color: "#8da18d" },
    { x: 2, y: 1, z: 2, material: "wood" },
  ]);

  const deeper = moveFurnitureSelectionSlice(
    makeFurniture(),
    frontSelection,
    1,
    "xz",
  );
  assert.equal(deeper.selection.start.y, 2);
  assert.deepEqual(deeper.furniture.voxels.slice(0, 2), [
    { x: 1, y: 2, z: 1, material: "sage", color: "#8da18d" },
    { x: 2, y: 2, z: 1, material: "wood" },
  ]);
});

test("측면 단면과 정면 채우기는 선택한 절단면 밖을 바꾸지 않는다", () => {
  const sideCells = cellsInFurnitureSelection(
    makeFurniture(),
    {
      start: { x: 1, y: 1, z: 0 },
      end: { x: 1, y: 2, z: 2 },
    },
    "yz",
  );
  assert.equal(sideCells.length, 6);
  assert.ok(sideCells.every((cell) => cell.x === 1));

  const filled = floodFillFurniture(
    makeFurniture(),
    { x: 0, y: 0, z: 0 },
    "rose",
    "#c38f87",
    "xz",
  );
  assert.equal(
    filled.voxels.filter((voxel) => voxel.y === 0 && voxel.material === "rose").length,
    24,
  );
  assert.equal(filled.voxels.filter((voxel) => voxel.y !== 0).length, 3);
});
