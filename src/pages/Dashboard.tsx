import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Clock,
  Download,
  Film,
  FolderKanban,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  List,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sliders,
  Star,
  X,
} from 'lucide-react';
import {
  deleteProjectRecord,
  duplicateProjectMediaRecords,
  getAllProjects,
  getProjectMediaStatsMap,
  loadDashboardSettings,
  saveDashboardSettings,
  saveProjectRecord,
  type ProjectMediaStats,
} from '../services/db';
import {
  DASHBOARD_TEMPLATES,
  createNewProject,
  createProjectFromTemplate,
  type ProjectTemplateSpec,
} from '../features/project/projectFactory';
import {
  ASPECT_RATIO_OPTIONS,
  PROJECT_CATEGORIES,
  RESOLUTION_TIER_OPTIONS,
  buildResolutionPreset,
  type AspectRatioKey,
  type DashboardSettings,
  type Project,
  type ProjectCategory,
  type ResolutionPreset,
  type ResolutionTier,
} from '../types/editor';
import { createId } from '../utils/id';
import { formatFileSize } from '../utils/timecode';
import { NewProjectModal } from '../components/dashboard/NewProjectModal';
import { ProjectCard } from '../components/dashboard/ProjectCard';
import { ConfirmModal } from '../components/common/ConfirmModal';

interface DashboardProps {
  onOpenProject: (projectId: string) => void;
}

type SidebarSection = 'dashboard' | 'all' | 'recent' | 'templates' | 'settings';
type SortOption = 'edited' | 'opened' | 'newest' | 'oldest' | 'name';
type CategoryFilter = 'All' | 'Favorites' | ProjectCategory;

