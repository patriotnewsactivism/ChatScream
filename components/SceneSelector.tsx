import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { Scene } from '../types';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import SceneThumbnail from './SceneThumbnail';

interface SceneSelectorProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSceneSelect: (scene: Scene | null) => void;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  onAddScene: () => void;
  onDuplicateScene: (id: string) => void;
  onRenameScene: (id: string, name: string) => void;
  onDeleteScene: (id: string) => void;
  onMoveScene: (id: string, direction: -1 | 1) => void;
  onResetScenes: () => void;
}

const IconBtn: FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
      danger
        ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/30'
        : 'text-gray-500 hover:text-white hover:bg-gray-700'
    }`}
  >
    {children}
  </button>
);

const SceneSelector: FC<SceneSelectorProps> = ({
  scenes,
  activeSceneId,
  onSceneSelect,
  cameraStream,
  screenStream,
  onAddScene,
  onDuplicateScene,
  onRenameScene,
  onDeleteScene,
  onMoveScene,
  onResetScenes,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const beginRename = (scene: Scene) => {
    setEditingId(scene.id);
    setDraft(scene.name);
  };

  const commitRename = () => {
    if (editingId) onRenameScene(editingId, draft);
    setEditingId(null);
  };

  return (
    <section className="flex flex-col gap-2 min-w-0">
      <header className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          Scene Engine
        </h3>
        <div className="flex items-center">
          <IconBtn label="Restore default scenes" onClick={onResetScenes}>
            <RotateCcw size={13} />
          </IconBtn>
          <IconBtn label="Add scene" onClick={onAddScene}>
            <Plus size={15} />
          </IconBtn>
        </div>
      </header>

      <button
        type="button"
        onClick={() => onSceneSelect(null)}
        aria-pressed={!activeSceneId}
        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
          !activeSceneId
            ? 'bg-brand-500/10 border-brand-500 text-brand-400'
            : 'bg-dark-800 border-gray-800 text-gray-400 hover:border-gray-600'
        }`}
      >
        <Layers size={18} className="shrink-0" />
        <span className="text-sm font-bold uppercase tracking-tight">Manual Layout</span>
      </button>

      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {scenes.map((scene, i) => {
          const active = activeSceneId === scene.id;
          const editing = editingId === scene.id;
          return (
            <li key={scene.id}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => !editing && onSceneSelect(scene)}
                onKeyDown={(e) => {
                  if (editing) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSceneSelect(scene);
                  }
                }}
                className={`group w-full rounded-lg border overflow-hidden text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-brand-500/10 border-brand-500'
                    : 'bg-dark-800 border-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="relative">
                  <SceneThumbnail
                    scene={scene}
                    cameraStream={cameraStream}
                    screenStream={screenStream}
                  />
                  {active && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-brand-500 text-[9px] font-bold uppercase tracking-wider text-white">
                      On air
                    </span>
                  )}
                  {/* Actions ride on the thumbnail so the name below keeps the
                      full width — sharing that row truncated most names. */}
                  <div className="absolute top-1 right-1 flex items-center rounded-md bg-dark-950/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn
                      label={`Move ${scene.name} up`}
                      onClick={() => onMoveScene(scene.id, -1)}
                      disabled={i === 0}
                    >
                      <ChevronUp size={13} />
                    </IconBtn>
                    <IconBtn
                      label={`Move ${scene.name} down`}
                      onClick={() => onMoveScene(scene.id, 1)}
                      disabled={i === scenes.length - 1}
                    >
                      <ChevronDown size={13} />
                    </IconBtn>
                    <IconBtn label={`Rename ${scene.name}`} onClick={() => beginRename(scene)}>
                      <Pencil size={13} />
                    </IconBtn>
                    <IconBtn
                      label={`Duplicate ${scene.name}`}
                      onClick={() => onDuplicateScene(scene.id)}
                    >
                      <Copy size={13} />
                    </IconBtn>
                    <IconBtn
                      label={`Delete ${scene.name}`}
                      danger
                      onClick={() => {
                        if (active) onSceneSelect(null);
                        onDeleteScene(scene.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </IconBtn>
                  </div>
                </div>

                <div className="flex items-center gap-1 px-2 py-1.5 min-w-0">
                  {editing ? (
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      aria-label={`Rename ${scene.name}`}
                      className="flex-1 min-w-0 bg-dark-900 border border-brand-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                    />
                  ) : (
                    <span
                      className={`flex-1 min-w-0 truncate text-xs font-bold uppercase tracking-tight ${
                        active ? 'text-brand-400' : 'text-gray-300'
                      }`}
                      title={scene.name}
                    >
                      {scene.name}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {scenes.length === 0 && (
        <p className="text-xs text-gray-500 italic px-1 py-3 text-center">
          No scenes yet — add one to get started.
        </p>
      )}
    </section>
  );
};

export default SceneSelector;
