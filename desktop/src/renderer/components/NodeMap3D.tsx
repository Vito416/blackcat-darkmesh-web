import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ManifestNode } from "../types/manifest";

export type NodeMap3DProps = {
  nodes: ManifestNode[];
  selectedIds: string[];
  liteMode?: boolean;
  height?: number;
};

type FlatNode = {
  id: string;
  title: string;
  depth: number;
  parentId?: string;
};

const flattenNodes = (nodes: ManifestNode[], depth = 0, parentId?: string, acc: FlatNode[] = []): FlatNode[] => {
  nodes.forEach((node) => {
    acc.push({ id: node.id, title: node.title, depth, parentId });
    if (node.children?.length) {
      flattenNodes(node.children, depth + 1, node.id, acc);
    }
  });
  return acc;
};

const lightColors = [0x5fffe0, 0x7bd8ff, 0xbe8bff, 0xff6ad5];

export const NodeMap3D: React.FC<NodeMap3DProps> = ({ nodes, selectedIds, liteMode = false, height = 260 }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameRef = useRef<number>();

  const flatNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const links = useMemo(
    () => flatNodes.filter((n) => n.parentId).map((n) => ({ from: n.parentId as string, to: n.id })),
    [flatNodes],
  );

  useEffect(() => {
    if (!mountRef.current) return undefined;

    const width = mountRef.current.clientWidth || mountRef.current.offsetWidth || 640;
    const h = height;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(48, width / h, 0.1, 1000);
    camera.position.set(0, 0, 24);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !liteMode, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, liteMode ? 1.4 : 2));
    renderer.setSize(width, h);
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x88aaff, liteMode ? 0.5 : 0.8);
    scene.add(ambient);
    const keyLight = new THREE.PointLight(0x66ffdd, liteMode ? 0.8 : 1.2, 60);
    keyLight.position.set(14, 16, 18);
    scene.add(keyLight);

    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);

    const positions: Record<string, THREE.Vector3> = {};
    const radiusBase = 6;
    const depthSpread = 2.5;

    flatNodes.forEach((node, idx) => {
      const angle = idx * 2.399963; // golden angle for distribution
      const radius = radiusBase + node.depth * 1.2;
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.7,
        liteMode ? 0 : Math.sin(angle * 0.6 + node.depth) * depthSpread,
      );
      positions[node.id] = pos;
      const isSelected = selectedIds.includes(node.id);
      const sphereGeom = new THREE.SphereGeometry(isSelected ? 0.45 : 0.32, 18, 18);
      const sphereMat = new THREE.MeshPhongMaterial({
        color: isSelected ? 0xffffff : lightColors[idx % lightColors.length],
        emissive: isSelected ? 0x66ffff : lightColors[idx % lightColors.length],
        emissiveIntensity: isSelected ? 1.3 : 0.6,
        transparent: true,
        opacity: 0.9,
        shininess: 90,
      });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.position.copy(pos);
      nodesGroup.add(sphere);
    });

    if (links.length) {
      const linkMat = new THREE.LineBasicMaterial({ color: 0x4cf1ff, transparent: true, opacity: liteMode ? 0.35 : 0.55 });
      const linkGeom = new THREE.BufferGeometry();
      const linkPoints: number[] = [];
      links.forEach((link) => {
        const from = positions[link.from];
        const to = positions[link.to];
        if (!from || !to) return;
        linkPoints.push(from.x, from.y, from.z, to.x, to.y, to.z);
      });
      linkGeom.setAttribute("position", new THREE.Float32BufferAttribute(linkPoints, 3));
      const lines = new THREE.LineSegments(linkGeom, linkMat);
      nodesGroup.add(lines);
    }

    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
      if (!liteMode) {
        sceneRef.current.rotation.y += 0.0026;
        sceneRef.current.rotation.x = Math.sin(Date.now() * 0.00015) * 0.12;
      }
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth || 640;
      const aspect = w / h;
      cameraRef.current.aspect = aspect;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current || 0);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
      scene.clear();
    };
  }, [flatNodes, links, selectedIds, liteMode, height]);

  return <div className="node-map-3d" style={{ height }} ref={mountRef} />;
};

export default NodeMap3D;
