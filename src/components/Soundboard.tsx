'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Search, Square, Heart, Play, Repeat, Lightbulb, Github, Upload, LogOut, FolderTree, Edit2, Trash2, User } from 'lucide-react';

type SoundType = 'sfx' | 'music';

interface Sound {
  id: string;
  name: string;
  game: string;
  subfolder?: string;
  type: SoundType;
  src: string;
}

function dedupeFiles(files: File[]) {
  const unique = new Map<string, File>();

  for (const file of files) {
    unique.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  }

  return Array.from(unique.values());
}

export default function Soundboard() {
  const { data: session } = useSession();

  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeSubfolder, setActiveSubfolder] = useState('All');
  const [favorites, setFavorites] = useState<string[]>([]);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const sfxAudio = useRef<HTMLAudioElement | null>(null);
  const musicAudio = useRef<HTMLAudioElement | null>(null);

  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingSound, setEditingSound] = useState<Sound | null>(null);
  const [editName, setEditName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadGame, setUploadGame] = useState('');
  const [uploadSubfolder, setUploadSubfolder] = useState('');

  const fetchSounds = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const res = await fetch(`/sounds.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load sounds.json');

      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) throw new Error('Invalid sounds payload');

      setSounds(data as Sound[]);
    } catch (error) {
      console.error('Failed to load sounds.json', error);
      setLoadError('Could not load sounds.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);

    const savedFavs = localStorage.getItem('arc-favs');
    if (savedFavs) setFavorites(JSON.parse(savedFavs));

    const savedTheme = localStorage.getItem('arc-theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.className = savedTheme;

    void fetchSounds();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 150);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      setActiveMenuId(null);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (sfxAudio.current) {
        sfxAudio.current.pause();
        sfxAudio.current.currentTime = 0;
      }

      if (musicAudio.current) {
        musicAudio.current.pause();
        musicAudio.current.currentTime = 0;
      }
    };
  }, []);

  const standardCategories = useMemo(
    () => Array.from(new Set(sounds.map((sound) => sound.game))),
    [sounds]
  );

  const categories = useMemo(
    () => ['All', 'Favorites', 'Loopables', ...standardCategories],
    [standardCategories]
  );

  const availableSubfolders = useMemo(() => {
    if (activeCategory === 'All' || activeCategory === 'Favorites' || activeCategory === 'Loopables') {
      return [] as string[];
    }

    return [
      'All',
      ...Array.from(
        new Set(
          sounds
            .filter((sound) => sound.game === activeCategory && sound.subfolder)
            .map((sound) => sound.subfolder as string)
        )
      ),
    ];
  }, [activeCategory, sounds]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  useEffect(() => setActiveSubfolder('All'), [activeCategory]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.className = newTheme;
    localStorage.setItem('arc-theme', newTheme);
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const nextFavorites = favoriteSet.has(id)
      ? favorites.filter((favoriteId) => favoriteId !== id)
      : [...favorites, id];

    setFavorites(nextFavorites);
    localStorage.setItem('arc-favs', JSON.stringify(nextFavorites));
  };

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const playSound = (sound: Sound, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    if (activeMenuId) {
      setActiveMenuId(null);
      return;
    }

    if (sound.type === 'music') {
      if (playingMusicId === sound.id) {
        if (musicAudio.current) {
          musicAudio.current.pause();
          musicAudio.current.currentTime = 0;
        }
        setPlayingMusicId(null);
        return;
      }

      if (musicAudio.current) {
        musicAudio.current.pause();
        musicAudio.current.currentTime = 0;
      }

      const audio = new Audio(sound.src);
      audio.loop = true;
      audio.play().catch((error) => console.log('Audio play failed:', error));
      musicAudio.current = audio;
      setPlayingMusicId(sound.id);
      return;
    }

    if (sfxAudio.current) {
      sfxAudio.current.pause();
      sfxAudio.current.currentTime = 0;
    }

    const audio = new Audio(sound.src);
    audio.play().catch((error) => console.log('Audio play failed:', error));
    sfxAudio.current = audio;
    setPlayingId(sound.id);
    audio.onended = () => setPlayingId(null);
  };

  const stopAll = () => {
    if (sfxAudio.current) {
      sfxAudio.current.pause();
      sfxAudio.current.currentTime = 0;
    }

    if (musicAudio.current) {
      musicAudio.current.pause();
      musicAudio.current.currentTime = 0;
    }

    setPlayingId(null);
    setPlayingMusicId(null);
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;

      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
        URL.revokeObjectURL(objectUrl);
      });

      audio.addEventListener('error', () => {
        resolve(0);
        URL.revokeObjectURL(objectUrl);
      });
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    const uniqueFiles = dedupeFiles(uploadFiles);
    if (uniqueFiles.length === 0 || !uploadGame.trim()) {
      alert('Select files and a Game category');
      return;
    }

    setIsSubmitting(true);

    const typesMap: Record<string, SoundType> = {};
    for (const file of uniqueFiles) {
      const duration = await getAudioDuration(file);
      typesMap[file.name] = duration > 10 ? 'music' : 'sfx';
    }

    const formData = new FormData();
    uniqueFiles.forEach((file) => formData.append('file', file));
    formData.append('game', uploadGame.trim());
    if (uploadSubfolder.trim()) formData.append('subfolder', uploadSubfolder.trim());
    formData.append('typesMap', JSON.stringify(typesMap));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = (await res.json()) as { added?: number; skipped?: number; error?: string };

      if (!res.ok) {
        alert(`Error: ${data.error ?? 'Upload failed'}`);
        return;
      }

      const added = data.added ?? 0;
      const skipped = data.skipped ?? 0;
      const message = skipped > 0
        ? `Success! Uploaded ${added} files. Skipped ${skipped} duplicates or invalid files.`
        : `Success! Uploaded ${added} files.`;

      alert(message);
      setShowUploadModal(false);
      setUploadFiles([]);
      setUploadGame('');
      setUploadSubfolder('');
      await fetchSounds();
    } catch (error) {
      console.error('Upload failed', error);
      alert('Upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (sound: Sound, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(null);

    if (!confirm(`Are you sure you want to PERMANENTLY delete "${sound.name}"?`)) return;

    try {
      const res = await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sound.id }),
      });

      if (res.ok) {
        setSounds((currentSounds) => currentSounds.filter((item) => item.id !== sound.id));
      } else {
        alert('Failed to delete.');
      }
    } catch (error) {
      console.error('Delete request failed', error);
      alert('Delete request failed.');
    }
  };

  const openEdit = (sound: Sound, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(null);
    setEditingSound(sound);
    setEditName(sound.name);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSound || !editName.trim()) return;

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingSound.id, newName: editName.trim() }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(`Error: ${data.error ?? 'Rename failed'}`);
        return;
      }

      setSounds((currentSounds) =>
        currentSounds.map((sound) =>
          sound.id === editingSound.id ? { ...sound, name: editName.trim() } : sound
        )
      );
      setEditingSound(null);
    } catch (error) {
      console.error('Rename request failed', error);
      alert('Rename request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSounds = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return sounds
      .filter((sound) => {
        const matchesSearch =
          searchTerm.length === 0 ||
          sound.name.toLowerCase().includes(searchTerm) ||
          sound.game.toLowerCase().includes(searchTerm);

        let matchesCategory = true;
        if (activeCategory === 'Favorites') matchesCategory = favoriteSet.has(sound.id);
        else if (activeCategory === 'Loopables') matchesCategory = sound.type === 'music';
        else if (activeCategory !== 'All') matchesCategory = sound.game === activeCategory;

        const matchesSubfolder = activeSubfolder === 'All' ? true : sound.subfolder === activeSubfolder;
        return matchesSearch && matchesCategory && matchesSubfolder;
      })
      .sort((a, b) => {
        if (activeCategory !== 'Favorites') {
          const aFav = favoriteSet.has(a.id);
          const bFav = favoriteSet.has(b.id);
          if (aFav && !bFav) return -1;
          if (!aFav && bFav) return 1;
        }

        return a.name.localeCompare(b.name);
      });
  }, [sounds, search, activeCategory, activeSubfolder, favoriteSet]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="sticky top-0 z-40 glass-header px-4 pt-4 pb-3 sm:px-8">
        <div className="max-w-[1600px] mx-auto flex gap-3 items-center mb-4">
          <div className="relative flex-1 input-glass rounded-xl flex items-center px-4 py-3">
            <Search size={18} className="text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search sounds..."
              aria-label="Search sounds"
              className="bg-transparent border-none outline-none w-full text-sm sm:text-base ml-3 placeholder-[var(--text-muted)]"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold px-2"
                title="Clear search"
                aria-label="Clear search"
              >
                CLEAR
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="input-glass hover:brightness-110 p-3 rounded-xl"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <Lightbulb size={18} className={theme === 'dark' ? 'text-yellow-500' : 'text-[var(--text-main)]'} />
            </button>

            <button
              type="button"
              onClick={stopAll}
              className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold"
              title="Stop all audio"
              aria-label="Stop all audio"
            >
              <Square size={14} fill="currentColor" />
              <span className="hidden sm:inline">Stop</span>
            </button>

            <div className="relative" ref={userMenuRef}>
              {!session ? (
                <button
                  type="button"
                  onClick={() => signIn('github')}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-lg shadow-blue-500/20"
                  title="Sign in with GitHub"
                  aria-label="Sign in with GitHub"
                >
                  <Github size={16} />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUserMenu(!showUserMenu);
                    }}
                    className="input-glass hover:brightness-110 p-3 rounded-xl"
                    title="Open user menu"
                    aria-label="Open user menu"
                  >
                    <User size={18} />
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-14 w-48 sound-tile border border-[var(--border-focus)] rounded-xl overflow-hidden shadow-2xl">
                      <div className="px-4 py-3 border-b border-[var(--border-line)]">
                        <div className="text-xs text-[var(--text-muted)] font-semibold">Signed in as</div>
                        <div className="text-sm font-bold truncate mt-1">{session.user?.name || session.user?.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUploadModal(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-blue-500/10 flex items-center gap-2 border-b border-[var(--border-line)]"
                        title="Upload files"
                        aria-label="Upload files"
                      >
                        <Upload size={14} /> Upload Files
                      </button>
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-red-500/10 text-red-500 flex items-center gap-2"
                        title="Sign out"
                        aria-label="Sign out"
                      >
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto flex flex-col gap-3">
          <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full whitespace-nowrap text-xs sm:text-sm font-bold tracking-wide transition-all ${activeCategory === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-black/20 dark:bg-white/5 text-[var(--text-muted)] hover:bg-black/30 dark:hover:bg-white/10'}`}
              >
                {cat === 'Loopables' ? <span className="flex items-center gap-1.5"><Repeat size={12} /> {cat}</span> : cat}
              </button>
            ))}
          </div>

          {availableSubfolders.length > 1 && (
            <div className="flex overflow-x-auto no-scrollbar gap-2">
              <div className="flex items-center text-[var(--text-muted)] px-2"><FolderTree size={14} /></div>
              {availableSubfolders.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setActiveSubfolder(sub)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition-all ${activeSubfolder === sub ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black' : 'text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-[1600px] mx-auto w-full p-4 sm:p-8">
        {isLoading ? (
          <div className="text-center text-[var(--text-muted)] mt-10 text-lg">Loading sounds...</div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-4 mt-10">
            <div className="text-center text-red-500 text-lg">{loadError}</div>
            <button
              type="button"
              onClick={() => void fetchSounds()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500"
            >
              Retry
            </button>
          </div>
        ) : filteredSounds.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] mt-10 text-lg">No sounds found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredSounds.map((sound) => {
              const isPlaying = sound.type === 'music' ? playingMusicId === sound.id : playingId === sound.id;
              const isFav = favoriteSet.has(sound.id);
              const showMenu = activeMenuId === sound.id;

              return (
                <div key={sound.id} className="relative group">
                  <div
                    onClick={(e) => playSound(sound, e)}
                    className={`sound-tile cursor-pointer p-4 rounded-2xl flex items-start gap-4 transition-all duration-200 ${isPlaying ? 'is-playing ring-2 ring-blue-500/50 shadow-xl shadow-blue-500/20' : 'hover:shadow-lg'}`}
                  >
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isPlaying ? 'bg-blue-500/20 text-blue-500 scale-105' : 'bg-black/5 dark:bg-white/5 text-[var(--text-muted)]'}`}>
                      {isPlaying ? (
                        <div className="eq-container"><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /></div>
                      ) : sound.type === 'music' ? (
                        <Repeat size={18} />
                      ) : (
                        <Play size={18} className="ml-0.5" fill="currentColor" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`text-base font-bold leading-snug mb-1 ${isPlaying ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--text-main)]'}`}>{sound.name}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-black/10 dark:bg-white/5 rounded-md text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{sound.game}</span>
                        {sound.subfolder && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-md text-[10px] font-bold uppercase tracking-wider">{sound.subfolder}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => toggleMenu(sound.id, e)}
                        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        title="Open sound actions"
                        aria-label={`Open actions for ${sound.name}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(sound.id, e)}
                        className={`p-2 rounded-lg transition-all ${isFav ? 'text-blue-500' : 'text-[var(--text-muted)] hover:text-blue-400'}`}
                        title={isFav ? 'Remove favorite' : 'Add favorite'}
                        aria-label={isFav ? `Remove ${sound.name} from favorites` : `Add ${sound.name} to favorites`}
                      >
                        <Heart size={16} fill={isFav ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  {showMenu && (
                    <div className="absolute right-0 top-16 z-50 w-40 sound-tile border border-[var(--border-focus)] rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => openEdit(sound, e)}
                        className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-blue-500/10 flex items-center gap-2"
                        title="Rename sound"
                        aria-label={`Rename ${sound.name}`}
                      >
                        <Edit2 size={14} /> Rename
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(sound, e)}
                        className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-red-500/10 text-red-500 flex items-center gap-2 border-t border-[var(--border-line)]"
                        title="Delete sound"
                        aria-label={`Delete ${sound.name}`}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => !isSubmitting && setShowUploadModal(false)}>
          <form onSubmit={handleUpload} className="sound-tile p-8 w-full max-w-lg shadow-2xl rounded-2xl border border-[var(--border-focus)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-3"><Upload size={24} /> Batch Upload</h2>
            <p className="text-sm text-[var(--text-muted)] mb-8">Names are auto-generated. Files over 10 seconds loop automatically.</p>
            <div className="space-y-6 mb-8">
              <div>
                <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">MP3 Files</label>
                <input
                  type="file"
                  accept="audio/mp3"
                  multiple
                  required
                  onChange={(e) => setUploadFiles(dedupeFiles(Array.from(e.target.files || [])))}
                  className="w-full text-base input-glass p-3 rounded-xl"
                />
                {uploadFiles.length > 0 && (
                  <div className="text-sm text-blue-500 mt-2 font-bold">
                    {uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">Game Category</label>
                <input
                  type="text"
                  placeholder="e.g. Roblox"
                  required
                  value={uploadGame}
                  onChange={(e) => setUploadGame(e.target.value)}
                  className="w-full text-base input-glass p-3 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">Subfolder (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Voices, SFX"
                  value={uploadSubfolder}
                  onChange={(e) => setUploadSubfolder(e.target.value)}
                  className="w-full text-base input-glass p-3 rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setShowUploadModal(false)} className="px-6 py-3 text-base font-bold input-glass rounded-xl hover:brightness-110">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-3 text-base font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 shadow-lg shadow-blue-500/30">
                {isSubmitting ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingSound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => !isSubmitting && setEditingSound(null)}>
          <form onSubmit={submitEdit} className="sound-tile p-8 w-full max-w-md shadow-2xl rounded-2xl border border-[var(--border-focus)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3"><Edit2 size={24} /> Rename Sound</h2>
            <div className="mb-8">
              <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">Display Name</label>
              <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full text-base input-glass p-3 rounded-xl" autoFocus />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setEditingSound(null)} className="px-6 py-3 text-base font-bold input-glass rounded-xl hover:brightness-110">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-3 text-base font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50">
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
