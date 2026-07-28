"use client";

import Link from "next/link";
import { FurnitureImageImporter } from "./image-importer";
import {
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clientPointToFurnitureCell,
  drawFurniture,
  type FurnitureView,
  type FurnitureViewport,
} from "../../lib/furniture/draw-furniture";
import {
  cellsInFurnitureSelection,
  cloneFurniture,
  eraseFurnitureSelection,
  floodFillFurniture,
  furnitureGridLimits,
  mirrorFurnitureSelection,
  moveFurnitureSelection,
  moveFurnitureSelectionLayer,
  moveFurnitureSelectionSlice,
  resizeFurnitureGrid,
  rotateFurnitureSelection,
  type FurnitureEditPlane,
  type FurnitureSelection,
} from "../../lib/furniture/editing";
import {
  canvasToBlob,
  type FurnitureExportBackground,
  type FurnitureExportRotation,
  type FurnitureExportSize,
  renderFurnitureImage,
  renderFurnitureSpriteSheet,
  safeFurnitureFilename,
} from "../../lib/furniture/export-image";
import {
  decodeFurniture,
  encodeFurniture,
} from "../../lib/furniture/codec";
import {
  FURNITURE_COLOR_PALETTE,
  normalizeFurnitureColor,
} from "../../lib/furniture/colors";
import { convertFurnitureResolution } from "../../lib/furniture/resolution";
import {
  DEFAULT_PRESET_BY_PLACEMENT,
  FURNITURE_MATERIALS,
  FURNITURE_PRESETS,
  makeStoolPreset,
} from "../../lib/furniture/presets";
import type {
  FurnitureCell,
  FurnitureDefinition,
  FurnitureLicense,
  FurnitureMaterialId,
  FurniturePlacement,
  FurnitureResolution,
} from "../../lib/furniture/types";
import { MAX_FURNITURE_VOXELS } from "../../lib/furniture/types";

type Tool = "paint" | "erase" | "fill" | "eyedropper" | "select" | "pan";

const COLOR_HISTORY_KEY = "character-room-builder:furniture-colors:v1";
const MAX_RECENT_COLORS = 10;
const MAX_HISTORY = 80;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

const TOOL_LABELS: Array<{ id: Tool; label: string; shortcut: string }> = [
  { id: "paint", label: "쌓기·칠하기", shortcut: "B" },
  { id: "erase", label: "지우기", shortcut: "E" },
  { id: "fill", label: "채우기", shortcut: "F" },
  { id: "eyedropper", label: "스포이트", shortcut: "I" },
  { id: "select", label: "영역 선택", shortcut: "S" },
  { id: "pan", label: "화면 이동", shortcut: "H" },
];

const VIEW_LABELS: Array<{ id: FurnitureView; label: string }> = [
  { id: "isometric", label: "아이소메트릭" },
  { id: "front", label: "정면" },
  { id: "side", label: "측면" },
  { id: "top", label: "평면" },
];

function editPlaneForView(
  furniture: FurnitureDefinition,
  view: FurnitureView,
): FurnitureEditPlane {
  if (view === "front" || furniture.placement === "wall") return "xz";
  if (view === "side") return "yz";
  return "xy";
}

