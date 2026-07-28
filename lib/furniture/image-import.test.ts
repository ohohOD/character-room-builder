import assert from "node:assert/strict";
import test from "node:test";
import {
  pixelImageToFurniture,
  quantizePixelImage,
  visualHullFromSilhouettes,
  type PixelImage,
} from "./image-import.ts";

function sourceImage(): PixelImage {
  return {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0,
      0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0,
    ]),
  };
}

test("이미지 축소와 팔레트화는 같은 입력에서 결정론적이다", () => {
  const options = {
    width: 4,
    height: 4,
    paletteSize: 3,
    alphaThreshold: 128,
    dither: false,
  };
  const first = quantizePixelImage(sourceImage(), options);
  const second = quantizePixelImage(sourceImage(), options);
  assert.deepEqual(first, second);
  assert.equal(first.palette.length, 3);
  assert.equal(first.colors.filter(Boolean).length, 12);
  assert.equal(first.colors.filter((color) => color === null).length, 4);
});

test("디더링과 투명도 임계값도 결정론적으로 적용된다", () => {
  const first = quantizePixelImage(sourceImage(), {
    width: 6,
    height: 6,
    paletteSize: 2,
    alphaThreshold: 1,
    dither: true,
  });
  const second = quantizePixelImage(sourceImage(), {
    width: 6,
    height: 6,
    paletteSize: 2,
    alphaThreshold: 1,
    dither: true,
  });
  assert.deepEqual(first.colors, second.colors);
  assert.ok(first.colors.some((color) => color === null));
  assert.ok(first.colors.some(Boolean));
});

test("벽·바닥 패널은 픽셀 좌표와 색을 조립면에 보존한다", () => {
  const image = quantizePixelImage(sourceImage(), {
    width: 4,
    height: 4,
    paletteSize: 3,
    alphaThreshold: 128,
    dither: false,
  });
  const common = {
    material: "cream" as const,
    reliefHeight: 4,
    name: "테스트 패널",
    license: "CC0-1.0" as const,
  };
  const wall = pixelImageToFurniture(image, { ...common, mode: "wall" });
  const floor = pixelImageToFurniture(image, { ...common, mode: "floor" });
  assert.equal(wall.placement, "wall");
  assert.deepEqual(wall.grid, { width: 4, depth: 1, height: 4 });
  assert.ok(wall.voxels.every((voxel) => voxel.y === 0));
  assert.ok(wall.voxels.some((voxel) => voxel.x === 0 && voxel.z === 3));
  assert.equal(floor.placement, "floor");
  assert.deepEqual(floor.grid, { width: 4, depth: 4, height: 1 });
  assert.ok(floor.voxels.every((voxel) => voxel.z === 0));
});

test("밝기 부조는 어두운 픽셀보다 밝은 픽셀을 높게 쌓는다", () => {
  const image = {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray(4 * 4 * 4),
    palette: ["#101010", "#f0f0f0"],
    colors: Array.from({ length: 16 }, (_, index) =>
      index % 2 === 0 ? "#101010" : "#f0f0f0"
    ),
  };
  const relief = pixelImageToFurniture(image, {
    mode: "relief",
    material: "wood",
    reliefHeight: 8,
    name: "밝기 부조",
    license: "CC-BY-4.0",
    credit: "테스트 제작자",
  });
  const darkHeight = relief.voxels.filter((voxel) => voxel.x === 0 && voxel.y === 0).length;
  const lightHeight = relief.voxels.filter((voxel) => voxel.x === 1 && voxel.y === 0).length;
  assert.ok(lightHeight > darkHeight);
  assert.equal(relief.provenance.credit, "테스트 제작자");
});

test("알파 부조는 반투명 픽셀의 높이를 결정론적으로 사용한다", () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let index = 0; index < 16; index += 1) {
    data.set([128, 128, 128, index % 2 === 0 ? 64 : 255], index * 4);
  }
  const relief = pixelImageToFurniture({
    width: 4,
    height: 4,
    data,
    palette: ["#808080"],
    colors: Array.from({ length: 16 }, () => "#808080"),
  }, {
    mode: "relief",
    reliefSource: "alpha",
    material: "metal",
    reliefHeight: 8,
    name: "알파 부조",
    license: "CC0-1.0",
  });
  const translucent = relief.voxels.filter((voxel) => voxel.x === 0 && voxel.y === 0).length;
  const opaque = relief.voxels.filter((voxel) => voxel.x === 1 && voxel.y === 0).length;
  assert.ok(opaque > translucent);
});

test("앞·옆·위 실루엣 교집합은 하나의 결정론적 visual hull을 만든다", () => {
  const silhouette = {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray(4 * 4 * 4),
    palette: ["#8da18d"],
    colors: Array.from({ length: 16 }, () => "#8da18d"),
  };
  const hull = visualHullFromSilhouettes(
    silhouette,
    silhouette,
    silhouette,
    {
      material: "sage",
      name: "삼면 실루엣",
      license: "CC-BY-4.0",
    },
  );
  assert.deepEqual(hull.grid, { width: 4, depth: 4, height: 4 });
  assert.equal(hull.voxels.length, 64);
  assert.ok(hull.voxels.every((voxel) => voxel.color === "#8da18d"));
});
