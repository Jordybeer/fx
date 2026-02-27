'use client';

import React, { useState, useEffect } from 'react';
import { Search, Square, Heart, Play, Repeat, Lightbulb, Github, Upload } from 'lucide-react';

const SOUNDS = [
    { id: '1', name: 'Level Up', game: 'Arc Raiders', type: 'sfx' },
    { id: '2', name: '1-Up', game: 'Mario', type: 'sfx' },
    { id: '3', name: 'Ambient Loop', game: 'Misc', type: 'music' },
    { id: '4', name: 'Sniper Shot', game: 'Arc Raiders', type: 'sfx' },
];

const CATEGORIES = ['All', 'Favorites', ...Array.from(new Set(SOUNDS.map(s => s.game)))];

export default function Soundboard() {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [favorites, setFavorites] = useState<string[]>([]);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
    
    const [theme, setTheme] = useState('dark');
    const [mounted, setMounted] = useState(false);

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

    if (!mounted) return null;

    const filteredSounds = SOUNDS.filter(sound => {
        const matchesSearch = sound.name.toLowerCase().includes(search.toLowerCase()) || sound.game.toLowerCase().includes(search.toLowerCase());
        const matchesCat = activeCategory === 'All' ? true : activeCategory === 'Favorites' ? favorites.includes(sound.id) : sound.game === activeCategory;
        return matchesSearch && matchesCat;
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
                    </div>
                    
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <button onClick={toggleTheme} className="input-glass hover:brightness-110 p-2.5 rounded-lg flex items-center justify-center">
                            <Lightbulb size={18} className={theme === 'dark' ? 'text-yellow-500' : 'text-[var(--text-main)]'} />
                        </button>
                        <button className="bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-2.5 rounded-lg flex items-center text-sm font-semibold">
                            <Github size={16} /><span className="ml-2 hidden sm:inline">Sign In</span>
                        </button>
                        <button onClick={() => { setPlayingId(null); setPlayingMusicId(null); }} className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 p-2.5 sm:px-4 sm:py-2.5 rounded-lg flex items-center text-sm font-medium">
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
                        return (
                            <div key={sound.id} className={`sound-tile p-2.5 sm:p-3 flex items-center gap-3 ${isPlaying ? 'is-playing' : ''}`}>
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isPlaying ? 'bg-blue-500/20' : 'bg-black/10 dark:bg-white/10'}`}>
                                    {isPlaying ? <div className="eq-container"><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/></div> : (sound.type === 'music' ? <Repeat size={14} /> : <Play size={14} className="ml-0.5" fill="currentColor" />)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">{sound.name}</div>
                                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider truncate">{sound.game}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}