function sliceLimitForView(
  furniture: FurnitureDefinition,
  view: FurnitureView,
): number {
  if (view === "front") return furniture.grid.depth;
  if (view === "side") return furniture.grid.width;
  return furniture.grid.height;
}

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
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragToolRef = useRef<Tool | null>(null);
  const lastPaintedRef = useRef("");
  const statusTimerRef = useRef<number | null>(null);
  const gestureBeforeRef = useRef<FurnitureDefinition | null>(null);
  const gestureStartRef = useRef<FurnitureDefinition | null>(null);
  const undoStackRef = useRef<FurnitureDefinition[]>([]);
  const redoStackRef = useRef<FurnitureDefinition[]>([]);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    viewport: FurnitureViewport;
  } | null>(null);
  const [furniture, setFurniture] = useState<FurnitureDefinition>(() =>
    makeStoolPreset(),
  );
  const furnitureRef = useRef(furniture);
  const [activeLayer, setActiveLayer] = useState(4);
  const [editView, setEditView] = useState<FurnitureView>("isometric");
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
  const [selection, setSelection] = useState<FurnitureSelection | null>(null);
  const [viewport, setViewport] = useState<FurnitureViewport>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const [gridDraft, setGridDraft] = useState(() => ({ ...furniture.grid }));
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState("");
  const [exportSize, setExportSize] = useState<FurnitureExportSize>(512);
  const [exportRotation, setExportRotation] = useState<FurnitureExportRotation>(0);
  const [exportBackground, setExportBackground] =
    useState<FurnitureExportBackground>("transparent");
  const [exportOutline, setExportOutline] = useState(true);
  const [exportShadow, setExportShadow] = useState(true);
  const [exportStatus, setExportStatus] = useState("");
  const editPlane = editPlaneForView(furniture, editView);
  const selectedCells = useMemo(
    () => cellsInFurnitureSelection(furniture, selection, editPlane),
    [editPlane, furniture, selection],
  );
  const selectedVoxelCount = useMemo(() => {
    const keys = new Set(selectedCells.map(cellKey));
    return furniture.voxels.filter((voxel) => keys.has(cellKey(voxel))).length;
  }, [furniture.voxels, selectedCells]);
  const canUndo = historyState.undo > 0;
  const canRedo = historyState.redo > 0;

  useEffect(() => {
    furnitureRef.current = furniture;
  }, [furniture]);

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
        furnitureRef.current = decoded;
        setFurniture(decoded);
        setGridDraft({ ...decoded.grid });
        setActiveLayer(editableLayer(decoded));
        setEditView("isometric");
        setHover(null);
        setSelection(null);
        setViewport({ zoom: 1, panX: 0, panY: 0 });
        undoStackRef.current = [];
        redoStackRef.current = [];
        setHistoryState({ undo: 0, redo: 0 });
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
        selection: selectedCells,
        viewport,
        view: editView,
      });
    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    activeLayer,
    editView,
    furniture,
    hover,
    selectedCells,
    selectedColor,
    selectedMaterial,
    tool,
    viewport,
  ]);

  useEffect(() => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    renderFurnitureImage(canvas, furniture, {
      size: exportSize,
      rotation: exportRotation,
      background: exportBackground,
      outline: exportOutline,
      shadow: exportShadow,
    });
  }, [
    exportBackground,
    exportOutline,
    exportRotation,
    exportShadow,
    exportSize,
    furniture,
  ]);

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

  function syncHistoryState(): void {
    setHistoryState({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    });
  }

  function pushUndoSnapshot(snapshot: FurnitureDefinition): void {
    undoStackRef.current = [
      ...undoStackRef.current,
      cloneFurniture(snapshot),
    ].slice(-MAX_HISTORY);
    redoStackRef.current = [];
    syncHistoryState();
  }

  function setFurnitureDocument(next: FurnitureDefinition): void {
    furnitureRef.current = next;
    setFurniture(next);
    setGridDraft({ ...next.grid });
    setActiveLayer((layer) =>
      next.placement === "volume"
        ? Math.min(sliceLimitForView(next, editView) - 1, Math.max(0, layer))
        : 0,
    );
    setHover(null);
  }

  function commitFurniture(
    next: FurnitureDefinition,
    message?: string,
  ): boolean {
    const current = furnitureRef.current;
    if (next.voxels.length > MAX_FURNITURE_VOXELS) {
      flash(`조립 칸은 최대 ${MAX_FURNITURE_VOXELS.toLocaleString("ko-KR")}개까지 만들 수 있어요.`);
      return false;
    }
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    pushUndoSnapshot(current);
    setFurnitureDocument(next);
    clearPublishedCode();
    if (message) flash(message);
    return true;
  }

  function beginFurnitureGesture(): void {
    gestureStartRef.current = furnitureRef.current;
    gestureBeforeRef.current = cloneFurniture(furnitureRef.current);
  }

  function finishFurnitureGesture(): void {
    if (
      gestureStartRef.current &&
      gestureBeforeRef.current &&
      furnitureRef.current !== gestureStartRef.current
    ) {
      pushUndoSnapshot(gestureBeforeRef.current);
    }
    gestureStartRef.current = null;
    gestureBeforeRef.current = null;
  }

  function undoFurniture(): void {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      cloneFurniture(furnitureRef.current),
    ].slice(-MAX_HISTORY);
    setFurnitureDocument(cloneFurniture(previous));
    setSelection(null);
    clearPublishedCode();
    syncHistoryState();
    flash("이전 편집 상태로 돌아갔어요.");
  }

  function redoFurniture(): void {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      cloneFurniture(furnitureRef.current),
    ].slice(-MAX_HISTORY);
    setFurnitureDocument(cloneFurniture(next));
    setSelection(null);
    clearPublishedCode();
    syncHistoryState();
    flash("다시 적용했어요.");
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
    const current = furnitureRef.current;
    const matchingIndex = current.voxels.findIndex(
      (voxel) => cellKey(voxel) === key,
    );
    let next = current;

    if (action === "erase") {
      if (matchingIndex >= 0) {
        next = {
          ...current,
          voxels: current.voxels.filter((_, index) => index !== matchingIndex),
        };
      }
    } else if (action === "paint") {
      if (matchingIndex < 0 && current.voxels.length >= MAX_FURNITURE_VOXELS) {
        flash(`조립 칸은 최대 ${MAX_FURNITURE_VOXELS.toLocaleString("ko-KR")}개까지 만들 수 있어요.`);
        return;
      }
      if (
        matchingIndex < 0 ||
        current.voxels[matchingIndex].material !== selectedMaterial ||
        current.voxels[matchingIndex].color !== selectedColor
      ) {
        const nextVoxel = {
          x: cell.x,
          y: cell.y,
          z: cell.z,
          material: selectedMaterial,
          color: selectedColor,
        };
        next = matchingIndex < 0
          ? { ...current, voxels: [...current.voxels, nextVoxel] }
          : {
              ...current,
              voxels: current.voxels.map((voxel, index) =>
                index === matchingIndex ? nextVoxel : voxel,
              ),
            };
      }
    }

    if (next !== current) {
      furnitureRef.current = next;
      setFurniture(next);
    }
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
      viewport,
      editView,
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0 && event.button !== 2) return;

    if (event.button === 0 && tool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragToolRef.current = "pan";
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        viewport,
      };
      setHover(null);
      return;
    }

    const cell = pointFromEvent(event);
    if (!cell) return;

    if (event.button === 0 && tool === "eyedropper") {
      const voxel = furnitureRef.current.voxels.find(
        (candidate) => cellKey(candidate) === cellKey(cell),
      );
      if (!voxel) {
        flash("색을 가져올 채워진 칸을 골라주세요.");
        return;
      }
      const color = voxel.color ?? FURNITURE_MATERIALS[voxel.material].color;
      setSelectedMaterial(voxel.material);
      chooseColor(color);
      rememberColor(color);
      setTool("paint");
      flash("이 칸의 재료와 색을 가져왔어요.");
      return;
    }

    if (event.button === 0 && tool === "fill") {
      const next = floodFillFurniture(
        furnitureRef.current,
        cell,
        selectedMaterial,
        selectedColor,
        editPlane,
      );
      if (commitFurniture(next, "연결된 영역을 채웠어요.")) {
        rememberColor(selectedColor);
      }
      return;
    }

    if (event.button === 0 && tool === "select") {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragToolRef.current = "select";
      setSelection({ start: cell, end: cell });
      setHover(cell);
      return;
    }

    const action: Tool = event.button === 2 ? "erase" : tool;
    if (action !== "paint" && action !== "erase") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragToolRef.current = action;
    lastPaintedRef.current = cellKey(cell);
    setHover(cell);
    if (action === "paint") rememberColor(selectedColor);
    beginFurnitureGesture();
    updateCell(cell, action);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    if (dragToolRef.current === "pan" && panStartRef.current) {
      const start = panStartRef.current;
      setViewport({
        ...start.viewport,
        panX: start.viewport.panX + event.clientX - start.clientX,
        panY: start.viewport.panY + event.clientY - start.clientY,
      });
      return;
    }

    const cell = pointFromEvent(event);
    setHover(cell);
    if (!cell || !dragToolRef.current) return;

    if (dragToolRef.current === "select") {
      setSelection((current) => current ? { ...current, end: cell } : null);
      return;
    }

    if (dragToolRef.current !== "paint" && dragToolRef.current !== "erase") {
      return;
    }
    const key = cellKey(cell);
    if (key === lastPaintedRef.current) return;
    lastPaintedRef.current = key;
    updateCell(cell, dragToolRef.current);
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragToolRef.current === "paint" || dragToolRef.current === "erase") {
      finishFurnitureGesture();
    }
    dragToolRef.current = null;
    panStartRef.current = null;
    lastPaintedRef.current = "";
  }

  function handleCanvasWheel(event: WheelEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    setViewport((current) => ({
      ...current,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + step)),
    }));
  }

  function handleCanvasKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoFurniture();
      else undoFurniture();
      return;
    }
    if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoFurniture();
      return;
    }
    if (!modifier && event.key.toLowerCase() === "b") setTool("paint");
    if (!modifier && event.key.toLowerCase() === "e") setTool("erase");
    if (!modifier && event.key.toLowerCase() === "f") setTool("fill");
    if (!modifier && event.key.toLowerCase() === "i") setTool("eyedropper");
    if (!modifier && event.key.toLowerCase() === "s") setTool("select");
    if (!modifier && event.key.toLowerCase() === "h") setTool("pan");
    if (!modifier && (event.key === "+" || event.key === "=")) {
      setViewport((current) => ({
        ...current,
        zoom: Math.min(MAX_ZOOM, current.zoom + 0.1),
      }));
    }
    if (!modifier && event.key === "-") {
      setViewport((current) => ({
        ...current,
        zoom: Math.max(MIN_ZOOM, current.zoom - 0.1),
      }));
    }
    if (!modifier && event.key === "0") {
      setViewport({ zoom: 1, panX: 0, panY: 0 });
    }
    if (furniture.placement === "volume" && event.key === "[") {
      event.preventDefault();
      setActiveLayer((layer) => Math.max(0, layer - 1));
      setSelection(null);
    }
    if (furniture.placement === "volume" && event.key === "]") {
      event.preventDefault();
      setActiveLayer((layer) =>
        Math.min(sliceLimitForView(furniture, editView) - 1, layer + 1)
      );
      setSelection(null);
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selection) {
      event.preventDefault();
      commitFurniture(
        eraseFurnitureSelection(furnitureRef.current, selection, editPlane),
        "선택 영역의 복셀을 지웠어요.",
      );
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && hover) {
      event.preventDefault();
      beginFurnitureGesture();
      updateCell(hover, "erase");
      finishFurnitureGesture();
    }
  }

  function loadPreset(create: () => FurnitureDefinition): void {
    const next = create();
    commitFurniture(next);
    setActiveLayer(editableLayer(next));
    setEditView("isometric");
    setTool("paint");
    setHover(null);
    setSelection(null);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
    flash(next.name + " 예시를 열었어요.");
  }

  function loadImportedFurniture(next: FurnitureDefinition): void {
    if (!commitFurniture(next)) return;
    const view: FurnitureView = next.placement === "wall"
      ? "front"
      : next.placement === "floor"
        ? "top"
        : "isometric";
    setEditView(view);
    setActiveLayer(next.placement === "volume" ? editableLayer(next) : 0);
    setTool("paint");
    setHover(null);
    setSelection(null);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
    flash(`${next.name} 변환 결과를 열었어요.`);
  }

  function changeResolution(resolution: FurnitureResolution): void {
    if (furniture.resolution === resolution) return;
    const previousResolution = furniture.resolution;
    const next = convertFurnitureResolution(furniture, resolution);
    if (next.voxels.length > MAX_FURNITURE_VOXELS) {
      flash(
        `이 모양을 ${resolution}×로 세분화하면 ${next.voxels.length.toLocaleString("ko-KR")}칸이 되어 최대 ${MAX_FURNITURE_VOXELS.toLocaleString("ko-KR")}칸을 넘어요. 빈 공간을 조금 만든 뒤 다시 시도해주세요.`,
      );
      return;
    }
    commitFurniture(next);
    setActiveLayer((layer) => {
      if (next.placement !== "volume") return 0;
      const factor = resolution > previousResolution
        ? resolution / previousResolution
        : previousResolution / resolution;
      const converted = resolution > previousResolution
        ? layer * factor + factor - 1
        : Math.floor(layer / factor);
      return Math.min(sliceLimitForView(next, editView) - 1, converted);
    });
    setHover(null);
    setSelection(null);
    flash(
      resolution === 1
        ? "기본 조립으로 바꿨어요. 작은 셀은 대표 재료로 합쳐졌어요."
        : `${resolution}× 정밀 조립으로 바꿨어요. 외형 크기는 유지되고 셀이 더 촘촘해졌어요.`,
    );
  }

  function applyGridResize(): void {
    const current = furnitureRef.current;
    const next = resizeFurnitureGrid(current, gridDraft);
    const removed = current.voxels.length - next.voxels.length;
    if (!commitFurniture(
      next,
      removed > 0
        ? `격자를 바꾸고 바깥쪽 ${removed}칸을 잘라냈어요. 실행 취소로 복원할 수 있어요.`
        : "격자 크기를 바꿨어요.",
    )) {
      flash("이미 같은 격자 크기예요.");
      return;
    }
    setSelection(null);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
    setActiveLayer((layer) =>
      Math.min(sliceLimitForView(next, editView) - 1, layer)
    );
  }

  function chooseEditView(view: FurnitureView): void {
    if (furniture.placement === "floor" && view !== "isometric" && view !== "top") {
      return;
    }
    if (furniture.placement === "wall" && view !== "isometric" && view !== "front") {
      return;
    }
    setEditView(view);
    setActiveLayer((layer) => furniture.placement === "volume"
      ? Math.min(sliceLimitForView(furniture, view) - 1, layer)
      : 0);
    setSelection(null);
    setHover(null);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }

  function applySelectionTransform(
    result: ReturnType<typeof moveFurnitureSelection>,
    message: string,
  ): void {
    if (result.blocked) {
      flash("선택 영역이 조립판 바깥으로 나가요.");
      return;
    }
    setSelection(result.selection);
    if (furnitureRef.current.placement === "volume") {
      setActiveLayer(
        editPlane === "xz"
          ? result.selection.start.y
          : editPlane === "yz"
            ? result.selection.start.x
            : result.selection.start.z,
      );
    }
    if (!result.changed) {
      flash("선택 영역에 옮길 복셀이 없어요.");
      return;
    }
    commitFurniture(result.furniture, message);
  }

  function moveSelection(deltaA: number, deltaB: number): void {
    if (!selection) return;
    applySelectionTransform(
      moveFurnitureSelection(
        furnitureRef.current,
        selection,
        deltaA,
        deltaB,
        false,
        editPlane,
      ),
      "선택 영역을 한 칸 옮겼어요.",
    );
  }

  function duplicateSelection(): void {
    if (!selection) return;
    applySelectionTransform(
      moveFurnitureSelection(
        furnitureRef.current,
        selection,
        1,
        0,
        true,
        editPlane,
      ),
      "선택 영역을 오른쪽으로 한 칸 복제했어요.",
    );
  }

  function moveSelectionLayer(deltaZ: number): void {
    if (!selection) return;
    applySelectionTransform(
      editPlane === "xy"
        ? moveFurnitureSelectionLayer(furnitureRef.current, selection, deltaZ)
        : moveFurnitureSelectionSlice(
            furnitureRef.current,
            selection,
            deltaZ,
            editPlane,
          ),
      editPlane === "xy"
        ? deltaZ > 0
          ? "선택 영역을 한 층 올렸어요."
          : "선택 영역을 한 층 내렸어요."
        : deltaZ > 0
          ? "선택 영역을 다음 단면으로 옮겼어요."
          : "선택 영역을 이전 단면으로 옮겼어요.",
    );
  }

  function rotateSelection(): void {
    if (!selection) return;
    applySelectionTransform(
      rotateFurnitureSelection(furnitureRef.current, selection, editPlane),
      "선택 영역을 시계 방향으로 돌렸어요.",
    );
  }

  function mirrorSelection(axis: "a" | "b"): void {
    if (!selection) return;
    applySelectionTransform(
      mirrorFurnitureSelection(furnitureRef.current, selection, axis, editPlane),
      axis === "a"
        ? "선택 영역을 좌우로 반전했어요."
        : editPlane === "xy"
          ? "선택 영역을 앞뒤로 반전했어요."
          : "선택 영역을 상하로 반전했어요.",
    );
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
      commitFurniture(decoded);
      setActiveLayer(editableLayer(decoded));
      setEditView("isometric");
      setHover(null);
      setSelection(null);
      setViewport({ zoom: 1, panX: 0, panY: 0 });
      const code = encodeFurniture(decoded);
      setCodeInput(code);
      window.history.replaceState(null, "", "#" + code);
      flash("가구 코드를 불러왔어요.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "가구 코드를 읽지 못했어요.");
    }
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportStill(type: "image/png" | "image/webp"): Promise<void> {
    if (furniture.voxels.length === 0) {
      setExportStatus("먼저 한 칸 이상 만들어주세요.");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      renderFurnitureImage(canvas, furniture, {
        size: exportSize,
        rotation: exportRotation,
        background: exportBackground,
        outline: exportOutline,
        shadow: exportShadow,
      });
      const blob = await canvasToBlob(canvas, type);
      if (type === "image/webp" && blob.type !== "image/webp") {
        throw new Error("이 브라우저는 WebP 내보내기를 지원하지 않아요.");
      }
      const extension = type === "image/png" ? "png" : "webp";
      downloadBlob(blob, `${safeFurnitureFilename(furniture.name)}.${extension}`);
      setExportStatus(`${exportSize} × ${exportSize} ${extension.toUpperCase()}를 저장했어요.`);
    } catch (error) {
      setExportStatus(
        error instanceof Error ? error.message : "이미지를 내보내지 못했어요.",
      );
    }
  }

  async function exportSpriteSheet(): Promise<void> {
    if (furniture.voxels.length === 0) {
      setExportStatus("먼저 한 칸 이상 만들어주세요.");
      return;
    }
    if (furniture.placement === "wall") {
      setExportStatus("벽 소품은 단일 이미지로 내보내주세요.");
      return;
    }
    try {
      const sheet = renderFurnitureSpriteSheet(furniture, {
        size: exportSize,
        background: exportBackground,
        outline: exportOutline,
        shadow: exportShadow,
      });
      const blob = await canvasToBlob(sheet, "image/png");
      downloadBlob(blob, `${safeFurnitureFilename(furniture.name)}-4dir.png`);
      setExportStatus(
        `${exportSize * 4} × ${exportSize} 4방향 PNG 시트를 저장했어요.`,
      );
    } catch (error) {
      setExportStatus(
        error instanceof Error ? error.message : "스프라이트 시트를 만들지 못했어요.",
      );
    }
  }

  const placementCopy = PLACEMENT_LABELS[furniture.placement];
  const matchingPresets = FURNITURE_PRESETS.filter(
    (preset) => preset.placement === furniture.placement,
  );
  const gridLimits = furnitureGridLimits(furniture);
  const activeViewLabel = VIEW_LABELS.find((item) => item.id === editView)?.label ?? "아이소메트릭";
  const sliceLimit = sliceLimitForView(furniture, editView);
  const sliceAxisName = editView === "front"
    ? "깊이면"
    : editView === "side"
      ? "가로면"
      : "층";

  return (
    <main className="shell foundry-shell">
      <header className="masthead">
        <div>
          <nav className="product-nav" aria-label="프로젝트 화면">
            <Link href="/" aria-current="page">가구 공방</Link>
            <Link href="/room">방 배치</Link>
          </nav>
          <p className="eyebrow">FURNITURE FOUNDRY · FURN1</p>
          <h1>아이소메트릭 가구 공방</h1>
        </div>
        <p>
          입체 가구를 쌓거나 바닥과 벽의 조립면을 칠합니다. 편집 가능한 FURN1과
          어디서든 쓸 수 있는 투명 이미지로 가져가세요.
        </p>
      </header>

      <div className="foundry-workspace">
        <section className="foundry-stage" aria-labelledby="furniture-title">
          <div className="foundry-stage-bar">
            <div>
              <p>WORKPIECE</p>
              <h2 id="furniture-title">{furniture.name}</h2>
            </div>
            <div className="history-controls" aria-label="편집 기록">
              <button
                type="button"
                disabled={!canUndo}
                onClick={undoFurniture}
              >
                실행 취소
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={redoFurniture}
              >
                다시 실행
              </button>
            </div>
          </div>

          <div className="foundry-toolbar">
            <div className="tool-switch" aria-label="편집 도구">
              {TOOL_LABELS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  data-active={tool === item.id}
                  aria-pressed={tool === item.id}
                  title={`${item.label} (${item.shortcut})`}
                  onClick={() => setTool(item.id)}
                >
                  {item.id === "paint"
                    ? furniture.placement === "volume" ? "쌓기" : "칠하기"
                    : item.label}
                </button>
              ))}
            </div>
            <div className="view-switch" aria-label="편집 시점">
              {VIEW_LABELS.map((item) => {
                const disabled = furniture.placement === "floor"
                  ? item.id === "front" || item.id === "side"
                  : furniture.placement === "wall"
                    ? item.id === "side" || item.id === "top"
                    : false;
                return (
                  <button
                    type="button"
                    key={item.id}
                    disabled={disabled}
                    data-active={editView === item.id}
                    aria-pressed={editView === item.id}
                    onClick={() => chooseEditView(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="viewport-controls" aria-label="화면 확대와 위치">
              <button
                type="button"
                aria-label="화면 축소"
                disabled={viewport.zoom <= MIN_ZOOM}
                onClick={() => setViewport((current) => ({
                  ...current,
                  zoom: Math.max(MIN_ZOOM, current.zoom - 0.1),
                }))}
              >
                축소
              </button>
              <output>{Math.round(viewport.zoom * 100)}%</output>
              <button
                type="button"
                aria-label="화면 확대"
                disabled={viewport.zoom >= MAX_ZOOM}
                onClick={() => setViewport((current) => ({
                  ...current,
                  zoom: Math.min(MAX_ZOOM, current.zoom + 0.1),
                }))}
              >
                확대
              </button>
              <button
                type="button"
                onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}
              >
                맞춤
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="foundry-canvas"
            role="application"
            tabIndex={0}
            aria-describedby="foundry-canvas-help"
            aria-label={`${furniture.name} ${placementCopy.name} ${activeViewLabel} 편집판.${
              furniture.placement === "volume"
                ? ` 현재 ${sliceAxisName} ${activeLayer + 1}.`
                : ""
            }`}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onWheel={handleCanvasWheel}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={() => {
              if (!dragToolRef.current) setHover(null);
            }}
            onKeyDown={handleCanvasKeyDown}
            data-tool={tool}
          />

          <div className="foundry-help" id="foundry-canvas-help">
            <p>
              휠로 확대·축소 · 화면 이동 도구로 드래그 · 오른쪽 클릭으로 바로 지우기
            </p>
            <p>
              {furniture.placement === "volume" ? "키보드 [ ] 층 이동 · " : ""}
              Ctrl+Z 실행 취소 · Delete 선택 영역 지우기
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
                  <p className="section-kicker">EDIT SLICE</p>
                  <h2>{activeLayer + 1}번째 {sliceAxisName} 편집</h2>
                </div>
                <output>{activeLayer + 1} / {sliceLimit}</output>
              </div>
              <label className="control-label" htmlFor="furniture-layer">
                편집할 {sliceAxisName}
              </label>
              <input
                id="furniture-layer"
                className="layer-range"
                type="range"
                min={0}
                max={sliceLimit - 1}
                value={activeLayer}
                onChange={(event) => {
                  setActiveLayer(Number(event.target.value));
                  setSelection(null);
                }}
              />
              <p className="control-note">
                {editView === "isometric"
                  ? "아이소메트릭에서는 현재 층 이하를 함께 보여요."
                  : `${activeViewLabel}에서는 선택한 단면만 정확히 편집해요.`}
              </p>
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
            <p className="section-kicker">WORKPIECE SIZE</p>
            <h2>조립판 크기</h2>
            <div className="grid-size-fields">
              <label>
                <span>가로</span>
                <input
                  type="number"
                  min={gridLimits.width.min}
                  max={gridLimits.width.max}
                  value={gridDraft.width}
                  onChange={(event) => setGridDraft((current) => ({
                    ...current,
                    width: Number(event.target.value),
                  }))}
                />
              </label>
              {furniture.placement !== "wall" ? (
                <label>
                  <span>깊이</span>
                  <input
                    type="number"
                    min={gridLimits.depth.min}
                    max={gridLimits.depth.max}
                    value={gridDraft.depth}
                    onChange={(event) => setGridDraft((current) => ({
                      ...current,
                      depth: Number(event.target.value),
                    }))}
                  />
                </label>
              ) : null}
              {furniture.placement !== "floor" ? (
                <label>
                  <span>높이</span>
                  <input
                    type="number"
                    min={gridLimits.height.min}
                    max={gridLimits.height.max}
                    value={gridDraft.height}
                    onChange={(event) => setGridDraft((current) => ({
                      ...current,
                      height: Number(event.target.value),
                    }))}
                  />
                </label>
              ) : null}
            </div>
            <button
              type="button"
              className="button secondary grid-size-apply"
              onClick={applyGridResize}
            >
              조립판 크기 적용
            </button>
            <p className="control-note">
              작은 크기로 줄이며 잘린 칸은 실행 취소로 되돌릴 수 있어요.
            </p>
          </section>

          <section>
            <p className="section-kicker">SELECTION</p>
            <h2>영역 편집</h2>
            {selection ? (
              <>
                <p className="panel-copy">
                  {selectedCells.length}칸 영역 · 복셀 {selectedVoxelCount}개
                </p>
                <div className="selection-nudge" aria-label="선택 영역 이동">
                  <button type="button" onClick={() => moveSelection(-1, 0)}>
                    왼쪽
                  </button>
                  <button type="button" onClick={() => moveSelection(1, 0)}>
                    오른쪽
                  </button>
                  <button type="button" onClick={() => moveSelection(0, -1)}>
                    {editPlane === "xy" ? "뒤" : "아래"}
                  </button>
                  <button type="button" onClick={() => moveSelection(0, 1)}>
                    {editPlane === "xy" ? "앞" : "위"}
                  </button>
                  {furniture.placement === "volume" ? (
                    <>
                      <button type="button" onClick={() => moveSelectionLayer(-1)}>
                        {editPlane === "xy" ? "한 층 아래" : "이전 단면"}
                      </button>
                      <button type="button" onClick={() => moveSelectionLayer(1)}>
                        {editPlane === "xy" ? "한 층 위" : "다음 단면"}
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="selection-actions">
                  <button type="button" onClick={duplicateSelection}>오른쪽 복제</button>
                  <button type="button" onClick={rotateSelection}>시계 방향 회전</button>
                  <button type="button" onClick={() => mirrorSelection("a")}>
                    좌우 반전
                  </button>
                  <button type="button" onClick={() => mirrorSelection("b")}>
                    {editPlane === "xy" ? "앞뒤 반전" : "상하 반전"}
                  </button>
                  <button
                    type="button"
                    onClick={() => commitFurniture(
                      eraseFurnitureSelection(
                        furnitureRef.current,
                        selection,
                        editPlane,
                      ),
                      "선택 영역의 복셀을 지웠어요.",
                    )}
                  >
                    선택 영역 지우기
                  </button>
                  <button type="button" onClick={() => setSelection(null)}>
                    선택 해제
                  </button>
                </div>
              </>
            ) : (
              <p className="panel-copy">
                영역 선택 도구로 현재 편집면을 드래그하면 이동·복제·회전·반전할 수 있어요.
              </p>
            )}
          </section>

          <section>
            <p className="section-kicker">ASSEMBLY DETAIL</p>
            <h2>조립 해상도</h2>
            <div className="resolution-switch" aria-label="조립 해상도">
              {([1, 2, 4] as FurnitureResolution[]).map((resolution) => (
                <button
                  type="button"
                  key={resolution}
                  aria-pressed={furniture.resolution === resolution}
                  data-active={furniture.resolution === resolution}
                  onClick={() => changeResolution(resolution)}
                >
                  <strong>
                    {resolution === 1 ? "기본" : resolution === 2 ? "정밀" : "초정밀"}
                  </strong>
                  <span>{resolution}× CELLS</span>
                </button>
              ))}
            </div>
            <p className="control-note">
              2×·4×는 같은 가구 크기 안에서 셀을 더 잘게 나눕니다. 4× 코드는
              빈 칸을 저장하지 않고 같은 재료의 가로 구간을 묶어요.
            </p>
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

      <FurnitureImageImporter
        selectedMaterial={selectedMaterial}
        license={furniture.provenance.license}
        credit={furniture.provenance.credit}
        onApply={loadImportedFurniture}
      />

      <section className="export-studio" aria-labelledby="export-title">
        <div className="export-heading">
          <div>
            <p className="section-kicker">TAKE IT WITH YOU</p>
            <h2 id="export-title">공방 밖으로 내보내기</h2>
          </div>
          <p>
            방 배치와 무관하게 쓸 수 있는 아이소메트릭 결과물입니다. 파일은 이
            브라우저에서 만들며 서버로 전송하지 않습니다.
          </p>
        </div>

        <div className="export-workspace">
          <div className="export-preview">
            <canvas
              ref={exportCanvasRef}
              role="img"
              aria-label={`${furniture.name} 투명 아이소메트릭 내보내기 미리보기`}
            />
            <p>
              {exportSize} × {exportSize} · {exportBackground === "transparent"
                ? "투명 배경"
                : "웜 페이퍼"}
            </p>
          </div>

          <div className="export-controls">
            <div className="export-control-row">
              <label htmlFor="export-size">이미지 크기</label>
              <select
                id="export-size"
                value={exportSize}
                onChange={(event) =>
                  setExportSize(Number(event.target.value) as FurnitureExportSize)}
              >
                <option value={256}>256 × 256</option>
                <option value={512}>512 × 512</option>
                <option value={1024}>1024 × 1024</option>
              </select>
            </div>

            <div className="export-control-row">
              <label htmlFor="export-background">배경</label>
              <select
                id="export-background"
                value={exportBackground}
                onChange={(event) =>
                  setExportBackground(event.target.value as FurnitureExportBackground)}
              >
                <option value="transparent">투명</option>
                <option value="paper">웜 페이퍼</option>
              </select>
            </div>

            <fieldset className="export-rotation-fieldset">
              <legend>보는 방향</legend>
              <div className="export-rotation-switch">
                {([0, 1, 2, 3] as FurnitureExportRotation[]).map((rotation) => (
                  <button
                    type="button"
                    key={rotation}
                    aria-pressed={exportRotation === rotation}
                    data-active={exportRotation === rotation}
                    disabled={furniture.placement === "wall"}
                    onClick={() => setExportRotation(rotation)}
                  >
                    {rotation + 1}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="export-checks">
              <label>
                <input
                  type="checkbox"
                  checked={exportOutline}
                  onChange={(event) => setExportOutline(event.target.checked)}
                />
                외곽선·재질 경계
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={exportShadow}
                  disabled={furniture.placement === "wall"}
                  onChange={(event) => setExportShadow(event.target.checked)}
                />
                바닥 그림자
              </label>
            </div>

            <div className="export-actions">
              <button
                type="button"
                className="button primary"
                disabled={furniture.voxels.length === 0}
                onClick={() => void exportStill("image/png")}
              >
                PNG 저장
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={furniture.voxels.length === 0}
                onClick={() => void exportStill("image/webp")}
              >
                WebP 저장
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={
                  furniture.voxels.length === 0 || furniture.placement === "wall"
                }
                onClick={() => void exportSpriteSheet()}
              >
                4방향 시트 PNG
              </button>
            </div>
            <p className="control-note">
              4방향 시트는 입체·바닥 가구를 방향별 한 프레임씩 가로로 배치합니다.
              벽 소품은 단일 PNG·WebP로 내보냅니다.
            </p>
            <p className="status" aria-live="polite">{exportStatus}</p>
          </div>
        </div>
      </section>

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
