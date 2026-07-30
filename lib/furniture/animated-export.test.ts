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

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.length + second.length);
  output.set(first, 0);
  output.set(second, first.length);
  return output;
}

function firstGifFrameIndices(data: Uint8Array): Uint8Array {
  let offset = 13;
  const globalTableSize = data[10] & 0x80 ? 3 * (1 << ((data[10] & 0x07) + 1)) : 0;
  offset += globalTableSize;

  while (offset < data.length && data[offset] !== 0x2c) {
    assert.equal(data[offset], 0x21);
    offset += 2;
    while (data[offset] !== 0) {
      offset += 1 + data[offset];
    }
    offset += 1;
  }
  assert.equal(data[offset], 0x2c);
  offset += 10;
  const minimumCodeSize = data[offset];
  offset += 1;
  const blocks: number[] = [];
  while (data[offset] !== 0) {
    const length = data[offset];
    offset += 1;
    blocks.push(...data.slice(offset, offset + length));
    offset += length;
  }

  const compressed = new Uint8Array(blocks);
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let bitOffset = 0;
  let previous: Uint8Array | undefined;
  let dictionary: Array<Uint8Array | undefined> = [];
  const output: number[] = [];
  const reset = () => {
    dictionary = Array.from({ length: clearCode }, (_, value) => new Uint8Array([value]));
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
    previous = undefined;
  };
  const readCode = (): number => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const byte = compressed[Math.floor(bitOffset / 8)];
      assert.notEqual(byte, undefined, "GIF LZW 코드가 중간에 끝났어요.");
      code |= ((byte >>> (bitOffset % 8)) & 1) << bit;
      bitOffset += 1;
    }
    return code;
  };

  reset();
  while (true) {
    const code = readCode();
    if (code === clearCode) {
      reset();
      continue;
    }
    if (code === endCode) break;
    let entry = dictionary[code];
    if (!entry && code === nextCode && previous) {
      entry = concatBytes(previous, previous.slice(0, 1));
    }
    assert.ok(entry, `GIF LZW 사전에 없는 코드예요: ${code}`);
    output.push(...entry);
    if (previous) {
      dictionary[nextCode] = concatBytes(previous, entry.slice(0, 1));
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }
  return new Uint8Array(output);
}

function firstGifFrameRgba(data: Uint8Array): Uint8ClampedArray {
  const indices = firstGifFrameIndices(data);
  const output = new Uint8ClampedArray(indices.length * 4);
  indices.forEach((paletteIndex, index) => {
    if (paletteIndex === 0) return;
    const paletteOffset = 13 + paletteIndex * 3;
    output.set([
      data[paletteOffset],
      data[paletteOffset + 1],
      data[paletteOffset + 2],
      255,
    ], index * 4);
  });
  return output;
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
  assert.deepEqual(firstGifFrameRgba(first).slice(0, 4), new Uint8ClampedArray([141, 161, 141, 255]));
});

test("GIF 전역 팔레트는 255색까지 원본 RGB를 보존한다", () => {
  const width = 64;
  const height = 64;
  const firstFrame = new Uint8ClampedArray(width * height * 4);
  const secondFrame = new Uint8ClampedArray(width * height * 4);
  const expected = new Uint8ClampedArray(width * height * 4);
  let state = 0x12345678;
  for (let index = 0; index < width * height; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const red = (state & 0x03) * 85;
    const green = (state >>> 2 & 0x03) * 85;
    const blue = (state >>> 4 & 0x03) * 85;
    const alpha = index % 13 === 0 ? 0 : 255;
    firstFrame.set([red, green, blue, alpha], index * 4);
    secondFrame.set([blue, red, green, alpha], index * 4);
    expected.set(alpha === 0 ? [0, 0, 0, 0] : [red, green, blue, 255], index * 4);
  }
  const output = encodeAnimatedGif(
    [{ data: firstFrame }, { data: secondFrame }],
    width,
    height,
    120,
  );
  assert.deepEqual(firstGifFrameRgba(output), expected);
});

test("GIF 색이 255개를 넘으면 가까운 전역 팔레트로 결정론적으로 줄인다", () => {
  const width = 32;
  const height = 16;
  const firstFrame = new Uint8ClampedArray(width * height * 4);
  const secondFrame = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const red = index & 0xff;
    const green = (index >>> 8) * 127;
    const blue = (index * 73) & 0xff;
    firstFrame.set([red, green, blue, 255], index * 4);
    secondFrame.set([blue, green, red, 255], index * 4);
  }
  const first = encodeAnimatedGif(
    [{ data: firstFrame }, { data: secondFrame }],
    width,
    height,
    120,
  );
  const second = encodeAnimatedGif(
    [{ data: firstFrame }, { data: secondFrame }],
    width,
    height,
    120,
  );
  assert.deepEqual(first, second);

  const decoded = firstGifFrameRgba(first);
  let difference = 0;
  for (let index = 0; index < decoded.length; index += 4) {
    difference += Math.abs(decoded[index] - firstFrame[index]);
    difference += Math.abs(decoded[index + 1] - firstFrame[index + 1]);
    difference += Math.abs(decoded[index + 2] - firstFrame[index + 2]);
    assert.equal(decoded[index + 3], 255);
  }
  assert.ok(difference / (width * height * 3) < 8);
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
