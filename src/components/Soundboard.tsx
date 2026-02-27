'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { Search, Square, Heart, Play, Repeat, Lightbulb, Github, Upload, LogOut } from 'lucide-react';

type SoundType = 'sfx' | 'music';
interface Sound {
  id: string;
  name: string;
  game: string;
  type: SoundType;
  src: string;
}

export default function Soundboard() {
    const { data: session } = useSession();
    const isJordy = session?.user?.login?.toLowerCase() === 'jordybeer';

    const [sounds, setSounds] = useState<Sound[]>([]);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [favorites, setFavorites] = useState<string[]>([]);
    
    // Audio State
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
    const sfxAudio = useRef<HTMLAudioElement | null>(null);
    const musicAudio = useRef<HTMLAudioElement | null>(null);
    
    // UI State
    const [theme, setTheme] = useState('dark');
    const [mounted, setMounted] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);

    // Upload Form State
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadName, setUploadName] = useState('');
    const [uploadGame, setUploadGame] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedFavs = localStorage.getItem('arc-favs');
        if (savedFavs) setFavorites(JSON.parse(savedFavs));
        
        const savedTheme = localStorage.getItem('arc-theme') || 'dark';
        setTheme(savedTheme);
        document.documentElement.className = savedTheme;

        // Fetch sounds from public/sounds.json
        fetch('/sounds.json')
            .then(res => res.json())
            .then(data => setSounds(data))
            .catch(err => console.error("Failed to load sounds.json", err));
    }, []);

    const categories = ['All', 'Favorites', ...Array.from(new Set(sounds.map(s => s.game)))];

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

    const playSound = (sound: Sound) => {
        if (sound.type === 'music') {
            if (musicAudio.current) {
                musicAudio.current.pause();
                musicAudio.current.currentTime = 0;
            }
            if (playingMusicId === sound.id) {
                setPlayingMusicId(null);
                return;
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

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile || !uploadName || !uploadGame) return alert("Fill all fields");
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("name", uploadName);
        formData.append("game", uploadGame);
        formData.append("type", "sfx");

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await res.json();
            if (res.ok) {
                alert("Success! The repository has been updated. Vercel is building the new version.");
                setShowUploadModal(false);
                setUploadFile(null);
                setUploadName('');
                setUploadGame('');
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (err) {
            alert("Upload failed. Check console.");
        } finally {
            setIsUploading(false);
        }
    };

    if (!mounted) return null;

    const filteredSounds = sounds.filter(sound => {
        const matchesSearch = sound.name.toLowerCase().includes(search.toLowerCase()) || sound.game.toLowerCase().includes(search.toLowerCase());
        const matchesCat = activeCategory === 'All' ? true : activeCategory === 'Favorites' ? favorites.includes(sound.id) : sound.game === activeCategory;
        return matchesSearch && matchesCat;
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
        <div className="flex flex-col min-h-screen">
            <div className="sticky top-0 z-40 glass-header px-4 pt-4 pb-3 sm:px-8">
                <div className="max-w-[1600px] mx-auto flex gap-2 sm:gap-3 items-center mb-3">
                    <div className="relative flex-1 input-glass rounded-lg flex items-center px-3 py-2.5 sm:py-3">
                        <Search size={18} className="text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Search sounds..." 
                            className="bg-transparent border-none outline-none w-full text-sm sm:text-base ml-2 placeholder-[var(--text-muted)]"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="text-[var(--text-muted)] hover:opacity-70 text-xs font-semibold">
                                CLEAR
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <button onClick={toggleTheme} className="input-glass hover:brightness-110 p-2.5 sm:p-3 rounded-lg flex items-center justify-center">
                            <Lightbulb size={18} className={theme === 'dark' ? 'text-yellow-500' : 'text-[var(--text-main)]'} />
                        </button>
                        
                        {!session ? (
                            <button onClick={() => signIn("github")} className="bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg flex items-center text-sm font-semibold">
                                <Github size={16} /><span className="ml-2 hidden sm:inline">Sign In</span>
                            </button>
                        ) : isJordy ? (
                            <button onClick={() => setShowUploadModal(true)} className="bg-blue-600 text-white px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg flex items-center text-sm font-semibold hover:bg-blue-500">
                                <Upload size={16} /><span className="ml-2 hidden sm:inline">Upload</span>
                            </button>
                        ) : (
                            <button onClick={() => signOut()} className="bg-zinc-800 text-[var(--text-muted)] px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg flex items-center text-sm font-semibold">
                                <LogOut size={16} /><span className="ml-2 hidden sm:inline">Sign Out</span>
                            </button>
                        )}

                        <button onClick={stopAll} className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 p-2.5 sm:px-5 sm:py-3 rounded-lg flex items-center text-sm font-semibold tracking-wide">
                            <Square size={14} fill="currentColor" /><span className="ml-2 hidden sm:inline">Stop All</span>
                        </button>
                    </div>
                </div>

                <div className="max-w-[1600px] mx-auto flex overflow-x-auto no-scrollbar gap-2 sm:gap-3">
                    {categories.map(cat => (
                        <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-1.5 sm:py-2 rounded-full whitespace-nowrap text-xs sm:text-sm font-semibold tracking-wide border transition-colors ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'input-glass hover:border-[var(--border-focus)]'}`}>
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 max-w-[1600px] mx-auto w-full p-4 sm:p-8">
                {sounds.length === 0 ? (
                    <div className="text-center text-[var(--text-muted)] mt-10 text-lg">Loading sounds from API...</div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 sm:gap-4">
                        {filteredSounds.map(sound => {
                            const isPlaying = sound.type === 'music' ? playingMusicId === sound.id : playingId === sound.id;
                            const isFav = favorites.includes(sound.id);

                            return (
                                <div key={sound.id} onClick={() => playSound(sound)} className={`sound-tile group cursor-pointer p-3 sm:p-4 rounded-xl flex items-center gap-3 sm:gap-4 ${isPlaying ? 'is-playing' : ''}`}>
                                    <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-blue-500/20' : 'bg-black/10 dark:bg-white/10 group-hover:bg-black/20 dark:group-hover:bg-white/20'}`}>
                                        {isPlaying ? <div className="eq-container"><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/></div> : (sound.type === 'music' ? <Repeat size={16} className="text-[var(--text-muted)]" /> : <Play size={16} className="ml-1 text-[var(--text-muted)]" fill="currentColor" />)}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className={`text-sm sm:text-base font-bold truncate ${isPlaying ? 'text-blue-500 dark:text-blue-400' : ''}`}>{sound.name}</div>
                                        <div className="text-[10px] sm:text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider truncate mt-0.5">{sound.game}</div>
                                    </div>
                                    <button onClick={(e) => toggleFavorite(sound.id, e)} className={`flex-shrink-0 p-1.5 rounded-md transition-opacity ${isFav ? 'opacity-100' : 'opacity-30 sm:opacity-0 sm:group-hover:opacity-100'}`}>
                                        <Heart size={18} fill={isFav ? "currentColor" : "none"} className={isFav ? "text-blue-500" : "text-[var(--text-muted)] hover:text-blue-400"} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !isUploading && setShowUploadModal(false)}>
                    <form onSubmit={handleUpload} className="sound-tile p-6 sm:p-8 w-full max-w-md shadow-2xl rounded-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2"><Upload size={24} /> Upload to GitHub</h2>
                        
                        <div className="space-y-5 mb-8">
                            <div>
                                <label className="block text-xs sm:text-sm font-semibold mb-1.5 text-[var(--text-muted)]">MP3 File</label>
                                <input type="file" accept="audio/mp3" required onChange={e => setUploadFile(e.target.files?.[0] || null)} className="w-full text-sm sm:text-base input-glass p-3 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-xs sm:text-sm font-semibold mb-1.5 text-[var(--text-muted)]">Display Name</label>
                                <input type="text" placeholder="e.g. Oof Sound" required value={uploadName} onChange={e => setUploadName(e.target.value)} className="w-full text-sm sm:text-base input-glass p-3 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-xs sm:text-sm font-semibold mb-1.5 text-[var(--text-muted)]">Game / Category</label>
                                <input type="text" placeholder="e.g. Roblox" required value={uploadGame} onChange={e => setUploadGame(e.target.value)} className="w-full text-sm sm:text-base input-glass p-3 rounded-lg" />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button type="button" disabled={isUploading} onClick={() => setShowUploadModal(false)} className="px-5 py-2.5 text-sm sm:text-base font-semibold input-glass rounded-lg opacity-80 hover:opacity-100 transition-opacity">Cancel</button>
                            <button type="submit" disabled={isUploading} className="px-5 py-2.5 text-sm sm:text-base font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors">
                                {isUploading ? 'Committing...' : 'Commit to Repo'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}