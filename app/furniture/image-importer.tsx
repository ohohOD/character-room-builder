"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  pixelImageToFurniture,
  quantizePixelImage,
  visualHullFromSilhouettes,
  type ImageFurnitureMode,
  type PixelImage,
} from "../../lib/furniture/image-import";
import type {
  FurnitureDefinition,
  FurnitureLicense,
  FurnitureMaterialId,
} from "../../lib/furniture/types";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_EDGE = 2048;

interface FurnitureImageImporterProps {
  selectedMaterial: FurnitureMaterialId;
  license: FurnitureLicense;
  credit?: string;
  onApply: (furniture: FurnitureDefinition) => void;
}

function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim().slice(0, 28) || "이미지";
}

async function decodeImageFile(file: File): Promise<PixelImage> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 열 수 있어요.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("이미지는 12MB 이하로 골라주세요.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(bitmap.width, bitmap.height));
  const sourceWidth = Math.max(1, Math.round(bitmap.width * scale));
  const sourceHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("이미지 Canvas를 만들지 못했어요.");
  context.drawImage(bitmap, 0, 0, sourceWidth, sourceHeight);
  const imageData = context.getImageData(0, 0, sourceWidth, sourceHeight);
  bitmap.close();
  return {
    width: sourceWidth,
    height: sourceHeight,
    data: new Uint8ClampedArray(imageData.data),
  };
}

