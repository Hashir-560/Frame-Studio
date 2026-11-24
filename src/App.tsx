import { useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  return (
    <MotionConfig reducedMotion="user">
      {activeProjectId ? (
        <Editor
          projectId={activeProjectId}
          onBackToDashboard={() => setActiveProjectId(null)}
        />
      ) : (
        <Dashboard onOpenProject={(id) => setActiveProjectId(id)} />
      )}
    </MotionConfig>
  );
}
