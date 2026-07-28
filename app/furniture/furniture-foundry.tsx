"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clientPointToFurnitureCell,
  drawFurniture,
  type FurnitureCell,
} from "../../lib/furniture/draw-furniture";
import {
  decodeFurniture,
  encodeFurniture,
} from "../../lib/furniture/codec";
import {
  FURNITURE_COLOR_PALETTE,
  normalizeFurnitureColor,
} from "../../lib/furniture/colors";
import {
  DEFAULT_PRESET_BY_PLACEMENT,
  FURNITURE_MATERIALS,
  FURNITURE_PRESETS,
  makeStoolPreset,
} from "../../lib/furniture/presets";
import type {
  FurnitureDefinition,
  FurnitureLicense,
  FurnitureMaterialId,
  FurniturePlacement,
} from "../../lib/furniture/types";

type Tool = "paint" | "erase";

const COLOR_HISTORY_KEY = "character-room-builder:furniture-colors:v1";
const MAX_RECENT_COLORS = 10;

const LICENSE_LABELS: Record<FurnitureLicense, string> = {
  "all-rights-reserved": "권리 보유 · 재사용 전 허락 필요",
  "CC-BY-4.0": "CC BY 4.0 · 출처 표시",
  "CC0-1.0": "CC0 1.0 · 자유로운 재사용",
};

const PLACEMENT_LABELS: Record<
  FurniturePlacement,
  { name: string; kicker: string; description: string }
> = {
  volume: {
    name: "입체 가구",
    kicker: "VOLUME",
    description: "층을 올리며 복셀을 쌓아요.",
  },
  floor: {
    name: "바닥 소품",
    kicker: "FLOOR",
    description: "러그와 매트를 바닥 면에 칠해요.",
  },
  wall: {
    name: "벽 소품",
    kicker: "WALL",
    description: "액자와 장식을 벽 면에 칠해요.",
  },
};

function cellKey(cell: FurnitureCell): string {
  return `${cell.x}:${cell.y}:${cell.z}`;
}

function editableLayer(furniture: FurnitureDefinition): number {
  if (furniture.placement !== "volume") return 0;
  return furniture.voxels.reduce(
    (highest, voxel) => Math.max(highest, voxel.z),
    0,
  );
}

