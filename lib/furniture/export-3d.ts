import {
  createStoredZip,
  licenseText,
  utf8,
} from "./animated-export.ts";
import { encodeFurniture } from "./codec.ts";
import { FURNITURE_MATERIALS } from "./presets.ts";
import type {
  FurnitureDefinition,
  FurnitureMaterialId,
  FurnitureVoxel,
} from "./types.ts";

const TICKS_PER_BASE_CELL = 8;
const THIN_SURFACE_TICKS = 1;
export const FURNITURE_EXPORT_METERS_PER_BASE_CELL = 0.1;
export const FURNITURE_EXPORT_THIN_SURFACE_METERS =
  FURNITURE_EXPORT_METERS_PER_BASE_CELL * THIN_SURFACE_TICKS / TICKS_PER_BASE_CELL;

type Vec3 = [number, number, number];
type FaceDirection = "negative-x" | "positive-x" | "negative-y" | "positive-y" | "negative-z" | "positive-z";

interface TickBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface FurnitureExportMaterial {
  key: string;
  name: string;
  sourceMaterial: FurnitureMaterialId;
  color: string;
  colorFactor: [number, number, number, number];
}

interface FaceRectangle {
  direction: FaceDirection;
  plane: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  material: FurnitureExportMaterial;
}

export interface FurnitureMeshPrimitive {
  material: FurnitureExportMaterial;
  positions: number[];
  normals: number[];
  indices: number[];
  quadCount: number;
}

export interface FurnitureSurfaceMesh {
  coordinateSystem: "right-handed-y-up";
  unit: "meter";
  pivot: "ground-center";
  thinSurfaceMeters: number;
  bounds: { min: Vec3; max: Vec3 };
  primitives: FurnitureMeshPrimitive[];
  materialCount: number;
  vertexCount: number;
  triangleCount: number;
  quadCount: number;
}

export interface Furniture3dExportMetadata {
  schema: "character-room-builder/furniture-3d-export-1";
  name: string;
  coordinateSystem: "right-handed-y-up";
  unit: "meter";
  metersPerBaseCell: number;
  pivot: "ground-center";
  thinSurfaceMeters: number;
  mesh: {
    bounds: FurnitureSurfaceMesh["bounds"];
    materials: number;
    vertices: number;
    triangles: number;
    quads: number;
  };
  furniture: {
    placement: FurnitureDefinition["placement"];
    resolution: FurnitureDefinition["resolution"];
    rendererVersion: number;
  };
  rights: {
    license: FurnitureDefinition["provenance"]["license"];
    credit?: string;
    generatedImageModel: false;
  };
}

const FACE_DIRECTIONS: ReadonlyArray<{
  direction: FaceDirection;
  offset: Vec3;
}> = [
  { direction: "negative-x", offset: [-1, 0, 0] },
  { direction: "positive-x", offset: [1, 0, 0] },
  { direction: "negative-y", offset: [0, -1, 0] },
  { direction: "positive-y", offset: [0, 1, 0] },
  { direction: "negative-z", offset: [0, 0, -1] },
  { direction: "positive-z", offset: [0, 0, 1] },
];

