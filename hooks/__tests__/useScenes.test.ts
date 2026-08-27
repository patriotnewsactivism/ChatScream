import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCENES, useScenes } from '../useScenes';

const STORAGE_KEY = 'chatscream.scenes.v1';

const names = (scenes: { name: string }[]) => scenes.map((s) => s.name);

describe('useScenes', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the shipped scenes on first run', () => {
    const { result } = renderHook(() => useScenes());
    expect(names(result.current.scenes)).toEqual(names(DEFAULT_SCENES));
  });

  it('restores a stored collection instead of reseeding', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'only', name: 'Only One', sources: [] }]),
    );
    const { result } = renderHook(() => useScenes());
    expect(names(result.current.scenes)).toEqual(['Only One']);
  });

  it('falls back to the defaults when stored data is unusable', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const { result } = renderHook(() => useScenes());
    expect(names(result.current.scenes)).toEqual(names(DEFAULT_SCENES));
  });

  it('drops entries that are not scenes rather than rendering them', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'ok', name: 'Keeper', sources: [] }, { nope: true }, null]),
    );
    const { result } = renderHook(() => useScenes());
    expect(names(result.current.scenes)).toEqual(['Keeper']);
  });

  it('adds, renames and deletes scenes', () => {
    const { result } = renderHook(() => useScenes());
    act(() => {
      result.current.addScene('Field Interview');
    });
    expect(names(result.current.scenes)).toContain('Field Interview');

    const added = result.current.scenes.find((s) => s.name === 'Field Interview')!;
    act(() => result.current.renameScene(added.id, '  Courthouse  '));
    expect(names(result.current.scenes)).toContain('Courthouse');

    act(() => result.current.deleteScene(added.id));
    expect(names(result.current.scenes)).not.toContain('Courthouse');
  });

  it('ignores a rename to blank rather than leaving a nameless scene', () => {
    const { result } = renderHook(() => useScenes());
    const first = result.current.scenes[0];
    act(() => result.current.renameScene(first.id, '   '));
    expect(result.current.scenes[0].name).toBe(first.name);
  });

  it('places a duplicate directly after its original with a distinct id', () => {
    const { result } = renderHook(() => useScenes());
    const source = result.current.scenes[0];
    act(() => {
      result.current.duplicateScene(source.id);
    });
    expect(result.current.scenes[1].name).toBe(`${source.name} copy`);
    expect(result.current.scenes[1].id).not.toBe(source.id);
    // Sources are copied, not shared — editing one must not edit the other.
    expect(result.current.scenes[1].sources[0]).not.toBe(source.sources[0]);
  });

  it('reorders scenes and stops at the ends', () => {
    const { result } = renderHook(() => useScenes());
    const original = names(result.current.scenes);

    act(() => result.current.moveScene(result.current.scenes[1].id, -1));
    expect(names(result.current.scenes).slice(0, 2)).toEqual([original[1], original[0]]);

    // Already first — moving up again is a no-op, not a wrap or a drop.
    const afterSwap = names(result.current.scenes);
    act(() => result.current.moveScene(result.current.scenes[0].id, -1));
    expect(names(result.current.scenes)).toEqual(afterSwap);

    const lastId = result.current.scenes[result.current.scenes.length - 1].id;
    act(() => result.current.moveScene(lastId, 1));
    expect(names(result.current.scenes)).toEqual(afterSwap);
  });

  it('persists edits so a reload keeps them', () => {
    const { result } = renderHook(() => useScenes());
    act(() => {
      result.current.addScene('Persisted');
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored.map((s: { name: string }) => s.name)).toContain('Persisted');

    const reloaded = renderHook(() => useScenes());
    expect(names(reloaded.result.current.scenes)).toContain('Persisted');
  });

  it('restores the shipped set on reset', () => {
    const { result } = renderHook(() => useScenes());
    act(() => {
      result.current.addScene('Temporary');
    });
    act(() => result.current.resetScenes());
    expect(names(result.current.scenes)).toEqual(names(DEFAULT_SCENES));
  });
});
