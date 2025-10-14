import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { throttle } from '../utils/throttle';
import { Stage, Layer, Group as KonvaGroup, Circle, Rect, Text, Image as KonvaImage, Arrow } from 'react-konva';
import { useAppStore } from '../store';
import type { AnyNode, GroupNode, TaskNode, PersonNode, TaskStatus, Recurrence } from '../types';
import { getLogger } from '../logger';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { computeNextDueDate, todayYMD, toIsoUTCFromYMD } from '../recurrence';

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function useHtmlImage(url?: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImg(null); return; }
    let alive = true;
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { if (alive) setImg(image); };
    image.onerror = () => { if (alive) setImg(null); };
    image.src = url;
    return () => { alive = false; };
  }, [url]);
  return img;
}

function computeNodeCenter(n: AnyNode) {
  return { cx: n.x + n.width / 2, cy: n.y + n.height / 2 };
}

function rectsIntersect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Compute point on node border towards another node center (for nice arrow anchoring)
function computeAnchorTowards(n: AnyNode, target: AnyNode) {
  const c1 = computeNodeCenter(n);
  const c2 = computeNodeCenter(target);
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  if (n.type === 'task') {
    const hw = n.width / 2;
    const hh = n.height / 2;
    const s = Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh) || 1;
    return { x: c1.cx + dx / s, y: c1.cy + dy / s };
  } else {
    const r = Math.min(n.width, n.height) / 2;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { x: c1.cx + ux * r, y: c1.cy + uy * r };
  }
}

// Compute point on node border towards arbitrary world point
function computeAnchorTowardsPoint(n: AnyNode, p: { x: number; y: number }) {
  const c1 = computeNodeCenter(n);
  const dx = p.x - c1.cx;
  const dy = p.y - c1.cy;
  if (n.type === 'task') {
    const hw = n.width / 2;
    const hh = n.height / 2;
    const s = Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh) || 1;
    return { x: c1.cx + dx / s, y: c1.cy + dy / s };
  } else {
    const r = Math.min(n.width, n.height) / 2;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { x: c1.cx + ux * r, y: c1.cy + uy * r };
  }
}

function nodeDisplayName(n: AnyNode): string {
  if (n.type === 'task') return (n as TaskNode).title;
  if (n.type === 'person') return (n as PersonNode).name;
  return (n as GroupNode).name;
}

// Estimate multiline font size to fit into a given box (approximate, fast)
function estimateTaskFont(text: string, base: number, contentW: number, contentH: number, lineH = 1.15) {
  let s = base;
  const minS = 10;
  // up to 3 refinement iterations to converge
  for (let i = 0; i < 3; i++) {
    const charW = 0.6 * s || 1; // average char width heuristic
    const charsPerLine = Math.max(1, Math.floor(contentW / charW));
    const parts = String(text || '').split('\n');
    let lines = 0;
    for (const part of parts) {
      const len = Math.max(1, part.length);
      lines += Math.max(1, Math.ceil(len / charsPerLine));
    }
    const requiredH = lines * s * lineH;
    if (requiredH <= contentH + 0.5) break;
    const ratio = contentH / requiredH;
    s = Math.max(minS, Math.floor(s * Math.max(0.5, ratio)));
  }
  return s;
}

