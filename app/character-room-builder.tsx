"use client";

import Link from "next/link";
import {
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { decodeFurniture } from "../lib/furniture/codec";
import { getFurnitureRenderGeometry } from "../lib/furniture/placement";
import type { FurnitureDefinition } from "../lib/furniture/types";
import {
  clientPointToRoomFloor,
  clientPointToRoomWall,
  drawRoom,
  ROOM_DEPTH,
  ROOM_WIDTH,
  WALL_HEIGHT,
} from "../lib/renderer/draw-room";
import {
  makeSampleRoom,
  PALETTES,
} from "../lib/room/sample-room";
import type {
  PaletteId,
  PlacedFurnitureObject,
  RoomDocument,
} from "../lib/room/types";

function encodeRoomCode(room: RoomDocument): string {
  const furniture = room.objects
    .filter(
      (object): object is PlacedFurnitureObject => object.type === "furniture",
    )
    .map((object) => ({
      id: object.id,
      x: object.x,
      y: object.y,
      ...(object.z === undefined ? {} : { z: object.z }),
      rotation: object.rotation,
      ...(object.wall ? { wall: object.wall } : {}),
      definition: object.definition,
    }));
  const bytes = new TextEncoder().encode(
    JSON.stringify({ seed: room.seed, palette: room.palette, furniture }),
  );
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return "ROOM1." + btoa(binary).replaceAll("=", "");
}

const SNAP = 0.25;

function snap(value: number): number {
  return Math.round(value / SNAP) * SNAP;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function CharacterRoomBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const furnitureIdRef = useRef(1);
  const [seed, setSeed] = useState("sage-attic-01");
  const [palette, setPalette] = useState<PaletteId>("sage");
  const [status, setStatus] = useState("");
  const [furnitureCode, setFurnitureCode] = useState("");
  const [pendingFurniture, setPendingFurniture] =
    useState<FurnitureDefinition | null>(null);
  const [placedFurniture, setPlacedFurniture] = useState<PlacedFurnitureObject[]>([]);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [wallSide, setWallSide] = useState<"back" | "left">("back");

  const room = useMemo(
    () => {
      const sample = makeSampleRoom(seed, palette);
      return { ...sample, objects: [...sample.objects, ...placedFurniture] };
    },
    [seed, palette, placedFurniture],
  );
  const paletteMeta = PALETTES[palette];
  const selectedFurniture = placedFurniture.find(
    (object) => object.id === selectedFurnitureId,
  ) ?? null;
  const activeFurniture = pendingFurniture ?? selectedFurniture?.definition ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () =>
      drawRoom(canvas, room, { selectedObjectId: selectedFurnitureId ?? undefined });
    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [room, selectedFurnitureId]);

  function flash(message: string): void {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2800);
  }

  function loadFurnitureCode(): void {
    try {
      const definition = decodeFurniture(furnitureCode);
      if (definition.voxels.length === 0) {
        flash("비어 있는 가구는 방에 배치할 수 없어요.");
        return;
      }
      setPendingFurniture(definition);
      setSelectedFurnitureId(null);
      setWallSide("back");
      flash(`${definition.name}을 불러왔어요. 방을 클릭해 배치해주세요.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "가구 코드를 읽지 못했어요.");
    }
  }

  function floorPosition(
    definition: FurnitureDefinition,
    rotation: PlacedFurnitureObject["rotation"],
    x: number,
    y: number,
  ): { x: number; y: number } {
    const geometry = getFurnitureRenderGeometry(definition, rotation);
    return {
      x: clamp(snap(x), 0, ROOM_WIDTH - geometry.width),
      y: clamp(snap(y), 0, ROOM_DEPTH - geometry.depth),
    };
  }

  function wallPosition(
    definition: FurnitureDefinition,
    wall: "back" | "left",
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; z: number } {
    const geometry = getFurnitureRenderGeometry(definition);
    const horizontalLimit = wall === "back" ? ROOM_WIDTH : ROOM_DEPTH;
    const anchor = clamp(snap(wall === "back" ? x : y), 0, horizontalLimit - geometry.width);
    return {
      x: wall === "back" ? anchor : 0,
      y: wall === "left" ? anchor : 0,
      z: clamp(snap(z), 0.25, WALL_HEIGHT - geometry.height),
    };
  }

  function placeOrMoveFurniture(event: PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const definition = pendingFurniture ?? selectedFurniture?.definition;
    if (!canvas || !definition) {
      flash("먼저 FURN1 가구를 불러오거나 배치된 가구를 선택해주세요.");
      return;
    }

    const rotation = pendingFurniture ? 0 : selectedFurniture?.rotation ?? 0;
    let position: { x: number; y: number; z?: number };
    if (definition.placement === "wall") {
      const side = pendingFurniture ? wallSide : selectedFurniture?.wall ?? wallSide;
      const point = clientPointToRoomWall(canvas, event.clientX, event.clientY, side);
      position = wallPosition(definition, side, point.x, point.y, point.z);
    } else {
      const point = clientPointToRoomFloor(canvas, event.clientX, event.clientY);
      position = floorPosition(definition, rotation, point.x, point.y);
    }

    if (pendingFurniture) {
      const id = `furniture-${furnitureIdRef.current}`;
      furnitureIdRef.current += 1;
      const next: PlacedFurnitureObject = {
        id,
        type: "furniture",
        x: position.x,
        y: position.y,
        ...(position.z === undefined ? {} : { z: position.z }),
        rotation,
        ...(definition.placement === "wall" ? { wall: wallSide } : {}),
        definition,
      };
      setPlacedFurniture((current) => [...current, next]);
      setPendingFurniture(null);
      setSelectedFurnitureId(id);
      flash(`${definition.name}을 방에 배치했어요.`);
      return;
    }

    if (!selectedFurniture) return;
    setPlacedFurniture((current) =>
      current.map((object) =>
        object.id === selectedFurniture.id ? { ...object, ...position } : object,
      ),
    );
    flash(`${definition.name}의 위치를 옮겼어요.`);
  }

  function setActiveWall(side: "back" | "left"): void {
    setWallSide(side);
    if (!selectedFurniture || selectedFurniture.definition.placement !== "wall") return;
    const anchor = selectedFurniture.wall === "left"
      ? selectedFurniture.y
      : selectedFurniture.x;
    const next = wallPosition(
      selectedFurniture.definition,
      side,
      anchor,
      anchor,
      selectedFurniture.z ?? 1,
    );
    setPlacedFurniture((current) =>
      current.map((object) =>
        object.id === selectedFurniture.id
          ? { ...object, ...next, wall: side }
          : object,
      ),
    );
  }

  function nudgeSelected(horizontal: number, vertical: number): void {
    if (!selectedFurniture) return;
    if (selectedFurniture.definition.placement === "wall") {
      const side = selectedFurniture.wall ?? "back";
      const next = wallPosition(
        selectedFurniture.definition,
        side,
        selectedFurniture.x + (side === "back" ? horizontal : 0),
        selectedFurniture.y + (side === "left" ? horizontal : 0),
        (selectedFurniture.z ?? 0.25) + vertical,
      );
      setPlacedFurniture((current) =>
        current.map((object) =>
          object.id === selectedFurniture.id ? { ...object, ...next } : object,
        ),
      );
      return;
    }
    const next = floorPosition(
      selectedFurniture.definition,
      selectedFurniture.rotation,
      selectedFurniture.x + horizontal,
      selectedFurniture.y + vertical,
    );
    setPlacedFurniture((current) =>
      current.map((object) =>
        object.id === selectedFurniture.id ? { ...object, ...next } : object,
      ),
    );
  }

  function rotateSelected(): void {
    if (!selectedFurniture || selectedFurniture.definition.placement === "wall") return;
    const rotation = ((selectedFurniture.rotation + 1) % 4) as PlacedFurnitureObject["rotation"];
    const next = floorPosition(
      selectedFurniture.definition,
      rotation,
      selectedFurniture.x,
      selectedFurniture.y,
    );
    setPlacedFurniture((current) =>
      current.map((object) =>
        object.id === selectedFurniture.id
          ? { ...object, ...next, rotation }
          : object,
      ),
    );
  }

  function deleteSelected(): void {
    if (!selectedFurniture) return;
    setPlacedFurniture((current) =>
      current.filter((object) => object.id !== selectedFurniture.id),
    );
    setSelectedFurnitureId(null);
    flash(`${selectedFurniture.definition.name}을 방에서 치웠어요.`);
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(encodeRoomCode(room));
      setStatus("방 코드를 복사했어요.");
    } catch {
      setStatus("복사하지 못했어요. 브라우저의 클립보드 권한을 확인해주세요.");
    }
    window.setTimeout(() => setStatus(""), 2400);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <nav className="product-nav" aria-label="프로젝트 화면">
            <Link href="/">복셀 가구 에디터</Link>
            <Link href="/room" aria-current="page">방 배치</Link>
          </nav>
          <p className="eyebrow">PROCEDURAL CANVAS ROOM · SCENE 01</p>
          <h1>Character Room Builder</h1>
        </div>
        <p>
          그림을 학습시키지 않고, 공개된 조형 규칙과 Canvas 코드로 캐릭터가
          머무는 방을 짓습니다.
        </p>
      </header>

      <div className="workspace">
        <section className="stage" aria-labelledby="room-title">
          <canvas
            ref={canvasRef}
            role="application"
            tabIndex={0}
            aria-describedby={activeFurniture ? "room-composer-help" : undefined}
            aria-label={
              paletteMeta.name +
              " 스타일의 아이소메트릭 캐릭터 방. 불러온 가구를 클릭으로 배치하거나 이동합니다."
            }
            onPointerDown={placeOrMoveFurniture}
          />

          <div className="stage-heading">
            <p>ROOM 01 · PAPER ATTIC</p>
            <h2 id="room-title">{paletteMeta.name}</h2>
            <span>{paletteMeta.story}</span>
          </div>

          {activeFurniture && (
            <p className="composer-hint" id="room-composer-help">
              {pendingFurniture ? "배치할 위치" : "옮길 위치"}를 방에서 클릭하세요 · {activeFurniture.name}
            </p>
          )}

          <p className="stage-label">
            Canvas2D · seed {seed} · no generated imagery
          </p>
        </section>

        <aside className="panel">
          <section className="intro-section">
            <p className="section-kicker">VISUAL PROOF</p>
            <h2>첫 번째 대표 방</h2>
            <p>
              빈 편집기보다 먼저 보여줄 장면입니다. 모든 가구와 빛은
              RoomDocument와 Canvas 코드에서 다시 그릴 수 있습니다.
            </p>
          </section>

          <section className="composer-section">
            <p className="section-kicker">ROOM COMPOSER</p>
            <h2>가구 배치</h2>
            <p>
              공방에서 복사한 FURN1 코드나 링크를 불러온 뒤 방을 클릭하세요.
              선택한 가구는 다시 클릭해 옮길 수 있습니다.
            </p>
            <label className="code-label" htmlFor="room-furniture-code">
              FURN1 코드 또는 공유 링크
            </label>
            <textarea
              id="room-furniture-code"
              className="code-area composer-code-area"
              value={furnitureCode}
              spellCheck={false}
              placeholder="FURN1 코드나 가구 공유 링크를 붙여넣으세요."
              onChange={(event) => setFurnitureCode(event.target.value)}
            />
            <div className="composer-import-actions">
              <button type="button" className="button primary" onClick={loadFurnitureCode}>
                가구 불러오기
              </button>
              <Link href="/" className="button secondary">
                공방으로 가기
              </Link>
            </div>

            {pendingFurniture && (
              <div className="placement-notice" aria-live="polite">
                <strong>{pendingFurniture.name}</strong>
                <span>
                  {pendingFurniture.resolution}× 조립 · 방에서 배치할 위치를 클릭하세요.
                </span>
                <button type="button" onClick={() => setPendingFurniture(null)}>
                  배치 취소
                </button>
              </div>
            )}

            {activeFurniture?.placement === "wall" && (
              <div className="wall-side-control">
                <span>붙일 벽</span>
                <div className="wall-side-switch" aria-label="가구를 붙일 벽">
                  <button
                    type="button"
                    data-active={wallSide === "back"}
                    aria-pressed={wallSide === "back"}
                    onClick={() => setActiveWall("back")}
                  >
                    뒤쪽 벽
                  </button>
                  <button
                    type="button"
                    data-active={wallSide === "left"}
                    aria-pressed={wallSide === "left"}
                    onClick={() => setActiveWall("left")}
                  >
                    왼쪽 벽
                  </button>
                </div>
              </div>
            )}

            <div className="placed-heading">
              <h3>배치한 가구</h3>
              <span>{placedFurniture.length}개</span>
            </div>
            {placedFurniture.length > 0 ? (
              <div className="placed-furniture-list" aria-label="배치한 가구 목록">
                {placedFurniture.map((object) => (
                  <button
                    type="button"
                    key={object.id}
                    data-active={selectedFurnitureId === object.id}
                    aria-pressed={selectedFurnitureId === object.id}
                    onClick={() => {
                      setPendingFurniture(null);
                      setSelectedFurnitureId(object.id);
                      if (object.wall) setWallSide(object.wall);
                    }}
                  >
                    <strong>{object.definition.name}</strong>
                    <span>
                      {object.definition.placement.toUpperCase()} · {object.definition.resolution}×
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-placement">아직 배치한 가구가 없어요.</p>
            )}

            {selectedFurniture && (
              <div className="placement-controls">
                <p>
                  <strong>{selectedFurniture.definition.name}</strong> 선택됨
                </p>
                <div className="nudge-grid" aria-label="선택 가구 미세 이동">
                  <button type="button" onClick={() => nudgeSelected(0, -SNAP)}>
                    {selectedFurniture.definition.placement === "wall" ? "아래" : "뒤로"}
                  </button>
                  <button type="button" onClick={() => nudgeSelected(-SNAP, 0)}>왼쪽</button>
                  <button type="button" onClick={() => nudgeSelected(SNAP, 0)}>오른쪽</button>
                  <button type="button" onClick={() => nudgeSelected(0, SNAP)}>
                    {selectedFurniture.definition.placement === "wall" ? "위" : "앞으로"}
                  </button>
                </div>
                <div className="selection-actions">
                  {selectedFurniture.definition.placement !== "wall" && (
                    <button type="button" className="text-button" onClick={rotateSelected}>
                      90° 회전
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={deleteSelected}>
                    방에서 치우기
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSelectedFurnitureId(null)}
                  >
                    선택 해제
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <fieldset className="palette-fieldset">
              <legend>스타일 팩</legend>
              <div className="palette-list">
                {Object.entries(PALETTES).map(([key, value]) => {
                  const paletteKey = key as PaletteId;
                  return (
                    <button
                      type="button"
                      className="palette-option"
                      data-active={palette === paletteKey}
                      key={key}
                      role="radio"
                      aria-checked={palette === paletteKey}
                      onClick={() => setPalette(paletteKey)}
                    >
                      <span className="palette-swatch" aria-hidden="true">
                        <i style={{ backgroundColor: value.wall }} />
                        <i style={{ backgroundColor: value.cloth }} />
                        <i style={{ backgroundColor: value.wood }} />
                      </span>
                      <span>
                        <strong>{value.name}</strong>
                        <small>{value.story}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="room-seed">방 시드</label>
              <input
                id="room-seed"
                value={seed}
                spellCheck={false}
                onChange={(event) => setSeed(event.target.value)}
              />
              <small>같은 시드와 스타일 팩은 같은 방을 그립니다.</small>
            </div>

            <div className="actions">
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setSeed("room-" + Date.now().toString(36))
                }
              >
                배치 다시 짓기
              </button>
              <button
                type="button"
                className="button primary"
                onClick={copyRoomCode}
              >
                방 코드 복사
              </button>
            </div>
            <p className="status" aria-live="polite">
              {status}
            </p>
          </section>

          <section className="spec-section">
            <h2>이 장면의 출처</h2>
            <dl className="spec-list">
              <div>
                <dt>오브젝트</dt>
                <dd>{room.objects.length}개</dd>
              </div>
              <div>
                <dt>스타일 팩</dt>
                <dd>{room.provenance.stylePackVersion}</dd>
              </div>
              <div>
                <dt>렌더러</dt>
                <dd>Canvas2D v{room.rendererVersion}</dd>
              </div>
              <div>
                <dt>생성형 이미지</dt>
                <dd>사용하지 않음</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <footer className="trust-footer" aria-label="제작 투명성">
        <p>
          <strong>제작 투명성</strong> · 이 프로젝트는 OpenAI Codex와 Anthropic
          Claude Code의 도움을 받아 기획·작성되었습니다. 제안의 채택과 최종
          책임은 유지관리자에게 있습니다.
        </p>
      </footer>
    </main>
  );
}
