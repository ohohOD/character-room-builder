import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleAnimatedWebP,
  createStoredZip,
  encodeAnimatedGif,
  licenseText,
  makeFurnitureExportMetadata,
  utf8,
} from "./animated-export.ts";
import type { FurnitureDefinition } from "./types.ts";

function furniture(): FurnitureDefinition {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: "volume",
    resolution: 2,
    name: "내보내기 의자",
    grid: { width: 4, depth: 4, height: 4 },
    voxels: [{ x: 0, y: 0, z: 0, material: "sage" }],
    provenance: {
      generatedImageModel: false,
      license: "CC-BY-4.0",
      credit: "김가구",
    },
  };
}

function textAt(data: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...data.slice(offset, offset + length));
}

function fakeStaticWebP(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x0e, 0, 0, 0,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x4c,
    0x02, 0, 0, 0,
    0, 0,
  ]);
}

test("GIF 애니메이션은 투명 프레임과 반복 확장을 결정론적으로 인코드한다", () => {
  const firstFrame = new Uint8ClampedArray(4 * 4 * 4);
  const secondFrame = new Uint8ClampedArray(4 * 4 * 4);
  firstFrame.set([141, 161, 141, 255], 0);
  secondFrame.set([195, 143, 135, 255], 4);
  const first = encodeAnimatedGif(
    [{ data: firstFrame }, { data: secondFrame }],
    4,
    4,
    120,
  );
  const second = encodeAnimatedGif(
    [{ data: firstFrame }, { data: secondFrame }],
    4,
    4,
    120,
  );
  assert.deepEqual(first, second);
  assert.equal(textAt(first, 0, 6), "GIF89a");
  assert.equal(first.at(-1), 0x3b);
  assert.ok(new TextDecoder().decode(first).includes("NETSCAPE2.0"));
});

test("정적 WebP 프레임을 VP8X·ANIM·ANMF 컨테이너로 묶는다", () => {
  const output = assembleAnimatedWebP(
    [fakeStaticWebP(), fakeStaticWebP()],
    16,
    16,
    140,
  );
  const text = new TextDecoder("latin1").decode(output);
  assert.equal(textAt(output, 0, 4), "RIFF");
  assert.equal(textAt(output, 8, 4), "WEBP");
  assert.ok(text.includes("VP8X"));
  assert.ok(text.includes("ANIM"));
  assert.equal(text.split("ANMF").length - 1, 2);
});

test("다운로드 묶음 ZIP은 UTF-8 파일과 결정론적 중앙 디렉터리를 가진다", () => {
  const first = createStoredZip([
    { name: "metadata.json", data: utf8("{\"ok\":true}\n") },
    { name: "LICENSE.txt", data: utf8("CC BY 4.0\n") },
  ]);
  const second = createStoredZip([
    { name: "metadata.json", data: utf8("{\"ok\":true}\n") },
    { name: "LICENSE.txt", data: utf8("CC BY 4.0\n") },
  ]);
  assert.deepEqual(first, second);
  assert.equal(textAt(first, 0, 4), "PK\x03\x04");
  assert.ok(new TextDecoder().decode(first).includes("metadata.json"));
  assert.equal(textAt(first, first.length - 22, 4), "PK\x05\x06");
});

test("메타데이터와 라이선스 파일은 방향·기준점·권리를 보존한다", () => {
  const metadata = makeFurnitureExportMetadata(
    furniture(),
    512,
    140,
    [0, 45, 90, 135, 180, 225, 270, 315],
  );
  assert.equal(metadata.frame.count, 8);
  assert.deepEqual(metadata.frame.groundAnchor, { x: 0.5, y: 0.82 });
  assert.equal(metadata.rights.credit, "김가구");
  assert.equal(metadata.rights.generatedImageModel, false);
  assert.match(licenseText(furniture()), /CC BY 4.0/);
  assert.match(licenseText(furniture()), /김가구/);
});
