'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Square, Heart, Play, Repeat, Lightbulb, Github, Upload } from 'lucide-react';

type SoundType = 'sfx' | 'music';
interface Sound {
  id: string;
  name: string;
  game: string;
  type: SoundType;
  src: string;
}

const SOUNDS: Sound[] = [
    { id: '1', name: 'Level Up', game: 'Arc Raiders', type: 'sfx', src: '/audio/levelup.mp3' },
    { id: '2', name: '1-Up', game: 'Mario', type: 'sfx', src: '/audio/1up.mp3' },
    { id: '3', name: 'Ambient Loop', game: 'Misc', type: 'music', src: '/audio/loop.mp3' },
    { id: '4', name: 'Sniper Shot', game: 'Arc Raiders', type: 'sfx', src: '/audio/sniper.mp3' },
];

const CATEGORIES = ['All', 'Favorites', ...Array.from(new Set(SOUNDS.map(s => s.game)))];

export default function Soundboard() {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [favorites, setFavorites] = useState<string[]>([]);
    
    // Audio State & Refs
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
    const sfxAudio = useRef<HTMLAudioElement | null>(null);
    const musicAudio = useRef<HTMLAudioElement | null>(null);
    
    // UI State
    const [theme, setTheme] = useState('dark');
    const [mounted, setMounted] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedFavs = localStorage.getItem('arc-favs');
        if (savedFavs) setFavorites(JSON.parse(savedFavs));
        
        const savedTheme = localStorage.getItem('arc-theme') || 'dark';
        setTheme(savedTheme);
        document.documentElement.className = savedTheme;
    }, []);

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

    if (!mounted) return null;

    const filteredSounds = SOUNDS.filter(sound => {
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
                <div className="max-w-7xl mx-auto flex gap-2 sm:gap-3 items-center mb-3">
                    <div className="relative flex-1 input-glass rounded-lg flex items-center px-3 py-2.5">
                        <Search size={18} className="text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Search sounds..." 
                            className="bg-transparent border-none outline-none w-full text-sm ml-2 placeholder-[var(--text-muted)]"
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
                        <button onClick={toggleTheme} className="input-glass hover:brightness-110 p-2.5 rounded-lg flex items-center justify-center">
                            <Lightbulb size={18} className={theme === 'dark' ? 'text-yellow-500' : 'text-[var(--text-main)]'} />
                        </button>
                        
                        {!isLoggedIn ? (
                            <button onClick={() => setIsLoggedIn(true)} className="bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 sm:px-4 py-2.5 rounded-lg flex items-center text-sm font-semibold">
                                <Github size={16} /><span className="ml-2 hidden sm:inline">Sign In</span>
                            </button>
                        ) : (
                            <button onClick={() => setShowUploadModal(true)} className="bg-blue-600 text-white px-3 sm:px-4 py-2.5 rounded-lg flex items-center text-sm font-semibold">
                                <Upload size={16} /><span className="ml-2 hidden sm:inline">Upload</span>
                            </button>
                        )}

                        <button onClick={stopAll} className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 p-2.5 sm:px-4 sm:py-2.5 rounded-lg flex items-center text-sm font-medium">
                            <Square size={14} fill="currentColor" /><span className="ml-2 hidden sm:inline">Stop All</span>
                        </button>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto flex overflow-x-auto no-scrollbar gap-2">
                    {CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-3.5 py-1.5 rounded-full whitespace-nowrap text-xs font-semibold tracking-wide border ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'input-glass'}`}>
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                    {filteredSounds.map(sound => {
                        const isPlaying = sound.type === 'music' ? playingMusicId === sound.id : playingId === sound.id;
                        const isFav = favorites.includes(sound.id);

                        return (
                            <div key={sound.id} onClick={() => playSound(sound)} className={`sound-tile group cursor-pointer p-2.5 sm:p-3 flex items-center gap-3 ${isPlaying ? 'is-playing' : ''}`}>
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-blue-500/20' : 'bg-black/10 dark:bg-white/10 group-hover:bg-black/20 dark:group-hover:bg-white/20'}`}>
                                    {isPlaying ? <div className="eq-container"><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/></div> : (sound.type === 'music' ? <Repeat size={14} className="text-[var(--text-muted)]" /> : <Play size={14} className="ml-0.5 text-[var(--text-muted)]" fill="currentColor" />)}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className={`text-sm font-semibold truncate ${isPlaying ? 'text-blue-500 dark:text-blue-400' : ''}`}>{sound.name}</div>
                                    <div className="text-[10px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wider truncate">{sound.game}</div>
                                </div>
                                <button onClick={(e) => toggleFavorite(sound.id, e)} className={`flex-shrink-0 p-1 rounded-md transition-opacity ${isFav ? 'opacity-100' : 'opacity-30 sm:opacity-0 sm:group-hover:opacity-100'}`}>
                                    <Heart size={16} fill={isFav ? "currentColor" : "none"} className={isFav ? "text-blue-500" : "text-[var(--text-muted)]"} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}>
                    <div className="sound-tile p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Upload size={20} /> Upload to GitHub</h2>
                        <p className="text-sm text-[var(--text-muted)] mb-4">API integration pending. This will push MP3s to /public/audio.</p>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-sm font-semibold input-glass rounded">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}