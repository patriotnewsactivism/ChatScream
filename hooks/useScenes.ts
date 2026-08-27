import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scene, SceneSource } from '../types';

const STORAGE_KEY = 'chatscream.scenes.v1';

const CANVAS_W = 1280;
const CANVAS_H = 720;

const full = (
  id: string,
  type: SceneSource['type'],
  extra: Partial<SceneSource> = {},
): SceneSource => ({
  id,
  type,
  x: 0,
  y: 0,
  width: CANVAS_W,
  height: CANVAS_H,
  zIndex: 1,
  opacity: 1,
  isVisible: true,
  ...extra,
});

/**
 * Shipped starting set. These are seeded into the user's editable collection on
 * first run rather than rendered from a frozen constant, so renaming or
 * reordering them behaves the same as for a scene the user made themselves.
 */
export const DEFAULT_SCENES: Scene[] = [
  { id: 'camera-only', name: 'Camera Only', sources: [full('cam-1', 'camera')] },
  {
    id: 'screen-cam-pip',
    name: 'Screen + Cam PIP',
    sources: [
      full('screen-1', 'screen'),
      full('cam-1', 'camera', { x: 960, y: 540, width: 320, height: 180, zIndex: 2 }),
    ],
  },
  {
    id: 'starting-soon',
    name: 'Starting Soon',
    sources: [
      full('bg-1', 'image', { url: 'https://images.unsplash.com/photo-1557683316-973673baf926' }),
      full('text-1', 'text', { x: 440, y: 300, width: 400, height: 100, zIndex: 2 }),
    ],
  },
  {
    id: 'brb',
    name: 'BRB',
    sources: [
      full('bg-1', 'image', { url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85' }),
      full('text-brb', 'text', { x: 500, y: 300, width: 280, height: 80, zIndex: 2 }),
    ],
  },
  {
    id: 'just-chatting',
    name: 'Just Chatting',
    sources: [
      full('bg-1', 'image', { url: 'https://images.unsplash.com/photo-1557682224-5b8590cd9ec5' }),
      full('cam-1', 'camera', { x: 50, y: 50, width: 800, height: 450, zIndex: 2 }),
    ],
  },
];

const isScene = (v: unknown): v is Scene => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Scene>;
  return typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.sources);
};

const readStored = (): Scene[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const scenes = parsed.filter(isScene);
    return scenes.length ? scenes : null;
  } catch {
    return null;
  }
};

const newId = () => `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export interface UseScenesResult {
  scenes: Scene[];
  addScene: (name?: string) => Scene;
  duplicateScene: (id: string) => Scene | null;
  renameScene: (id: string, name: string) => void;
  deleteScene: (id: string) => void;
  moveScene: (id: string, direction: -1 | 1) => void;
  resetScenes: () => void;
}

export const useScenes = (): UseScenesResult => {
  const [scenes, setScenes] = useState<Scene[]>(() => readStored() ?? DEFAULT_SCENES);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
    } catch {
      // A full or blocked quota costs persistence, not the session.
    }
  }, [scenes]);

  const addScene = useCallback((name?: string) => {
    const scene: Scene = {
      id: newId(),
      name: name?.trim() || 'New Scene',
      sources: [full('cam-1', 'camera')],
    };
    setScenes((prev) => [...prev, scene]);
    return scene;
  }, []);

  const duplicateScene = useCallback(
    (id: string) => {
      const source = scenes.find((s) => s.id === id);
      if (!source) return null;
      const copy: Scene = {
        ...source,
        id: newId(),
        name: `${source.name} copy`,
        sources: source.sources.map((src) => ({ ...src })),
      };
      setScenes((prev) => {
        const at = prev.findIndex((s) => s.id === id);
        const next = [...prev];
        next.splice(at + 1, 0, copy);
        return next;
      });
      return copy;
    },
    [scenes],
  );

  const renameScene = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
  }, []);

  const deleteScene = useCallback((id: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const moveScene = useCallback((id: string, direction: -1 | 1) => {
    setScenes((prev) => {
      const at = prev.findIndex((s) => s.id === id);
      const to = at + direction;
      if (at < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[at], next[to]] = [next[to], next[at]];
      return next;
    });
  }, []);

  const resetScenes = useCallback(() => setScenes(DEFAULT_SCENES), []);

  return useMemo(
    () => ({ scenes, addScene, duplicateScene, renameScene, deleteScene, moveScene, resetScenes }),
    [scenes, addScene, duplicateScene, renameScene, deleteScene, moveScene, resetScenes],
  );
};
