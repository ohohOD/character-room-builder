import {
  PALETTES,
  type RoomPalette,
} from "../room/sample-room";
import type { RoomDocument, RoomObject } from "../room/types";

type Point = { x: number; y: number };
type Projector = (x: number, y: number, z?: number) => Point;
type Random = () => number;

const ROOM_WIDTH = 8;
const ROOM_DEPTH = 6;
const WALL_HEIGHT = 4.8;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): Random {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixColor(first: string, second: string, amount: number): string {
  const a = parseHex(first);
  const b = parseHex(second);
  const channel = (index: number) =>
    Math.round(a[index] + (b[index] - a[index]) * amount)
      .toString(16)
      .padStart(2, "0");
  return "#" + channel(0) + channel(1) + channel(2);
}

function withAlpha(color: string, alpha: number): string {
  const [red, green, blue] = parseHex(color);
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  points: Point[],
): void {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
}

function polygon(
  context: CanvasRenderingContext2D,
  points: Point[],
  fill: string,
  stroke: string,
  lineWidth = 1,
): void {
  tracePolygon(context, points);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.stroke();
}

function line(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  stroke: string,
  lineWidth = 1,
): void {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.stroke();
}

function box(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  color: string,
): void {
  const outline = withAlpha(palette.ink, 0.72);
  const front = mixColor(color, palette.ink, 0.08);
  const side = mixColor(color, palette.ink, 0.18);
  const top = mixColor(color, "#FFFFFF", 0.16);

  polygon(
    context,
    [
      project(x, y + depth, z),
      project(x + width, y + depth, z),
      project(x + width, y + depth, z + height),
      project(x, y + depth, z + height),
    ],
    front,
    outline,
  );
  polygon(
    context,
    [
      project(x + width, y, z),
      project(x + width, y + depth, z),
      project(x + width, y + depth, z + height),
      project(x + width, y, z + height),
    ],
    side,
    outline,
  );
  polygon(
    context,
    [
      project(x, y, z + height),
      project(x + width, y, z + height),
      project(x + width, y + depth, z + height),
      project(x, y + depth, z + height),
    ],
    top,
    outline,
  );
}

function drawRoomShadow(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
): void {
  const floor = [
    project(0, 0),
    project(ROOM_WIDTH, 0),
    project(ROOM_WIDTH, ROOM_DEPTH),
    project(0, ROOM_DEPTH),
  ].map((point) => ({ x: point.x, y: point.y + 18 }));

  context.save();
  context.shadowColor = withAlpha(palette.ink, 0.24);
  context.shadowBlur = 30;
  context.shadowOffsetY = 12;
  tracePolygon(context, floor);
  context.fillStyle = withAlpha(palette.ink, 0.12);
  context.fill();
  context.restore();
}

function drawRoomShell(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
): void {
  const outline = withAlpha(palette.ink, 0.3);

  polygon(
    context,
    [
      project(0, 0),
      project(ROOM_WIDTH, 0),
      project(ROOM_WIDTH, ROOM_DEPTH),
      project(0, ROOM_DEPTH),
    ],
    palette.floor,
    outline,
    1.2,
  );

  for (let x = 0.5; x < ROOM_WIDTH; x += 0.5) {
    line(
      context,
      project(x, 0, 0.012),
      project(x, ROOM_DEPTH, 0.012),
      withAlpha(palette.floorLine, x % 1 === 0 ? 0.4 : 0.2),
      x % 1 === 0 ? 0.9 : 0.5,
    );
  }

  polygon(
    context,
    [
      project(0, 0),
      project(0, ROOM_DEPTH),
      project(0, ROOM_DEPTH, WALL_HEIGHT),
      project(0, 0, WALL_HEIGHT),
    ],
    palette.wallShade,
    outline,
    1.2,
  );

  polygon(
    context,
    [
      project(0, 0),
      project(ROOM_WIDTH, 0),
      project(ROOM_WIDTH, 0, WALL_HEIGHT),
      project(0, 0, WALL_HEIGHT),
    ],
    palette.wall,
    outline,
    1.2,
  );

  line(
    context,
    project(0, 0, 1.05),
    project(ROOM_WIDTH, 0, 1.05),
    withAlpha(palette.ink, 0.14),
  );
  line(
    context,
    project(0, 0, 1.05),
    project(0, ROOM_DEPTH, 1.05),
    withAlpha(palette.ink, 0.14),
  );
}

function drawWindow(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
): void {
  const x = object.x;
  const z = object.z ?? 1.65;
  const width = 2.35;
  const height = 2.25;
  const points = [
    project(x, 0, z),
    project(x + width, 0, z),
    project(x + width, 0, z + height),
    project(x, 0, z + height),
  ];

  context.save();
  tracePolygon(context, points);
  context.clip();
  const top = Math.min(points[2].y, points[3].y);
  const bottom = Math.max(points[0].y, points[1].y);
  const sky = context.createLinearGradient(0, top, 0, bottom);
  sky.addColorStop(0, mixColor(palette.sky, "#FFFFFF", 0.2));
  sky.addColorStop(1, palette.sky);
  context.fillStyle = sky;
  context.fillRect(
    Math.min(...points.map((point) => point.x)),
    top,
    Math.max(...points.map((point) => point.x)) -
      Math.min(...points.map((point) => point.x)),
    bottom - top + 2,
  );

  const glow = context.createRadialGradient(
    points[2].x - 24,
    points[2].y + 28,
    2,
    points[2].x - 24,
    points[2].y + 28,
    44,
  );
  glow.addColorStop(0, withAlpha(palette.light, 0.82));
  glow.addColorStop(1, withAlpha(palette.light, 0));
  context.fillStyle = glow;
  context.fillRect(points[3].x, top, points[1].x - points[3].x, bottom - top);
  context.restore();

  polygon(
    context,
    points,
    withAlpha(palette.sky, 0.08),
    palette.woodDark,
    2.8,
  );

  const middleX = x + width / 2;
  const middleZ = z + height / 2;
  line(
    context,
    project(middleX, 0, z),
    project(middleX, 0, z + height),
    palette.woodDark,
    2.2,
  );
  line(
    context,
    project(x, 0, middleZ),
    project(x + width, 0, middleZ),
    palette.woodDark,
    2.2,
  );

  box(
    context,
    project,
    palette,
    x - 0.08,
    0.01,
    z - 0.11,
    width + 0.16,
    0.13,
    0.1,
    palette.wood,
  );
}

function drawFrame(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
): void {
  const y = object.y;
  const z = object.z ?? 2.05;
  const outer = [
    project(0, y, z),
    project(0, y + 1.35, z),
    project(0, y + 1.35, z + 1.18),
    project(0, y, z + 1.18),
  ];
  const inner = [
    project(0.01, y + 0.15, z + 0.14),
    project(0.01, y + 1.2, z + 0.14),
    project(0.01, y + 1.2, z + 1.02),
    project(0.01, y + 0.15, z + 1.02),
  ];

  polygon(context, outer, palette.woodDark, withAlpha(palette.ink, 0.7));
  polygon(context, inner, palette.clothLight, withAlpha(palette.ink, 0.35));
  line(
    context,
    project(0.02, y + 0.28, z + 0.38),
    project(0.02, y + 1.03, z + 0.78),
    withAlpha(palette.accent, 0.7),
    2,
  );
  line(
    context,
    project(0.02, y + 0.34, z + 0.78),
    project(0.02, y + 0.97, z + 0.43),
    withAlpha(palette.leaf, 0.62),
    2,
  );
}

function drawRug(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
  random: Random,
): void {
  const x = object.x;
  const y = object.y;
  const width = 3.45;
  const depth = 2.5;
  const outer = [
    project(x, y, 0.025),
    project(x + width, y, 0.025),
    project(x + width, y + depth, 0.025),
    project(x, y + depth, 0.025),
  ];
  const inset = 0.18;
  const inner = [
    project(x + inset, y + inset, 0.03),
    project(x + width - inset, y + inset, 0.03),
    project(x + width - inset, y + depth - inset, 0.03),
    project(x + inset, y + depth - inset, 0.03),
  ];

  polygon(
    context,
    outer,
    mixColor(palette.cloth, palette.wall, 0.18),
    withAlpha(palette.ink, 0.32),
  );
  polygon(
    context,
    inner,
    mixColor(palette.cloth, palette.wall, 0.35),
    withAlpha(palette.ink, 0.22),
  );

  for (let stripe = 0; stripe < 5; stripe += 1) {
    const offset = 0.52 + stripe * 0.48 + random() * 0.05;
    line(
      context,
      project(x + 0.25, y + offset, 0.035),
      project(x + width - 0.25, y + offset, 0.035),
      withAlpha(stripe % 2 === 0 ? palette.accent : palette.cloth, 0.42),
      1.25,
    );
  }
}

function drawShelf(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
  random: Random,
): void {
  const x = object.x;
  const y = object.y;
  const width = 1.9;
  const depth = 0.48;
  const height = 2.7;

  box(context, project, palette, x, y, 0, width, depth, height, palette.wood);
  [0.58, 1.18, 1.78, 2.38].forEach((z) => {
    line(
      context,
      project(x + 0.08, y + depth + 0.01, z),
      project(x + width - 0.08, y + depth + 0.01, z),
      withAlpha(palette.ink, 0.66),
      1.4,
    );
  });

  const bookColors = [
    palette.cloth,
    palette.accent,
    palette.clothLight,
    palette.leaf,
    palette.ceramic,
  ];

  for (let shelf = 0; shelf < 3; shelf += 1) {
    let cursor = x + 0.12;
    for (let book = 0; book < 5; book += 1) {
      const bookWidth = 0.16 + random() * 0.09;
      const bookHeight = 0.28 + random() * 0.19;
      box(
        context,
        project,
        palette,
        cursor,
        y + 0.12,
        0.59 + shelf * 0.6,
        bookWidth,
        0.26,
        bookHeight,
        bookColors[Math.floor(random() * bookColors.length)],
      );
      cursor += bookWidth + 0.035;
    }
  }
}

function drawBed(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
  random: Random,
): void {
  const x = object.x;
  const y = object.y;

  box(context, project, palette, x, y, 0.05, 2.8, 1.75, 0.34, palette.wood);
  box(
    context,
    project,
    palette,
    x + 0.12,
    y + 0.1,
    0.39,
    2.56,
    1.5,
    0.28,
    palette.clothLight,
  );
  box(
    context,
    project,
    palette,
    x + 1.08,
    y + 0.16,
    0.67,
    1.54,
    1.38,
    0.13,
    palette.cloth,
  );
  box(
    context,
    project,
    palette,
    x + 0.28,
    y + 0.24,
    0.68,
    0.72,
    0.9,
    0.17,
    mixColor(palette.ceramic, "#FFFFFF", 0.2),
  );
  box(
    context,
    project,
    palette,
    x + 0.72,
    y - 0.02,
    0.05,
    0.11,
    1.82,
    1.18,
    palette.woodDark,
  );

  if (random() > 0.5) {
    line(
      context,
      project(x + 1.42, y + 0.17, 0.81),
      project(x + 1.42, y + 1.52, 0.81),
      withAlpha(palette.clothLight, 0.72),
      1.6,
    );
  }
}

function drawDesk(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
): void {
  const x = object.x;
  const y = object.y;
  const width = 2.18;
  const depth = 0.78;

  box(context, project, palette, x, y, 0.04, width, depth, 1.18, palette.wood);
  box(
    context,
    project,
    palette,
    x + 0.12,
    y + 0.09,
    0.05,
    0.16,
    0.14,
    1.05,
    palette.woodDark,
  );
  box(
    context,
    project,
    palette,
    x + width - 0.3,
    y + depth - 0.22,
    0.05,
    0.16,
    0.14,
    1.05,
    palette.woodDark,
  );
  box(
    context,
    project,
    palette,
    x + width - 0.68,
    y + 0.13,
    0.58,
    0.55,
    0.55,
    0.45,
    mixColor(palette.wood, palette.wall, 0.08),
  );
  line(
    context,
    project(x + width - 0.58, y + depth + 0.01, 0.83),
    project(x + width - 0.18, y + depth + 0.01, 0.83),
    withAlpha(palette.ink, 0.48),
  );
}

function drawChair(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
): void {
  const x = object.x;
  const y = object.y;

  box(context, project, palette, x, y, 0.48, 0.86, 0.78, 0.16, palette.wood);
  [
    [x + 0.06, y + 0.06],
    [x + 0.66, y + 0.06],
    [x + 0.06, y + 0.58],
    [x + 0.66, y + 0.58],
  ].forEach(([legX, legY]) => {
    box(
      context,
      project,
      palette,
      legX,
      legY,
      0.02,
      0.11,
      0.11,
      0.46,
      palette.woodDark,
    );
  });
  box(
    context,
    project,
    palette,
    x + 0.05,
    y + 0.02,
    0.64,
    0.13,
    0.72,
    0.9,
    palette.wood,
  );
  box(
    context,
    project,
    palette,
    x + 0.14,
    y + 0.1,
    0.66,
    0.62,
    0.53,
    0.09,
    palette.cloth,
  );
}

function drawLamp(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
): void {
  const base = project(object.x, object.y, object.z ?? 1.28);
  const top = project(object.x, object.y, (object.z ?? 1.28) + 0.74);

  context.save();
  const glow = context.createRadialGradient(top.x, top.y + 8, 2, top.x, top.y + 8, 64);
  glow.addColorStop(0, withAlpha(palette.light, 0.28));
  glow.addColorStop(1, withAlpha(palette.light, 0));
  context.fillStyle = glow;
  context.fillRect(top.x - 70, top.y - 62, 140, 140);
  context.restore();

  context.beginPath();
  context.ellipse(base.x, base.y, 9, 4, 0, 0, Math.PI * 2);
  context.fillStyle = palette.metal;
  context.fill();
  context.strokeStyle = withAlpha(palette.ink, 0.7);
  context.stroke();

  line(context, base, top, palette.metal, 2.2);
  polygon(
    context,
    [
      { x: top.x - 15, y: top.y + 4 },
      { x: top.x + 15, y: top.y + 4 },
      { x: top.x + 9, y: top.y - 16 },
      { x: top.x - 8, y: top.y - 16 },
    ],
    palette.light,
    withAlpha(palette.ink, 0.65),
  );
}

function drawLetter(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
): void {
  const z = object.z ?? 1.27;
  const points = [
    project(object.x, object.y, z),
    project(object.x + 0.58, object.y, z),
    project(object.x + 0.58, object.y + 0.34, z),
    project(object.x, object.y + 0.34, z),
  ];
  polygon(
    context,
    points,
    mixColor(palette.ceramic, "#FFFFFF", 0.46),
    withAlpha(palette.ink, 0.36),
    0.8,
  );
  line(
    context,
    project(object.x + 0.1, object.y + 0.12, z + 0.01),
    project(object.x + 0.46, object.y + 0.12, z + 0.01),
    withAlpha(palette.ink, 0.34),
    0.7,
  );
}

function drawPlant(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
  random: Random,
): void {
  const x = object.x;
  const y = object.y;
  box(
    context,
    project,
    palette,
    x,
    y,
    0.02,
    0.68,
    0.68,
    0.62,
    palette.ceramic,
  );

  const stem = project(x + 0.34, y + 0.34, 0.62);
  const crown = project(x + 0.34, y + 0.34, 1.5);
  line(context, stem, crown, palette.leaf, 2.2);

  for (let leaf = 0; leaf < 9; leaf += 1) {
    const angle = -Math.PI * 0.92 + leaf * 0.72 + random() * 0.24;
    const distance = 19 + random() * 18;
    const height = crown.y + 18 + random() * 24;
    const centerX = crown.x + Math.cos(angle) * distance;
    const centerY = height + Math.sin(angle) * distance * 0.35;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(angle * 0.55);
    context.beginPath();
    context.ellipse(0, 0, 13, 5.2, 0, 0, Math.PI * 2);
    context.fillStyle =
      leaf % 3 === 0
        ? mixColor(palette.leaf, palette.light, 0.22)
        : palette.leaf;
    context.fill();
    context.strokeStyle = withAlpha(palette.ink, 0.45);
    context.lineWidth = 0.8;
    context.stroke();
    context.restore();
  }
}

function drawObject(
  context: CanvasRenderingContext2D,
  project: Projector,
  palette: RoomPalette,
  object: RoomObject,
  seed: string,
): void {
  const random = seededRandom(seed + ":" + object.id);

  switch (object.type) {
    case "bed":
      drawBed(context, project, palette, object, random);
      break;
    case "chair":
      drawChair(context, project, palette, object);
      break;
    case "desk":
      drawDesk(context, project, palette, object);
      break;
    case "lamp":
      drawLamp(context, project, palette, object);
      break;
    case "letter":
      drawLetter(context, project, palette, object);
      break;
    case "plant":
      drawPlant(context, project, palette, object, random);
      break;
    case "shelf":
      drawShelf(context, project, palette, object, random);
      break;
    default:
      break;
  }
}

function drawPaperGrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: RoomPalette,
  seed: string,
): void {
  const random = seededRandom(seed + ":paper-grain");
  context.save();
  context.fillStyle = withAlpha(palette.ink, 0.035);
  for (let dot = 0; dot < 260; dot += 1) {
    const size = random() > 0.88 ? 1.4 : 0.7;
    context.fillRect(random() * width, random() * height, size, size);
  }
  context.restore();
}

