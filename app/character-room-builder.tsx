"use client";

import { useEffect, useRef, useState } from "react";
import { drawRoom } from "../lib/renderer/draw-room";
import { makeSampleRoom, PALETTES } from "../lib/room/sample-room";

export function CharacterRoomBuilder() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seed, setSeed] = useState("sage-attic-01");
  const [palette, setPalette] = useState<keyof typeof PALETTES>("sage");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const render = () => drawRoom(canvas, makeSampleRoom(seed, palette));
    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [seed, palette]);

  const roomCode =
    "ROOM1." +
    btoa(
      unescape(
        encodeURIComponent(
          JSON.stringify({
            seed,
            palette,
          }),
        ),
      ),
    ).replaceAll("=", "");

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomCode);
    setStatus("방 코드를 복사했어요.");
    setTimeout(() => setStatus(""), 1800);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">CHARACTER ROOM BUILDER · PROTOTYPE 01</p>
          <h1>Character Room Builder</h1>
        </div>
        <p>
          그림을 학습시키지 않고, 공개된 조형 규칙과 Canvas 코드로 캐릭터가
          머무는 방을 짓습니다.
        </p>
      </header>

      <div className="workspace">
        <section className="stage">
          <canvas ref={ref} />
          <p className="stage-label">
            CANVAS2D · deterministic seed · no generated imagery
          </p>
        </section>

        <aside className="panel">
          <section>
            <h2>첫 번째 방</h2>
            <p>
              기획의 미술 방향과 데이터 경계를 잊지 않기 위한 실행 가능한
              표본입니다.
            </p>

            <div className="field">
              <label htmlFor="room-seed">방 시드</label>
              <input
                id="room-seed"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="room-palette">팔레트</label>
              <select
                id="room-palette"
                value={palette}
                onChange={(event) =>
                  setPalette(event.target.value as keyof typeof PALETTES)
                }
              >
                {Object.entries(PALETTES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="actions">
              <button
                className="button secondary"
                onClick={() => setSeed("room-" + Date.now().toString(36))}
              >
                새 시드
              </button>
              <button className="button" onClick={copyRoomCode}>
                방 코드 복사
              </button>
            </div>
            <p className="status" aria-live="polite">
              {status}
            </p>
          </section>

          <section>
            <h2>지켜야 할 것</h2>
            <ul className="principles">
              <li>생성형 이미지 모델을 사용하지 않는다</li>
              <li>동일한 데이터는 동일한 방을 그린다</li>
              <li>계정 권한 없는 로컬 모드가 기본이다</li>
              <li>Google Sheets 연동은 선택적 어댑터다</li>
              <li>스타일 팩의 작가·라이선스를 보존한다</li>
            </ul>
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