export function FurnitureImageImporter({
  selectedMaterial,
  license,
  credit,
  onApply,
}: FurnitureImageImporterProps) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<PixelImage | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [width, setWidth] = useState(16);
  const [height, setHeight] = useState(16);
  const [paletteSize, setPaletteSize] = useState(8);
  const [alphaThreshold, setAlphaThreshold] = useState(32);
  const [dither, setDither] = useState(false);
  const [mode, setMode] = useState<ImageFurnitureMode>("wall");
  const [reliefHeight, setReliefHeight] = useState(8);
  const [reliefSource, setReliefSource] = useState<"brightness" | "alpha">("brightness");
  const [status, setStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [hullSources, setHullSources] = useState<Partial<Record<"front" | "side" | "top", PixelImage>>>({});
  const [hullNames, setHullNames] = useState<Partial<Record<"front" | "side" | "top", string>>>({});
  const [hullWidth, setHullWidth] = useState(12);
  const [hullDepth, setHullDepth] = useState(12);
  const [hullHeight, setHullHeight] = useState(12);
  const [hullStatus, setHullStatus] = useState("");

  const preview = useMemo(() => source
    ? quantizePixelImage(source, {
        width,
        height,
        paletteSize,
        alphaThreshold,
        dither,
      })
    : null, [alphaThreshold, dither, height, paletteSize, source, width]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !preview) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(displayWidth * ratio));
    canvas.height = Math.max(1, Math.floor(displayHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#e8e0d3";
    context.fillRect(0, 0, displayWidth, displayHeight);
    const scale = Math.max(1, Math.floor(Math.min(
      (displayWidth - 24) / preview.width,
      (displayHeight - 24) / preview.height,
    )));
    const renderWidth = preview.width * scale;
    const renderHeight = preview.height * scale;
    const originX = Math.floor((displayWidth - renderWidth) / 2);
    const originY = Math.floor((displayHeight - renderHeight) / 2);
    for (let y = 0; y < preview.height; y += 1) {
      for (let x = 0; x < preview.width; x += 1) {
        const color = preview.colors[y * preview.width + x];
        if (!color) continue;
        context.fillStyle = color;
        context.fillRect(originX + x * scale, originY + y * scale, scale, scale);
      }
    }
    context.strokeStyle = "rgba(48, 44, 39, 0.48)";
    context.lineWidth = 1;
    context.strokeRect(originX - 0.5, originY - 0.5, renderWidth + 1, renderHeight + 1);
  }, [preview]);

  async function openImageFile(file: File): Promise<void> {
    try {
      const decoded = await decodeImageFile(file);
      setSource(decoded);
      setSourceName(fileBaseName(file.name));
      const initialWidth = Math.max(4, Math.min(16, decoded.width));
      const initialHeight = Math.max(
        4,
        Math.min(16, Math.round(initialWidth * decoded.height / decoded.width)),
      );
      setWidth(initialWidth);
      setHeight(initialHeight);
      setStatus(`${decoded.width} × ${decoded.height} 이미지를 메모리에 열었어요.`);
    } catch (error) {
      setStatus(error instanceof Error
        ? error.message
        : "이 브라우저에서 이미지를 읽지 못했어요. PNG·JPEG·WebP를 확인해주세요.");
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await openImageFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void openImageFile(file);
  }

  async function readHullFile(
    view: "front" | "side" | "top",
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const decoded = await decodeImageFile(file);
      setHullSources((current) => ({ ...current, [view]: decoded }));
      setHullNames((current) => ({ ...current, [view]: fileBaseName(file.name) }));
      setHullStatus(`${view === "front" ? "앞" : view === "side" ? "옆" : "위"} 실루엣을 메모리에 열었어요.`);
    } catch (error) {
      setHullStatus(error instanceof Error ? error.message : "실루엣 이미지를 읽지 못했어요.");
    }
  }

  function applyImage(): void {
    if (!preview) return;
    try {
      const furniture = pixelImageToFurniture(preview, {
        mode,
        material: selectedMaterial,
        reliefHeight,
        reliefSource,
        name: `${sourceName || "이미지"} ${mode === "wall" ? "벽 패널" : mode === "floor" ? "바닥 패널" : "밝기 부조"}`,
        license,
        credit,
      });
      onApply(furniture);
      setStatus(`${preview.width} × ${preview.height} 변환 결과를 공방에 열었어요.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "이미지를 가구로 바꾸지 못했어요.");
    }
  }

  function applyVisualHull(): void {
    if (!hullSources.front || !hullSources.side || !hullSources.top) return;
    try {
      const common = { paletteSize, alphaThreshold, dither };
      const front = quantizePixelImage(hullSources.front, {
        ...common,
        width: hullWidth,
        height: hullHeight,
      });
      const side = quantizePixelImage(hullSources.side, {
        ...common,
        width: hullDepth,
        height: hullHeight,
      });
      const top = quantizePixelImage(hullSources.top, {
        ...common,
        width: hullWidth,
        height: hullDepth,
      });
      const furniture = visualHullFromSilhouettes(front, side, top, {
        material: selectedMaterial,
        name: `${hullNames.front ?? "삼면"} visual hull`,
        license,
        credit,
      });
      onApply(furniture);
      setHullStatus(`${hullWidth} × ${hullDepth} × ${hullHeight} 삼면 교집합을 공방에 열었어요.`);
    } catch (error) {
      setHullStatus(error instanceof Error ? error.message : "삼면 교집합을 만들지 못했어요.");
    }
  }

  return (
    <section className="image-import-section" aria-labelledby="image-import-title">
      <div className="image-import-heading">
        <div>
          <p className="section-kicker">LOCAL PIXEL LAB</p>
          <h2 id="image-import-title">이미지를 도트와 복셀로</h2>
        </div>
        <label className="button secondary image-file-button" htmlFor="pixel-image-file">
          이미지 열기
          <input
            id="pixel-image-file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={readFile}
          />
        </label>
      </div>
      <p className="panel-copy">
        선택한 파일은 이 브라우저 메모리에서만 축소·팔레트화합니다. 원본, EXIF,
        파일 경로는 저장하거나 공유 코드에 넣지 않습니다. 움직이는 이미지는 첫 프레임을 사용합니다.
      </p>

      <div className="image-import-workspace">
        <div
          className="pixel-preview-wrap"
          data-dragging={isDragging}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <canvas
            ref={previewRef}
            className="pixel-preview-canvas"
            aria-label={preview
              ? `${preview.width} × ${preview.height} 도트 변환 미리보기`
              : "이미지를 열면 나타나는 도트 변환 미리보기"}
          />
          {!source ? (
            <label className="pixel-preview-empty" htmlFor="pixel-image-file">
              <span className="section-kicker">DROP IMAGE</span>
              <strong>이미지를 여기에 놓거나 클릭해 여세요</strong>
              <small>선택하면 원본 대신 도트 변환 미리보기가 표시됩니다.</small>
            </label>
          ) : null}
          <p>{source ? `${sourceName} · ${preview?.palette.length ?? 0}색` : "PNG·JPEG·WebP·GIF 첫 프레임"}</p>
        </div>

        <div className="image-import-controls">
          <fieldset>
            <legend>변환 결과</legend>
            <div className="image-mode-switch">
              {([
                ["wall", "벽 픽셀 패널"],
                ["floor", "바닥 픽셀 패널"],
                ["relief", "높이 복셀 부조"],
              ] as Array<[ImageFurnitureMode, string]>).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={mode === value}
                  data-active={mode === value}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="image-number-grid">
            <label>
              <span>도트 가로</span>
              <input type="number" min={4} max={64} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
            </label>
            <label>
              <span>도트 세로</span>
              <input type="number" min={4} max={mode === "wall" ? 48 : 64} value={height} onChange={(event) => setHeight(Number(event.target.value))} />
            </label>
            <label>
              <span>팔레트 색 수</span>
              <input type="number" min={2} max={24} value={paletteSize} onChange={(event) => setPaletteSize(Number(event.target.value))} />
            </label>
            <label>
              <span>투명도 기준</span>
              <input type="number" min={0} max={255} value={alphaThreshold} onChange={(event) => setAlphaThreshold(Number(event.target.value))} />
            </label>
            {mode === "relief" ? (
              <>
                <label>
                  <span>최대 부조 높이</span>
                  <input type="number" min={2} max={48} value={reliefHeight} onChange={(event) => setReliefHeight(Number(event.target.value))} />
                </label>
                <label>
                  <span>부조 높이 기준</span>
                  <select value={reliefSource} onChange={(event) => setReliefSource(event.target.value as "brightness" | "alpha")}>
                    <option value="brightness">밝기</option>
                    <option value="alpha">알파</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} />
            오차 확산 디더링
          </label>
          {preview ? (
            <div className="pixel-palette" aria-label="변환 팔레트">
              {preview.palette.map((color, index) => (
                <span key={`${color}-${index}`} title={color} style={{ background: color }} />
              ))}
            </div>
          ) : null}
          <button type="button" className="button primary" disabled={!preview} onClick={applyImage}>
            변환 결과를 공방에 열기
          </button>
          <p className="control-note" aria-live="polite">{status}</p>
        </div>
      </div>

      <div className="visual-hull-lab">
        <div>
          <p className="section-kicker">THREE-VIEW HULL</p>
          <h3>앞·옆·위 실루엣 교차</h3>
          <p className="panel-copy">
            세 이미지에서 투명하지 않은 실루엣이 모두 겹치는 칸만 복셀로 만듭니다.
            보이지 않는 형태를 추측하지 않는 결정론적 visual hull입니다.
          </p>
        </div>
        <div className="hull-file-grid">
          {([
            ["front", "앞 실루엣"],
            ["side", "옆 실루엣"],
            ["top", "위 실루엣"],
          ] as Array<["front" | "side" | "top", string]>).map(([view, label]) => (
            <label className="button secondary image-file-button" key={view}>
              {hullNames[view] ? `${label} · ${hullNames[view]}` : label + " 열기"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => void readHullFile(view, event)}
              />
            </label>
          ))}
        </div>
        <div className="image-number-grid hull-size-grid">
          <label>
            <span>가로</span>
            <input type="number" min={4} max={64} value={hullWidth} onChange={(event) => setHullWidth(Number(event.target.value))} />
          </label>
          <label>
            <span>깊이</span>
            <input type="number" min={4} max={64} value={hullDepth} onChange={(event) => setHullDepth(Number(event.target.value))} />
          </label>
          <label>
            <span>높이</span>
            <input type="number" min={2} max={48} value={hullHeight} onChange={(event) => setHullHeight(Number(event.target.value))} />
          </label>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={!hullSources.front || !hullSources.side || !hullSources.top}
          onClick={applyVisualHull}
        >
          삼면 교집합을 복셀로 열기
        </button>
        <p className="control-note" aria-live="polite">{hullStatus}</p>
      </div>
    </section>
  );
}