export const BoardCanvas: React.FC = () => {
  const nodes = useAppStore((s) => s.nodes);
  const currentParentId = useAppStore((s) => s.currentParentId);
  
  // ОПТИМИЗАЦИЯ: фильтруем видимые узлы и кэшируем по хэшу
  const visibleNodes = useMemo(() => {
    return nodes.filter((n) => n.parentId === currentParentId && !(n.type === 'task' && (n as TaskNode).status === 'done'));
  }, [nodes, currentParentId]);
  
  const links = useAppStore((s) => s.links);
  const viewport = useAppStore((s) => s.viewport);
  const setViewportRaw = useAppStore((s) => s.setViewport);
  // ОПТИМИЗАЦИЯ: throttle для viewport чтобы не дёргать store на каждый пиксель
  const setViewport = useMemo(() => throttle(setViewportRaw, 16), [setViewportRaw]);
  const moveNode = useAppStore((s) => s.moveNode);
  const setSelection = useAppStore((s) => s.setSelection);
  const selection = useAppStore((s) => s.selection);
  // ОПТИМИЗАЦИЯ: Set для быстрой проверки selected
  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const addLink = useAppStore((s) => s.addLink);
  const enterGroup = useAppStore((s) => s.enterGroup);
  const addTask = useAppStore((s) => s.addTask);
  const addGroup = useAppStore((s) => s.addGroup);
  const addPerson = useAppStore((s) => s.addPerson);
  const linkSelection = useAppStore((s) => s.linkSelection);
  const setLinkSelection = useAppStore((s) => s.setLinkSelection);
  const editingNodeId = useAppStore((s) => s.editingNodeId);
  const setEditingNodeId = useAppStore((s) => s.setEditingNodeId);
  const deleteSelection = useAppStore((s) => s.deleteSelection);
  const perfModeOverride = useAppStore((s) => s.perfModeOverride);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const log = getLogger('BoardCanvas');
  const diag = useMemo(() => {
    try { return localStorage.getItem('DEBUG_DIAG') === '1'; } catch { return false; }
  }, []);

  // Ключ уровня для сохранения/восстановления вида
  const levelKey = useMemo(() => currentParentId ?? '__ROOT__', [currentParentId]);
  // Есть ли сохранённый стартовый центр вида для текущего уровня?
  const hasSavedStart = useMemo(() => {
    try {
      // Новый формат: START_VIEW_BY_LEVEL: { [levelKey]: { x,y,scale? } }
      const rawMap = localStorage.getItem('START_VIEW_BY_LEVEL');
      if (rawMap) {
        const map = JSON.parse(rawMap) as Record<string, { x: number; y: number; scale?: number }> | null;
        const p = map && map[levelKey];
        if (p && typeof p.x === 'number' && typeof p.y === 'number') return true;
      }
      // Legacy для корня: START_VIEW_CENTER
      if (levelKey === '__ROOT__') {
        const rawLegacy = localStorage.getItem('START_VIEW_CENTER');
        if (rawLegacy) {
          const parsed = JSON.parse(rawLegacy) as { x?: number; y?: number } | null;
          if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [levelKey]);

  // Если в сторе есть сохранённый вид для уровня — используем его и блокируем автопозиционирование
  const levelView = useAppStore((s) => s.levelView);
  const hasStoredLevelView = !!levelView[levelKey];

  const { width, height } = useWindowSize();

  const stageRef = useRef<Konva.Stage | null>(null);
  const levelGroupRef = useRef<Konva.Group | null>(null);
  const lastCenter = useRef<{ x: number; y: number } | null>(null);
  const lastDist = useRef<number>(0);
  const lassoClickGuardRef = useRef<boolean>(false);
  const [pendingLinkFrom, setPendingLinkFrom] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [linkCtxMenu, setLinkCtxMenu] = useState<{ x: number; y: number; linkId: string } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  
  // Сброс pendingLinkFrom при выключении режима нитки
  useEffect(() => {
    if (tool !== 'link') {
      log.info('link:mode-off, resetting pendingLinkFrom');
      setPendingLinkFrom(null);
    } else {
      log.info('link:mode-on');
    }
  }, [tool, log]);
  // Локальный ввод даты дедлайна в контекстном меню, чтобы не дёргалось при onChange
  const [ctxDueLocal, setCtxDueLocal] = useState<string>('');
  useEffect(() => {
    if (!ctxMenu) { setCtxDueLocal(''); return; }
    const n = nodes.find((x) => x.id === ctxMenu.nodeId);
    if (n && n.type === 'task') {
      const t = n as TaskNode;
      setCtxDueLocal(t.dueDate ? t.dueDate.slice(0, 10) : '');
    } else {
      setCtxDueLocal('');
    }
  }, [ctxMenu, nodes]);
  const [ctxMenuPos, setCtxMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [linkCtxMenuPos, setLinkCtxMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [ctxRecOpen, setCtxRecOpen] = useState(false);
  const draggingMenuRef = useRef<{ kind: 'ctx' | 'link'; dx: number; dy: number } | null>(null);
  const [lasso, setLasso] = useState<null | { x: number; y: number; w: number; h: number; additive: boolean }>(null);
  const [hoveredStub, setHoveredStub] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const didAutoCenter = useRef<boolean>(false);
  // Поиск целевого узла для связи (после выбора первого узла и нажатия A/Ф)
  const [linkSearchOpen, setLinkSearchOpen] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [linkSearchIndex, setLinkSearchIndex] = useState(0);
  const linkSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Поиск свободного места на уровне (newParentId) рядом с базовой точкой
  const findFreeSpot = useCallback((baseX: number, baseY: number, w: number, h: number, newParentId: string | null): { x: number; y: number } => {
    const atLevel = nodes.filter((n) => n.parentId === newParentId);
    const collides = (x: number, y: number) => atLevel.some((n) => rectsIntersect(x, y, w, h, n.x, n.y, n.width, n.height));
    // компактная спираль вокруг базовой точки
    const step = 16;
    let ring = 0;
    const maxRings = 10; // ~160px от базовой точки
    while (ring < maxRings) {
      const span = step * (ring + 1);
      for (let dx = -span; dx <= span; dx += step) {
        for (let dy = -span; dy <= span; dy += step) {
          const x = baseX + dx;
          const y = baseY + dy;
          if (!collides(x, y)) return { x, y };
        }
      }
      ring++;
    }
    // если не нашли рядом — возвращаем базовую точку (лучше близко, даже с пересечением)
    return { x: baseX, y: baseY };
  }, [nodes]);

  // World origin of current level (for nested groups): used to convert world -> local
  const levelOrigin = useMemo(() => {
    if (!currentParentId) return { x: 0, y: 0 };
    const grp = nodes.find((n) => n.id === currentParentId) as GroupNode | undefined;
    if (!grp) return { x: 0, y: 0 };
    let x = grp.x, y = grp.y; let p = grp.parentId; const visited = new Set<string>(); let hops = 0;
    while (p && !visited.has(p) && hops < 1000) { visited.add(p); const g = nodes.find((nn) => nn.id === p) as GroupNode | undefined; if (!g) break; x += g.x; y += g.y; p = g.parentId; hops++; }
    return { x, y };
  }, [currentParentId, nodes]);

  // Автоцентровка по "центру массы" видимых узлов один раз на старте/при входе в группу
  const levelBBox = useMemo(() => {
    if (visibleNodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of visibleNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }, [visibleNodes]);

  // Сброс флага автоцентра ДО вычисления нового центра уровня, чтобы избежать видимого прыжка
  useLayoutEffect(() => {
    didAutoCenter.current = false;
  }, [currentParentId]);

  useLayoutEffect(() => {
    if (!levelBBox) return;
    if (!didAutoCenter.current && !hasSavedStart && !hasStoredLevelView) {
      const s = viewport.scale;
      const nx = width / 2 - (levelOrigin.x + levelBBox.cx) * s;
      const ny = height / 2 - (levelOrigin.y + levelBBox.cy) * s;
      setViewport({ x: nx, y: ny, scale: s });
      didAutoCenter.current = true;
      log.info('autocenter', { level: currentParentId, center: { x: levelBBox.cx, y: levelBBox.cy } });
    }
  }, [levelBBox, levelOrigin.x, levelOrigin.y, viewport.scale, width, height, setViewport, currentParentId, log, hasSavedStart, hasStoredLevelView]);

  // Восстановление стартового центра/масштаба при смене уровня (per-level)
  const lastRestoredLevelRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    try {
      const lk = levelKey;
      if (lastRestoredLevelRef.current === lk) return;
      if (hasStoredLevelView) { lastRestoredLevelRef.current = lk; return; }
      let payload: { x?: number; y?: number; scale?: number } | null | undefined;
      const rawMap = localStorage.getItem('START_VIEW_BY_LEVEL');
      if (rawMap) {
        const map = JSON.parse(rawMap) as Record<string, { x: number; y: number; scale?: number }> | null;
        payload = map ? map[lk] : undefined;
      }
      // Legacy: если корень и нет per-level — пробуем START_VIEW_CENTER
      if ((!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') && lk === '__ROOT__') {
        const rawLegacy = localStorage.getItem('START_VIEW_CENTER');
        if (rawLegacy) payload = JSON.parse(rawLegacy) as { x?: number; y?: number; scale?: number } | null;
      }
      if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
      const s = (typeof payload.scale === 'number' && isFinite(payload.scale) && payload.scale > 0) ? payload.scale : useAppStore.getState().viewport.scale;
      const nx = width / 2 - payload.x * s;
      const ny = height / 2 - payload.y * s;
      setViewport({ x: nx, y: ny, scale: s });
      didAutoCenter.current = true; // подавляем автоцентровку на первый экран
      lastLevelRef.current = currentParentId; // помечаем уровень как инициализированный
      lastRestoredLevelRef.current = lk; // запоминаем, что этот уровень восстановлен
      log.info('startViewCenter:restore', { level: lk, center: { x: payload.x, y: payload.y, scale: s } });
    } catch {}
  }, [levelKey, width, height, setViewport, currentParentId, log, hasStoredLevelView]);

  // Если в группе нет детей — один раз центрируем локальный (0,0) в центр экрана, чтобы не было "пустоты"
  useLayoutEffect(() => {
    if (!currentParentId) return; // на корне не трогаем
    if (visibleNodes.length === 0 && !didAutoCenter.current) {
      const s = viewport.scale;
      const targetX = width / 2 - levelOrigin.x * s;
      const targetY = height / 2 - levelOrigin.y * s;
      if (viewport.x !== targetX || viewport.y !== targetY) {
        setViewport({ x: targetX, y: targetY, scale: s });
      }
      didAutoCenter.current = true;
      log.debug('autocenter:empty-level', { parent: currentParentId });
    }
  }, [currentParentId, visibleNodes.length, levelOrigin.x, levelOrigin.y, width, height, viewport.scale, viewport.x, viewport.y, setViewport, log]);

  // Принудительный редроу Stage при смене уровня/viewport/видимых узлов (фикс пустоты до первого действия)
  useEffect(() => {
    try {
      const s = stageRef.current as unknown as { batchDraw?: () => void } | null;
      s?.batchDraw?.();
    } catch {}
  }, [currentParentId, visibleNodes.length, viewport.x, viewport.y, viewport.scale]);

  const ctxNode = useMemo(() => (ctxMenu ? nodes.find((n) => n.id === ctxMenu.nodeId) : null), [ctxMenu, nodes]);

  // HUD-подсказка рядом с курсором: используется для связей и для узлов
  const [hoverHUD, setHoverHUD] = useState<{ x: number; y: number; text: string } | null>(null);
  // Раньше показывали HUD только в режиме 'link'. По просьбе — включаем всегда.
  const showLinkHud = true;

  // Безрыжковое центрирование: вычисляем целевые x/y для уровня и используем их сразу на первом кадре
  const lastLevelRef = useRef<string | '__INIT__' | null>('__INIT__');
  const desiredViewport = useMemo(() => {
    const s = viewport.scale;
    if (visibleNodes.length > 0 && levelBBox) {
      return { x: width / 2 - (levelOrigin.x + levelBBox.cx) * s, y: height / 2 - (levelOrigin.y + levelBBox.cy) * s };
    }
    return { x: width / 2 - levelOrigin.x * s, y: height / 2 - levelOrigin.y * s };
  }, [levelBBox, levelOrigin.x, levelOrigin.y, visibleNodes.length, width, height, viewport.scale]);
  const isNewLevel = lastLevelRef.current !== currentParentId;
  // Важно: не считаем расхождение с desiredViewport поводом для повторной инициализации,
  // иначе любое пользовательское перетаскивание (pan) будет мгновенно отменяться.
  const initializing = (!hasSavedStart && !hasStoredLevelView) && (isNewLevel || !didAutoCenter.current);
  const stageX = initializing ? desiredViewport.x : viewport.x;
  const stageY = initializing ? desiredViewport.y : viewport.y;
  useLayoutEffect(() => {
    if (lastLevelRef.current !== currentParentId && !hasSavedStart && !hasStoredLevelView) {
      setViewport({ x: desiredViewport.x, y: desiredViewport.y, scale: viewport.scale });
      didAutoCenter.current = true;
      lastLevelRef.current = currentParentId;
    }
  }, [currentParentId, desiredViewport.x, desiredViewport.y, setViewport, viewport.scale, hasSavedStart, hasStoredLevelView]);

  // wheel zoom
  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const stage = stageRef.current!;
    const oldScale = stage.scaleX();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setViewport({ x: newPos.x, y: newPos.y, scale: newScale });
  }, [viewport.x, viewport.y, setViewport]);

  // drag to pan when tool=pan or when space pressed
  const isPanningRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const grp = levelGroupRef.current as unknown as Konva.Node | null;
    const isLayer = (e.target as any)?.getClassName?.() === 'Layer';
    const clickedOnStage = e.target === stage || isLayer || (grp ? e.target === grp : false);
    if (!clickedOnStage) return;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    // Точное преобразование указателя в локальные координаты уровня
    let lx: number, ly: number;
    const grpNode = levelGroupRef.current;
    if (grpNode) {
      const t = grpNode.getAbsoluteTransform().copy();
      t.invert();
      const p = t.point(pointer);
      lx = p.x; ly = p.y;
    } else {
      const sx = stageRef.current ? stageRef.current.x() : viewport.x;
      const sy = stageRef.current ? stageRef.current.y() : viewport.y;
      const sc = stageRef.current ? stageRef.current.scaleX() : viewport.scale;
      const worldX = (pointer.x - sx) / sc;
      const worldY = (pointer.y - sy) / sc;
      lx = worldX - levelOrigin.x;
      ly = worldY - levelOrigin.y;
    }
    // Ctrl/Cmd -> рамочный выбор (локальные координаты уровня)
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const additive = true; // всегда мультивыделение
      setLasso({ x: lx, y: ly, w: 0, h: 0, additive });
      isPanningRef.current = false;
      lastPosRef.current = null;
      return;
    }
    // иначе панорамирование
    isPanningRef.current = true;
    lastPosRef.current = { x: e.evt.clientX, y: e.evt.clientY };
  }, [viewport.x, viewport.y, viewport.scale]);

  const onMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // Обновляем позицию курсора для временной линии связи
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (pointer) {
      let lx: number, ly: number;
      const grp = levelGroupRef.current;
      if (grp) {
        const t = grp.getAbsoluteTransform().copy();
        t.invert();
        const p = t.point(pointer);
        lx = p.x; ly = p.y;
      } else {
        const sx = stageRef.current ? stageRef.current.x() : viewport.x;
        const sy = stageRef.current ? stageRef.current.y() : viewport.y;
        const sc = stageRef.current ? stageRef.current.scaleX() : viewport.scale;
        const worldX = (pointer.x - sx) / sc;
        const worldY = (pointer.y - sy) / sc;
        lx = worldX - levelOrigin.x;
        ly = worldY - levelOrigin.y;
      }
      setMousePos({ x: lx, y: ly });
    }
    
    // lasso
    if (lasso) {
      if (!pointer) return;
      let lx: number, ly: number;
      const grp = levelGroupRef.current;
      if (grp) {
        const t = grp.getAbsoluteTransform().copy();
        t.invert();
        const p = t.point(pointer);
        lx = p.x; ly = p.y;
      } else {
        const sx = stageRef.current ? stageRef.current.x() : viewport.x;
        const sy = stageRef.current ? stageRef.current.y() : viewport.y;
        const sc = stageRef.current ? stageRef.current.scaleX() : viewport.scale;
        const worldX = (pointer.x - sx) / sc;
        const worldY = (pointer.y - sy) / sc;
        lx = worldX - levelOrigin.x;
        ly = worldY - levelOrigin.y;
      }
      setLasso((prev) => (prev ? { ...prev, w: lx - prev.x, h: ly - prev.y } : prev));
      return;
    }
    // pan
    if (!isPanningRef.current) return;
    const last = lastPosRef.current;
    if (!last) return;
    const dx = e.evt.clientX - last.x;
    const dy = e.evt.clientY - last.y;
    lastPosRef.current = { x: e.evt.clientX, y: e.evt.clientY };
    setViewport({ x: viewport.x + dx, y: viewport.y + dy, scale: viewport.scale });
  }, [lasso, viewport, setViewport, levelOrigin.x, levelOrigin.y]);

  const onMouseUp = useCallback(() => {
    if (lasso) {
      // финал lasso — выделяем объекты
      const rx = Math.min(lasso.x, lasso.x + lasso.w);
      const ry = Math.min(lasso.y, lasso.y + lasso.h);
      const rw = Math.abs(lasso.w);
      const rh = Math.abs(lasso.h);
      const idsInRect = visibleNodes
        .filter((n) => rectsIntersect(n.x, n.y, n.width, n.height, rx, ry, rw, rh))
        .map((n) => n.id);
      if (lasso.additive) {
        const next = new Set(selection);
        idsInRect.forEach((id) => next.add(id));
        setSelection(Array.from(next));
      } else {
        setSelection(idsInRect);
      }
      setLasso(null);
      // предотвратить немедленный сброс выделения кликом по Stage после рамочного выбора
      lassoClickGuardRef.current = true;
      return;
    }
    isPanningRef.current = false;
  }, [lasso, visibleNodes, selection, setSelection]);

  // touch for pan/pinch
  const onTouchMove = useCallback((e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches && touches.length >= 2) {
      // pinch-zoom
      const p1 = touches[0];
      const p2 = touches[1];
      const center = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      if (!lastCenter.current) {
        lastCenter.current = center;
        lastDist.current = dist;
        return;
      }
      const newScale = viewport.scale * (dist / lastDist.current);
      const pointTo = {
        x: (center.x - viewport.x) / viewport.scale,
        y: (center.y - viewport.y) / viewport.scale,
      };
      const newPos = {
        x: center.x - pointTo.x * newScale,
        y: center.y - pointTo.y * newScale,
      };
      setViewport({ x: newPos.x, y: newPos.y, scale: newScale });
      lastCenter.current = center;
      lastDist.current = dist;
    } else {
      const touch1 = touches && touches[0];
      if (touch1) {
        // pan
        if (!lastPosRef.current) {
          lastPosRef.current = { x: touch1.clientX, y: touch1.clientY };
          return;
        }
        const dx = touch1.clientX - lastPosRef.current.x;
        const dy = touch1.clientY - lastPosRef.current.y;
        lastPosRef.current = { x: touch1.clientX, y: touch1.clientY };
        setViewport({ x: viewport.x + dx, y: viewport.y + dy, scale: viewport.scale });
      }
    }
  }, [viewport, setViewport]);

  const onTouchEnd = useCallback(() => {
    lastCenter.current = null;
    lastDist.current = 0;
    lastPosRef.current = null;
  }, []);

  // удалены старые обработчики перетаскивания (перенесено ниже в мульти-логике)

  const handleNodeClick = useCallback((id: string, ev?: KonvaEventObject<MouseEvent>) => {
    if (tool !== 'link') {
      const evt = ev?.evt as MouseEvent | undefined;
      const shift = !!(evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey));
      if (shift) {
        const next = new Set<string>(selection);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelection(Array.from(next));
      } else {
        setSelection([id]);
      }
    } else if (tool === 'link') {
      log.info('link:click', { nodeId: id, pendingFrom: pendingLinkFrom });
      if (!pendingLinkFrom) {
        // Первый клик - запоминаем узел-источник
        log.info('link:first-click', { from: id });
        setPendingLinkFrom(id);
        setSelection([id]);
      } else if (pendingLinkFrom === id) {
        // Повторный клик на тот же узел - отменяем выбор
        log.info('link:cancel', { nodeId: id });
        setPendingLinkFrom(null);
        setSelection([]);
      } else {
        // Второй клик на другой узел - создаём связь
        log.info('link:second-click', { from: pendingLinkFrom, to: id });
        void addLink(pendingLinkFrom, id).then((linkId) => {
          if (linkId) {
            log.info('link:created', { linkId, from: pendingLinkFrom, to: id });
            setPendingLinkFrom(null);
            setSelection([]);
            setLinkError(null);
          } else {
            log.warn('link:failed', { from: pendingLinkFrom, to: id, reason: 'duplicate or self-link' });
            setLinkError('Нить уже существует или выбран тот же объект');
            setTimeout(() => setLinkError(null), 3000);
            // Не сбрасываем pendingLinkFrom - пользователь может попробовать другой узел
          }
        });
      }
    } else if (tool === 'add-task' || tool === 'add-group' || tool === 'add-person-employee' || tool === 'add-person-partner' || tool === 'add-person-bot') {
      // ignore clicks in create modes
    }
  }, [tool, pendingLinkFrom, addLink, setSelection, selection, log]);

  const handleNodeDblClick = useCallback((node: AnyNode, ev?: KonvaEventObject<MouseEvent>) => {
    if (node.type === 'group') {
      enterGroup(node.id);
      log.info('group:enter', { id: node.id });
    } else if (node.type === 'task' || node.type === 'person') {
      setEditingNodeId(node.id);
      const ex = (ev as any)?.evt?.clientX;
      const ey = (ev as any)?.evt?.clientY;
      if (typeof ex === 'number' && typeof ey === 'number') setEditorClientPos({ x: ex, y: ey });
      log.info('edit:start', { id: node.id, type: node.type });
    }
  }, [enterGroup, setEditingNodeId, log]);

  // Проекция узла на текущий уровень: если узел глубже — возвращаем ближайшую группу-предка, находящуюся на текущем уровне; если узел вне нашей ветки — null
  const projectToLevel = useCallback((nodeId: string): AnyNode | null => {
    const n0 = nodes.find((n) => n.id === nodeId);
    if (!n0) return null;
    if (n0.parentId === currentParentId) return n0; // уже на уровне
    // если это группа, возможно сама группа лежит на уровне как дочерняя следующей группы
    let p = n0.parentId;
    const visited = new Set<string>();
    let hops = 0;
    while (p && !visited.has(p) && hops < 1000) {
      visited.add(p);
      const g = nodes.find((nn) => nn.id === p && nn.type === 'group') as GroupNode | undefined;
      if (!g) break;
      if (g.parentId === currentParentId) return g; // ближайшая группа на уровне
      p = g.parentId;
      hops++;
    }
    return null;
  }, [nodes, currentParentId]);

  // Ссылки, отрисованные на текущем уровне (сквозные связи поднимаются до группы)
  // ОПТИМИЗАЦИЯ: кэшируем проекции узлов, чтобы не вызывать projectToLevel в цикле
  const nodeProjections = useMemo(() => {
    const cache = new Map<string, AnyNode | null>();
    const allNodeIds = new Set(nodes.map(n => n.id));
    // Предвычисляем проекции только для узлов, участвующих в связях
    const relevantIds = new Set<string>();
    links.forEach(l => { relevantIds.add(l.fromId); relevantIds.add(l.toId); });
    relevantIds.forEach(id => {
      if (allNodeIds.has(id)) cache.set(id, projectToLevel(id));
    });
    return cache;
  }, [nodes, links, currentParentId, projectToLevel]);

  const renderedLinks = useMemo(() => {
    const list: Array<{ base: typeof links[number]; from: AnyNode; to: AnyNode }> = [];
    links.forEach((l) => {
      const fromProj = nodeProjections.get(l.fromId);
      const toProj = nodeProjections.get(l.toId);
      if (fromProj && toProj && fromProj.id !== toProj.id) {
        list.push({ base: l, from: fromProj, to: toProj });
      }
    });
    return list;
  }, [links, nodeProjections]);

  // Результаты поиска узла-назначения при создании связи
  const linkSearchResults = useMemo(() => {
    if (!linkSearchOpen) return [] as AnyNode[];
    const q = linkSearchTerm.trim().toLowerCase();
    const arr = nodes.filter((n) => n.id !== pendingLinkFrom).filter((n) => {
      if (!q) return true;
      const label = nodeDisplayName(n).toLowerCase();
      return label.includes(q);
    });
    return arr.slice(0, 200);
  }, [linkSearchOpen, linkSearchTerm, nodes, pendingLinkFrom]);

  const chooseLinkTarget = useCallback((targetId: string) => {
    const from = pendingLinkFrom;
    if (!from || from === targetId) {
      setLinkSearchOpen(false);
      return;
    }
    void addLink(from, targetId);
    setPendingLinkFrom(null);
    setSelection([]);
    setLinkSearchOpen(false);
    setLinkSearchTerm('');
  }, [pendingLinkFrom, addLink, setSelection]);

  // Фокус в поле поиска, когда открываем палитру
  useEffect(() => {
    if (linkSearchOpen) {
      setTimeout(() => { linkSearchInputRef.current?.focus(); }, 0);
      setLinkSearchIndex(0);
    }
  }, [linkSearchOpen]);

  // Performance mode: упрощаем отрисовку при больших графах или сильном отдалении
  const basePerf = useMemo(() => (
    visibleNodes.length > 300 || links.length > 600 || viewport.scale < 0.35
  ), [visibleNodes.length, links.length, viewport.scale]);
  const baseSuper = useMemo(() => (
    visibleNodes.length > 800 || links.length > 1600 || viewport.scale < 0.2
  ), [visibleNodes.length, links.length, viewport.scale]);
  const { perfMode, superPerfMode } = useMemo(() => {
    if (perfModeOverride === 'perf') return { perfMode: true, superPerfMode: false };
    if (perfModeOverride === 'super') return { perfMode: true, superPerfMode: true };
    return { perfMode: basePerf, superPerfMode: baseSuper };
  }, [perfModeOverride, basePerf, baseSuper]);
  const linksToRender = useMemo(() => {
    if (superPerfMode) return renderedLinks.slice(0, 600);
    if (perfMode) return renderedLinks.slice(0, 2000);
    return renderedLinks;
  }, [renderedLinks, perfMode, superPerfMode]);

  useEffect(() => {
    if (!diag) return;
    log.info('perf:mode', { perfMode, superPerfMode, nodes: visibleNodes.length, linksTotal: links.length, scale: Number(viewport.scale.toFixed(3)), renderLinks: linksToRender.length });
  }, [perfMode, superPerfMode, visibleNodes.length, links.length, viewport.scale, linksToRender.length, diag, log]);

  // ОПТИМИЗАЦИЯ: убран избыточный лог visible:update

  // Мультиперетаскивание: запоминаем стартовые позиции выбранных узлов
  const dragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragHistorySavedRef = useRef<boolean>(false);
  const handleNodeDragStart = useCallback((nodeId: string) => {
    // ОПТИМИЗАЦИЯ: сохраняем в history один раз при начале перетаскивания
    if (!dragHistorySavedRef.current) {
      const s0 = useAppStore.getState();
      useAppStore.setState((s) => ({ 
        historyPast: [...s.historyPast, { 
          nodes: s0.nodes, 
          links: s0.links, 
          viewport: s0.viewport, 
          currentParentId: s0.currentParentId 
        }], 
        historyFuture: [] 
      }));
      dragHistorySavedRef.current = true;
    }
    const ids = selection.includes(nodeId) ? selection : [nodeId];
    const map = new Map<string, { x: number; y: number }>();
    ids.forEach((id) => {
      const n = nodes.find((nn) => nn.id === id);
      if (n) map.set(id, { x: n.x, y: n.y });
    });
    dragStartRef.current = map;
  }, [selection, nodes]);

  // ОПТИМИЗАЦИЯ: НЕ обновляем store во время drag - только Konva
  const nodeRefsMap = useRef<Map<string, any>>(new Map());
  const handleNodeDragMove = useCallback((nodeId: string, e: KonvaEventObject<DragEvent>) => {
    const base = dragStartRef.current.get(nodeId);
    const t = e.target;
    if (!base || dragStartRef.current.size <= 1) {
      // одиночный drag - Konva сам управляет позицией
      return;
    }
    // мульти-drag: двигаем другие узлы напрямую через Konva refs
    const dx = t.x() - base.x;
    const dy = t.y() - base.y;
    dragStartRef.current.forEach((pos, id) => {
      if (id === nodeId) return; // лидер двигается сам
      const ref = nodeRefsMap.current.get(id);
      if (ref) {
        ref.x(pos.x + dx);
        ref.y(pos.y + dy);
      }
    });
  }, []);

  // Вспомогательная функция репарентинга одного узла с правилами
  const reparentOne = useCallback(async (nodeObj: AnyNode, newX: number, newY: number, forcedGroup?: GroupNode | null) => {
    const all = useAppStore.getState().nodes;
    const parentId = useAppStore.getState().currentParentId;
    const isGroupNode = nodeObj.type === 'group';
    const cx = newX + nodeObj.width / 2;
    const cy = newY + nodeObj.height / 2;
    const isDescendant = (candidateId: string, possibleAncestorId: string): boolean => {
      let p = (all.find((n) => n.id === candidateId) as AnyNode | undefined)?.parentId;
      const visited = new Set<string>();
      let hops = 0;
      while (p && !visited.has(p) && hops < 1000) {
        if (p === possibleAncestorId) return true;
        visited.add(p);
        const next = (all.find((n) => n.id === p) as AnyNode | undefined)?.parentId || null;
        p = next;
        hops++;
      }
      return false;
    };

    // определяем целевую группу на уровне (либо принудительную)
    const levelGroups = all.filter((n): n is GroupNode => n.type === 'group' && n.parentId === parentId);
    const insideGroup = forcedGroup || levelGroups.find((g) => {
      const r = Math.min(g.width, g.height) / 2;
      const gx = g.x + r;
      const gy = g.y + r;
      const d = Math.hypot(cx - gx, cy - gy);
      return d <= r;
    }) || null;

    if (insideGroup && nodeObj.parentId !== insideGroup.id) {
      if (isGroupNode) return; // не репарентим группы перетаскиванием, чтобы не "исчезали"
      if (isDescendant(insideGroup.id, nodeObj.id)) return; // не допускаем циклы для прочих
      // Ставим узел поближе к месту дропа внутри группы: к исходной точке, но с учётом отступа и занятости
      const margin = 12;
      let candX = newX - insideGroup.x;
      let candY = newY - insideGroup.y;
      candX = Math.max(margin, Math.min(insideGroup.width - nodeObj.width - margin, candX));
      candY = Math.max(margin, Math.min(insideGroup.height - nodeObj.height - margin, candY));
      const spot = findFreeSpot(candX, candY, nodeObj.width, nodeObj.height, insideGroup.id);
      const clampX = Math.max(margin, Math.min(insideGroup.width - nodeObj.width - margin, spot.x));
      const clampY = Math.max(margin, Math.min(insideGroup.height - nodeObj.height - margin, spot.y));
      await useAppStore.getState().updateNode(nodeObj.id, { parentId: insideGroup.id, x: clampX, y: clampY });
      log.info('reparent:into-group', { node: nodeObj.id, group: insideGroup.id });
      return;
    }

    // авто-вынос из группы на уровень выше: только для НЕ-групп и с порогом
    // и только если мы НЕ на уровне этой группы (иначе внутри группы узлы не должны "исчезать")
    const isChildOfGroup = !!nodeObj.parentId && !!all.find((n) => n.id === nodeObj.parentId && n.type === 'group');
    if (!isGroupNode && isChildOfGroup && nodeObj.parentId !== parentId) {
      const g = all.find((n) => n.id === nodeObj.parentId) as GroupNode | undefined;
      if (g) {
        const r = Math.min(g.width, g.height) / 2;
        const halfW = nodeObj.width / 2;
        const halfH = nodeObj.height / 2;
        const margin = 16;
        // Текущий уровень — это уровень группы?
        if (parentId === g.id) {
          // Мы ВНУТРИ группы: cx,cy заданы в локальных координатах группы.
          const dLocal = Math.hypot(cx - r, cy - r);
          const thresholdLocal = r + Math.max(halfW, halfH) * 0.35;
          if (dLocal > thresholdLocal) {
            const angle = Math.atan2(cy - r, cx - r);
            const gxParent = g.x + r;
            const gyParent = g.y + r;
            const outCx = gxParent + Math.cos(angle) * (r + margin + halfW);
            const outCy = gyParent + Math.sin(angle) * (r + margin + halfH);
            const baseX = outCx - halfW;
            const baseY = outCy - halfH;
            const spot = findFreeSpot(baseX, baseY, nodeObj.width, nodeObj.height, g.parentId);
            await useAppStore.getState().updateNode(nodeObj.id, { parentId: g.parentId, x: spot.x, y: spot.y });
            log.info('reparent:out-of-group', { node: nodeObj.id, from: g.id, to: g.parentId });
          }
        } else {
          // Мы на уровне родителя группы: cx,cy уже в координатах родителя.
          const gxParent = g.x + r;
          const gyParent = g.y + r;
          const dParent = Math.hypot(cx - gxParent, cy - gyParent);
          const thresholdParent = r + Math.max(halfW, halfH) * 0.35;
          if (dParent > thresholdParent) {
            const angle = Math.atan2(cy - gyParent, cx - gxParent);
            const outCx = gxParent + Math.cos(angle) * (r + margin + halfW);
            const outCy = gyParent + Math.sin(angle) * (r + margin + halfH);
            const baseX = outCx - halfW;
            const baseY = outCy - halfH;
            const spot = findFreeSpot(baseX, baseY, nodeObj.width, nodeObj.height, g.parentId);
            await useAppStore.getState().updateNode(nodeObj.id, { parentId: g.parentId, x: spot.x, y: spot.y });
            log.info('reparent:out-of-group', { node: nodeObj.id, from: g.id, to: g.parentId });
          }
        }
      }
    }
  }, [log]);

  const handleNodeDragEnd = useCallback((node: AnyNode, e: KonvaEventObject<DragEvent>) => {
    const t = e.target; const newX = t.x(); const newY = t.y();
    const base = dragStartRef.current.get(node.id);
    // Определяем целевую группу по лидеру
    const all = useAppStore.getState().nodes;
    const parentId = useAppStore.getState().currentParentId;
    const cx = newX + node.width / 2; const cy = newY + node.height / 2;
    const levelGroups = all.filter((n): n is GroupNode => n.type === 'group' && n.parentId === parentId);
    const leaderInside = levelGroups.find((g) => {
      const r = Math.min(g.width, g.height) / 2; const gx = g.x + r; const gy = g.y + r; return Math.hypot(cx - gx, cy - gy) <= r;
    }) || null;

    if (!base || dragStartRef.current.size <= 1) {
      // одиночный перетаск
      void moveNode(node.id, newX, newY).then(async () => { await reparentOne(node, newX, newY, leaderInside); });
      dragStartRef.current.clear();
      dragHistorySavedRef.current = false;
      return;
    }
    // мультиперетаск: двигаем все по относительному смещению лидера
    const dx = newX - base.x; const dy = newY - base.y;
    const ids = Array.from(dragStartRef.current.keys());
    // Сначала фиксируем новые позиции
    Promise.all(ids.map(async (id) => {
      const pos = dragStartRef.current.get(id)!;
      await moveNode(id, pos.x + dx, pos.y + dy);
    })).then(async () => {
      // затем репарентим: если лидер вошёл в группу — всем одну группу
      for (const id of ids) {
        const n = useAppStore.getState().nodes.find((nn) => nn.id === id);
        if (!n) continue;
        const pos = dragStartRef.current.get(id)!;
        const nx = pos.x + dx, ny = pos.y + dy;
        await reparentOne(n as AnyNode, nx, ny, leaderInside);
      }
      dragStartRef.current.clear();
      dragHistorySavedRef.current = false;
    });
  }, [moveNode, reparentOne]);

  // Keyboard shortcuts: F/А — тумблер режима связей, T/Е G/П E/У R/К B/И — инструменты добавления
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;
      if (editingNodeId) return;
      const keyLower = e.key.toLowerCase(); // поддержка русской раскладки
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selection.length === 0 && linkSelection.length === 0) return;
        const ok = window.confirm('Удалить выбранное?');
        if (!ok) return;
        void deleteSelection();
      } else if ((e.metaKey || e.ctrlKey) && (keyLower === 'z' || keyLower === 'я')) {
        e.preventDefault();
        if (e.shiftKey) {
          void redo();
        } else {
          void undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && (keyLower === 'y' || keyLower === 'н')) {
        e.preventDefault();
        void redo();
      } else if (e.key === 'Escape') {
        setSelection([]);
        setLinkSelection([]);
        setEditingNodeId(null);
        setCtxMenu(null);
        setLinkCtxMenu(null);
        setLinkSearchOpen(false);
      } else if (keyLower === 'f' || keyLower === 'а') {
        const now = useAppStore.getState().tool;
        const next = now === 'link' ? 'none' : 'link';
        setTool(next);
        if (next !== 'link') setPendingLinkFrom(null);
      } else if (tool === 'link' && pendingLinkFrom && (keyLower === 'a' || keyLower === 'ф')) {
        // Открыть палитру выбора целевого узла
        e.preventDefault();
        setLinkSearchOpen(true);
        setLinkSearchTerm('');
      } else {
        // Добавление: T/G/E/R/B и русские аналоги Е/П/У/К/И — тумблер инструментов
        const mapRU: Record<string, typeof tool> = {
          't': 'add-task', 'е': 'add-task', // T -> русская Е
          'g': 'add-group', 'п': 'add-group', // G -> русская П
          'e': 'add-person-employee', 'у': 'add-person-employee', // E -> русская У
          'r': 'add-person-partner', 'к': 'add-person-partner', // R -> русская К
          'b': 'add-person-bot', 'и': 'add-person-bot', // B -> русская И
        } as const;
        if (keyLower in mapRU) {
          const desired = mapRU[keyLower];
          const now = useAppStore.getState().tool;
          const next = now === desired ? 'none' : desired;
          setTool(next);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [deleteSelection, setSelection, setLinkSelection, setEditingNodeId, editingNodeId, selection.length, linkSelection.length, undo, redo, setTool, log, tool, pendingLinkFrom]);

  // Инициализация позиций контекстных меню при открытии — умное размещение относительно квадранта курсора
  useEffect(() => {
    if (ctxMenu) {
      const pad = 8; const menuW = 360; const menuH = 240;
      const onLeftHalf = ctxMenu.x < window.innerWidth / 2;
      const onTopHalf = ctxMenu.y < window.innerHeight / 2;
      const offsetX = onLeftHalf ? 12 : -menuW - 12; // слева — рисуем справа; справа — слева
      const offsetY = onTopHalf ? 12 : -menuH - 12; // сверху — рисуем снизу; снизу — сверху
      const rawX = ctxMenu.x + offsetX;
      const rawY = ctxMenu.y + offsetY;
      const x = Math.max(pad, Math.min(rawX, window.innerWidth - pad - menuW));
      const y = Math.max(pad, Math.min(rawY, window.innerHeight - pad - menuH));
      setCtxMenuPos({ x, y });
    } else {
      setCtxMenuPos(null);
    }
  }, [ctxMenu]);
  // Сбрасываем панель повтора при смене узла/меню
  useEffect(() => {
    setCtxRecOpen(false);
  }, [ctxMenu?.nodeId]);
  useEffect(() => {
    if (linkCtxMenu) {
      const pad = 8; const menuW = 320; const menuH = 200;
      const onLeftHalf = linkCtxMenu.x < window.innerWidth / 2;
      const onTopHalf = linkCtxMenu.y < window.innerHeight / 2;
      const offsetX = onLeftHalf ? 12 : -menuW - 12;
      const offsetY = onTopHalf ? 12 : -menuH - 12;
      const rawX = linkCtxMenu.x + offsetX;
      const rawY = linkCtxMenu.y + offsetY;
      const x = Math.max(pad, Math.min(rawX, window.innerWidth - pad - menuW));
      const y = Math.max(pad, Math.min(rawY, window.innerHeight - pad - menuH));
      setLinkCtxMenuPos({ x, y });
    } else {
      setLinkCtxMenuPos(null);
    }
  }, [linkCtxMenu]);

  // Глобальные обработчики перетаскивания меню
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = draggingMenuRef.current; if (!d) return;
      const x = e.clientX - d.dx; const y = e.clientY - d.dy;
      const menuW = d.kind === 'ctx' ? 360 : 320;
      const menuH = d.kind === 'ctx' ? 240 : 200;
      const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuW));
      const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuH));
      if (d.kind === 'ctx') setCtxMenuPos({ x: clampedX, y: clampedY });
      else setLinkCtxMenuPos({ x: clampedX, y: clampedY });
    };
    const onUp = () => { draggingMenuRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Обновление индекса выделения в результатах поиска при изменении списка
  useEffect(() => {
    if (!linkSearchOpen) return;
    // Сбрасываем или ограничиваем индекс
    const max = Math.max(0, linkSearchResults.length - 1);
    setLinkSearchIndex((i) => Math.min(Math.max(0, i), max));
  }, [linkSearchOpen, linkSearchResults.length]);

  // Inline editor overlay
  const editingNode = useMemo(() => nodes.find((n) => n.id === editingNodeId), [nodes, editingNodeId]);
  const [editValue, setEditValue] = useState('');
  const [editorClientPos, setEditorClientPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (editingNode) {
      if (editingNode.type === 'task') {
        const t = editingNode as TaskNode;
        const combined = t.description ? `${t.title}\n\n${t.description}` : t.title;
        setEditValue(combined);
      } else {
        setEditValue((editingNode as PersonNode).name);
      }
    } else {
      setEditValue('');
    }
  }, [editingNode]);

  const commitEdit = useCallback(async () => {
    if (!editingNode) return;
    if (editingNode.type === 'task') {
      // Разбиваем текст: до первой пустой строки — заголовок; остальное — описание
      const parts = editValue.replace(/\r\n/g, '\n').split(/\n\n+/);
      const title = parts[0] ?? '';
      const description = parts.slice(1).join('\n\n') || undefined;
      await useAppStore.getState().updateNode(editingNode.id, { title, description });
    } else if (editingNode.type === 'person') {
      await useAppStore.getState().updateNode(editingNode.id, { name: editValue });
    }
    setEditingNodeId(null);
    log.info('edit:commit', { id: editingNode.id });
  }, [editingNode, editValue, setEditingNodeId, log]);

  const editorStyle = useMemo(() => {
    if (!editingNode) return undefined;
    // Если известна позиция курсора при двойном клике — используем её
    if (editorClientPos) {
      const w = Math.max(80, Math.min(600, editingNode.width * viewport.scale - 24));
      return {
        position: 'fixed' as const,
        left: `${editorClientPos.x + 8}px`,
        top: `${editorClientPos.y + 8}px`,
        width: `${w}px`,
        zIndex: 1000,
      };
    }
    // иначе — позиционируем по мировым координатам узла, учитывая всех предков-групп
    let baseX = editingNode.x;
    let baseY = editingNode.y;
    if (editingNode.parentId) {
      const visited = new Set<string>();
      let p: string | null | undefined = editingNode.parentId;
      let hops = 0;
      while (p && !visited.has(p) && hops < 1000) {
        visited.add(p);
        const pg = nodes.find((n) => n.id === p && n.type === 'group') as GroupNode | undefined;
        if (!pg) break;
        baseX += pg.x;
        baseY += pg.y;
        p = pg.parentId ?? null;
        hops++;
      }
    }
    const screenX = baseX * viewport.scale + viewport.x + 12;
    const screenY = baseY * viewport.scale + viewport.y + 8;
    const w = Math.max(80, Math.min(600, editingNode.width * viewport.scale - 24));
    return {
      position: 'fixed' as const,
      left: `${screenX}px`,
      top: `${screenY}px`,
      width: `${w}px`,
      zIndex: 1000,
    };
  }, [editingNode, viewport, nodes, editorClientPos]);

  // Сбрасываем позицию редактора при закрытии
  useEffect(() => {
    if (!editingNode) setEditorClientPos(null);
  }, [editingNode]);

  return (
    <div className="board-canvas" style={{ position: 'fixed', inset: 0 }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={stageX}
        y={stageY}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ background: 'var(--paper-bg)' }}
        onClick={(e) => {
          // Create nodes on empty space click in creation tools
          const stage = e.target.getStage();
          if (!stage) return;
          const clickedOnEmpty = e.target === stage;
          if (!clickedOnEmpty) return;
          if (tool === 'none') {
            if (lassoClickGuardRef.current) { lassoClickGuardRef.current = false; return; }
            setSelection([]);
            setCtxMenu(null);
            if (lasso) return; // не сбрасываем при рамочном
            return;
          }
          const isAddPerson = tool === 'add-person-employee' || tool === 'add-person-partner' || tool === 'add-person-bot';
          if (tool === 'add-task' || tool === 'add-group' || isAddPerson) {
            (async () => {
              const pointer = stage.getPointerPosition();
              if (!pointer) return;
              // Локальные координаты уровня через абсолютный трансформ группы
              let lx: number, ly: number;
              const grp = levelGroupRef.current;
              if (grp) {
                const t = grp.getAbsoluteTransform().copy();
                t.invert();
                const p = t.point(pointer);
                lx = p.x; ly = p.y;
              } else {
                const sx = stageRef.current ? stageRef.current.x() : viewport.x;
                const sy = stageRef.current ? stageRef.current.y() : viewport.y;
                const sc = stageRef.current ? stageRef.current.scaleX() : viewport.scale;
                const worldX = (pointer.x - sx) / sc;
                const worldY = (pointer.y - sy) / sc;
                lx = worldX - levelOrigin.x;
                ly = worldY - levelOrigin.y;
              }
              if (tool === 'add-task') {
                const id = await addTask({ x: lx, y: ly });
                setSelection([id]);
              } else if (tool === 'add-group') {
                const id = await addGroup('Группа', { x: lx, y: ly });
                setSelection([id]);
              } else if (isAddPerson) {
                const role = tool === 'add-person-partner' ? 'partner' : tool === 'add-person-bot' ? 'bot' : 'employee';
                const name = role === 'partner' ? 'Партнер' : role === 'bot' ? 'Бот' : 'Сотрудник';
                const id = await addPerson(name, role, { x: lx, y: ly });
                setSelection([id]);
              }
              // one-shot tool: выключаем после создания
              setTool('none');
            })();
          }
        }}
      >
        <Layer listening={!superPerfMode} hitGraphEnabled={!superPerfMode}>
          <KonvaGroup ref={levelGroupRef} x={levelOrigin.x} y={levelOrigin.y}>
            {/* Lasso rectangle */}
            {lasso ? (
              <Rect
                x={Math.min(lasso.x, lasso.x + lasso.w)}
                y={Math.min(lasso.y, lasso.y + lasso.h)}
                width={Math.abs(lasso.w)}
                height={Math.abs(lasso.h)}
                fill={"rgba(80,120,255,0.12)"}
                stroke={"rgba(80,120,255,0.8)"}
                strokeWidth={1}
                dash={[6, 4]}
              />
            ) : null}
            {/* Temporary link line from first node to cursor */}
            {pendingLinkFrom && mousePos && (() => {
              const fromNode = visibleNodes.find(n => n.id === pendingLinkFrom);
              if (!fromNode) return null;
              const anchor = computeAnchorTowardsPoint(fromNode, mousePos);
              return (
                <Arrow
                  points={[anchor.x, anchor.y, mousePos.x, mousePos.y]}
                  stroke={'#FFD700'}
                  strokeWidth={3}
                  dash={[10, 5]}
                  pointerLength={0}
                  pointerWidth={0}
                  perfectDrawEnabled={false}
                  listening={false}
                />
              );
            })()}
            {linksToRender.map(({ base: l, from, to }) => {
            const a = computeAnchorTowards(from, to);
            const b = computeAnchorTowards(to, from);
            const useBezier = !perfMode;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - 30;
            const hasReverse = links.some((r) => r.fromId === l.toId && r.toId === l.fromId);
            const stroke = l.color || '#C94545';
            return (
              <React.Fragment key={`rl-${l.id}`}>
                <Arrow
                  points={useBezier ? [a.x, a.y, mx, my, b.x, b.y] : [a.x, a.y, b.x, b.y]}
                  stroke={stroke}
                  strokeWidth={linkSelection.includes(l.id) ? 4 : 2}
                  tension={useBezier ? 0.5 : 0}
                  bezier={useBezier}
                  pointerLength={18}
                  pointerWidth={18}
                  fill={stroke}
                  pointerAtBeginning={(l.dir || 'one') === 'both' || hasReverse}
                  hitStrokeWidth={40}
                  perfectDrawEnabled={false}
                  shadowColor={perfMode ? undefined : '#00000080'}
                  shadowBlur={perfMode ? 0 : (linkSelection.includes(l.id) ? 10 : 6)}
                  onMouseEnter={(ev) => {
                    setHoveredLink(l.id);
                    if (showLinkHud) setHoverHUD({ x: ev.evt.clientX, y: ev.evt.clientY, text: `${nodeDisplayName(from)} ${(l.dir==='both'||hasReverse)?'↔':'→'} ${nodeDisplayName(to)}` });
                  }}
                  onMouseMove={(ev) => {
                    if (showLinkHud && hoveredLink === l.id) setHoverHUD({ x: ev.evt.clientX, y: ev.evt.clientY, text: `${nodeDisplayName(from)} ${(l.dir==='both'||hasReverse)?'↔':'→'} ${nodeDisplayName(to)}` });
                  }}
                  onMouseLeave={() => { setHoveredLink((p) => (p === l.id ? null : p)); setHoverHUD(null); }}
                  onClick={(ev) => {
                    const evt = ev.evt as MouseEvent;
                    if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
                      const next = new Set<string>(linkSelection);
                      if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                      setLinkSelection(Array.from(next));
                    } else {
                      setLinkSelection([l.id]);
                    }
                  }}
                  onContextMenu={(ev) => {
                    ev.evt.preventDefault();
                    setLinkSelection([l.id]);
                    setLinkCtxMenu({ x: ev.evt.clientX, y: ev.evt.clientY, linkId: l.id });
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* кросс-уровневые связи: штрихи с подписями */}
          {(() => {
            if (superPerfMode) return null; // в супермоде не рисуем стабы, чтобы не нагружать
            const idSet = new Set(visibleNodes.map((n) => n.id));
            const findNode = (id: string) => nodes.find((n) => n.id === id);
            const parentWorld = (() => {
              if (!currentParentId) return { x: 0, y: 0 };
              const grp = nodes.find((n) => n.id === currentParentId) as GroupNode | undefined;
              if (!grp) return { x: 0, y: 0 };
              const getWorld = (n: AnyNode): { x: number; y: number } => {
                let x = n.x, y = n.y; let p = n.parentId;
                const visited = new Set<string>(); let hops = 0;
                while (p && !visited.has(p) && hops < 1000) {
                  visited.add(p);
                  const pg = nodes.find((nn) => nn.id === p) as GroupNode | undefined; if (!pg) break;
                  x += pg.x; y += pg.y; p = pg.parentId; hops++;
                }
                return { x, y };
              };
              return getWorld(grp);
            })();
            const getWorldCenter = (n: AnyNode) => {
              let x = n.x, y = n.y; let p = n.parentId;
              const visited = new Set<string>(); let hops = 0;
              while (p && !visited.has(p) && hops < 1000) { const pg = nodes.find((nn) => nn.id === p) as GroupNode | undefined; if (!pg) break; visited.add(p); x += pg.x; y += pg.y; p = pg.parentId; hops++; }
              return { x: x + n.width / 2, y: y + n.height / 2 };
            };
            const toLocal = (w: { x: number; y: number }) => ({ x: w.x - parentWorld.x, y: w.y - parentWorld.y });
            const t0 = performance.now();
            const list: React.ReactNode[] = [];
            links.forEach((l) => {
              const a = findNode(l.fromId); const b = findNode(l.toId);
              if (!a || !b) return;
              const aVisible = idSet.has(a.id); const bVisible = idSet.has(b.id);
              // Если обе стороны проецируются на текущий уровень — отрисовано как стрелка выше
              const aProj = projectToLevel(a.id);
              const bProj = projectToLevel(b.id);
              if (aProj && bProj) return;
              if (!aVisible && !bVisible) return; // не относимся к текущему уровню
              const visibleNode = aVisible ? a : b;
              const hiddenNode = aVisible ? b : a;
              // обе точки в координатах текущего уровня
              const vWorld = getWorldCenter(visibleNode);
              const vLocal = toLocal(vWorld);
              const hWorld = getWorldCenter(hiddenNode);
              const hLocal = toLocal(hWorld);
              // направляющий вектор
              const dx = hLocal.x - vLocal.x; const dy = hLocal.y - vLocal.y; const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len;
              // якорим старт по границе видимого узла в сторону скрытого
              const start = computeAnchorTowardsPoint(visibleNode, hLocal);
              const ex = start.x + ux * 60; const ey = start.y + uy * 60; // 60px штрих
              list.push(
                <React.Fragment key={`stub-${l.id}`}>
                  {/* стрелочка усеченная: направление с учетом ориентации */}
                  {(() => {
                    const dir = l.dir || 'one';
                    const points = (() => {
                      if (dir === 'both') return [start.x, start.y, ex, ey];
                      // если from виден, рисуем от видимого наружу; иначе — к видимому внутрь
                      return aVisible ? [start.x, start.y, ex, ey] : [ex, ey, start.x, start.y];
                    })();
                    return (
                      <Arrow points={points} stroke={l.color || '#C94545'} fill={l.color || '#C94545'} strokeWidth={2} dash={[8, 6]} pointerLength={14} pointerWidth={14}
                        perfectDrawEnabled={false}
                        shadowColor={perfMode ? undefined : '#00000080'} shadowBlur={perfMode ? 0 : 6}
                        hitStrokeWidth={40}
                        onMouseEnter={(ev) => {
                          setHoveredStub(l.id);
                          if (showLinkHud) {
                            const arrow = (l.dir || 'one') === 'both' ? '↔' : '→';
                            setHoverHUD({ x: ev.evt.clientX, y: ev.evt.clientY, text: `${nodeDisplayName(a)} ${arrow} ${nodeDisplayName(b)}` });
                          }
                        }}
                        onMouseMove={(ev) => {
                          if (showLinkHud && hoveredStub === l.id) {
                            const arrow = (l.dir || 'one') === 'both' ? '↔' : '→';
                            setHoverHUD({ x: ev.evt.clientX, y: ev.evt.clientY, text: `${nodeDisplayName(a)} ${arrow} ${nodeDisplayName(b)}` });
                          }
                        }}
                        onMouseLeave={() => { setHoveredStub((p) => (p === l.id ? null : p)); setHoverHUD(null); }} />
                    );
                  })()}
                </React.Fragment>
              );
            });
            const dt = performance.now() - t0;
            if (dt > 20 && diag) log.warn('perf:stubs:slow', { ms: Math.round(dt), links: links.length, stubs: list.length });
            return list;
          })()}

          {visibleNodes.map((n) => (
            <NodeShape
              key={n.id}
              node={n}
              selected={selectionSet.has(n.id)}
              onDragStart={() => handleNodeDragStart(n.id)}
              onDragMove={(e) => handleNodeDragMove(n.id, e)}
              onDragEnd={(e) => handleNodeDragEnd(n, e)}
              onClick={(e) => { handleNodeClick(n.id, e); }}
              onDblClick={(e) => handleNodeDblClick(n, e as unknown as KonvaEventObject<MouseEvent>)}
              onContextMenu={(e) => {
                e.evt.preventDefault();
                setSelection([n.id]);
                setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, nodeId: n.id });
              }}
              onHoverEnter={(ev) => {
                const label = n.type === 'task' ? (n as TaskNode).title : n.type === 'person' ? (n as PersonNode).name : (n as GroupNode).name;
                setHoverHUD({ x: ev.evt.clientX, y: ev.evt.clientY, text: label || '' });
              }}
              onHoverMove={(ev) => {
                setHoverHUD((prev) => (prev ? { ...prev, x: ev.evt.clientX, y: ev.evt.clientY } : prev));
              }}
              onHoverLeave={() => setHoverHUD((prev) => (prev ? null : prev))}
              onRefReady={(ref) => { if (ref) nodeRefsMap.current.set(n.id, ref); }}
            />
          ))}
          </KonvaGroup>
        </Layer>
      </Stage>
      {linkSearchOpen ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2000, display: 'grid', placeItems: 'center' }}
          onClick={() => setLinkSearchOpen(false)}
        >
          <div
            style={{ width: 'min(720px, 96vw)', maxHeight: '80vh', background: '#1f1f1f', color: '#fff', padding: 12, borderRadius: 8, boxShadow: '0 10px 36px rgba(0,0,0,0.45)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ opacity: 0.8 }}>Куда связать:</span>
              <input
                ref={linkSearchInputRef}
                value={linkSearchTerm}
                onChange={(e) => { setLinkSearchTerm(e.target.value); setLinkSearchIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setLinkSearchIndex((i) => Math.min(i + 1, Math.max(0, linkSearchResults.length - 1))); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setLinkSearchIndex((i) => Math.max(i - 1, 0)); }
                  else if (e.key === 'Enter') { const item = linkSearchResults[linkSearchIndex]; if (item) chooseLinkTarget(item.id); }
                  else if (e.key === 'Escape') { setLinkSearchOpen(false); }
                }}
                placeholder="Введите название..."
                style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #3a3a3a', background: '#2a2a2a', color: '#fff' }}
              />
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', borderTop: '1px solid #333' }}>
              {linkSearchResults.length === 0 ? (
                <div style={{ padding: 10, color: '#bbb' }}>Ничего не найдено</div>
              ) : (
                linkSearchResults.map((n, idx) => {
                  const label = nodeDisplayName(n);
                  const type = n.type === 'task' ? 'Задача' : n.type === 'group' ? 'Группа' : 'Человек';
                  const icon = n.type === 'task' ? '📝' : n.type === 'group' ? '🟢' : '👤';
                  const active = idx === linkSearchIndex;
                  return (
                    <div
                      key={n.id}
                      onClick={() => chooseLinkTarget(n.id)}
                      onMouseEnter={() => setLinkSearchIndex(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', background: active ? '#2f2f2f' : 'transparent' }}
                    >
                      <span style={{ width: 20, textAlign: 'center' }}>{icon}</span>
                      <div style={{ display: 'grid' }}>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{label}</div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>{type} • {n.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
      {ctxMenu && ctxNode ? (
        <div
          style={{ position: 'fixed', left: (ctxMenuPos?.x ?? Math.max(8, Math.min(ctxMenu.x, window.innerWidth - 360))), top: (ctxMenuPos?.y ?? Math.max(8, Math.min(ctxMenu.y, window.innerHeight - 16 - 240))), background: '#222', color: '#fff', padding: 8, borderRadius: 6, zIndex: 1001, minWidth: 240, maxHeight: Math.max(240, window.innerHeight - 16), overflowY: 'auto', boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div
            style={{ cursor: 'move', fontWeight: 600, margin: '-4px -4px 6px -4px', padding: '4px 6px', background: '#2a2a2a', borderRadius: 4 }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); const cx = (ctxMenuPos?.x ?? Math.max(8, Math.min(ctxMenu.x, window.innerWidth - 360))); const cy = (ctxMenuPos?.y ?? Math.max(8, Math.min(ctxMenu.y, window.innerHeight - 16 - 240))); draggingMenuRef.current = { kind: 'ctx', dx: e.clientX - cx, dy: e.clientY - cy }; }}
          >
            Настройки
          </div>
          {ctxNode.type === 'task' ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Задача</div>
              <label style={{ display: 'block', marginBottom: 6 }}>Заголовок
                <input style={{ width: '100%' }} value={(ctxNode as TaskNode).title} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { title: e.target.value }); }} placeholder="Название задачи" />
              </label>
              <label style={{ display: 'block', marginBottom: 6 }}>Описание
                <textarea style={{ width: '100%', minHeight: 60 }} value={(ctxNode as TaskNode).description || ''} onChange={(e) => { const v = e.target.value || undefined; void useAppStore.getState().updateNode(ctxNode.id, { description: v }); }} placeholder="Описание (необязательно)" />
              </label>
              <label style={{ display: 'block', marginBottom: 6 }}>Цвет
                <input type="color" style={{ width: '100%' }} value={(ctxNode as TaskNode).color || '#E8D8A6'} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { color: e.target.value }); }} />
              </label>
              <label style={{ display: 'block', marginBottom: 6 }}>Дедлайн
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="YYYY-MM-DD"
                    maxLength={10}
                    style={{ flex: 1 }}
                    className="date-no-icon"
                    value={ctxDueLocal}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCtxDueLocal(v);
                      if (!v) { void useAppStore.getState().updateNode(ctxNode.id, { dueDate: undefined }); return; }
                      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                        void useAppStore.getState().updateNode(ctxNode.id, { dueDate: toIsoUTCFromYMD(v) });
                      }
                    }}
                  />
                  <button
                    title="Повтор"
                    style={{ padding: '6px 8px', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: 4, cursor: 'pointer' }}
                    onClick={() => setCtxRecOpen((v) => !v)}
                  >▾</button>
                </div>
              </label>
              {ctxRecOpen ? (
                <div style={{ margin: '6px 0', padding: 8, border: '1px solid #333', borderRadius: 6, background: '#1f1f1f', color: '#eee' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <button style={{ padding: '4px 8px' }} onClick={() => {
                      const rec = { kind: 'daily' } as const;
                      const next = computeNextDueDate(rec, new Date());
                      void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                    }}>Каждый день</button>
                    <button style={{ padding: '4px 8px' }} onClick={() => {
                      const rec = { kind: 'weekly', weekday: 4 } as const; // четверг
                      const next = computeNextDueDate(rec, new Date());
                      void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                    }}>Каждый четверг</button>
                    <button style={{ padding: '4px 8px' }} onClick={() => {
                      const rec = { kind: 'monthly', day: 28 } as const;
                      const next = computeNextDueDate(rec, new Date());
                      void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                    }}>Каждое 28-е</button>
                    <button style={{ padding: '4px 8px' }} onClick={() => {
                      const rec = { kind: 'interval', everyDays: 7, anchorDate: new Date().toISOString() } as const;
                      const next = computeNextDueDate(rec, new Date());
                      void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                    }}>Каждые 7 дней</button>
                    <button style={{ padding: '4px 8px' }} onClick={() => {
                      const rec = { kind: 'none' } as const;
                      void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec });
                    }}>Без повтора</button>
                  </div>
                  <fieldset className="inspector__fieldset" style={{ borderColor: '#333' }}>
                    <legend style={{ fontSize: 12, color: '#aaa' }}>Произвольно</legend>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 6 }}>
                        <span>Еженедельно:</span>
                        <select
                          style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px' }}
                          value={(() => { const r = (ctxNode as TaskNode).recurrence as Recurrence | undefined; return r && r.kind === 'weekly' ? String(r.weekday) : ''; })()}
                          onChange={(e) => {
                            const w = Number(e.target.value);
                            const rec = { kind: 'weekly', weekday: isNaN(w) ? 1 : w } as const;
                            const next = computeNextDueDate(rec, new Date());
                            void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                          }}
                        >
                          <option value="">— выбрать —</option>
                          <option value={1}>Понедельник</option>
                          <option value={2}>Вторник</option>
                          <option value={3}>Среда</option>
                          <option value={4}>Четверг</option>
                          <option value={5}>Пятница</option>
                          <option value={6}>Суббота</option>
                          <option value={0}>Воскресенье</option>
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 6 }}>
                        <span>Ежемесячно:</span>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px' }}
                          value={(() => { const r = (ctxNode as TaskNode).recurrence as Recurrence | undefined; return r && r.kind === 'monthly' ? r.day : ''; })()}
                          onChange={(e) => {
                            const day = Math.max(1, Math.min(31, Number(e.target.value) || 1));
                            const rec = { kind: 'monthly', day } as const;
                            const next = computeNextDueDate(rec, new Date());
                            void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                          }}
                          placeholder="День месяца"
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', alignItems: 'center', gap: 6 }}>
                        <span>Интервал:</span>
                        <input
                          type="number"
                          min={1}
                          style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px' }}
                          value={(() => { const r = (ctxNode as TaskNode).recurrence as Recurrence | undefined; return r && r.kind === 'interval' ? r.everyDays : ''; })()}
                          onChange={(e) => {
                            const n = Math.max(1, Number(e.target.value) || 1);
                            const curr = (ctxNode as TaskNode).recurrence;
                            const anchor = (curr && (curr as Recurrence).kind === 'interval') ? (curr as Extract<Recurrence, { kind: 'interval' }>).anchorDate : new Date().toISOString();
                            const rec = { kind: 'interval', everyDays: n, anchorDate: anchor } as const;
                            const next = computeNextDueDate(rec, new Date());
                            void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                          }}
                          placeholder="Каждые N дней"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="YYYY-MM-DD"
                          maxLength={10}
                          style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px' }}
                          value={(() => { const r = (ctxNode as TaskNode).recurrence as Recurrence | undefined; return r && r.kind === 'interval' ? r.anchorDate.slice(0,10) : todayYMD(); })()}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const curr = (ctxNode as TaskNode).recurrence as Recurrence | undefined;
                            const n = curr && curr.kind === 'interval' ? curr.everyDays : 7;
                            if (!raw) {
                              const rec = { kind: 'interval', everyDays: n, anchorDate: new Date().toISOString() } as const;
                              const next = computeNextDueDate(rec, new Date());
                              void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                              return;
                            }
                            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                              const anchor = toIsoUTCFromYMD(raw);
                              const rec = { kind: 'interval', everyDays: n, anchorDate: anchor } as const;
                              const next = computeNextDueDate(rec, new Date());
                              void useAppStore.getState().updateNode(ctxNode.id, { recurrence: rec, dueDate: next ?? (ctxNode as TaskNode).dueDate });
                            }
                          }}
                          title="Начинать с"
                        />
                      </div>
                    </div>
                  </fieldset>
                </div>
              ) : null}
              <label style={{ display: 'block', marginBottom: 6 }}>Срочность
                <select style={{ width: '100%' }} value={(ctxNode as TaskNode).priority || 'med'} onChange={(e) => { const val = e.target.value as 'low'|'med'|'high'; void useAppStore.getState().updateNode(ctxNode.id, { priority: val }); }}>
                  <option value="low">Низкая</option>
                  <option value="med">Средняя</option>
                  <option value="high">Высокая</option>
                </select>
              </label>
              <label className="radio" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={(ctxNode as TaskNode).status === 'done'}
                  onChange={(e) => {
                    const done = e.target.checked;
                    let patch: Partial<TaskNode>;
                    if (done) {
                      const ask = window.prompt('Дата выполнения (YYYY-MM-DD или YYYY-MM-DD HH:mm). Пусто — сейчас:');
                      let completedAt = Date.now();
                      if (ask && ask.trim()) {
                        const s = ask.trim();
                        const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
                        if (m1) {
                          const [_, yy, mm, dd] = m1;
                          completedAt = new Date(Number(yy), Number(mm) - 1, Number(dd), 12, 0, 0).getTime();
                        } else if (m2) {
                          const [_, yy, mm, dd, HH, MM] = m2;
                          completedAt = new Date(Number(yy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), 0).getTime();
                        }
                      }
                      patch = { status: 'done', completedAt };
                    } else {
                      patch = { status: 'inactive', completedAt: undefined };
                    }
                    void useAppStore.getState().updateNode(ctxNode.id, patch as any);
                  }}
                />
                <span>Выполнено</span>
              </label>
              <label className="radio" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={(ctxNode as TaskNode).isActual !== false}
                  onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { isActual: e.target.checked }); }}
                />
                <span>Актуальный</span>
              </label>
              <fieldset className="inspector__fieldset" style={{ marginBottom: 6 }}>
                <legend style={{ fontSize: 12, color: '#ccc' }}>Текст</legend>
                <label className="radio" style={{ marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={typeof (ctxNode as TaskNode).textSize !== 'number'}
                    onChange={(e) => {
                      const auto = e.target.checked;
                      if (auto) {
                        void useAppStore.getState().updateNode(ctxNode.id, { textSize: undefined });
                      } else {
                        const t = ctxNode as TaskNode;
                        const base = Math.round(Math.min(t.width / 5, t.height / 2.4));
                        void useAppStore.getState().updateNode(ctxNode.id, { textSize: Math.max(10, Math.min(72, base)) });
                      }
                    }}
                  />
                  <span>Авто размер текста</span>
                </label>
                <label style={{ display: 'block' }}>
                  Размер текста
                  <input
                    type="range"
                    min={10}
                    max={72}
                    step={1}
                    disabled={typeof (ctxNode as TaskNode).textSize !== 'number'}
                    value={(ctxNode as TaskNode).textSize ?? 16}
                    onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { textSize: Number(e.target.value) }); }}
                  />
                </label>
              </fieldset>
              <label style={{ display: 'block', marginBottom: 6 }}>Статус
                <select style={{ width: '100%' }} value={(ctxNode as TaskNode).status} onChange={(e) => { const val = e.target.value as TaskStatus; void useAppStore.getState().updateNode(ctxNode.id, { status: val }); }}>
                  <option value="active">Активная</option>
                  <option value="in_progress">В процессе</option>
                  <option value="deferred">Отложенная</option>
                  <option value="inactive">Неактивная</option>
                  <option value="done">Сделана</option>
                </select>
              </label>
              <button onClick={() => { if (window.confirm('Удалить выбранное?')) { void deleteSelection(); setCtxMenu(null); } }} style={{ display: 'block', width: '100%', marginTop: 8 }}>Удалить</button>
              {ctxNode.parentId ? (
                <button style={{ display: 'block', width: '100%', marginTop: 6 }} onClick={async () => {
                  const all = useAppStore.getState().nodes;
                  const parent = all.find((n) => n.id === ctxNode.parentId) as GroupNode | undefined;
                  if (!parent) return;
                  const newParentId: string | null = parent.parentId ?? null;
                  // координаты на уровне выше = локальные + координаты группы
                  const baseX = (ctxNode as TaskNode).x + parent.x;
                  const baseY = (ctxNode as TaskNode).y + parent.y;
                  const spot = findFreeSpot(baseX, baseY, (ctxNode as TaskNode).width, (ctxNode as TaskNode).height, newParentId);
                  await useAppStore.getState().updateNode(ctxNode.id, { parentId: newParentId, x: spot.x, y: spot.y });
                  setCtxMenu(null);
                }}>Вывести из группы</button>
              ) : null}
            </div>
          ) : ctxNode.type === 'group' ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Группа</div>
              <label style={{ display: 'block', marginBottom: 6 }}>Название
                <input style={{ width: '100%' }} value={(ctxNode as GroupNode).name} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { name: e.target.value }); }} />
              </label>
              <label style={{ display: 'block', marginBottom: 6 }}>Описание
                <textarea style={{ width: '100%' }} value={(ctxNode as GroupNode).description || ''} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { description: e.target.value }); }} />
              </label>
              <label style={{ display: 'block', marginBottom: 6 }}>Цвет
                <input type="color" style={{ width: '100%' }} value={(ctxNode as GroupNode).color || '#AEC6CF'} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { color: e.target.value }); }} />
              </label>
              <label className="radio" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={(ctxNode as GroupNode).isActual !== false}
                  onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { isActual: e.target.checked }); }}
                />
                <span>Актуальный</span>
              </label>
              <fieldset className="inspector__fieldset" style={{ marginBottom: 6 }}>
                <legend style={{ fontSize: 12, color: '#ccc' }}>Заголовок</legend>
                <label className="radio" style={{ marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={typeof (ctxNode as GroupNode).titleSize !== 'number'}
                    onChange={(e) => {
                      const auto = e.target.checked;
                      if (auto) {
                        void useAppStore.getState().updateNode(ctxNode.id, { titleSize: undefined });
                      } else {
                        void useAppStore.getState().updateNode(ctxNode.id, { titleSize: 24 });
                      }
                    }}
                  />
                  <span>Авто размер заголовка</span>
                </label>
                <label style={{ display: 'block' }}>
                  Размер заголовка
                  <input
                    type="range"
                    min={10}
                    max={64}
                    step={1}
                    disabled={typeof (ctxNode as GroupNode).titleSize !== 'number'}
                    value={(ctxNode as GroupNode).titleSize ?? 24}
                    onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { titleSize: Number(e.target.value) }); }}
                  />
                </label>
              </fieldset>
              <button onClick={() => { if (window.confirm('Удалить выбранное?')) { void deleteSelection(); setCtxMenu(null); } }} style={{ display: 'block', width: '100%', marginTop: 8 }}>Удалить</button>
              {ctxNode.parentId ? (
                <button style={{ display: 'block', width: '100%', marginTop: 6 }} onClick={async () => {
                  const all = useAppStore.getState().nodes;
                  const parent = all.find((n) => n.id === ctxNode.parentId) as GroupNode | undefined;
                  if (!parent) return;
                  const newParentId: string | null = parent.parentId ?? null;
                  const baseX = (ctxNode as GroupNode).x + parent.x;
                  const baseY = (ctxNode as GroupNode).y + parent.y;
                  const size = Math.max((ctxNode as GroupNode).width, (ctxNode as GroupNode).height);
                  const spot = findFreeSpot(baseX, baseY, size, size, newParentId);
                  await useAppStore.getState().updateNode(ctxNode.id, { parentId: newParentId, x: spot.x, y: spot.y });
                  setCtxMenu(null);
                }}>Вывести из группы</button>
              ) : null}
            </div>
          ) : ctxNode.type === 'person' ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Контакты</div>
              <label style={{ display: 'block', marginBottom: 4 }}>Имя
                <input style={{ width: '100%' }} value={(ctxNode as PersonNode).name || ''} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { name: e.target.value }); }} placeholder="Имя" />
              </label>
              <label style={{ display: 'block', marginBottom: 4 }}>Email
                <input style={{ width: '100%' }} value={(ctxNode as PersonNode).contacts?.email || ''} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { contacts: { ...(ctxNode as PersonNode).contacts, email: e.target.value } }); }} />
              </label>
              <label style={{ display: 'block', marginBottom: 4 }}>Телефон
                <input style={{ width: '100%' }} value={(ctxNode as PersonNode).contacts?.phone || ''} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { contacts: { ...(ctxNode as PersonNode).contacts, phone: e.target.value } }); }} />
              </label>
              <label style={{ display: 'block', marginBottom: 4 }}>Заметки
                <textarea style={{ width: '100%' }} value={(ctxNode as PersonNode).contacts?.notes || ''} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { contacts: { ...(ctxNode as PersonNode).contacts, notes: e.target.value } }); }} />
              </label>
              <label style={{ display: 'block', marginBottom: 4 }}>Фото (URL)
                <input style={{ width: '100%' }} value={(ctxNode as PersonNode).avatarUrl || ''} onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { avatarUrl: e.target.value }); }} placeholder="https://..." />
              </label>
              <label className="radio" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={(ctxNode as PersonNode).isActual !== false}
                  onChange={(e) => { void useAppStore.getState().updateNode(ctxNode.id, { isActual: e.target.checked }); }}
                />
                <span>Актуальный</span>
              </label>
              <label style={{ display: 'block', marginBottom: 4 }}>Загрузить фото
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => { if (ctxNode) { void useAppStore.getState().updateNode(ctxNode.id, { avatarUrl: String(reader.result) }); } };
                  reader.readAsDataURL(file);
                }} />
              </label>
              <button onClick={() => { if (window.confirm('Удалить выбранное?')) { void deleteSelection(); setCtxMenu(null); } }} style={{ display: 'block', width: '100%', marginTop: 8 }}>Удалить</button>
              {ctxNode.parentId ? (
                <button style={{ display: 'block', width: '100%', marginTop: 6 }} onClick={async () => {
                  const all = useAppStore.getState().nodes;
                  const parent = all.find((n) => n.id === ctxNode.parentId) as GroupNode | undefined;
                  if (!parent) return;
                  const newParentId: string | null = parent.parentId ?? null;
                  const baseX = (ctxNode as PersonNode).x + parent.x;
                  const baseY = (ctxNode as PersonNode).y + parent.y;
                  const size = Math.max((ctxNode as PersonNode).width, (ctxNode as PersonNode).height);
                  const spot = findFreeSpot(baseX, baseY, size, size, newParentId);
                  await useAppStore.getState().updateNode(ctxNode.id, { parentId: newParentId, x: spot.x, y: spot.y });
                  setCtxMenu(null);
                }}>Вывести из группы</button>
              ) : null}
            </div>
          ) : null}
          <div style={{ textAlign: 'right', marginTop: 6 }}>
            <button onClick={() => setCtxMenu(null)}>Закрыть</button>
          </div>
        </div>
      ) : null}
      {/* HUD-подсказка: фиксированный размер рядом с курсором */}
      {hoverHUD ? (
        <div style={{ position: 'fixed', left: hoverHUD.x + 12, top: hoverHUD.y + 12, background: '#fff', color: '#111', padding: '2px 6px', borderRadius: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.2)', fontSize: 13, pointerEvents: 'none', zIndex: 1002 }}>
          {hoverHUD.text}
        </div>
      ) : null}
      {/* Link error notification */}
      {linkError ? (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#ff4444', color: '#fff', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 600, zIndex: 2000, pointerEvents: 'none' }}>
          {linkError}
        </div>
      ) : null}
      {linkCtxMenu ? (
        <div
          style={{ position: 'fixed', left: (linkCtxMenuPos?.x ?? Math.max(8, Math.min(linkCtxMenu.x, window.innerWidth - 360))), top: (linkCtxMenuPos?.y ?? Math.max(8, Math.min(linkCtxMenu.y, window.innerHeight - 320))), background: '#222', color: '#fff', padding: 8, borderRadius: 6, zIndex: 1001, minWidth: 240, maxHeight: Math.max(200, window.innerHeight - 16), overflowY: 'auto', boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div
            style={{ cursor: 'move', fontWeight: 600, margin: '-4px -4px 6px -4px', padding: '4px 6px', background: '#2a2a2a', borderRadius: 4 }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); const cx = (linkCtxMenuPos?.x ?? Math.max(8, Math.min(linkCtxMenu.x, window.innerWidth - 360))); const cy = (linkCtxMenuPos?.y ?? Math.max(8, Math.min(linkCtxMenu.y, window.innerHeight - 320))); draggingMenuRef.current = { kind: 'link', dx: e.clientX - cx, dy: e.clientY - cy }; }}
          >
            Связь
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Связь</div>
          <label style={{ display: 'block', marginBottom: 6 }}>Цвет
            <input type="color" style={{ width: '100%' }} value={(useAppStore.getState().links.find((l) => l.id === linkCtxMenu.linkId)?.color) || '#C94545'} onChange={(e) => { void useAppStore.getState().updateLink(linkCtxMenu.linkId, { color: e.target.value }); }} />
          </label>
          <label style={{ display: 'block', marginBottom: 6 }}>Направление
            <select style={{ width: '100%' }} value={(useAppStore.getState().links.find((l) => l.id === linkCtxMenu.linkId)?.dir) || 'one'} onChange={(e) => { const dir = e.target.value as 'one' | 'both'; void useAppStore.getState().updateLink(linkCtxMenu.linkId, { dir }); }}>
              <option value="one">Однонаправленная</option>
              <option value="both">Двунаправленная</option>
            </select>
          </label>
          <div style={{ textAlign: 'right', marginTop: 6 }}>
            <button onClick={() => setLinkCtxMenu(null)}>Закрыть</button>
          </div>
        </div>
      ) : null}
      {editingNode && editorStyle ? (
        editingNode.type === 'task' ? (
          <textarea
            style={{ ...(editorStyle as React.CSSProperties), height: `${Math.max(40, editingNode.height * viewport.scale - 24)}px`, resize: 'none' }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { void commitEdit(); } else if (e.key === 'Escape') { setEditingNodeId(null); } }}
            autoFocus
          />
        ) : (
          <input
            style={editorStyle as React.CSSProperties}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(e) => { if (e.key === 'Enter') { void commitEdit(); } else if (e.key === 'Escape') { setEditingNodeId(null); } }}
            autoFocus
          />
        )
      ) : null}
    </div>
  );
};