function voxelKey(voxel: Pick<FurnitureVoxel, "x" | "y" | "z">): string {
  return `${voxel.x}:${voxel.y}:${voxel.z}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVoxels(left: FurnitureVoxel, right: FurnitureVoxel): number {
  return left.z - right.z || left.y - right.y || left.x - right.x ||
    compareText(left.material, right.material) ||
    compareText(left.color ?? "", right.color ?? "");
}

function parseColor(color: string): [number, number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error("3D 내보내기 색상 형식이 올바르지 않아요.");
  }
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
    1,
  ];
}

function exportMaterial(voxel: FurnitureVoxel): FurnitureExportMaterial {
  const color = (voxel.color ?? FURNITURE_MATERIALS[voxel.material].color).toLowerCase();
  const colorCode = color.slice(1);
  return {
    key: `${voxel.material}:${color}`,
    name: `material_${voxel.material}_${colorCode}`,
    sourceMaterial: voxel.material,
    color,
    colorFactor: parseColor(color),
  };
}

function boundsOfVoxels(voxels: FurnitureVoxel[]): {
  minX: number;
  minY: number;
  minZ: number;
} {
  return {
    minX: Math.min(...voxels.map((voxel) => voxel.x)),
    minY: Math.min(...voxels.map((voxel) => voxel.y)),
    minZ: Math.min(...voxels.map((voxel) => voxel.z)),
  };
}

function tickBox(
  furniture: FurnitureDefinition,
  voxel: FurnitureVoxel,
  origin: ReturnType<typeof boundsOfVoxels>,
): TickBox {
  const cellTicks = TICKS_PER_BASE_CELL / furniture.resolution;
  const x0 = (voxel.x - origin.minX) * cellTicks;
  const y0 = (voxel.y - origin.minY) * cellTicks;
  const z0 = (voxel.z - origin.minZ) * cellTicks;
  if (furniture.placement === "floor") {
    return {
      x0,
      x1: x0 + cellTicks,
      y0,
      y1: y0 + cellTicks,
      z0: 0,
      z1: THIN_SURFACE_TICKS,
    };
  }
  if (furniture.placement === "wall") {
    return {
      x0,
      x1: x0 + cellTicks,
      y0: 0,
      y1: THIN_SURFACE_TICKS,
      z0,
      z1: z0 + cellTicks,
    };
  }
  return {
    x0,
    x1: x0 + cellTicks,
    y0,
    y1: y0 + cellTicks,
    z0,
    z1: z0 + cellTicks,
  };
}

function faceRectangle(
  direction: FaceDirection,
  box: TickBox,
  material: FurnitureExportMaterial,
): FaceRectangle {
  if (direction === "negative-x" || direction === "positive-x") {
    return {
      direction,
      plane: direction === "negative-x" ? box.x0 : box.x1,
      u0: box.y0,
      u1: box.y1,
      v0: box.z0,
      v1: box.z1,
      material,
    };
  }
  if (direction === "negative-y" || direction === "positive-y") {
    return {
      direction,
      plane: direction === "negative-y" ? box.y0 : box.y1,
      u0: box.x0,
      u1: box.x1,
      v0: box.z0,
      v1: box.z1,
      material,
    };
  }
  return {
    direction,
    plane: direction === "negative-z" ? box.z0 : box.z1,
    u0: box.x0,
    u1: box.x1,
    v0: box.y0,
    v1: box.y1,
    material,
  };
}

function mergeRectangles(rectangles: FaceRectangle[]): FaceRectangle[] {
  const horizontal: FaceRectangle[] = [];
  [...rectangles]
    .sort((left, right) =>
      left.v0 - right.v0 || left.v1 - right.v1 ||
      left.u0 - right.u0 || left.u1 - right.u1)
    .forEach((rectangle) => {
      const previous = horizontal.at(-1);
      if (
        previous &&
        previous.v0 === rectangle.v0 &&
        previous.v1 === rectangle.v1 &&
        previous.u1 === rectangle.u0
      ) {
        previous.u1 = rectangle.u1;
      } else {
        horizontal.push({ ...rectangle });
      }
    });

  const vertical: FaceRectangle[] = [];
  horizontal
    .sort((left, right) =>
      left.u0 - right.u0 || left.u1 - right.u1 ||
      left.v0 - right.v0 || left.v1 - right.v1)
    .forEach((rectangle) => {
      const previous = vertical.at(-1);
      if (
        previous &&
        previous.u0 === rectangle.u0 &&
        previous.u1 === rectangle.u1 &&
        previous.v1 === rectangle.v0
      ) {
        previous.v1 = rectangle.v1;
      } else {
        vertical.push({ ...rectangle });
      }
    });
  return vertical;
}

function furnitureQuad(rectangle: FaceRectangle): Vec3[] {
  const { direction, plane, u0, u1, v0, v1 } = rectangle;
  if (direction === "positive-x") {
    return [[plane, u0, v0], [plane, u1, v0], [plane, u1, v1], [plane, u0, v1]];
  }
  if (direction === "negative-x") {
    return [[plane, u0, v0], [plane, u0, v1], [plane, u1, v1], [plane, u1, v0]];
  }
  if (direction === "positive-y") {
    return [[u0, plane, v0], [u0, plane, v1], [u1, plane, v1], [u1, plane, v0]];
  }
  if (direction === "negative-y") {
    return [[u0, plane, v0], [u1, plane, v0], [u1, plane, v1], [u0, plane, v1]];
  }
  if (direction === "positive-z") {
    return [[u0, v0, plane], [u1, v0, plane], [u1, v1, plane], [u0, v1, plane]];
  }
  return [[u0, v0, plane], [u0, v1, plane], [u1, v1, plane], [u1, v0, plane]];
}

function furnitureNormal(direction: FaceDirection): Vec3 {
  if (direction === "negative-x") return [-1, 0, 0];
  if (direction === "positive-x") return [1, 0, 0];
  if (direction === "negative-y") return [0, -1, 0];
  if (direction === "positive-y") return [0, 1, 0];
  if (direction === "negative-z") return [0, 0, -1];
  return [0, 0, 1];
}

function toExportPosition(
  point: Vec3,
  widthTicks: number,
  depthTicks: number,
  wall: boolean,
): Vec3 {
  const meterPerTick = FURNITURE_EXPORT_METERS_PER_BASE_CELL / TICKS_PER_BASE_CELL;
  return ([
    (point[0] - widthTicks / 2) * meterPerTick,
    point[2] * meterPerTick,
    (wall ? -point[1] : depthTicks / 2 - point[1]) * meterPerTick,
  ] as Vec3).map((value) => Object.is(value, -0) ? 0 : value) as Vec3;
}

function toExportNormal(normal: Vec3): Vec3 {
  return [normal[0], normal[2], -normal[1]];
}

function updateBounds(bounds: { min: Vec3; max: Vec3 }, point: Vec3): void {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
}

export function buildFurnitureSurfaceMesh(
  furniture: FurnitureDefinition,
): FurnitureSurfaceMesh {
  if (furniture.voxels.length === 0) {
    throw new Error("3D 모델로 내보낼 복셀이 없어요.");
  }
  const voxels = [...new Map(
    [...furniture.voxels].sort(compareVoxels).map((voxel) => [voxelKey(voxel), voxel]),
  ).values()].sort(compareVoxels);
  const occupied = new Set(voxels.map(voxelKey));
  const origin = boundsOfVoxels(voxels);
  const boxes = new Map(voxels.map((voxel) => [voxelKey(voxel), tickBox(furniture, voxel, origin)]));
  const groupedFaces = new Map<string, FaceRectangle[]>();

  voxels.forEach((voxel) => {
    const box = boxes.get(voxelKey(voxel));
    if (!box) return;
    const material = exportMaterial(voxel);
    FACE_DIRECTIONS.forEach(({ direction, offset }) => {
      const neighbor = `${voxel.x + offset[0]}:${voxel.y + offset[1]}:${voxel.z + offset[2]}`;
      if (occupied.has(neighbor)) return;
      const rectangle = faceRectangle(direction, box, material);
      const groupKey = `${direction}:${rectangle.plane}:${material.key}`;
      const group = groupedFaces.get(groupKey) ?? [];
      group.push(rectangle);
      groupedFaces.set(groupKey, group);
    });
  });

  const mergedFaces = [...groupedFaces.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .flatMap(([, rectangles]) => mergeRectangles(rectangles));
  const widthTicks = Math.max(...[...boxes.values()].map((box) => box.x1));
  const depthTicks = Math.max(...[...boxes.values()].map((box) => box.y1));
  const materialMap = new Map<string, FurnitureExportMaterial>();
  mergedFaces.forEach((face) => materialMap.set(face.material.key, face.material));
  const materials = [...materialMap.values()].sort((left, right) =>
    compareText(left.key, right.key));
  const primitiveMap = new Map<string, FurnitureMeshPrimitive>(materials.map((material) => [
    material.key,
    { material, positions: [], normals: [], indices: [], quadCount: 0 },
  ]));
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as Vec3,
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as Vec3,
  };

  mergedFaces.forEach((face) => {
    const primitive = primitiveMap.get(face.material.key);
    if (!primitive) return;
    const normal = toExportNormal(furnitureNormal(face.direction));
    const vertexOffset = primitive.positions.length / 3;
    furnitureQuad(face).forEach((point) => {
      const exported = toExportPosition(
        point,
        widthTicks,
        depthTicks,
        furniture.placement === "wall",
      );
      primitive.positions.push(...exported);
      primitive.normals.push(...normal);
      updateBounds(bounds, exported);
    });
    primitive.indices.push(
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 3,
    );
    primitive.quadCount += 1;
  });

  const primitives = materials.map((material) => primitiveMap.get(material.key)).filter(
    (primitive): primitive is FurnitureMeshPrimitive => primitive !== undefined,
  );
  const quadCount = primitives.reduce((sum, primitive) => sum + primitive.quadCount, 0);
  return {
    coordinateSystem: "right-handed-y-up",
    unit: "meter",
    pivot: "ground-center",
    thinSurfaceMeters: FURNITURE_EXPORT_THIN_SURFACE_METERS,
    bounds,
    primitives,
    materialCount: primitives.length,
    vertexCount: primitives.reduce((sum, primitive) => sum + primitive.positions.length / 3, 0),
    triangleCount: quadCount * 2,
    quadCount,
  };
}

function float32Bytes(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

function uint32Bytes(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function alignedLength(length: number): number {
  return Math.ceil(length / 4) * 4;
}

class BinaryBuilder {
  private readonly chunks: Uint8Array[] = [];
  length = 0;

  append(data: Uint8Array): { byteOffset: number; byteLength: number } {
    const aligned = alignedLength(this.length);
    if (aligned > this.length) this.chunks.push(new Uint8Array(aligned - this.length));
    this.length = aligned;
    const byteOffset = this.length;
    this.chunks.push(data);
    this.length += data.length;
    return { byteOffset, byteLength: data.length };
  }

  finish(): Uint8Array {
    const bytes = new Uint8Array(alignedLength(this.length));
    let offset = 0;
    this.chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.length;
    });
    return bytes;
  }
}

function componentBounds(values: number[]): { min: Vec3; max: Vec3 } {
  const result = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as Vec3,
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as Vec3,
  };
  for (let index = 0; index < values.length; index += 3) {
    updateBounds(result, [values[index], values[index + 1], values[index + 2]]);
  }
  return result;
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

export function encodeFurnitureGlb(furniture: FurnitureDefinition): Uint8Array {
  const mesh = buildFurnitureSurfaceMesh(furniture);
  const binary = new BinaryBuilder();
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const gltfPrimitives: Array<Record<string, unknown>> = [];

  mesh.primitives.forEach((primitive, materialIndex) => {
    const positionBuffer = binary.append(float32Bytes(primitive.positions));
    const positionView = bufferViews.push({ ...positionBuffer, target: 34962 }) - 1;
    const positionBounds = componentBounds(primitive.positions);
    const positionAccessor = accessors.push({
      bufferView: positionView,
      byteOffset: 0,
      componentType: 5126,
      count: primitive.positions.length / 3,
      type: "VEC3",
      min: positionBounds.min,
      max: positionBounds.max,
    }) - 1;

    const normalBuffer = binary.append(float32Bytes(primitive.normals));
    const normalView = bufferViews.push({ ...normalBuffer, target: 34962 }) - 1;
    const normalAccessor = accessors.push({
      bufferView: normalView,
      byteOffset: 0,
      componentType: 5126,
      count: primitive.normals.length / 3,
      type: "VEC3",
    }) - 1;

    const indexBuffer = binary.append(uint32Bytes(primitive.indices));
    const indexView = bufferViews.push({ ...indexBuffer, target: 34963 }) - 1;
    const indexAccessor = accessors.push({
      bufferView: indexView,
      byteOffset: 0,
      componentType: 5125,
      count: primitive.indices.length,
      type: "SCALAR",
      min: [0],
      max: [primitive.positions.length / 3 - 1],
    }) - 1;

    gltfPrimitives.push({
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
      indices: indexAccessor,
      material: materialIndex,
      mode: 4,
    });
  });

  const binaryData = binary.finish();
  const encodedFurniture = encodeFurniture(furniture);
  const root = {
    asset: {
      version: "2.0",
      generator: "Character Room Builder · 복셀 가구 에디터",
      ...(furniture.provenance.credit ? { copyright: furniture.provenance.credit } : {}),
    },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{
      name: furniture.name,
      mesh: 0,
      extras: {
        characterRoomBuilder: {
          schema: "FURN1",
          code: encodedFurniture,
          placement: furniture.placement,
          resolution: furniture.resolution,
          rendererVersion: furniture.rendererVersion,
          unit: "meter",
          metersPerBaseCell: FURNITURE_EXPORT_METERS_PER_BASE_CELL,
          pivot: "ground-center",
          license: furniture.provenance.license,
          ...(furniture.provenance.credit ? { credit: furniture.provenance.credit } : {}),
          generatedImageModel: false,
        },
      },
    }],
    meshes: [{ name: furniture.name, primitives: gltfPrimitives }],
    materials: mesh.primitives.map((primitive) => ({
      name: primitive.material.name,
      pbrMetallicRoughness: {
        baseColorFactor: primitive.material.colorFactor,
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      extensions: { KHR_materials_unlit: {} },
      extras: {
        sourceMaterial: primitive.material.sourceMaterial,
        sourceColor: primitive.material.color,
      },
    })),
    buffers: [{ byteLength: binaryData.length }],
    bufferViews,
    accessors,
  };
  const json = utf8(JSON.stringify(root));
  const paddedJsonLength = alignedLength(json.length);
  const totalLength = 12 + 8 + paddedJsonLength + 8 + binaryData.length;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  writeUint32(view, 0, 0x46546c67);
  writeUint32(view, 4, 2);
  writeUint32(view, 8, totalLength);
  writeUint32(view, 12, paddedJsonLength);
  writeUint32(view, 16, 0x4e4f534a);
  output.fill(0x20, 20, 20 + paddedJsonLength);
  output.set(json, 20);
  const binaryHeader = 20 + paddedJsonLength;
  writeUint32(view, binaryHeader, binaryData.length);
  writeUint32(view, binaryHeader + 4, 0x004e4942);
  output.set(binaryData, binaryHeader + 8);
  return output;
}

function formatNumber(value: number): string {
  const normalized = Object.is(value, -0) || Math.abs(value) < 0.0000005 ? 0 : value;
  return normalized.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function encodeFurnitureMtl(furniture: FurnitureDefinition): string {
  const mesh = buildFurnitureSurfaceMesh(furniture);
  return mesh.primitives.map((primitive) => {
    const [red, green, blue] = primitive.material.colorFactor;
    return [
      `newmtl ${primitive.material.name}`,
      `Kd ${formatNumber(red)} ${formatNumber(green)} ${formatNumber(blue)}`,
      "Ka 0 0 0",
      "Ks 0 0 0",
      "d 1",
      "illum 1",
    ].join("\n");
  }).join("\n\n") + "\n";
}

export function encodeFurnitureObj(
  furniture: FurnitureDefinition,
  materialLibraryFilename: string,
): string {
  const mesh = buildFurnitureSurfaceMesh(furniture);
  const lines = [
    "# Character Room Builder voxel furniture",
    "# right-handed, Y-up, meters, ground-center pivot",
    `mtllib ${materialLibraryFilename}`,
    "o furniture",
  ];
  let vertexOffset = 1;
  mesh.primitives.forEach((primitive) => {
    for (let index = 0; index < primitive.positions.length; index += 3) {
      lines.push(`v ${formatNumber(primitive.positions[index])} ${formatNumber(primitive.positions[index + 1])} ${formatNumber(primitive.positions[index + 2])}`);
    }
    for (let index = 0; index < primitive.normals.length; index += 3) {
      lines.push(`vn ${formatNumber(primitive.normals[index])} ${formatNumber(primitive.normals[index + 1])} ${formatNumber(primitive.normals[index + 2])}`);
    }
    lines.push(`usemtl ${primitive.material.name}`);
    for (let quad = 0; quad < primitive.quadCount; quad += 1) {
      const first = vertexOffset + quad * 4;
      lines.push(`f ${first}//${first} ${first + 1}//${first + 1} ${first + 2}//${first + 2} ${first + 3}//${first + 3}`);
    }
    vertexOffset += primitive.positions.length / 3;
  });
  return lines.join("\n") + "\n";
}

