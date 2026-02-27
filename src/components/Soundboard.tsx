'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
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

export default function Soundboard() {
    const { data: session } = useSession();
    const isJordy = session?.user?.login?.toLowerCase() === 'jordybeer';

    const [sounds, setSounds] = useState<Sound[]>([]);
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
    
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [editingSound, setEditingSound] = useState<Sound | null>(null);
    const [editName, setEditName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadGame, setUploadGame] = useState('');
    const [uploadSubfolder, setUploadSubfolder] = useState('');

    useEffect(() => {
        setMounted(true);
        const savedFavs = localStorage.getItem('arc-favs');
        if (savedFavs) setFavorites(JSON.parse(savedFavs));
        
        const savedTheme = localStorage.getItem('arc-theme') || 'dark';
        setTheme(savedTheme);
        document.documentElement.className = savedTheme;

        fetchSounds();
    }, []);

    const fetchSounds = () => {
        fetch('/sounds.json?t=' + Date.now())
            .then(res => res.json())
            .then(data => setSounds(data))
            .catch(err => console.error("Failed to load sounds.json", err));
    };

    useEffect(() => {
        const handleClickOutside = () => {
            setActiveMenuId(null);
            setShowUserMenu(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const standardCategories = Array.from(new Set(sounds.map(s => s.game)));
    const categories = ['All', 'Favorites', 'Loopables', ...standardCategories];
    
    const availableSubfolders = activeCategory !== 'All' && activeCategory !== 'Favorites' && activeCategory !== 'Loopables'
        ? ['All', ...Array.from(new Set(sounds.filter(s => s.game === activeCategory && s.subfolder).map(s => s.subfolder as string)))]
        : [];

    useEffect(() => setActiveSubfolder('All'), [activeCategory]);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.className = newTheme;
        localStorage.setItem('arc-theme', newTheme);
    };

    const toggleFavorite = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newFavs = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
        setFavorites(newFavs);
        localStorage.setItem('arc-favs', JSON.stringify(newFavs));
    };

    const toggleMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    const playSound = (sound: Sound) => {
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
            audio.play().catch(e => console.log('Audio play failed:', e));
            musicAudio.current = audio;
            setPlayingMusicId(sound.id);
        } else {
            if (sfxAudio.current) {
                sfxAudio.current.pause();
                sfxAudio.current.currentTime = 0;
            }
            const audio = new Audio(sound.src);
            audio.play().catch(e => console.log('Audio play failed:', e));
            sfxAudio.current = audio;
            setPlayingId(sound.id);
            audio.onended = () => setPlayingId(null);
        }
    };

    const stopAll = () => {
        if (sfxAudio.current) sfxAudio.current.pause();
        if (musicAudio.current) musicAudio.current.pause();
        setPlayingId(null);
        setPlayingMusicId(null);
    };

    const getAudioDuration = (file: File): Promise<number> => {
        return new Promise((resolve) => {
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(file);
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration);
                URL.revokeObjectURL(audio.src);
            });
            audio.addEventListener('error', () => resolve(0));
        });
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (uploadFiles.length === 0 || !uploadGame) return alert("Select files and a Game category");
        setIsSubmitting(true);
        
        const typesMap: Record<string, string> = {};
        for (const file of uploadFiles) {
            const duration = await getAudioDuration(file);
            typesMap[file.name] = duration > 10 ? 'music' : 'sfx';
        }

        const formData = new FormData();
        uploadFiles.forEach(file => formData.append("file", file));
        formData.append("game", uploadGame);
        if (uploadSubfolder) formData.append("subfolder", uploadSubfolder);
        formData.append("typesMap", JSON.stringify(typesMap));

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await res.json();
            if (res.ok) {
                const msg = data.skipped > 0 
                    ? `Success! Uploaded ${data.added} files. Skipped ${data.skipped} duplicates.`
                    : `Success! Uploaded ${data.added} files.`;
                alert(msg + " Rebuilding...");
                setShowUploadModal(false);
                setUploadFiles([]);
                setUploadGame('');
                setUploadSubfolder('');
            } else alert(`Error: ${data.error}`);
        } catch (err) { alert("Upload failed."); } 
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (sound: Sound, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(null);
        if (!confirm(`Are you sure you want to PERMANENTLY delete "${sound.name}"?`)) return;
        
        try {
            const res = await fetch("/api/upload", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: sound.id })
            });
            if (res.ok) {
                setSounds(sounds.filter(s => s.id !== sound.id));
            } else alert("Failed to delete.");
        } catch (e) { alert("Delete request failed."); }
    };

    const openEdit = (sound: Sound, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(null);
        setEditingSound(sound);
        setEditName(sound.name);
    };

    const submitEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSound || !editName) return;
        setIsSubmitting(true);
        
        try {
            const res = await fetch("/api/upload", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingSound.id, newName: editName })
            });
            const data = await res.json();
            if (res.ok) {
                setSounds(sounds.map(s => s.id === editingSound.id ? { ...s, name: editName } : s));
                setEditingSound(null);
            } else alert(`Error: ${data.error}`);
        } catch (e) { alert("Rename request failed."); }
        finally { setIsSubmitting(false); }
    };

    if (!mounted) return null;

    const filteredSounds = sounds.filter(sound => {
        const matchesSearch = sound.name.toLowerCase().includes(search.toLowerCase()) || sound.game.toLowerCase().includes(search.toLowerCase());
        
        let matchesCat = true;
        if (activeCategory === 'Favorites') matchesCat = favorites.includes(sound.id);
        else if (activeCategory === 'Loopables') matchesCat = sound.type === 'music';
        else if (activeCategory !== 'All') matchesCat = sound.game === activeCategory;

        const matchesSub = activeSubfolder === 'All' ? true : sound.subfolder === activeSubfolder;
        return matchesSearch && matchesCat && matchesSub;
    }).sort((a, b) => {
        if (activeCategory !== 'Favorites') {
            const aFav = favorites.includes(a.id);
            const bFav = favorites.includes(b.id);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
        }
        return 0;
    });

    return (
        <div className="flex flex-col min-h-screen pb-20">
            <div className="sticky top-0 z-40 glass-header px-4 pt-4 pb-3 sm:px-8">
                <div className="max-w-[1600px] mx-auto flex gap-3 items-center mb-4">
                    <div className="relative flex-1 input-glass rounded-xl flex items-center px-4 py-3">
                        <Search size={18} className="text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Search sounds..." 
                            className="bg-transparent border-none outline-none w-full text-sm sm:text-base ml-3 placeholder-[var(--text-muted)]"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold px-2">
                                CLEAR
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button onClick={toggleTheme} className="input-glass hover:brightness-110 p-3 rounded-xl">
                            <Lightbulb size={18} className={theme === 'dark' ? 'text-yellow-500' : 'text-[var(--text-main)]'} />
                        </button>
                        
                        <button onClick={stopAll} className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold">
                            <Square size={14} fill="currentColor" />
                            <span className="hidden sm:inline">Stop</span>
                        </button>

                        {/* User Menu */}
                        <div className="relative" onClick={e => e.stopPropagation()}>
                            {!session ? (
                                <button onClick={() => signIn("github")} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold shadow-lg shadow-blue-500/20">
                                    <Github size={16} />
                                    <span className="hidden sm:inline">Sign In</span>
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => setShowUserMenu(!showUserMenu)} className="input-glass hover:brightness-110 p-3 rounded-xl">
                                        <User size={18} />
                                    </button>
                                    {showUserMenu && (
                                        <div className="absolute right-0 top-14 w-48 sound-tile border border-[var(--border-focus)] rounded-xl overflow-hidden shadow-2xl">
                                            <div className="px-4 py-3 border-b border-[var(--border-line)]">
                                                <div className="text-xs text-[var(--text-muted)] font-semibold">Signed in as</div>
                                                <div className="text-sm font-bold truncate mt-1">{session.user?.name || session.user?.email}</div>
                                            </div>
                                            {isJordy && (
                                                <button onClick={() => { setShowUploadModal(true); setShowUserMenu(false); }} className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-blue-500/10 flex items-center gap-2 border-b border-[var(--border-line)]">
                                                    <Upload size={14} /> Upload Files
                                                </button>
                                            )}
                                            <button onClick={() => signOut()} className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-red-500/10 text-red-500 flex items-center gap-2">
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
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-2 rounded-full whitespace-nowrap text-xs sm:text-sm font-bold tracking-wide transition-all ${activeCategory === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-black/20 dark:bg-white/5 text-[var(--text-muted)] hover:bg-black/30 dark:hover:bg-white/10'}`}>
                                {cat === 'Loopables' ? <span className="flex items-center gap-1.5"><Repeat size={12}/> {cat}</span> : cat}
                            </button>
                        ))}
                    </div>
                    
                    {availableSubfolders.length > 1 && (
                        <div className="flex overflow-x-auto no-scrollbar gap-2">
                            <div className="flex items-center text-[var(--text-muted)] px-2"><FolderTree size={14} /></div>
                            {availableSubfolders.map(sub => (
                                <button key={sub} onClick={() => setActiveSubfolder(sub)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition-all ${activeSubfolder === sub ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black' : 'text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5'}`}>
                                    {sub}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 max-w-[1600px] mx-auto w-full p-4 sm:p-8">
                {sounds.length === 0 ? (
                    <div className="text-center text-[var(--text-muted)] mt-10 text-lg">Loading sounds...</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {filteredSounds.map(sound => {
                            const isPlaying = sound.type === 'music' ? playingMusicId === sound.id : playingId === sound.id;
                            const isFav = favorites.includes(sound.id);
                            const showMenu = activeMenuId === sound.id;

                            return (
                                <div key={sound.id} className="relative group">
                                    <div onClick={() => playSound(sound)} className={`sound-tile cursor-pointer p-4 rounded-2xl flex items-start gap-4 transition-all duration-200 ${isPlaying ? 'is-playing ring-2 ring-blue-500/50 shadow-xl shadow-blue-500/20' : 'hover:shadow-lg'}`}>
                                        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isPlaying ? 'bg-blue-500/20 text-blue-500 scale-105' : 'bg-black/5 dark:bg-white/5 text-[var(--text-muted)]'}`}>
                                            {isPlaying ? <div className="eq-container"><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/></div> : (sound.type === 'music' ? <Repeat size={18} /> : <Play size={18} className="ml-0.5" fill="currentColor" />)}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-base font-bold leading-snug mb-1 ${isPlaying ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--text-main)]'}`}>{sound.name}</div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2 py-0.5 bg-black/10 dark:bg-white/5 rounded-md text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{sound.game}</span>
                                                {sound.subfolder && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-md text-[10px] font-bold uppercase tracking-wider">{sound.subfolder}</span>}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            {isJordy && (
                                                <button onClick={(e) => toggleMenu(sound.id, e)} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                                                    <Edit2 size={14} />
                                                </button>
                                            )}
                                            <button onClick={(e) => toggleFavorite(sound.id, e)} className={`p-2 rounded-lg transition-all ${isFav ? 'text-blue-500' : 'text-[var(--text-muted)] hover:text-blue-400'}`}>
                                                <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                                            </button>
                                        </div>
                                    </div>

                                    {showMenu && isJordy && (
                                        <div className="absolute right-0 top-16 z-50 w-40 sound-tile border border-[var(--border-focus)] rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                                            <button onClick={(e) => openEdit(sound, e)} className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-blue-500/10 flex items-center gap-2">
                                                <Edit2 size={14} /> Rename
                                            </button>
                                            <button onClick={(e) => handleDelete(sound, e)} className="w-full px-4 py-3 text-left text-sm font-semibold hover:bg-red-500/10 text-red-500 flex items-center gap-2 border-t border-[var(--border-line)]">
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
                    <form onSubmit={handleUpload} className="sound-tile p-8 w-full max-w-lg shadow-2xl rounded-2xl border border-[var(--border-focus)]" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold mb-2 flex items-center gap-3"><Upload size={24} /> Batch Upload</h2>
                        <p className="text-sm text-[var(--text-muted)] mb-8">Names are auto-generated. Files over 10 seconds loop automatically.</p>
                        <div className="space-y-6 mb-8">
                            <div>
                                <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">MP3 Files</label>
                                <input type="file" accept="audio/mp3" multiple required onChange={e => setUploadFiles(Array.from(e.target.files || []))} className="w-full text-base input-glass p-3 rounded-xl" />
                                {uploadFiles.length > 0 && <div className="text-sm text-blue-500 mt-2 font-bold">{uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected</div>}
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">Game Category</label>
                                <input type="text" placeholder="e.g. Roblox" required value={uploadGame} onChange={e => setUploadGame(e.target.value)} className="w-full text-base input-glass p-3 rounded-xl" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">Subfolder (Optional)</label>
                                <input type="text" placeholder="e.g. Voices, SFX" value={uploadSubfolder} onChange={e => setUploadSubfolder(e.target.value)} className="w-full text-base input-glass p-3 rounded-xl" />
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
                    <form onSubmit={submitEdit} className="sound-tile p-8 w-full max-w-md shadow-2xl rounded-2xl border border-[var(--border-focus)]" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3"><Edit2 size={24} /> Rename Sound</h2>
                        <div className="mb-8">
                            <label className="block text-sm font-bold mb-2 text-[var(--text-muted)]">Display Name</label>
                            <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="w-full text-base input-glass p-3 rounded-xl" autoFocus />
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