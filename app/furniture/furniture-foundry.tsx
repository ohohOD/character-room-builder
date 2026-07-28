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
  FURNITURE_MATERIALS,
  FURNITURE_PRESETS,
  makeStoolPreset,
} from "../../lib/furniture/presets";
import type {
  FurnitureDefinition,
  FurnitureLicense,
  FurnitureMaterialId,
} from "../../lib/furniture/types";

type Tool = "paint" | "erase";

const LICENSE_LABELS: Record<FurnitureLicense, string> = {
  "all-rights-reserved": "권리 보유 · 재사용 전 허락 필요",
  "CC-BY-4.0": "CC BY 4.0 · 출처 표시",
  "CC0-1.0": "CC0 1.0 · 자유로운 재사용",
};

function cellKey(cell: FurnitureCell, layer: number): string {
  return cell.x + ":" + cell.y + ":" + layer;
}

function highestLayer(furniture: FurnitureDefinition): number {
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
  const [tool, setTool] = useState<Tool>("paint");
  const [hover, setHover] = useState<FurnitureCell | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const restoreFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith("FURN1.")) return;
      try {
        const decoded = decodeFurniture(hash);
        setFurniture(decoded);
        setActiveLayer(highestLayer(decoded));
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
        tool,
        hover,
      });
    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [activeLayer, furniture, hover, selectedMaterial, tool]);

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

  function updateCell(cell: FurnitureCell, action: Tool): void {
    clearPublishedCode();
    const key = cellKey(cell, activeLayer);
    setFurniture((current) => {
      const matchingIndex = current.voxels.findIndex(
        (voxel) => cellKey(voxel, voxel.z) === key,
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
        current.voxels[matchingIndex].material === selectedMaterial
      ) {
        return current;
      }

      const nextVoxel = {
        x: cell.x,
        y: cell.y,
        z: activeLayer,
        material: selectedMaterial,
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
    lastPaintedRef.current = cellKey(cell, activeLayer);
    setHover(cell);
    updateCell(cell, action);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const cell = pointFromEvent(event);
    setHover(cell);
    if (!cell || !dragToolRef.current) return;
    const key = cellKey(cell, activeLayer);
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
    if (event.key === "[") {
      event.preventDefault();
      setActiveLayer((layer) => Math.max(0, layer - 1));
    }
    if (event.key === "]") {
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
    setActiveLayer(highestLayer(next));
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
      setActiveLayer(highestLayer(decoded));
      setHover(null);
      const code = encodeFurniture(decoded);
      setCodeInput(code);
      window.history.replaceState(null, "", "#" + code);
      flash("가구 코드를 불러왔어요.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "가구 코드를 읽지 못했어요.");
    }
  }

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
          조립판을 도트 찍듯 채워 가구를 만듭니다. 결과는 이미지 파일이 아니라
          검증 가능한 Canvas 데이터로 공유됩니다.
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
                쌓기
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
            aria-label={`${furniture.name} 아이소메트릭 편집판. 현재 ${activeLayer + 1}층.`}
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
            <p>클릭·드래그로 쌓기 · 오른쪽 클릭으로 바로 지우기</p>
            <p>키보드 [ ] 층 이동 · Delete 선택 칸 지우기</p>
          </div>
        </section>

        <aside className="foundry-panel">
          <section>
            <p className="section-kicker">STARTING POINT</p>
            <h2>예시에서 시작</h2>
            <div className="preset-row">
              {FURNITURE_PRESETS.map((preset) => (
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
                        setTool("paint");
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
          이미지가 아니라 사용자가 만든 복셀 데이터와 Canvas 코드로 렌더링됩니다.
        </p>
      </footer>
    </main>
  );
}