export function makeFurniture3dExportMetadata(
  furniture: FurnitureDefinition,
  mesh = buildFurnitureSurfaceMesh(furniture),
): Furniture3dExportMetadata {
  return {
    schema: "character-room-builder/furniture-3d-export-1",
    name: furniture.name,
    coordinateSystem: mesh.coordinateSystem,
    unit: mesh.unit,
    metersPerBaseCell: FURNITURE_EXPORT_METERS_PER_BASE_CELL,
    pivot: mesh.pivot,
    thinSurfaceMeters: mesh.thinSurfaceMeters,
    mesh: {
      bounds: mesh.bounds,
      materials: mesh.materialCount,
      vertices: mesh.vertexCount,
      triangles: mesh.triangleCount,
      quads: mesh.quadCount,
    },
    furniture: {
      placement: furniture.placement,
      resolution: furniture.resolution,
      rendererVersion: furniture.rendererVersion,
    },
    rights: {
      license: furniture.provenance.license,
      ...(furniture.provenance.credit ? { credit: furniture.provenance.credit } : {}),
      generatedImageModel: false,
    },
  };
}

export function encodeFurnitureObjZip(
  furniture: FurnitureDefinition,
  baseFilename: string,
): Uint8Array {
  const mesh = buildFurnitureSurfaceMesh(furniture);
  const metadata = makeFurniture3dExportMetadata(furniture, mesh);
  const mtlFilename = `${baseFilename}.mtl`;
  return createStoredZip([
    { name: `${baseFilename}.obj`, data: utf8(encodeFurnitureObj(furniture, mtlFilename)) },
    { name: mtlFilename, data: utf8(encodeFurnitureMtl(furniture)) },
    { name: `${baseFilename}.furn1.txt`, data: utf8(encodeFurniture(furniture) + "\n") },
    { name: "metadata.json", data: utf8(JSON.stringify(metadata, null, 2) + "\n") },
    { name: "LICENSE.txt", data: utf8(licenseText(furniture)) },
  ]);
}