const NAV_ITEMS: {
  id: SidebarSection;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'all', label: 'All Projects', icon: FolderKanban },
  { id: 'recent', label: 'Recent Projects', icon: Clock },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadDashboardSettings());
  const [section, setSection] = useState<SidebarSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [mediaStatsMap, setMediaStatsMap] = useState<Record<string, ProjectMediaStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [sortBy, setSortBy] = useState<SortOption>('edited');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => settings.defaultViewMode);

  const [showNewModal, setShowNewModal] = useState(false);
  const [modalSeed, setModalSeed] = useState<{
    tier?: ResolutionTier;
    ratio?: AspectRatioKey;
    fps?: 24 | 30 | 60;
  }>({});

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [settingsSavedNotice, setSettingsSavedNotice] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stats] = await Promise.all([getAllProjects(), getProjectMediaStatsMap()]);
      setProjects(list);
      setMediaStatsMap(stats);
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        if (typeof est.usage === 'number' && typeof est.quota === 'number') {
          setStorageUsage({ used: est.usage, quota: est.quota });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to access local IndexedDB storage.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const updateSettings = (patch: Partial<DashboardSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveDashboardSettings(next);
    if (patch.defaultViewMode) {
      setViewMode(patch.defaultViewMode);
    }
    setSettingsSavedNotice(true);
    window.setTimeout(() => setSettingsSavedNotice(false), 1800);
  };

  const openProjectWithTimestamp = async (proj: Project) => {
    const now = Date.now();
    const updated: Project = { ...proj, lastOpenedAt: now };
    try {
      await saveProjectRecord(updated);
    } catch {
      // Proceed even if timestamp update fails
    }
    onOpenProject(proj.id);
  };

  const handleOpenNewModal = (seed?: {
    tier?: ResolutionTier;
    ratio?: AspectRatioKey;
    fps?: 24 | 30 | 60;
  }) => {
    setModalSeed(seed ?? {});
    setShowNewModal(true);
  };

  const handleCreateProject = async (
    name: string,
    resolution: ResolutionPreset,
    fps: 24 | 30 | 60,
    options: { category: ProjectCategory; proxyMode: boolean }
  ) => {
    const project = createNewProject(name, resolution, fps, {
      category: options.category,
      proxyMode: options.proxyMode,
    });
    await saveProjectRecord(project);
    setShowNewModal(false);
    onOpenProject(project.id);
  };

  const handleQuickCreatePreset = async (
    name: string,
    tier: ResolutionTier,
    ratio: AspectRatioKey,
    fps: 24 | 30 | 60,
    category: ProjectCategory
  ) => {
    const resolution = buildResolutionPreset(tier, ratio);
    const project = createNewProject(name, resolution, fps, {
      category,
      proxyMode: settings.defaultProxyMode,
    });
    await saveProjectRecord(project);
    onOpenProject(project.id);
  };

  const handleUseTemplate = async (template: ProjectTemplateSpec) => {
    const project = createProjectFromTemplate(template, template.name, settings.defaultProxyMode);
    await saveProjectRecord(project);
    onOpenProject(project.id);
  };

  const handleToggleFavorite = async (proj: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated: Project = { ...proj, favorite: !proj.favorite };
    setProjects((prev) => prev.map((p) => (p.id === proj.id ? updated : p)));
    await saveProjectRecord(updated);
  };

  const handleDuplicate = async (source: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = createId('proj');
    const mediaIdMap = await duplicateProjectMediaRecords(source.id, newId);
    const clonedClips = source.clips.map((c) => ({
      ...c,
      id: createId('clip'),
      mediaId: c.mediaId ? mediaIdMap.get(c.mediaId) ?? c.mediaId : null,
      transform: { ...c.transform },
      crop: { ...c.crop },
      keyframes: c.keyframes.map((k) => ({ ...k })),
      speedCurve: { ...c.speedCurve },
      color: { ...c.color },
      effects: { ...c.effects },
      chromaKey: { ...c.chromaKey },
      mask: { ...c.mask },
      stabilization: {
        ...c.stabilization,
        offsets: c.stabilization.offsets.map((o) => ({ ...o })),
      },
      audio: { ...c.audio },
      transitionIn: { ...c.transitionIn },
      transitionOut: { ...c.transitionOut },
      text: c.text ? { ...c.text } : undefined,
      sticker: c.sticker ? { ...c.sticker } : undefined,
    }));
    const now = Date.now();
    const copy: Project = {
      ...source,
      id: newId,
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      tracks: source.tracks.map((t) => ({ ...t })),
      clips: clonedClips,
    };
    await saveProjectRecord(copy);
    await loadProjects();
  };

  const startRename = (proj: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(proj.id);
    setRenameDraft(proj.name);
  };

  const commitRename = async (proj: Project) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === proj.name) return;
    const updated: Project = { ...proj, name: trimmed, updatedAt: Date.now() };
    await saveProjectRecord(updated);
    setProjects((prev) => prev.map((p) => (p.id === proj.id ? updated : p)));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteProjectRecord(pendingDelete.id);
    setPendingDelete(null);
    await loadProjects();
  };

  const handleExportIndexJson = () => {
    const manifest = projects.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? 'General',
      favorite: Boolean(p.favorite),
      resolution: p.resolution,
      fps: p.fps,
      clipCount: p.clips.length,
      trackCount: p.tracks.length,
      createdAt: new Date(p.createdAt).toISOString(),
      updatedAt: new Date(p.updatedAt).toISOString(),
      lastOpenedAt: p.lastOpenedAt ? new Date(p.lastOpenedAt).toISOString() : null,
    }));
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `framestudio_projects_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Real storage & project aggregations
  const { totalMediaBytes, totalMediaCount } = useMemo(() => {
    let bytes = 0;
    let count = 0;
    for (const stat of Object.values(mediaStatsMap)) {
      bytes += stat.totalBytes;
      count += stat.mediaCount;
    }
    return { totalMediaBytes: bytes, totalMediaCount: count };
  }, [mediaStatsMap]);

  const favoriteProjects = useMemo(
    () => projects.filter((p) => Boolean(p.favorite)).sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );

  const recentProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...projects]
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(
        (a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt)
      );
  }, [projects, searchQuery]);

  const filteredAllProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (categoryFilter === 'Favorites') return Boolean(p.favorite);
      if (categoryFilter !== 'All') return (p.category ?? 'General') === categoryFilter;
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      if (sortBy === 'opened') {
        return (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt);
      }
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [projects, searchQuery, categoryFilter, sortBy]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return DASHBOARD_TEMPLATES;
    return DASHBOARD_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const usedPct = useMemo(() => {
    if (!storageUsage || storageUsage.quota <= 0) return 0;
    return Math.min(100, Math.max(1, (storageUsage.used / storageUsage.quota) * 100));
  }, [storageUsage]);

  const activeNavLabel = NAV_ITEMS.find((i) => i.id === section)?.label ?? 'Dashboard';

  const renderEmptyState = (title: string, description: string, showClearSearch = false) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-white/[0.06] bg-[#14171F] py-16 px-6 text-center max-w-lg mx-auto mt-6"
    >
      <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#1C202B] border border-white/[0.07] flex items-center justify-center">
        <FolderOpen className="w-5 h-5 text-[#7DD3FC]" />
      </div>
      <h3 className="font-display text-base font-semibold text-[#FAF9F6]">{title}</h3>
      <p className="text-xs text-[#9BA3AB] mt-2 mb-6 max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
      <div className="flex items-center justify-center gap-2.5">
        {showClearSearch && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('All');
            }}
            className="px-4 py-2 text-xs font-medium text-[#dce4e4] bg-[#1F2430] hover:bg-[#272D3C] rounded-xl transition-colors"
          >
            Reset Filters
          </button>
        )}
        <button
          type="button"
          onClick={() => handleOpenNewModal()}
          className="px-4 py-2 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </button>
      </div>
    </motion.div>
  );

  const renderProjectCollection = (items: Project[], emptyTitle: string, emptyDesc: string) => {
    if (loading) {
      return (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'
              : 'space-y-2.5'
          }
        >
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className={
                viewMode === 'grid'
                  ? 'h-64 bg-[#151820] border border-white/[0.05] rounded-2xl animate-pulse'
                  : 'h-20 bg-[#151820] border border-white/[0.05] rounded-xl animate-pulse'
              }
            />
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return renderEmptyState(
        emptyTitle,
        emptyDesc,
        Boolean(searchQuery.trim() || categoryFilter !== 'All')
      );
    }

    return (
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'
            : 'space-y-2.5'
        }
      >
        {items.map((proj) => (
          <ProjectCard
            key={proj.id}
            project={proj}
            mediaStats={mediaStatsMap[proj.id]}
            viewMode={viewMode}
            isRenaming={renamingId === proj.id}
            renameDraft={renameDraft}
            onRenameDraftChange={setRenameDraft}
            onStartRename={startRename}
            onCommitRename={(p) => void commitRename(p)}
            onCancelRename={() => setRenamingId(null)}
            onToggleFavorite={(p, e) => void handleToggleFavorite(p, e)}
            onDuplicate={(p, e) => void handleDuplicate(p, e)}
            onRequestDelete={(p, e) => {
              e.stopPropagation();
              setPendingDelete(p);
            }}
            onOpen={(p) => void openProjectWithTimestamp(p)}
          />
        ))}
      </div>
    );
  };

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between p-4 bg-[#12141A] border-r border-white/[0.06] select-none">
      <div className="space-y-5">
        {/* Brand Lockup */}
        <div className="flex items-center justify-between px-1.5 pt-0.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0284C7] to-[#0369A1] flex items-center justify-center shadow-sm">
              <Film className="w-4 h-4 text-[#FAF9F6]" />
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-[#FAF9F6] whitespace-nowrap">
              FRAMESTUDIO
            </span>
          </div>
          {mobileMenuOpen && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-[#9BA3AB] hover:text-[#FAF9F6] hover:bg-white/[0.06]"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Primary CTA */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setMobileMenuOpen(false);
            handleOpenNewModal();
          }}
          className="w-full py-2.5 px-4 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-[0_6px_20px_rgba(2,132,199,0.28)] whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </motion.button>

        {/* Navigation Links */}
        <nav className="space-y-1" aria-label="Dashboard Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            const count =
              item.id === 'all'
                ? projects.length
                : item.id === 'recent'
                ? recentProjects.length
                : item.id === 'templates'
                ? DASHBOARD_TEMPLATES.length
                : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`relative w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'text-[#FAF9F6]'
                    : 'text-[#9BA3AB] hover:text-[#FAF9F6] hover:bg-white/[0.04]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="dashboardSidebarActive"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 bg-[#1D222D] border border-white/[0.07] rounded-xl"
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${active ? 'text-[#38BDF8]' : 'text-[#7B838D]'}`}
                  />
                  <span>{item.label}</span>
                </span>
                {count !== null && (
                  <span className="relative z-10 font-mono text-[11px] tabular-nums text-[#7B838D]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Real IndexedDB Local Storage Summary */}
      <div className="p-3.5 rounded-xl bg-[#161922] border border-white/[0.06] space-y-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 font-medium text-[#dce4e4]">
            <HardDrive className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Local Storage</span>
          </span>
          <span className="font-mono tabular-nums text-[#9BA3AB]">
            {storageUsage ? formatFileSize(storageUsage.used) : formatFileSize(totalMediaBytes)}
          </span>
        </div>

        <div className="h-1.5 w-full bg-[#0E1014] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#0284C7] to-[#38BDF8] rounded-full transition-all duration-300"
            style={{ width: `${usedPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#7B838D] tabular-nums">
          <span>
            {projects.length} {projects.length === 1 ? 'sequence' : 'sequences'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {totalMediaCount} {totalMediaCount === 1 ? 'asset' : 'assets'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="h-screen w-screen flex bg-[#0E1014] text-[#dce4e4] overflow-hidden"
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[252px] shrink-0 h-full">{sidebarContent}</aside>

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex"
          >
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-[260px] h-full"
            >
              {sidebarContent}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 shrink-0 px-5 lg:px-8 border-b border-white/[0.06] bg-[#12141A]/90 backdrop-blur-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-[#9BA3AB] hover:text-[#FAF9F6] hover:bg-white/[0.06]"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>

            <h1 className="font-display text-sm sm:text-base font-semibold text-[#FAF9F6] tracking-tight whitespace-nowrap">
              {activeNavLabel}
            </h1>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7B838D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim() && section === 'settings') {
                    setSection('all');
                  }
                }}
                placeholder="Search projects by name..."
                className="w-full h-9 pl-9 pr-8 bg-[#0E1014] border border-white/[0.07] focus:border-[#38BDF8] rounded-xl text-xs text-[#FAF9F6] placeholder-[#666E76] outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7B838D] hover:text-[#FAF9F6]"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => handleOpenNewModal()}
              className="px-4 py-2 bg-[#1D222D] hover:bg-[#262D3B] border border-white/[0.08] text-[#FAF9F6] text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>New Project</span>
            </motion.button>
          </div>
        </header>

        {/* Main Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto px-5 lg:px-8 py-6 lg:py-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {error && (
              <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-4">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => void loadProjects()}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-medium whitespace-nowrap"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Mobile Search Input */}
            <div className="sm:hidden relative">
              <Search className="w-3.5 h-3.5 text-[#7B838D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by name..."
                className="w-full h-9 pl-9 pr-8 bg-[#151820] border border-white/[0.07] focus:border-[#38BDF8] rounded-xl text-xs text-[#FAF9F6] placeholder-[#666E76] outline-none"
              />
            </div>

            <AnimatePresence mode="wait">
              {/* ==================== 1. DASHBOARD OVERVIEW ==================== */}
              {section === 'dashboard' && (
                <motion.div
                  key="dashboard-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-8"
                >
                  {/* Studio Hero Banner & Quick Launch */}
                  <section className="rounded-2xl bg-gradient-to-br from-[#161B26] via-[#141720] to-[#11141C] border border-white/[0.07] p-6 lg:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2 max-w-xl">
                      <h2 className="font-display text-xl lg:text-2xl font-bold text-[#FAF9F6] tracking-tight text-balance">
                        Cut, grade, mix, and master locally in your browser.
                      </h2>
                      <p className="text-xs sm:text-sm text-[#9BA3AB] leading-relaxed">
                        Start a sequence with custom frame dimensions or resume your recent timelines. All clips and edits persist locally in IndexedDB.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleOpenNewModal()}
                        className="px-5 py-2.5 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-[0_6px_22px_rgba(2,132,199,0.3)] whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4" />
                        <span>New Project</span>
                      </motion.button>
                      <button
                        type="button"
                        onClick={() => setSection('templates')}
                        className="px-4 py-2.5 bg-[#1C212C] hover:bg-[#242A38] border border-white/[0.08] text-[#dce4e4] text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <LayoutTemplate className="w-3.5 h-3.5 text-[#7DD3FC]" />
                        <span>Browse Templates</span>
                      </button>
                    </div>
                  </section>

                  {/* Quick Format Launchers */}
                  <section className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">
                        Quick Start Sequences
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleOpenNewModal()}
                        className="text-xs text-[#7DD3FC] hover:text-[#38BDF8] font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <span>Custom Format</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
                      {(
                        [
                          {
                            title: 'YouTube 1080p',
                            spec: '1920×1080 · 16:9 · 30 fps',
                            category: 'YouTube & Vlog' as ProjectCategory,
                            tier: '1080p' as ResolutionTier,
                            ratio: '16:9' as AspectRatioKey,
                            fps: 30 as const,
                            boxW: 26,
                            boxH: 15,
                          },
                          {
                            title: 'Vertical Reel / Short',
                            spec: '1080×1920 · 9:16 · 60 fps',
                            category: 'Social & Reels' as ProjectCategory,
                            tier: '1080p' as ResolutionTier,
                            ratio: '9:16' as AspectRatioKey,
                            fps: 60 as const,
                            boxW: 15,
                            boxH: 24,
                          },
                          {
                            title: 'Cinema 4K Master',
                            spec: '3840×2160 · 16:9 · 24 fps',
                            category: 'Film & Cinema' as ProjectCategory,
                            tier: '4k' as ResolutionTier,
                            ratio: '16:9' as AspectRatioKey,
                            fps: 24 as const,
                            boxW: 26,
                            boxH: 15,
                          },
                          {
                            title: 'Square Feed Cut',
                            spec: '1080×1080 · 1:1 · 30 fps',
                            category: 'Commercial' as ProjectCategory,
                            tier: '1080p' as ResolutionTier,
                            ratio: '1:1' as AspectRatioKey,
                            fps: 30 as const,
                            boxW: 20,
                            boxH: 20,
                          },
                        ] as const
                      ).map((preset) => (
                        <motion.button
                          key={preset.title}
                          type="button"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() =>
                            void handleQuickCreatePreset(
                              preset.title,
                              preset.tier,
                              preset.ratio,
                              preset.fps,
                              preset.category
                            )
                          }
                          className="group p-4 rounded-2xl bg-[#151820] hover:bg-[#1A1F2B] border border-white/[0.06] hover:border-[#38BDF8]/35 text-left flex items-center gap-3.5 transition-colors"
                        >
                          <div className="w-10 h-10 rounded-xl bg-[#0E1014] border border-white/[0.07] flex items-center justify-center shrink-0">
                            <div
                              style={{ width: preset.boxW, height: preset.boxH }}
                              className="rounded-[3px] border border-[#38BDF8]/60 bg-[#38BDF8]/10 group-hover:border-[#38BDF8] transition-colors"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#FAF9F6] group-hover:text-[#7DD3FC] truncate transition-colors">
                              {preset.title}
                            </div>
                            <div className="font-mono text-[11px] text-[#8A9299] tabular-nums mt-0.5 truncate">
                              {preset.spec}
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </section>

                  {/* Favorites Strip (only rendered if user has starred projects) */}
                  {favoriteProjects.length > 0 && !searchQuery.trim() && (
                    <section className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">
                            Starred Favorites
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryFilter('Favorites');
                            setSection('all');
                          }}
                          className="text-xs text-[#9BA3AB] hover:text-[#FAF9F6] transition-colors"
                        >
                          View All
                        </button>
                      </div>
                      {renderProjectCollection(
                        favoriteProjects.slice(0, 3),
                        'No favorite projects',
                        'Star any sequence to keep it pinned here.'
                      )}
                    </section>
                  )}

                  {/* Recently Opened / Continue Editing */}
                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">
                          {searchQuery.trim()
                            ? `Search Results (${recentProjects.length})`
                            : 'Recently Opened'}
                        </h3>
                        <p className="text-xs text-[#7B838D] mt-0.5">
                          {searchQuery.trim()
                            ? `Filtering projects matching "${searchQuery}"`
                            : 'Pick up right where you left off across your saved sequences'}
                        </p>
                      </div>

                      {projects.length > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-[#151820] border border-white/[0.06] rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => setViewMode('grid')}
                              aria-label="Grid view"
                              className={`p-1.5 rounded-lg transition-colors ${
                                viewMode === 'grid'
                                  ? 'bg-[#232936] text-[#FAF9F6]'
                                  : 'text-[#7B838D] hover:text-[#FAF9F6]'
                              }`}
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewMode('list')}
                              aria-label="List view"
                              className={`p-1.5 rounded-lg transition-colors ${
                                viewMode === 'list'
                                  ? 'bg-[#232936] text-[#FAF9F6]'
                                  : 'text-[#7B838D] hover:text-[#FAF9F6]'
                              }`}
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSection('all')}
                            className="text-xs font-medium text-[#7DD3FC] hover:text-[#38BDF8] flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>All Projects</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {renderProjectCollection(
                      searchQuery.trim() ? recentProjects : recentProjects.slice(0, 6),
                      searchQuery.trim() ? 'No matching projects' : 'No projects yet',
                      searchQuery.trim()
                        ? `No saved sequences match "${searchQuery}".`
                        : 'Create your first sequence to import video, images, and audio tracks for multi-track editing.'
                    )}
                  </section>
                </motion.div>
              )}

              {/* ==================== 2. ALL PROJECTS ==================== */}
              {section === 'all' && (
                <motion.div
                  key="all-projects-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-6"
                >
                  {/* Filter, Category, Sort & Layout Toolbar */}
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 xl:pb-0">
                      {(['All', 'Favorites', ...PROJECT_CATEGORIES] as CategoryFilter[]).map(
                        (cat) => {
                          const active = categoryFilter === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setCategoryFilter(cat)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                                active
                                  ? 'bg-[#0284C7] text-[#FAF9F6]'
                                  : 'bg-[#151820] text-[#9BA3AB] hover:text-[#FAF9F6] hover:bg-[#1B202B]'
                              }`}
                            >
                              {cat === 'Favorites' && (
                                <Star
                                  className={`w-3 h-3 ${
                                    active ? 'fill-current' : 'text-amber-400'
                                  }`}
                                />
                              )}
                              <span>{cat}</span>
                            </button>
                          );
                        }
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <label htmlFor="all-projects-sort" className="text-xs text-[#7B838D]">
                          Sort
                        </label>
                        <select
                          id="all-projects-sort"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortOption)}
                          className="h-9 px-3 bg-[#151820] border border-white/[0.07] focus:border-[#38BDF8] rounded-xl text-xs text-[#FAF9F6] outline-none"
                        >
                          <option value="edited" className="bg-[#151820]">
                            Recently Edited
                          </option>
                          <option value="opened" className="bg-[#151820]">
                            Recently Opened
                          </option>
                          <option value="newest" className="bg-[#151820]">
                            Newest Created
                          </option>
                          <option value="oldest" className="bg-[#151820]">
                            Oldest Created
                          </option>
                          <option value="name" className="bg-[#151820]">
                            Name (A–Z)
                          </option>
                        </select>
                      </div>

                      <div className="flex items-center bg-[#151820] border border-white/[0.07] rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => setViewMode('grid')}
                          aria-label="Grid view"
                          className={`p-1.5 rounded-lg transition-colors ${
                            viewMode === 'grid'
                              ? 'bg-[#232936] text-[#FAF9F6]'
                              : 'text-[#7B838D] hover:text-[#FAF9F6]'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('list')}
                          aria-label="List view"
                          className={`p-1.5 rounded-lg transition-colors ${
                            viewMode === 'list'
                              ? 'bg-[#232936] text-[#FAF9F6]'
                              : 'text-[#7B838D] hover:text-[#FAF9F6]'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {renderProjectCollection(
                    filteredAllProjects,
                    categoryFilter === 'Favorites'
                      ? 'No starred favorites yet'
                      : searchQuery.trim()
                      ? 'No matching sequences'
                      : 'Your library is empty',
                    categoryFilter === 'Favorites'
                      ? 'Click the star icon on any project card to pin it to your Favorites.'
                      : searchQuery.trim()
                      ? `No projects match "${searchQuery}" under "${categoryFilter}".`
                      : 'Create a new project or pick a sequence template to start editing.'
                  )}
                </motion.div>
              )}

              {/* ==================== 3. RECENT PROJECTS ==================== */}
              {section === 'recent' && (
                <motion.div
                  key="recent-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
                    <div>
                      <h2 className="font-display text-base font-semibold text-[#FAF9F6]">
                        Recent Activity
                      </h2>
                      <p className="text-xs text-[#9BA3AB] mt-0.5">
                        Ordered by most recently opened or modified sequence
                      </p>
                    </div>
                    <div className="flex items-center bg-[#151820] border border-white/[0.07] rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        aria-label="Grid view"
                        className={`p-1.5 rounded-lg transition-colors ${
                          viewMode === 'grid'
                            ? 'bg-[#232936] text-[#FAF9F6]'
                            : 'text-[#7B838D] hover:text-[#FAF9F6]'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        aria-label="List view"
                        className={`p-1.5 rounded-lg transition-colors ${
                          viewMode === 'list'
                            ? 'bg-[#232936] text-[#FAF9F6]'
                            : 'text-[#7B838D] hover:text-[#FAF9F6]'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {renderProjectCollection(
                    recentProjects,
                    searchQuery.trim() ? 'No matching recent projects' : 'No recent activity',
                    searchQuery.trim()
                      ? `No recent projects match "${searchQuery}".`
                      : 'Projects you create or open will automatically appear here for fast access.'
                  )}
                </motion.div>
              )}

              {/* ==================== 4. TEMPLATES ==================== */}
              {section === 'templates' && (
                <motion.div
                  key="templates-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-6"
                >
                  <div className="pb-4 border-b border-white/[0.06]">
                    <h2 className="font-display text-base font-semibold text-[#FAF9F6]">
                      Sequence Templates
                    </h2>
                    <p className="text-xs text-[#9BA3AB] mt-1">
                      Launch pre-configured timelines with delivery aspect ratios, frame rates, and starter title graphics
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredTemplates.map((tpl) => {
                      const res = buildResolutionPreset(tpl.tier, tpl.ratio);
                      const isVertical = tpl.ratio === '9:16' || tpl.ratio === '4:5';
                      const isSquare = tpl.ratio === '1:1';

                      return (
                        <motion.div
                          key={tpl.id}
                          whileHover={{ y: -3 }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          className="group bg-[#151820] hover:bg-[#191E29] border border-white/[0.06] hover:border-[#38BDF8]/35 rounded-2xl overflow-hidden flex flex-col transition-colors"
                        >
                          {/* Authentic Aspect-Ratio Preview Canvas */}
                          <div className="aspect-video w-full bg-[#0C0E13] flex items-center justify-center p-5 relative overflow-hidden">
                            <div
                              className={`rounded-lg border border-[#38BDF8]/40 bg-gradient-to-br from-[#1B2638] via-[#131926] to-[#0D1119] flex flex-col items-center justify-center p-3 text-center shadow-inner transition-transform duration-200 group-hover:scale-[1.03] ${
                                isVertical
                                  ? 'h-full aspect-[9/16]'
                                  : isSquare
                                  ? 'h-full aspect-square'
                                  : 'w-4/5 aspect-video'
                              }`}
                            >
                              <span className="font-display text-xs font-bold text-[#FAF9F6] tracking-wide truncate max-w-full">
                                {tpl.starterTitle?.content ?? tpl.name}
                              </span>
                              <span className="font-mono text-[10px] text-[#7DD3FC] mt-1 tabular-nums">
                                {tpl.ratio} · {tpl.fps}p
                              </span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">
                                  {tpl.name}
                                </h3>
                              </div>
                              <p className="text-xs text-[#9BA3AB] mt-1.5 leading-relaxed">
                                {tpl.description}
                              </p>
                              <div className="flex items-center gap-1.5 mt-2.5 font-mono text-[11px] text-[#7B838D] tabular-nums">
                                <span>{tpl.category}</span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {res.width}×{res.height}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{tpl.fps} fps</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleUseTemplate(tpl)}
                              className="w-full py-2 px-4 bg-[#1E2430] hover:bg-[#0284C7] border border-white/[0.07] hover:border-[#38BDF8]/50 text-[#FAF9F6] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <span>Use Template</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* ==================== 5. SETTINGS ==================== */}
              {section === 'settings' && (
                <motion.div
                  key="settings-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-3xl space-y-6"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
                    <div>
                      <h2 className="font-display text-base font-semibold text-[#FAF9F6]">
                        Workstation Settings
                      </h2>
                      <p className="text-xs text-[#9BA3AB] mt-0.5">
                        Configure default new-project settings and inspect local IndexedDB storage
                      </p>
                    </div>
                    {settingsSavedNotice && (
                      <span className="text-xs font-medium text-[#7DD3FC]">
                        Preferences saved
                      </span>
                    )}
                  </div>

                  {/* Sequence Defaults Card */}
                  <section className="rounded-2xl bg-[#151820] border border-white/[0.06] p-6 space-y-5">
                    <div className="flex items-center gap-2.5">
                      <Sliders className="w-4 h-4 text-[#38BDF8]" />
                      <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">
                        Default New Sequence Configuration
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="settings-default-tier"
                          className="block text-xs font-medium text-[#dce4e4] mb-1.5"
                        >
                          Default Resolution
                        </label>
                        <select
                          id="settings-default-tier"
                          value={settings.defaultTier}
                          onChange={(e) =>
                            updateSettings({ defaultTier: e.target.value as ResolutionTier })
                          }
                          className="w-full h-10 px-3 bg-[#0E1014] border border-white/[0.08] rounded-xl text-xs text-[#FAF9F6] outline-none"
                        >
                          {RESOLUTION_TIER_OPTIONS.map((t) => (
                            <option key={t.id} value={t.id} className="bg-[#151820]">
                              {t.label} — {t.shortDesc}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="settings-default-ratio"
                          className="block text-xs font-medium text-[#dce4e4] mb-1.5"
                        >
                          Default Aspect Ratio
                        </label>
                        <select
                          id="settings-default-ratio"
                          value={settings.defaultRatio}
                          onChange={(e) =>
                            updateSettings({ defaultRatio: e.target.value as AspectRatioKey })
                          }
                          className="w-full h-10 px-3 bg-[#0E1014] border border-white/[0.08] rounded-xl text-xs text-[#FAF9F6] outline-none"
                        >
                          {ASPECT_RATIO_OPTIONS.map((r) => (
                            <option key={r.id} value={r.id} className="bg-[#151820]">
                              {r.label} ({r.platform})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="block text-xs font-medium text-[#dce4e4] mb-1.5">
                          Default Frame Rate
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {([24, 30, 60] as const).map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => updateSettings({ defaultFps: rate })}
                              className={`h-10 rounded-xl border font-mono text-xs tabular-nums transition-colors ${
                                settings.defaultFps === rate
                                  ? 'bg-[#0284C7]/20 border-[#38BDF8]/70 text-[#FAF9F6]'
                                  : 'bg-[#0E1014] border-white/[0.08] text-[#9BA3AB] hover:text-[#FAF9F6]'
                              }`}
                            >
                              {rate} fps
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-medium text-[#dce4e4] mb-1.5">
                          Default Library Layout
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {(['grid', 'list'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => updateSettings({ defaultViewMode: mode })}
                              className={`h-10 rounded-xl border text-xs font-medium capitalize transition-colors ${
                                settings.defaultViewMode === mode
                                  ? 'bg-[#0284C7]/20 border-[#38BDF8]/70 text-[#FAF9F6]'
                                  : 'bg-[#0E1014] border-white/[0.08] text-[#9BA3AB] hover:text-[#FAF9F6]'
                              }`}
                            >
                              {mode} View
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-4 border-t border-white/[0.06]">
                      <div>
                        <div className="text-xs font-medium text-[#FAF9F6]">
                          Enable Proxy Mode on New Projects
                        </div>
                        <div className="text-[11px] text-[#9BA3AB]">
                          Automatically enable 360p proxy playback when creating new sequences
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateSettings({ defaultProxyMode: !settings.defaultProxyMode })
                        }
                        className={`px-3.5 py-1.5 rounded-xl font-mono text-xs font-semibold border transition-colors ${
                          settings.defaultProxyMode
                            ? 'bg-[#0284C7] border-[#38BDF8] text-[#FAF9F6]'
                            : 'bg-[#0E1014] border-white/[0.08] text-[#9BA3AB]'
                        }`}
                      >
                        {settings.defaultProxyMode ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </section>

                  {/* Real IndexedDB Storage Inspector */}
                  <section className="rounded-2xl bg-[#151820] border border-white/[0.06] p-6 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <HardDrive className="w-4 h-4 text-[#38BDF8]" />
                        <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">
                          IndexedDB Local Storage
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadProjects()}
                        className="px-3 py-1.5 bg-[#1C212C] hover:bg-[#242B39] border border-white/[0.07] rounded-xl text-xs font-medium text-[#dce4e4] flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Rescan</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl bg-[#0E1014] border border-white/[0.05]">
                        <div className="text-[11px] text-[#9BA3AB]">Saved Sequences</div>
                        <div className="font-mono text-lg font-semibold text-[#FAF9F6] tabular-nums mt-1">
                          {projects.length}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[#0E1014] border border-white/[0.05]">
                        <div className="text-[11px] text-[#9BA3AB]">Stored Media Assets</div>
                        <div className="font-mono text-lg font-semibold text-[#FAF9F6] tabular-nums mt-1">
                          {totalMediaCount}
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[#0E1014] border border-white/[0.05]">
                        <div className="text-[11px] text-[#9BA3AB]">Media Footprint</div>
                        <div className="font-mono text-lg font-semibold text-[#FAF9F6] tabular-nums mt-1">
                          {formatFileSize(totalMediaBytes)}
                        </div>
                      </div>
                    </div>

                    {storageUsage && (
                      <div className="text-xs text-[#9BA3AB] font-mono tabular-nums">
                        Browser origin usage: {formatFileSize(storageUsage.used)} of{' '}
                        {formatFileSize(storageUsage.quota)} available
                      </div>
                    )}

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-4">
                      <span className="text-xs text-[#9BA3AB]">
                        Download a JSON catalog of all local project metadata and track counts.
                      </span>
                      <button
                        type="button"
                        onClick={handleExportIndexJson}
                        disabled={projects.length === 0}
                        className="px-4 py-2 bg-[#1C212C] hover:bg-[#242B39] disabled:opacity-40 disabled:pointer-events-none border border-white/[0.08] rounded-xl text-xs font-medium text-[#FAF9F6] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>Export Catalog</span>
                      </button>
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <NewProjectModal
        open={showNewModal}
        initialTier={modalSeed.tier ?? settings.defaultTier}
        initialRatio={modalSeed.ratio ?? settings.defaultRatio}
        initialFps={modalSeed.fps ?? settings.defaultFps}
        initialProxyMode={settings.defaultProxyMode}
        onClose={() => setShowNewModal(false)}
        onCreate={(name, res, fps, opts) => void handleCreateProject(name, res, fps, opts)}
      />

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete Project"
        description={
          pendingDelete
            ? `Permanently delete "${pendingDelete.name}" and all imported media stored inside this project? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Project"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </motion.div>
  );
};
