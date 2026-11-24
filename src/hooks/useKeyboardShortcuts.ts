import { useEffect } from 'react';
import { useEditorStore } from '../stores/useEditorStore';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(disabled = false): void {
  const {
    project,
    setIsPlaying,
    undo,
    redo,
    saveNow,
    notify,
    deleteSelectedClip,
    splitAtPlayhead,
    setPlayhead,
    setZoomPps,
    setActiveTool,
  } = useEditorStore();

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isMod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (isMod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow().then(() => notify('Project saved locally to IndexedDB.', 'success'));
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedClip();
        return;
      }

      if (!isMod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      if (!isMod && e.key.toLowerCase() === 'v') {
        setActiveTool('select');
        return;
      }

      if (!isMod && e.key.toLowerCase() === 'c') {
        setActiveTool('razor');
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const fps = project?.fps ?? 30;
        const step = (e.shiftKey ? 10 : 1) / fps;
        const delta = e.key === 'ArrowRight' ? step : -step;
        setIsPlaying(false);
        setPlayhead((prev) => Math.max(0, Number((prev + delta).toFixed(4))));
        return;
      }

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoomPps((prev) => Math.min(240, Math.round(prev * 1.25)));
        return;
      }

      if (e.key === '-') {
        e.preventDefault();
        setZoomPps((prev) => Math.max(16, Math.round(prev / 1.25)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    disabled,
    project?.fps,
    setIsPlaying,
    undo,
    redo,
    saveNow,
    notify,
    deleteSelectedClip,
    splitAtPlayhead,
    setPlayhead,
    setZoomPps,
    setActiveTool,
  ]);
}
