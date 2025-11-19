import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Stage, Layer, Circle, Line, Text, Group } from 'react-konva';
import Konva from 'konva';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import type { TaskNode, GroupNode, PersonNode } from '../types';

// Simple vector math
type Vector = { x: number; y: number };

export const TasksGraphPage: React.FC = () => {
  const allNodes = useAppStore((s) => s.nodes);
  const allLinksRaw = useAppStore((s) => s.links);
  const addLink = useAppStore((s) => s.addLink);
  const navigate = useNavigate();

  // UI state
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);

  // Simulation state (mutable ref to avoid re-renders)
  const nodesRef = useRef<Record<string, Vector>>({});

  // Konva Refs for direct manipulation
  const layerRef = useRef<Konva.Layer>(null);
  const nodeGroupsRef = useRef<Record<string, Konva.Group>>({});
  const linkLinesRef = useRef<Record<string, Konva.Line>>({});

  const [stageScale, setStageScale] = useState(0.5);
  const [stagePos, setStagePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const animationRef = useRef<Konva.Animation | null>(null);
  
  // Root groups for filtering
  const rootGroups = useMemo(() => {
    return allNodes.filter((n): n is GroupNode => n.type === 'group' && !n.parentId);
  }, [allNodes]);

  // Filter nodes: exclude completed tasks and hidden groups (including children)
  const nodes = useMemo(() => {
    const hiddenIds = new Set<string>();
    // First pass: collect all IDs that are hidden (recursive)
    const collectHidden = (id: string) => {
      hiddenIds.add(id);
      allNodes.filter(n => n.parentId === id).forEach(child => collectHidden(child.id));
    };
    rootGroups.forEach(g => {
      if (hiddenGroups.has(g.id)) {
        collectHidden(g.id);
      }
    });

    return allNodes.filter(n => {
      if (hiddenIds.has(n.id)) return false;
      if (n.type === 'task' && n.status === 'done') return false;
      return true;
    });
  }, [allNodes, hiddenGroups, rootGroups]);

  // Filter links: only include links where both endpoints exist in our filtered nodes
  const links = useMemo(() => {
    const nodeIds = new Set(nodes.map(n => n.id));
    return allLinksRaw.filter(l => nodeIds.has(l.fromId) && nodeIds.has(l.toId));
  }, [allLinksRaw, nodes]);

  const toggleGroup = (id: string) => {
    setHiddenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNodeClick = (id: string) => {
    if (!linkMode) return;
    
    if (!linkSourceId) {
      setLinkSourceId(id);
    } else {
      if (id !== linkSourceId) {
        void addLink(linkSourceId, id);
        setLinkSourceId(null); // Reset after linking
        // Keep mode active for chain linking or multi-linking
      } else {
        setLinkSourceId(null); // Cancel if clicked same node
      }
    }
  };

  // Prepare extended links (explicit + implicit parent-child)
  const allLinks = useMemo(() => {
    // Create implicit links for parent-child relationships
    const implicitLinks = nodes
      .filter(n => n.parentId && nodes.some(p => p.id === n.parentId)) // ensure parent exists in filtered set
      .map(n => ({
        id: `implicit-${n.id}-${n.parentId}`,
        fromId: n.parentId!,
        toId: n.id,
        color: '#7A8C99', // Brighter, more visible structural link
        isImplicit: true
      }));
    return [...links, ...implicitLinks];
  }, [nodes, links]);

  // Initialize positions
  useEffect(() => {
    const initial: Record<string, Vector> = {};
    // If we already have positions, try to preserve them, otherwise random
    nodes.forEach((n, i) => {
      if (!nodesRef.current[n.id]) {
        const angle = (i / nodes.length) * Math.PI * 2;
        const radius = 300 + Math.random() * 200;
        initial[n.id] = {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        };
      } else {
        initial[n.id] = nodesRef.current[n.id];
      }
    });
    nodesRef.current = initial;
  }, [nodes]);

  // Physics Engine
  const velocities = useRef<Record<string, Vector>>({});

  useEffect(() => {
    // Initialize velocities
    nodes.forEach(n => {
      if (!velocities.current[n.id]) velocities.current[n.id] = { x: 0, y: 0 };
    });

    // Stop previous animation
    if (animationRef.current) {
      animationRef.current.stop();
    }

    const REPULSION = 8000; // Reduced further to allow tighter clusters
    const REPULSION_DIST = 500;
    const SPRING_LENGTH = 120;
    const IMPLICIT_SPRING_LENGTH = 80; // Keep them relatively close
    const SPRING_K = 0.02; // Stronger springs for better structure
    const IMPLICIT_SPRING_K = 0.05; // Even stronger for structural links
    const DAMPING = 0.80;
    const CENTER_GRAVITY = 0.002;

    const anim = new Konva.Animation((frame) => {
      if (!frame) return;
      
      // Run multiple physics steps per frame if needed, but for perf start with 1
      const positions = nodesRef.current;
      const nodeIds = Object.keys(positions);
      const forces: Record<string, Vector> = {};
      
      // Reset forces
      for (const id of nodeIds) forces[id] = { x: 0, y: 0 };

      // 1. Repulsion (Optimized: simple distance cutoff)
      for (let i = 0; i < nodeIds.length; i++) {
        const idA = nodeIds[i];
        const posA = positions[idA];
        if (!posA) continue;

        for (let j = i + 1; j < nodeIds.length; j++) {
          const idB = nodeIds[j];
          const posB = positions[idB];
          if (!posB) continue;

          const dx = posA.x - posB.x;
          const dy = posA.y - posB.y;
          // Cheap distance check (squared)
          const distSq = dx * dx + dy * dy;
          
          // Optimization: ignore if too far
          if (distSq > REPULSION_DIST * REPULSION_DIST) continue;

          const dist = Math.sqrt(distSq) || 0.1;
          const force = REPULSION / (distSq + 100); // Avoid infinity
          
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          forces[idA].x += fx;
          forces[idA].y += fy;
          forces[idB].x -= fx;
          forces[idB].y -= fy;
        }
      }

      // 2. Attraction (Links)
      for (const link of allLinks) {
        const posA = positions[link.fromId];
        const posB = positions[link.toId];
        if (posA && posB) {
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dirX = dist === 0 ? 0 : dx / dist;
          const dirY = dist === 0 ? 0 : dy / dist;
          
          const isImplicit = (link as any).isImplicit;
          const targetLen = isImplicit ? IMPLICIT_SPRING_LENGTH : SPRING_LENGTH;
          const k = isImplicit ? IMPLICIT_SPRING_K : SPRING_K;
          const force = (dist - targetLen) * k;
          
          const fx = dirX * force;
          const fy = dirY * force;

          forces[link.fromId].x += fx;
          forces[link.fromId].y += fy;
          forces[link.toId].x -= fx;
          forces[link.toId].y -= fy;
        }
      }

      // 3. Center Gravity
      for (const id of nodeIds) {
        const pos = positions[id];
        if (!pos) continue;
        // Pull towards center (0,0)
        forces[id].x -= pos.x * CENTER_GRAVITY;
        forces[id].y -= pos.y * CENTER_GRAVITY;
      }

      // 4. Apply forces
      let maxVel = 0;
      for (const id of nodeIds) {
        const vel = velocities.current[id] || { x: 0, y: 0 };
        const f = forces[id];
        
        vel.x = (vel.x + f.x) * DAMPING;
        vel.y = (vel.y + f.y) * DAMPING;

        // Cap velocity
        const vMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (vMag > 15) {
          vel.x = (vel.x / vMag) * 15;
          vel.y = (vel.y / vMag) * 15;
        }
        
        if (vMag > maxVel) maxVel = vMag;
        
        // Update position ref
        positions[id].x += vel.x;
        positions[id].y += vel.y;

        // DIRECT KONVA UPDATE (Bypassing React)
        const nodeGroup = nodeGroupsRef.current[id];
        if (nodeGroup) {
          nodeGroup.x(positions[id].x);
          nodeGroup.y(positions[id].y);
        }
      }

      // Update link lines directly
      for (const link of allLinks) {
        const line = linkLinesRef.current[link.id];
        const start = positions[link.fromId];
        const end = positions[link.toId];
        if (line && start && end) {
          line.points([start.x, start.y, end.x, end.y]);
        }
      }

    }, layerRef.current);

    animationRef.current = anim;
    anim.start();

    return () => {
      anim.stop();
    };
  }, [nodes, allLinks]);

  // Handlers
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const oldScale = stageScale;
    const pointer = e.target.getStage().getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  // Drag individual nodes
  const handleDragMove = (e: any, id: string) => {
    const node = nodesRef.current[id];
    if (node) {
      node.x = e.target.x();
      node.y = e.target.y();
      // Reset velocity so it doesn't fly away after drag
      if (velocities.current[id]) {
        velocities.current[id] = { x: 0, y: 0 };
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, display: 'flex', gap: 10 }}>
        <button 
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255,255,255,0.1)', 
            border: '1px solid rgba(255,255,255,0.2)', 
            color: 'white', 
            padding: '8px 16px', 
            borderRadius: 4,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)'
          }}
        >
          ← Назад
        </button>

        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            style={{
              background: filterMenuOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', 
              border: '1px solid rgba(255,255,255,0.2)', 
              color: 'white', 
              padding: '8px 16px', 
              borderRadius: 4,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)'
            }}
          >
            Фильтр групп {hiddenGroups.size > 0 ? `(${hiddenGroups.size})` : ''}
          </button>
          {filterMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 8,
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              padding: 8,
              minWidth: 200,
              maxHeight: 300,
              overflowY: 'auto'
            }}>
              {rootGroups.map(g => (
                <div 
                  key={g.id}
                  onClick={() => toggleGroup(g.id)}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: hiddenGroups.has(g.id) ? '#666' : '#fff',
                    fontSize: 13
                  }}
                >
                  <span>{hiddenGroups.has(g.id) ? '⬜' : '✅'}</span>
                  <span>{g.name || 'Без названия'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={() => { setLinkMode(!linkMode); setLinkSourceId(null); }}
          style={{
            background: linkMode ? '#4a90e2' : 'rgba(255,255,255,0.1)', 
            border: linkMode ? '1px solid #4a90e2' : 'rgba(255,255,255,0.2)', 
            color: 'white', 
            padding: '8px 16px', 
            borderRadius: 4,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)'
          }}
        >
          {linkMode ? (linkSourceId ? 'Выберите второй узел...' : 'Режим связи (вкл)') : '🔗 Создать связь'}
        </button>
      </div>
      
      <Stage 
        width={window.innerWidth} 
        height={window.innerHeight}
        draggable
        onWheel={handleWheel}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onDragEnd={(e) => {
          // Only update stage pos if we dragged the stage (target is stage)
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer ref={layerRef}>
          {/* Links */}
          {allLinks.map(link => {
            const isImplicit = (link as any).isImplicit;
            return (
              <Line
                key={link.id}
                ref={el => { if (el) linkLinesRef.current[link.id] = el; }}
                points={[0, 0, 0, 0]} // Initial points, updated by animation
                stroke={isImplicit ? '#7A8C99' : (link.color || '#4a90e2')}
                strokeWidth={isImplicit ? 1.5 : 2}
                opacity={isImplicit ? 0.5 : 0.6}
                dash={undefined} // Solid lines for structure
                shadowColor={link.color || '#4a90e2'}
                shadowBlur={isImplicit ? 0 : 10}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const color = node.type === 'group' ? '#9CC5B0' : (node.color || '#E8D8A6');
            const isGroup = node.type === 'group';
            const isTask = node.type === 'task';
            
            // Visual status
            const isActive = isTask && (node.status === 'active' || node.status === 'in_progress');
            const isInactive = isTask && node.status === 'inactive';
            const opacity = isInactive ? 0.5 : 1;
            
            const baseRadius = isGroup ? 50 : 30;
            
            const label = node.type === 'task' 
              ? ((node as TaskNode).title || 'Задача') 
              : (node.type === 'group' ? ((node as GroupNode).name || 'Группа') : ((node as PersonNode).name || 'Персона'));

            return (
              <Group 
                key={node.id} 
                draggable
                onClick={() => handleNodeClick(node.id)}
                onDragMove={(e) => handleDragMove(e, node.id)}
                ref={el => { if (el) nodeGroupsRef.current[node.id] = el; }}
                opacity={opacity}
              >
                {/* Glow - stronger for active items. DISABLED BLUR FOR PERF */}
                <Circle
                  radius={baseRadius * 1.4}
                  fill={linkSourceId === node.id ? '#4a90e2' : color} // Blue if selected for link
                  opacity={isActive ? 0.3 : (linkSourceId === node.id ? 0.5 : 0.1)}
                  // shadowBlur removed for performance
                />
                {/* Core */}
                <Circle
                  radius={baseRadius}
                  fill={isGroup ? '#1a262f' : color}
                  stroke={linkSourceId === node.id ? 'white' : color}
                  strokeWidth={isGroup ? 3 : (isActive ? 3 : 1)}
                  // shadowBlur removed for performance
                />
                <Text
                  text={label}
                  fontSize={isGroup ? 14 : 12}
                  fontStyle={isGroup || isActive ? 'bold' : 'normal'}
                  fill="white"
                  align="center"
                  width={200}
                  x={-100}
                  y={baseRadius + 10}
                  listening={false} // Optimization: text doesn't need mouse events
                />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
};

export default TasksGraphPage;
