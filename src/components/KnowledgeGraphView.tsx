"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeGraph, KnowledgeGraphNode } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";
import styles from "./KnowledgeGraphView.module.css";

interface Props {
  graph: KnowledgeGraph;
  username: string;
}

interface Point {
  x: number;
  y: number;
}

const WIDTH = 1000;
const HEIGHT = 680;
const SUBJECT_COLORS = ["#2d6ef6", "#8b5cf6", "#0891b2", "#16a34a", "#d97706", "#db2777"];

function hash(value: string): number {
  return [...value].reduce((total, char) => ((total << 5) - total + char.charCodeAt(0)) | 0, 0);
}

function subjectColor(subject: string): string {
  return SUBJECT_COLORS[Math.abs(hash(subject)) % SUBJECT_COLORS.length];
}

function initialPositions(nodes: KnowledgeGraphNode[]): Record<string, Point> {
  const groups = new Map<string, KnowledgeGraphNode[]>();
  for (const node of nodes) groups.set(node.subject, [...(groups.get(node.subject) || []), node]);
  const result: Record<string, Point> = {};
  const groupEntries = [...groups.entries()];

  groupEntries.forEach(([, group], groupIndex) => {
    const clusterAngle = (groupIndex / Math.max(groupEntries.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const clusterRadius = groupEntries.length > 1 ? 205 : 0;
    const centerX = WIDTH / 2 + Math.cos(clusterAngle) * clusterRadius;
    const centerY = HEIGHT / 2 + Math.sin(clusterAngle) * clusterRadius;
    group.forEach((node, index) => {
      const angle = (index / Math.max(group.length, 1)) * Math.PI * 2 + groupIndex * 0.43;
      const radius = group.length > 1 ? 48 + (index % 3) * 25 : 0;
      result[node.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    });
  });
  return result;
}

export default function KnowledgeGraphView({ graph, username }: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const positionsRef = useRef<Record<string, Point>>({});
  const velocitiesRef = useRef<Record<string, Point>>({});
  const draggedIdRef = useRef<string | null>(null);
  const panGestureRef = useRef<{ x: number; y: number; origin: Point } | null>(null);
  const [activeSubject, setActiveSubject] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(graph.nodes[0]?.id || null);
  const [positions, setPositions] = useState<Record<string, Point>>(() => initialPositions(graph.nodes));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  const visibleNodes = useMemo(
    () => graph.nodes.filter((node) => activeSubject === "All" || node.subject === activeSubject),
    [activeSubject, graph.nodes],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [graph.edges, visibleIds],
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) || null;
  const selectedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : [];
  const matches = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return [];
    return visibleNodes.filter((node) => node.title.toLocaleLowerCase().includes(clean)).slice(0, 6);
  }, [query, visibleNodes]);

  useEffect(() => {
    const nextPositions = initialPositions(visibleNodes);
    positionsRef.current = nextPositions;
    velocitiesRef.current = Object.fromEntries(visibleNodes.map((node) => [node.id, { x: 0, y: 0 }]));
    setPositions(nextPositions);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let animationId = 0;

    const tick = () => {
      const points = positionsRef.current;
      const velocities = velocitiesRef.current;

      for (let i = 0; i < visibleNodes.length; i += 1) {
        const a = visibleNodes[i];
        const pointA = points[a.id];
        const velocityA = velocities[a.id];
        if (!pointA || !velocityA) continue;

        for (let j = i + 1; j < visibleNodes.length; j += 1) {
          const b = visibleNodes[j];
          const pointB = points[b.id];
          const velocityB = velocities[b.id];
          if (!pointB || !velocityB) continue;
          const dx = pointB.x - pointA.x || 0.1;
          const dy = pointB.y - pointA.y || 0.1;
          const distanceSquared = Math.max(dx * dx + dy * dy, 900);
          const force = 920 / distanceSquared;
          velocityA.x -= dx * force;
          velocityA.y -= dy * force;
          velocityB.x += dx * force;
          velocityB.y += dy * force;
        }
      }

      for (const edge of visibleEdges) {
        const source = points[edge.source];
        const target = points[edge.target];
        const sourceVelocity = velocities[edge.source];
        const targetVelocity = velocities[edge.target];
        if (!source || !target || !sourceVelocity || !targetVelocity) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const force = (distance - 145) * 0.0017;
        sourceVelocity.x += (dx / distance) * force;
        sourceVelocity.y += (dy / distance) * force;
        targetVelocity.x -= (dx / distance) * force;
        targetVelocity.y -= (dy / distance) * force;
      }

      for (const node of visibleNodes) {
        const point = points[node.id];
        const velocity = velocities[node.id];
        if (!point || !velocity || draggedIdRef.current === node.id) continue;
        velocity.x += (WIDTH / 2 - point.x) * 0.00045;
        velocity.y += (HEIGHT / 2 - point.y) * 0.00045;
        velocity.x *= 0.88;
        velocity.y *= 0.88;
        point.x = Math.max(55, Math.min(WIDTH - 55, point.x + velocity.x));
        point.y = Math.max(45, Math.min(HEIGHT - 45, point.y + velocity.y));
      }

      frame += 1;
      setPositions({ ...points });
      if (frame < 150) animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [visibleEdges, visibleNodes]);

  const clientToGraph = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) * (WIDTH / rect.width) - pan.x) / zoom,
      y: ((clientY - rect.top) * (HEIGHT / rect.height) - pan.y) / zoom,
    };
  };

  const beginNodeDrag = (event: ReactPointerEvent<SVGGElement>, nodeId: string) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedIdRef.current = nodeId;
    setSelectedId(nodeId);
  };

  const moveNode = (event: ReactPointerEvent<SVGGElement>, nodeId: string) => {
    if (draggedIdRef.current !== nodeId) return;
    const point = clientToGraph(event.clientX, event.clientY);
    positionsRef.current[nodeId] = point;
    velocitiesRef.current[nodeId] = { x: 0, y: 0 };
    setPositions({ ...positionsRef.current });
  };

  const endNodeDrag = (event: ReactPointerEvent<SVGGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggedIdRef.current = null;
  };

  const openNode = (node: KnowledgeGraphNode) => {
    setSelectedId(node.id);
    if (node.href) router.push(node.href);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => router.push("/")} aria-label="Back to notebooks">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>Knowledge atlas</span>
          <h1>Connections</h1>
        </div>
        <div className={styles.headerStats} aria-label={`${graph.nodes.length} nodes and ${graph.edges.length} connections`}>
          <span>{graph.nodes.length} nodes</span><span>{graph.edges.length} links</span>
        </div>
        <div className={styles.headerRight}><ThemeToggle /><span>{username}</span></div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.controls} aria-label="Graph controls">
          <label className={styles.searchLabel}>
            <span>Find a note or concept</span>
            <div className={styles.searchBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search graph…" aria-label="Search graph" />
            </div>
          </label>
          {matches.length > 0 && (
            <div className={styles.matches}>
              {matches.map((node) => <button key={node.id} onClick={() => { setSelectedId(node.id); setQuery(node.title); }}>{node.title}<small>{node.kind}</small></button>)}
            </div>
          )}
          <div className={styles.filterHeader}><span>Subjects</span><small>Cluster filter</small></div>
          <div className={styles.filters}>
            {["All", ...graph.subjects].map((subject) => (
              <button key={subject} className={activeSubject === subject ? styles.activeFilter : ""} onClick={() => setActiveSubject(subject)}>
                <span className={styles.colorDot} style={{ background: subject === "All" ? "conic-gradient(#2d6ef6, #db2777, #16a34a, #2d6ef6)" : subjectColor(subject) }} />
                <span>{subject}</span>
                <small>{subject === "All" ? graph.nodes.length : graph.nodes.filter((node) => node.subject === subject).length}</small>
              </button>
            ))}
          </div>
          <p className={styles.hint}>Drag nodes to inspect relationships. Scroll to zoom; drag empty space to pan.</p>
        </aside>

        <main className={styles.graphShell}>
          {visibleNodes.length === 0 ? (
            <div className={styles.empty}><h2>No nodes in this subject</h2><p>Choose another cluster to restore the constellation.</p></div>
          ) : (
            <svg
              ref={svgRef}
              className={styles.graph}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label="Interactive force-directed knowledge graph"
              onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(0.55, Math.min(2.2, value * (event.deltaY > 0 ? 0.92 : 1.08)))); }}
              onPointerDown={(event) => { if (event.target === event.currentTarget) { event.currentTarget.setPointerCapture(event.pointerId); panGestureRef.current = { x: event.clientX, y: event.clientY, origin: pan }; } }}
              onPointerMove={(event) => { const gesture = panGestureRef.current; const rect = svgRef.current?.getBoundingClientRect(); if (gesture && rect) setPan({ x: gesture.origin.x + (event.clientX - gesture.x) * (WIDTH / rect.width), y: gesture.origin.y + (event.clientY - gesture.y) * (HEIGHT / rect.height) }); }}
              onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); panGestureRef.current = null; }}
            >
              <defs>
                <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#111827" floodOpacity="0.15" /></filter>
              </defs>
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {visibleEdges.map((edge) => {
                  const source = positions[edge.source]; const target = positions[edge.target];
                  if (!source || !target) return null;
                  const isSelected = selectedId === edge.source || selectedId === edge.target;
                  return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={isSelected ? styles.selectedEdge : styles.edge} strokeWidth={Math.min(5, 1.2 + edge.mentions * 0.55)} />;
                })}
                {visibleNodes.map((node) => {
                  const point = positions[node.id]; if (!point) return null;
                  const radius = node.kind === "notebook" ? 24 : 17;
                  const isMatch = query.trim() && node.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
                  const isSelected = node.id === selectedId;
                  return (
                    <g key={node.id} transform={`translate(${point.x} ${point.y})`} className={styles.node} role="link" tabIndex={0} aria-label={`${node.title}, ${node.kind}`} onPointerDown={(event) => beginNodeDrag(event, node.id)} onPointerMove={(event) => moveNode(event, node.id)} onPointerUp={endNodeDrag} onDoubleClick={() => openNode(node)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNode(node); } }}>
                      {(isSelected || isMatch) && <circle r={radius + 8} fill="none" stroke={subjectColor(node.subject)} strokeWidth="2" opacity="0.35" />}
                      <circle r={radius} fill={node.kind === "notebook" ? subjectColor(node.subject) : "var(--graph-concept)"} stroke={node.kind === "notebook" ? "white" : subjectColor(node.subject)} strokeWidth={node.kind === "notebook" ? 3 : 2} filter="url(#node-glow)" />
                      {node.kind === "notebook" && <path d="M-7 -8h10l5 5v12h-15v-17zM3-8v5h5M-3 2h7M-3 6h5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
                      <text y={radius + 18} textAnchor="middle" className={styles.nodeLabel}>{node.title.length > 24 ? `${node.title.slice(0, 22)}…` : node.title}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          <div className={styles.zoomControls} aria-label="Zoom controls">
            <button onClick={() => setZoom((value) => Math.min(2.2, value + 0.15))} aria-label="Zoom in">+</button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset graph view">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom((value) => Math.max(0.55, value - 0.15))} aria-label="Zoom out">−</button>
          </div>
        </main>

        <aside className={styles.inspector} aria-label="Selected node details">
          {selectedNode ? (
            <>
              <div className={styles.inspectorKind}><span style={{ background: subjectColor(selectedNode.subject) }} />{selectedNode.kind}</div>
              <h2>{selectedNode.title}</h2>
              <p>{selectedNode.subject}</p>
              <div className={styles.connectionStats}><div><strong>{selectedNode.incoming_count}</strong><span>Backlinks</span></div><div><strong>{selectedNode.outgoing_count}</strong><span>Outgoing</span></div></div>
              {selectedNode.href && <button className={styles.openButton} onClick={() => router.push(selectedNode.href!)}>Open notebook</button>}
              <div className={styles.relatedHeader}>Direct connections</div>
              <div className={styles.relatedList}>
                {selectedEdges.length === 0 ? <p className={styles.noLinks}>No wiki links yet. Add <code>[[Note Title]]</code> inside a notebook.</p> : selectedEdges.map((edge) => {
                  const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                  const other = graph.nodes.find((node) => node.id === otherId);
                  return other ? <button key={edge.id} onClick={() => setSelectedId(other.id)}><span style={{ background: subjectColor(other.subject) }} /> <div>{other.title}<small>{edge.mentions} mention{edge.mentions === 1 ? "" : "s"}</small></div></button> : null;
                })}
              </div>
            </>
          ) : <p className={styles.noLinks}>Select a node to inspect it.</p>}
        </aside>
      </div>
    </div>
  );
}