export function drawRoom(
  canvas: HTMLCanvasElement,
  room: RoomDocument,
): void {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio));

  const context = canvas.getContext("2d");
  if (!context) return;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const palette = PALETTES[room.palette];
  const unit = Math.min(bounds.width / 17.1, bounds.height / 13.6);
  const origin = {
    x: bounds.width * 0.52,
    y: bounds.height * 0.395,
  };
  const project: Projector = (x, y, z = 0) => ({
    x: origin.x + (x - y) * unit,
    y: origin.y + (x + y) * unit * 0.5 - z * unit,
  });

  const backdrop = context.createLinearGradient(0, 0, 0, bounds.height);
  backdrop.addColorStop(0, mixColor(palette.wall, "#FFFFFF", 0.28));
  backdrop.addColorStop(1, mixColor(palette.wallShade, palette.floor, 0.18));
  context.fillStyle = backdrop;
  context.fillRect(0, 0, bounds.width, bounds.height);

  drawPaperGrain(context, bounds.width, bounds.height, palette, room.seed);
  drawRoomShadow(context, project, palette);
  drawRoomShell(context, project, palette);

  room.objects
    .filter((object) => object.type === "window")
    .forEach((object) => drawWindow(context, project, palette, object));

  room.objects
    .filter((object) => object.type === "frame")
    .forEach((object) => drawFrame(context, project, palette, object));

  room.objects
    .filter((object) => object.type === "rug")
    .forEach((object) =>
      drawRug(
        context,
        project,
        palette,
        object,
        seededRandom(room.seed + ":" + object.id),
      ),
    );

  room.objects
    .filter(
      (object) =>
        object.type !== "window" &&
        object.type !== "frame" &&
        object.type !== "rug",
    )
    .sort((first, second) => first.x + first.y - (second.x + second.y))
    .forEach((object) =>
      drawObject(context, project, palette, object, room.seed),
    );
}