export function FurnitureFoundry() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragToolRef = useRef<Tool | null>(null);
  const lastPaintedRef = useRef("");
  const statusTimerRef = useRef<number | null>(null);
  const [furniture, setFurniture] = useState<FurnitureDefinition>(() =>
    makeStoolPreset(),
  );
  const [activeLayer, setActiveLayer] = useState(4);
  const [selectedMaterial, setSelectedMaterial] =
    useState<FurnitureMaterialId>("sage");
  const [selectedColor, setSelectedColor] = useState(
    FURNITURE_MATERIALS.sage.color,
  );
  const [colorInput, setColorInput] = useState(FURNITURE_MATERIALS.sage.color);
  const [colorError, setColorError] = useState("");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [colorHistoryReady, setColorHistoryReady] = useState(false);
  const [tool, setTool] = useState<Tool>("paint");
  const [hover, setHover] = useState<FurnitureCell | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(COLOR_HISTORY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            setRecentColors(
              parsed
                .filter((value): value is string => typeof value === "string")
                .map(normalizeFurnitureColor)
                .filter((value): value is string => value !== null)
                .filter((value, index, colors) => colors.indexOf(value) === index)
                .slice(0, MAX_RECENT_COLORS),
            );
          }
        }
      } catch {
        // 브라우저 저장소를 사용할 수 없어도 공방 편집은 그대로 동작한다.
      }
      setColorHistoryReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!colorHistoryReady) return;
    try {
      if (recentColors.length === 0) {
        window.localStorage.removeItem(COLOR_HISTORY_KEY);
      } else {
        window.localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(recentColors));
      }
    } catch {
      // 색상 이력은 선택 기능이며 저장 실패가 편집을 막지 않는다.
    }
  }, [colorHistoryReady, recentColors]);

  useEffect(() => {
    const restoreFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith("FURN1.")) return;
      try {
        const decoded = decodeFurniture(hash);
        setFurniture(decoded);
        setActiveLayer(editableLayer(decoded));
        setHover(null);
        setCodeInput(encodeFurniture(decoded));
        setStatus("공유 링크의 가구를 불러왔어요.");
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "가구 코드를 읽지 못했어요.",
        );
      }
    };

    restoreFromHash();
    window.addEventListener("hashchange", restoreFromHash);
    return () => window.removeEventListener("hashchange", restoreFromHash);
  }, []);

  useEffect(
    () => () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () =>
      drawFurniture(canvas, furniture, {
        activeLayer,
        selectedMaterial,
        selectedColor,
        tool,
        hover,
      });
    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [activeLayer, furniture, hover, selectedColor, selectedMaterial, tool]);

  function flash(message: string): void {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    setStatus(message);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus("");
      statusTimerRef.current = null;
    }, 2800);
  }

  function clearPublishedCode(): void {
    setCodeInput((current) => (current ? "" : current));
    if (window.location.hash) {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", cleanUrl);
    }
  }

  function chooseColor(value: string): void {
    const normalized = normalizeFurnitureColor(value);
    if (!normalized) return;
    setSelectedColor(normalized);
    setColorInput(normalized);
    setColorError("");
    setTool("paint");
  }

  function commitColorInput(): void {
    const normalized = normalizeFurnitureColor(colorInput);
    if (!normalized) {
      setColorError("#RGB 또는 #RRGGBB 형식으로 입력해주세요.");
      return;
    }
    chooseColor(normalized);
  }

  function rememberColor(value: string): void {
    setRecentColors((current) => [
      value,
      ...current.filter((color) => color !== value),
    ].slice(0, MAX_RECENT_COLORS));
  }

  function updateCell(cell: FurnitureCell, action: Tool): void {
    clearPublishedCode();
    const key = cellKey(cell);
    setFurniture((current) => {
      const matchingIndex = current.voxels.findIndex(
        (voxel) => cellKey(voxel) === key,
      );

      if (action === "erase") {
        if (matchingIndex < 0) return current;
        return {
          ...current,
          voxels: current.voxels.filter((_, index) => index !== matchingIndex),
        };
      }

      if (
        matchingIndex >= 0 &&
        current.voxels[matchingIndex].material === selectedMaterial &&
        current.voxels[matchingIndex].color === selectedColor
      ) {
        return current;
      }

      const nextVoxel = {
        x: cell.x,
        y: cell.y,
        z: cell.z,
        material: selectedMaterial,
        color: selectedColor,
      };
      if (matchingIndex < 0) {
        return { ...current, voxels: [...current.voxels, nextVoxel] };
      }
      return {
        ...current,
        voxels: current.voxels.map((voxel, index) =>
          index === matchingIndex ? nextVoxel : voxel,
        ),
      };
    });
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): FurnitureCell | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return clientPointToFurnitureCell(
      canvas,
      furniture,
      event.clientX,
      event.clientY,
      activeLayer,
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0 && event.button !== 2) return;
    const cell = pointFromEvent(event);
    if (!cell) return;
    const action = event.button === 2 ? "erase" : tool;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragToolRef.current = action;
    lastPaintedRef.current = cellKey(cell);
    setHover(cell);
    if (action === "paint") rememberColor(selectedColor);
    updateCell(cell, action);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const cell = pointFromEvent(event);
    setHover(cell);
    if (!cell || !dragToolRef.current) return;
    const key = cellKey(cell);
    if (key === lastPaintedRef.current) return;
    lastPaintedRef.current = key;
    updateCell(cell, dragToolRef.current);
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragToolRef.current = null;
    lastPaintedRef.current = "";
  }

  function handleCanvasKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (furniture.placement === "volume" && event.key === "[") {
      event.preventDefault();
      setActiveLayer((layer) => Math.max(0, layer - 1));
    }
    if (furniture.placement === "volume" && event.key === "]") {
      event.preventDefault();
      setActiveLayer((layer) => Math.min(furniture.grid.height - 1, layer + 1));
    }
    if ((event.key === "Delete" || event.key === "Backspace") && hover) {
      event.preventDefault();
      updateCell(hover, "erase");
    }
  }

  function loadPreset(create: () => FurnitureDefinition): void {
    const next = create();
    setFurniture(next);
    setActiveLayer(editableLayer(next));
    setTool("paint");
    setHover(null);
    clearPublishedCode();
    flash(next.name + " 예시를 열었어요.");
  }

  function makeCode(): string | null {
    try {
      const code = encodeFurniture(furniture);
      setCodeInput(code);
      return code;
    } catch (error) {
      flash(error instanceof Error ? error.message : "가구 코드를 만들지 못했어요.");
      return null;
    }
  }

  async function copyCode(): Promise<void> {
    const code = makeCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      flash("FURN1 가구 코드를 복사했어요.");
    } catch {
      flash("코드는 만들었어요. 아래 입력창에서 직접 복사해주세요.");
    }
  }

  async function copyShareLink(): Promise<void> {
    const code = makeCode();
    if (!code) return;
    window.history.replaceState(null, "", "#" + code);
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("공유 링크를 복사했어요.");
    } catch {
      flash("주소에 공유 코드를 넣었어요. 주소창에서 복사해주세요.");
    }
  }

  function loadCode(): void {
    try {
      const decoded = decodeFurniture(codeInput);
      setFurniture(decoded);
      setActiveLayer(editableLayer(decoded));
      setHover(null);
      const code = encodeFurniture(decoded);
      setCodeInput(code);
      window.history.replaceState(null, "", "#" + code);
      flash("가구 코드를 불러왔어요.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "가구 코드를 읽지 못했어요.");
    }
  }

  const placementCopy = PLACEMENT_LABELS[furniture.placement];
  const matchingPresets = FURNITURE_PRESETS.filter(
    (preset) => preset.placement === furniture.placement,
  );

  return (
    <main className="shell foundry-shell">
      <header className="masthead">
        <div>
          <nav className="product-nav" aria-label="프로젝트 화면">
            <Link href="/">방 보기</Link>
            <Link href="/furniture" aria-current="page">가구 공방</Link>
          </nav>
          <p className="eyebrow">FURNITURE FOUNDRY · FURN1</p>
          <h1>아이소메트릭 가구 공방</h1>
        </div>
        <p>
          입체 가구를 쌓거나 바닥과 벽의 조립면을 칠합니다. 결과는 이미지 파일이
          아니라 검증 가능한 Canvas 데이터로 공유됩니다.
        </p>
      </header>

      <div className="foundry-workspace">
        <section className="foundry-stage" aria-labelledby="furniture-title">
          <div className="foundry-stage-bar">
            <div>
              <p>WORKPIECE</p>
              <h2 id="furniture-title">{furniture.name}</h2>
            </div>
            <div className="tool-switch" aria-label="그리기 도구">
              <button
                type="button"
                data-active={tool === "paint"}
                aria-pressed={tool === "paint"}
                onClick={() => setTool("paint")}
              >
                {furniture.placement === "volume" ? "쌓기" : "칠하기"}
              </button>
              <button
                type="button"
                data-active={tool === "erase"}
                aria-pressed={tool === "erase"}
                onClick={() => setTool("erase")}
              >
                지우기
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="foundry-canvas"
            role="application"
            tabIndex={0}
            aria-describedby="foundry-canvas-help"
            aria-label={`${furniture.name} ${placementCopy.name} 편집판.${
              furniture.placement === "volume" ? ` 현재 ${activeLayer + 1}층.` : ""
            }`}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={() => {
              if (!dragToolRef.current) setHover(null);
            }}
            onKeyDown={handleCanvasKeyDown}
          />

          <div className="foundry-help" id="foundry-canvas-help">
            <p>
              클릭·드래그로 {furniture.placement === "volume" ? "쌓기" : "칠하기"}
              {" · "}오른쪽 클릭으로 바로 지우기
            </p>
            <p>
              {furniture.placement === "volume" ? "키보드 [ ] 층 이동 · " : ""}
              Delete 선택 칸 지우기
            </p>
          </div>
        </section>

        <aside className="foundry-panel">
          <section>
            <p className="section-kicker">WORK SURFACE</p>
            <h2>어디에 놓을까요</h2>
            <div className="placement-switch" aria-label="가구 배치 면">
              {(Object.keys(PLACEMENT_LABELS) as FurniturePlacement[]).map(
                (placement) => (
                  <button
                    type="button"
                    key={placement}
                    aria-pressed={furniture.placement === placement}
                    data-active={furniture.placement === placement}
                    onClick={() => loadPreset(DEFAULT_PRESET_BY_PLACEMENT[placement])}
                  >
                    <strong>{PLACEMENT_LABELS[placement].name}</strong>
                    <span>{PLACEMENT_LABELS[placement].kicker}</span>
                  </button>
                ),
              )}
            </div>
            <p className="control-note">{placementCopy.description}</p>
          </section>

          <section>
            <p className="section-kicker">STARTING POINT</p>
            <h2>예시에서 시작</h2>
            <div className="preset-row">
              {matchingPresets.map((preset) => (
                <button
                  type="button"
                  className="text-button"
                  key={preset.id}
                  onClick={() => loadPreset(preset.create)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </section>

          {furniture.placement === "volume" ? (
            <section>
              <div className="layer-heading">
                <div>
                  <p className="section-kicker">BUILD LAYER</p>
                  <h2>{activeLayer + 1}층 편집</h2>
                </div>
                <output>{activeLayer + 1} / {furniture.grid.height}</output>
              </div>
              <label className="control-label" htmlFor="furniture-layer">
                편집할 가구 층
              </label>
              <input
                id="furniture-layer"
                className="layer-range"
                type="range"
                min={0}
                max={furniture.grid.height - 1}
                value={activeLayer}
                onChange={(event) => setActiveLayer(Number(event.target.value))}
              />
              <p className="control-note">현재 층 이하의 복셀만 보여요.</p>
            </section>
          ) : (
            <section>
              <div className="layer-heading">
                <div>
                  <p className="section-kicker">SURFACE GRID</p>
                  <h2>{placementCopy.name} 편집</h2>
                </div>
                <output>
                  {furniture.grid.width} × {furniture.placement === "wall"
                    ? furniture.grid.height
                    : furniture.grid.depth}
                </output>
              </div>
              <p className="panel-copy">
                한 겹의 조립면을 칠합니다. 채운 칸은 방 배치기가 하나의
                {furniture.placement === "wall" ? " 벽걸이" : " 바닥"} 오브젝트로
                다룰 수 있어요.
              </p>
            </section>
          )}

          <section>
            <fieldset className="material-fieldset">
              <legend>재료</legend>
              <div className="material-list">
                {Object.entries(FURNITURE_MATERIALS).map(([id, material]) => {
                  const materialId = id as FurnitureMaterialId;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedMaterial === materialId}
                      data-active={selectedMaterial === materialId}
                      key={id}
                      onClick={() => {
                        setSelectedMaterial(materialId);
                        chooseColor(material.color);
                      }}
                    >
                      <i style={{ backgroundColor: material.color }} aria-hidden="true" />
                      <span>{material.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section>
            <p className="section-kicker">SURFACE COLOR</p>
            <h2>표면색</h2>
            <p className="panel-copy">
              재료 분류는 유지하고, 칠할 색만 따로 고를 수 있어요.
            </p>
            <fieldset className="color-fieldset">
              <legend>빠른 색상</legend>
              <div className="color-swatch-grid">
                {FURNITURE_COLOR_PALETTE.map((color) => (
                  <button
                    type="button"
                    key={color.value}
                    aria-label={`${color.name} ${color.value}`}
                    aria-pressed={selectedColor === color.value}
                    data-active={selectedColor === color.value}
                    title={`${color.name} · ${color.value}`}
                    onClick={() => chooseColor(color.value)}
                  >
                    <span style={{ backgroundColor: color.value }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="control-label color-code-label" htmlFor="furniture-color-code">
              컬러 코드
            </label>
            <div className="color-code-row">
              <input
                className="native-color-input"
                type="color"
                aria-label="색상 선택기"
                value={selectedColor}
                onChange={(event) => chooseColor(event.target.value)}
              />
              <input
                id="furniture-color-code"
                className="color-code-input"
                value={colorInput}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(colorError)}
                aria-describedby="furniture-color-help"
                onChange={(event) => {
                  setColorInput(event.target.value);
                  if (colorError) setColorError("");
                }}
                onBlur={commitColorInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitColorInput();
                  }
                }}
              />
              <button type="button" className="text-button" onClick={commitColorInput}>
                적용
              </button>
            </div>
            <p
              id="furniture-color-help"
              className={colorError ? "field-error" : "control-note"}
              aria-live="polite"
            >
              {colorError || "#RGB 또는 #RRGGBB를 입력할 수 있어요."}
            </p>

            <div className="recent-color-heading">
              <h3>최근 사용한 색</h3>
              {recentColors.length > 0 && (
                <button
                  type="button"
                  className="history-clear-button"
                  onClick={() => setRecentColors([])}
                >
                  기록 지우기
                </button>
              )}
            </div>
            {recentColors.length > 0 ? (
              <div className="recent-color-list" aria-label="최근 사용한 색상">
                {recentColors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`최근 색상 ${color}`}
                    aria-pressed={selectedColor === color}
                    data-active={selectedColor === color}
                    title={color}
                    onClick={() => chooseColor(color)}
                  >
                    <span style={{ backgroundColor: color }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-history">아직 사용한 색이 없어요.</p>
            )}
            <p className="control-note">
              최근 10색은 이 브라우저에만 남고 네트워크로 전송되지 않습니다.
            </p>
          </section>

          <section>
            <p className="section-kicker">IDENTITY & RIGHTS</p>
            <h2>이름과 출처</h2>
            <div className="field compact-field">
              <label htmlFor="furniture-name">가구 이름</label>
              <input
                id="furniture-name"
                maxLength={40}
                value={furniture.name}
                onChange={(event) => {
                  clearPublishedCode();
                  setFurniture((current) => ({ ...current, name: event.target.value }));
                }}
              />
            </div>
            <div className="field compact-field">
              <label htmlFor="furniture-credit">제작자 표기 · 선택</label>
              <input
                id="furniture-credit"
                maxLength={80}
                value={furniture.provenance.credit ?? ""}
                placeholder="코드에 넣을 이름만 입력"
                onChange={(event) => {
                  clearPublishedCode();
                  setFurniture((current) => ({
                    ...current,
                    provenance: {
                      ...current.provenance,
                      credit: event.target.value,
                    },
                  }));
                }}
              />
            </div>
            <div className="field compact-field">
              <label htmlFor="furniture-license">공유 라이선스</label>
              <select
                id="furniture-license"
                value={furniture.provenance.license}
                onChange={(event) => {
                  clearPublishedCode();
                  setFurniture((current) => ({
                    ...current,
                    provenance: {
                      ...current.provenance,
                      license: event.target.value as FurnitureLicense,
                    },
                  }));
                }}
              >
                {Object.entries(LICENSE_LABELS).map(([id, label]) => (
                  <option value={id} key={id}>{label}</option>
                ))}
              </select>
            </div>
            <p className="control-note">
              입력한 이름·제작자·라이선스만 공유 코드에 포함됩니다.
            </p>
          </section>

          <section>
            <p className="section-kicker">SHARE WITHOUT A SERVER</p>
            <h2>가구 코드</h2>
            <p className="panel-copy">
              FURN1은 UTF-8 데이터를 URL-safe Base64로 담고 손상 검사용 체크섬을
              붙입니다. 링크의 # 뒤 데이터는 서버로 전송되지 않습니다.
            </p>
            <label className="code-label" htmlFor="furniture-code">
              FURN1 코드 또는 공유 링크
            </label>
            <textarea
              id="furniture-code"
              className="code-area"
              value={codeInput}
              spellCheck={false}
              placeholder="FURN1 코드나 공유 링크를 붙여넣으세요."
              onChange={(event) => setCodeInput(event.target.value)}
            />
            <div className="code-actions">
              <button type="button" className="button secondary" onClick={loadCode}>
                코드 불러오기
              </button>
              <button type="button" className="button secondary" onClick={copyCode}>
                코드 복사
              </button>
              <button type="button" className="button primary" onClick={copyShareLink}>
                링크 복사
              </button>
            </div>
            <p className="status" aria-live="polite">{status}</p>
          </section>
        </aside>
      </div>

      <footer className="trust-footer" aria-label="제작 투명성">
        <p>
          <strong>제작 투명성</strong> · 이 프로젝트는 OpenAI Codex와 Anthropic
          Claude Code의 도움을 받아 기획·작성되었습니다. 가구 그래픽은 생성형
          이미지가 아니라 사용자가 만든 조립 데이터와 Canvas 코드로 렌더링됩니다.
        </p>
      </footer>
    </main>
  );
}
