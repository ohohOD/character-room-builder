"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { drawRoom } from "../lib/renderer/draw-room";
import {
  makeSampleRoom,
  PALETTES,
} from "../lib/room/sample-room";
import type { PaletteId } from "../lib/room/types";

function encodeRoomCode(seed: string, palette: PaletteId): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ seed, palette }));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return "ROOM1." + btoa(binary).replaceAll("=", "");
}

export function CharacterRoomBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seed, setSeed] = useState("sage-attic-01");
  const [palette, setPalette] = useState<PaletteId>("sage");
  const [status, setStatus] = useState("");

  const room = useMemo(
    () => makeSampleRoom(seed, palette),
    [seed, palette],
  );
  const paletteMeta = PALETTES[palette];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => drawRoom(canvas, room);
    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [room]);

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(encodeRoomCode(seed, palette));
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
            <Link href="/" aria-current="page">방 보기</Link>
            <Link href="/furniture">가구 공방</Link>
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
            role="img"
            aria-label={paletteMeta.name + " 스타일의 아이소메트릭 캐릭터 방"}
          />

          <div className="stage-heading">
            <p>ROOM 01 · PAPER ATTIC</p>
            <h2 id="room-title">{paletteMeta.name}</h2>
            <span>{paletteMeta.story}</span>
          </div>

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