// ОПТИМИЗАЦИЯ: React.memo предотвращает лишние re-renders
const NodeShape = React.memo<{
  node: AnyNode;
  selected: boolean;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onClick: (e: KonvaEventObject<MouseEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
  onContextMenu: (e: KonvaEventObject<PointerEvent>) => void;
  onHoverEnter?: (e: KonvaEventObject<MouseEvent>) => void;
  onHoverMove?: (e: KonvaEventObject<MouseEvent>) => void;
  onHoverLeave?: () => void;
  onRefReady?: (ref: any) => void;
}>(({ node, selected, onDragStart, onDragMove, onDragEnd, onClick, onDblClick, onContextMenu, onHoverEnter, onHoverMove, onHoverLeave, onRefReady }) => {
  const isTask = node.type === 'task';
  const isGroup = node.type === 'group';
  const isPerson = node.type === 'person';
  const updateNode = useAppStore((s) => s.updateNode);
  const multiResizeRef = useRef<Map<string, { w: number; h: number }> | null>(null);
  const personAvatarUrl = node.type === 'person' ? (node as PersonNode).avatarUrl : undefined;
  const img = useHtmlImage(personAvatarUrl);
  
  // ОПТИМИЗАЦИЯ: кэшируем узел как картинку для быстрого рендера
  const groupRef = useRef<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragStartWrapper = useCallback((e: KonvaEventObject<DragEvent>) => {
    setIsDragging(true);
    // Отключаем кэш во время перетаскивания
    if (groupRef.current) groupRef.current.clearCache();
    onDragStart(e);
  }, [onDragStart]);
  
  const handleDragEndWrapper = useCallback((e: KonvaEventObject<DragEvent>) => {
    setIsDragging(false);
    onDragEnd(e);
    // Включаем кэш обратно после небольшой задержки
    setTimeout(() => {
      if (groupRef.current) groupRef.current.cache();
    }, 50);
  }, [onDragEnd]);
  
  useEffect(() => {
    // Кэшируем узел после монтирования (превращаем в картинку)
    if (groupRef.current && !isDragging && !selected) {
      groupRef.current.cache();
    }
    
    return () => {
      if (groupRef.current) groupRef.current.clearCache();
    };
  }, [isDragging, selected]);

  if (isTask) {
    const t = node as TaskNode;
    const padX = Math.max(8, Math.round(t.width * 0.06));
    const padY = Math.max(6, Math.round(t.height * 0.05));
    const contentW = Math.max(0, t.width - padX * 2);
    const contentH = Math.max(0, t.height - padY * 2);
    const textStr = `${t.title}`;
    const baseFs = clamp(Math.min(t.width / 5, t.height / 2.4), 12, 72);
    const fs = typeof t.textSize === 'number' ? t.textSize : estimateTaskFont(textStr, baseFs, contentW, contentH, 1.15);
    return (
      <KonvaGroup
        ref={(ref) => { 
          groupRef.current = ref;
          if (ref && onRefReady) onRefReady(ref); 
        }}
        x={t.x}
        y={t.y}
        opacity={t.isActual === false ? 0.35 : 1}
        draggable
        onDragStart={handleDragStartWrapper}
        onDragMove={onDragMove}
        onDragEnd={handleDragEndWrapper}
        onClick={(e) => onClick(e)}
        onDblClick={(e) => onDblClick(e as unknown as KonvaEventObject<MouseEvent>)}
        onDblTap={() => onDblClick({} as KonvaEventObject<MouseEvent>)}
        onContextMenu={onContextMenu}
        onMouseEnter={(e) => { onHoverEnter?.(e as unknown as KonvaEventObject<MouseEvent>); }}
        onMouseMove={(e) => { onHoverMove?.(e as unknown as KonvaEventObject<MouseEvent>); }}
        onMouseLeave={() => { onHoverLeave?.(); }}
      >
        {/* ОПТИМИЗАЦИЯ: "фейковая тень" через Rect вместо shadowBlur (в 10x быстрее) */}
        <Rect
          x={3}
          y={4}
          width={t.width}
          height={t.height}
          fill="#00000020"
          cornerRadius={8}
          perfectDrawEnabled={false}
        />
        <Rect
          width={t.width}
          height={t.height}
          fill={t.color || '#E8D8A6'}
          cornerRadius={8}
          shadowColor={selected ? '#F05A5A99' : undefined}
          shadowBlur={selected ? 12 : 0}
          shadowOffset={selected ? { x: 0, y: 0 } : undefined}
          stroke={selected ? '#F05A5A' : '#00000030'}
          strokeWidth={selected ? 2 : 1}
          perfectDrawEnabled={false}
        />
        {/* clipped text area to prevent overflow */}
        <KonvaGroup x={padX} y={padY} clip={{ x: 0, y: 0, width: contentW, height: contentH }}>
          <Text
            x={0}
            y={0}
            width={contentW}
            height={contentH}
            text={textStr}
            fontSize={fs}
            fill={'#3B2F2F'}
            align="left"
            verticalAlign="top"
            wrap="word"
            lineHeight={1.15}
          />
        </KonvaGroup>
        {/* attention badge for active & actual tasks */}
        {(t.isActual !== false) && (t.status === 'in_progress' || t.status === 'active') ? (
          <>
            <Rect x={t.width - 22} y={4} width={18} height={18} cornerRadius={9} fill={'#000'} shadowBlur={4} stroke={'#222'} strokeWidth={1} />
            <Text x={t.width - 22} y={4} width={18} height={18} text={'⏳'} fontSize={14} align="center" verticalAlign="middle" fill={'#fff'} />
          </>
        ) : null}

        {/* resize handle (bottom-right): хит-зона 15% от размеров */}
        {selected ? (
          <>
            {/* видимый маркер */}
            <Rect x={t.width - 14} y={t.height - 14} width={14} height={14} fill={'#6e5548'} cornerRadius={3} stroke={'#00000060'} strokeWidth={1} />
            {/* увеличенная хит-зона, адаптивная к зуму */}
            {(() => {
              const hitW = Math.max(8, Math.round(t.width * 0.15));
              const hitH = Math.max(8, Math.round(t.height * 0.15));
              return (
                <Rect
                  x={t.width - hitW}
                  y={t.height - hitH}
                  width={hitW}
                  height={hitH}
                  opacity={0.001}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    const sel = new Set(useAppStore.getState().selection.length ? useAppStore.getState().selection : [t.id]);
                    const all = useAppStore.getState().nodes;
                    const map = new Map<string, { w: number; h: number }>();
                    sel.forEach((id) => {
                      const n = all.find((nn) => nn.id === id);
                      if (n) map.set(id, { w: n.width, h: n.height });
                    });
                    multiResizeRef.current = map;
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    const startMap = multiResizeRef.current;
                    const hx = e.target.x();
                    const hy = e.target.y();
                    const minW = 120, minH = 80, maxW = 1600, maxH = 1200;
                    const base = startMap?.get(t.id) || { w: t.width, h: t.height };
                    const newW = Math.max(minW, Math.min(maxW, hx + hitW));
                    const newH = Math.max(minH, Math.min(maxH, hy + hitH));
                    const sx = newW / base.w;
                    const sy = newH / base.h;
                    const s = Math.min(sx, sy);
                    if (startMap && startMap.size > 1) {
                      startMap.forEach((size, id) => {
                        const w2 = Math.max(minW, Math.min(maxW, Math.round(size.w * s)));
                        const h2 = Math.max(minH, Math.min(maxH, Math.round(size.h * s)));
                        void updateNode(id, { width: w2, height: h2 });
                      });
                    } else {
                      void updateNode(t.id, { width: newW, height: newH });
                    }
                  }}
                  onDragEnd={(e) => { e.cancelBubble = true; e.target.position({ x: t.width - hitW, y: t.height - hitH }); multiResizeRef.current = null; }}
                />
              );
            })()}
          </>
        ) : null}
      </KonvaGroup>
    );
  }

  if (isGroup) {
    const g = node as GroupNode;
    const r = Math.min(g.width, g.height) / 2;
    const baseGroup = clamp(r / 1.6, 12, 64);
    const d = Math.min(g.width, g.height);
    const pad = Math.max(8, Math.round(d * 0.12));
    const contentW = Math.max(0, d - pad * 2);
    const contentH = Math.max(0, d - pad * 2);
    const groupFs = typeof g.titleSize === 'number' ? g.titleSize : estimateTaskFont(g.name, baseGroup, contentW, contentH, 1.1);
    // Убрали индикатор «группа не пустая» (красная точка)
    return (
      <KonvaGroup
        ref={(ref) => { if (ref && onRefReady) onRefReady(ref); }}
        x={g.x}
        y={g.y}
        opacity={g.isActual === false ? 0.35 : 1}
        draggable
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onClick={(e) => onClick(e as unknown as KonvaEventObject<MouseEvent>)}
        onDblClick={(e) => onDblClick(e as unknown as KonvaEventObject<MouseEvent>)}
        onDblTap={() => onDblClick({} as KonvaEventObject<MouseEvent>)}
        onContextMenu={onContextMenu}
        onMouseEnter={(e) => { onHoverEnter?.(e as unknown as KonvaEventObject<MouseEvent>); }}
        onMouseMove={(e) => { onHoverMove?.(e as unknown as KonvaEventObject<MouseEvent>); }}
        onMouseLeave={() => { onHoverLeave?.(); }}
      >
        {/* ОПТИМИЗАЦИЯ: "фейковая тень" через Circle */}
        <Circle
          radius={r}
          x={r + 3}
          y={r + 4}
          fill="#00000020"
          perfectDrawEnabled={false}
        />
        <Circle
          radius={r}
          x={r}
          y={r}
          fill={g.color || '#AEC6CF'}
          shadowColor={selected ? '#F05A5A99' : undefined}
          shadowBlur={selected ? 10 : 0}
          stroke={selected ? '#F05A5A' : '#00000060'}
          strokeWidth={selected ? 2 : 1}
          perfectDrawEnabled={false}
        />
        {/* title (wrapped, centered inside inner box) */}
        <KonvaGroup x={r - contentW / 2} y={r - contentH / 2} clip={{ x: 0, y: 0, width: contentW, height: contentH }}>
          <Text
            x={0}
            y={0}
            width={contentW}
            height={contentH}
            text={g.name}
            fontSize={groupFs}
            fill={'#2B1F1F'}
            fontStyle="bold"
            align="center"
            verticalAlign="middle"
            wrap="word"
          />
        </KonvaGroup>
        {/* active indicator removed */}

        {/* corner badge: type marker for group */}
        <Text
          x={4}
          y={4}
          text={'🟢'}
          fontSize={16}
          align="left"
          verticalAlign="top"
        />

        {/* resize handle for group (keeps square) — 15% от размеров */}
        {selected ? (
          <>
            <Circle x={g.width - 10} y={g.height - 10} radius={8} fill={'#6e5548'} stroke={'#00000060'} strokeWidth={1} />
            {(() => {
              const hitW = Math.max(8, Math.round(g.width * 0.15));
              const hitH = Math.max(8, Math.round(g.height * 0.15));
              return (
                <Rect
                  x={g.width - hitW}
                  y={g.height - hitH}
                  width={hitW}
                  height={hitH}
                  opacity={0.001}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    const sel = new Set(useAppStore.getState().selection.length ? useAppStore.getState().selection : [g.id]);
                    const all = useAppStore.getState().nodes;
                    const map = new Map<string, { w: number; h: number }>();
                    sel.forEach((id) => {
                      const n = all.find((nn) => nn.id === id);
                      if (n) map.set(id, { w: n.width, h: n.height });
                    });
                    multiResizeRef.current = map;
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    const startMap = multiResizeRef.current;
                    const hx = e.target.x();
                    const hy = e.target.y();
                    const minS = 100, maxS = 1600;
                    const base = startMap?.get(g.id) || { w: g.width, h: g.height };
                    const size = Math.max(minS, Math.min(maxS, Math.max(hx + hitW, hy + hitH)));
                    const s = size / Math.max(base.w, base.h);
                    if (startMap && startMap.size > 1) {
                      startMap.forEach((size0, id) => {
                        const target = Math.max(minS, Math.min(maxS, Math.round(Math.max(size0.w, size0.h) * s)));
                        void updateNode(id, { width: target, height: target });
                      });
                    } else {
                      void updateNode(g.id, { width: size, height: size });
                    }
                  }}
                  onDragEnd={(e) => { e.cancelBubble = true; e.target.position({ x: g.width - hitW, y: g.height - hitH }); multiResizeRef.current = null; }}
                />
              );
            })()}
          </>
        ) : null}
      </KonvaGroup>
    );
  }

  if (isPerson) {
    const p = node as PersonNode;
    const r = Math.min(p.width, p.height) / 2;
    const nameFs = clamp(p.width / 4, 12, 48);
    return (
      <KonvaGroup
        ref={(ref) => { if (ref && onRefReady) onRefReady(ref); }}
        x={p.x}
        y={p.y}
        opacity={p.isActual === false ? 0.35 : 1}
        draggable
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onClick={(e) => onClick(e as unknown as KonvaEventObject<MouseEvent>)}
        onDblClick={(e) => onDblClick(e as unknown as KonvaEventObject<MouseEvent>)}
        onDblTap={() => onDblClick({} as KonvaEventObject<MouseEvent>)}
        onContextMenu={onContextMenu}
        onMouseEnter={(e) => { onHoverEnter?.(e as unknown as KonvaEventObject<MouseEvent>); }}
        onMouseMove={(e) => { onHoverMove?.(e as unknown as KonvaEventObject<MouseEvent>); }}
        onMouseLeave={() => { onHoverLeave?.(); }}
      >
        {/* ОПТИМИЗАЦИЯ: "фейковая тень" */}
        <Circle
          radius={r}
          x={r + 3}
          y={r + 4}
          fill="#00000020"
          perfectDrawEnabled={false}
        />
        {/* avatar background circle */}
        <Circle
          radius={r}
          x={r}
          y={r}
          fill={p.color || '#B3E5FC'}
          shadowColor={selected ? '#F05A5A99' : undefined}
          shadowBlur={selected ? 10 : 0}
          stroke={selected ? '#F05A5A' : '#00000040'}
          strokeWidth={selected ? 2 : 1}
          perfectDrawEnabled={false}
        />
        {/* avatar image or emoji covering whole circle */}
        {img ? (
          <KonvaGroup x={0} y={0} clipFunc={(ctx) => { ctx.arc(r, r, r, 0, Math.PI * 2, false); }}>
            <KonvaImage image={img} x={0} y={0} width={p.width} height={p.height} />
          </KonvaGroup>
        ) : (
          <Text x={0} y={0} width={p.width} height={p.height} text={p.avatarEmoji || '👤'} fontSize={r * 1.8} align="center" verticalAlign="middle" />
        )}
        {/* corner badge: role marker (employee/partner/bot) */}
        {(() => {
          const role = p.role;
          const icon = role === 'bot' ? '🤖' : role === 'partner' ? '🤝' : '👤';
          return (
            <Text x={4} y={4} text={icon} fontSize={16} align="left" verticalAlign="top" />
          );
        })()}
        <Text x={4} y={p.height + 4} width={Math.max(0, p.width - 8)} align="center" text={p.name} fontSize={nameFs} fill={'#2B1F1F'} wrap="none" ellipsis />
        {selected ? (
          <>
            <Rect x={p.width - 14} y={p.height - 14} width={14} height={14} fill={'#6e5548'} cornerRadius={3} stroke={'#00000060'} strokeWidth={1} />
            {(() => {
              const hitW = Math.max(8, Math.round(p.width * 0.15));
              const hitH = Math.max(8, Math.round(p.height * 0.15));
              return (
                <Rect
                  x={p.width - hitW}
                  y={p.height - hitH}
                  width={hitW}
                  height={hitH}
                  opacity={0.001}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    const sel = new Set(useAppStore.getState().selection.length ? useAppStore.getState().selection : [p.id]);
                    const all = useAppStore.getState().nodes;
                    const map = new Map<string, { w: number; h: number }>();
                    sel.forEach((id) => {
                      const n = all.find((nn) => nn.id === id);
                      if (n) map.set(id, { w: n.width, h: n.height });
                    });
                    multiResizeRef.current = map;
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    const startMap = multiResizeRef.current;
                    const hx = e.target.x();
                    const hy = e.target.y();
                    const minS = 80, maxS = 800;
                    const base = startMap?.get(p.id) || { w: p.width, h: p.height };
                    const size = Math.max(minS, Math.min(maxS, Math.max(hx + hitW, hy + hitH)));
                    const s = size / Math.max(base.w, base.h);
                    if (startMap && startMap.size > 1) {
                      startMap.forEach((size0, id) => {
                        const target = Math.max(minS, Math.min(maxS, Math.round(Math.max(size0.w, size0.h) * s)));
                        void updateNode(id, { width: target, height: target });
                      });
                    } else {
                      void updateNode(p.id, { width: size, height: size });
                    }
                  }}
                  onDragEnd={(e) => { e.cancelBubble = true; e.target.position({ x: p.width - hitW, y: p.height - hitH }); multiResizeRef.current = null; }}
                />
              );
            })()}
          </>
        ) : null}
      </KonvaGroup>
    );
  }

  return null;
}, (prev, next) => {
  // ОПТИМИЗАЦИЯ: пропускаем re-render если ничего важного не изменилось
  return (
    prev.node === next.node &&
    prev.selected === next.selected
    // handlers не сравниваем - они стабильны через useCallback
  );
});
