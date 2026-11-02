import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, Home, Search, Library, ListMusic, Download, Settings, Plus, Play, Pause,
  SkipBack, SkipForward, Heart, Upload, MoreHorizontal, Music2, Disc3, Shuffle, Repeat2,
  Volume2, ChevronDown, X, Trash2, FileDown, CheckCircle2, AlertCircle, ExternalLink
} from "lucide-react";
import { getTracks, putTrack, deleteTrack, getPlaylists, putPlaylist, deletePlaylist } from "./db";
import type { Track, Playlist } from "./types";

type Page = "Главная" | "Поиск" | "Моя музыка" | "Плейлисты" | "Импорт" | "Офлайн" | "Исполнители" | "Настройки";
const nav: { label: Page; icon: typeof Home }[] = [
  { label: "Главная", icon: Home }, { label: "Поиск", icon: Search }, { label: "Моя музыка", icon: Library },
  { label: "Плейлисты", icon: ListMusic }, { label: "Импорт", icon: Upload }, { label: "Офлайн", icon: Download },
  { label: "Исполнители", icon: AudioLines }, { label: "Настройки", icon: Settings }
];
const uid = () => crypto.randomUUID();
const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const fmtBytes = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
const coverStyles = ["cover-purple", "cover-blue", "cover-pink", "cover-orange", "cover-green"];

function Cover({ track, index = 0, large = false }: { track?: Track; index?: number; large?: boolean }) {
  return <div className={`cover ${coverStyles[index % coverStyles.length]} ${large ? "cover-large" : ""}`}>
    <Disc3 size={large ? 76 : 30} strokeWidth={1.15} />
    {track && <span className="cover-initial">{track.title.slice(0, 1).toUpperCase()}</span>}
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>("Главная");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [fullPlayer, setFullPlayer] = useState(false);
  const [toast, setToast] = useState("");
  const [importText, setImportText] = useState("");
  const [storageEstimate, setStorageEstimate] = useState<{usage?: number; quota?: number}>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const current = tracks.find(t => t.id === currentId) ?? null;
  const visibleTracks = useMemo(() => {
    let list = tracks;
    if (activePlaylist) list = list.filter(t => playlists.find(p => p.id === activePlaylist)?.trackIds.includes(t.id));
    if (filter === "favorites") list = list.filter(t => t.favorite);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
    }
    return list;
  }, [tracks, playlists, activePlaylist, filter, query]);

  const refresh = async () => {
    try {
      setTracks(await getTracks());
      setPlaylists(await getPlaylists());
      if (navigator.storage?.estimate) setStorageEstimate(await navigator.storage.estimate());
    } catch (e) { console.error(e); setToast("Не удалось открыть локальную библиотеку"); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    const url = URL.createObjectURL(current.audio);
    a.src = url;
    a.volume = volume;
    a.load();
    if (playing) void a.play().catch(() => setPlaying(false));
    return () => URL.revokeObjectURL(url);
  }, [currentId]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const startTrack = (t: Track) => { setCurrentId(t.id); setPlaying(true); setProgress(0); };
  const togglePlay = async () => {
    const a = audioRef.current;
    if (!current) { if (tracks[0]) startTrack(tracks[0]); else fileInputRef.current?.click(); return; }
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { try { await a.play(); setPlaying(true); } catch { setToast("Браузер не смог воспроизвести этот файл"); } }
  };
  const nextTrack = () => {
    if (!tracks.length) return;
    const idx = tracks.findIndex(t => t.id === currentId);
    const next = shuffle ? tracks[Math.floor(Math.random() * tracks.length)] : tracks[(idx + 1 + tracks.length) % tracks.length];
    startTrack(next);
  };
  const prevTrack = () => {
    if (!tracks.length) return;
    if (progress > 3 && audioRef.current) { audioRef.current.currentTime = 0; return; }
    const idx = tracks.findIndex(t => t.id === currentId);
    startTrack(tracks[(idx - 1 + tracks.length) % tracks.length]);
  };
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    let count = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/") && !/\.(mp3|ogg|oga|flac|wav|m4a|aac|opus|webm)$/i.test(file.name)) continue;
      const base = file.name.replace(/\.[^.]+$/, "");
      const track: Track = {
        id: uid(), title: base, artist: "Неизвестный исполнитель", album: "Локальные файлы",
        duration: 0, fileName: file.name, mimeType: file.type || "audio/mpeg", size: file.size,
        addedAt: Date.now(), favorite: false, audio: file
      };
      try { await putTrack(track); count++; } catch { setToast("Не удалось сохранить файл. Возможно, закончилось место."); }
    }
    await refresh();
    setPage("Моя музыка");
    setToast(count ? `Добавлено файлов: ${count}` : "Не найдено поддерживаемых аудиофайлов");
  };
  const toggleFavorite = async (t: Track) => { await putTrack({ ...t, favorite: !t.favorite }); await refresh(); };
  const createPlaylist = async () => {
    const name = window.prompt("Название плейлиста");
    if (!name?.trim()) return;
    const p = { id: uid(), name: name.trim(), trackIds: [], createdAt: Date.now() };
    await putPlaylist(p); await refresh(); setActivePlaylist(p.id); setPage("Плейлисты");
  };
  const addToPlaylist = async (track: Track) => {
    if (!playlists.length) { setToast("Сначала создай плейлист"); return; }
    const choice = window.prompt(`Добавить «${track.title}» в плейлист:\n${playlists.map((p, i) => `${i + 1}. ${p.name}`).join("\n")}\n\nВведи номер`);
    const idx = Number(choice) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= playlists.length) return;
    const p = playlists[idx];
    await putPlaylist({ ...p, trackIds: p.trackIds.includes(track.id) ? p.trackIds : [...p.trackIds, track.id] });
    await refresh(); setToast("Трек добавлен в плейлист");
  };
  const removeTrack = async (t: Track) => {
    if (!window.confirm(`Удалить «${t.title}» из локальной библиотеки?`)) return;
    await deleteTrack(t.id);
    if (currentId === t.id) { audioRef.current?.pause(); setCurrentId(null); setPlaying(false); }
    await refresh();
  };
  const exportJSON = () => {
    const data = { format: "sonora-playlists-v1", exportedAt: new Date().toISOString(), playlists: playlists.map(p => ({ name: p.name, tracks: p.trackIds.map(id => { const t = tracks.find(x => x.id === id); return t ? { title: t.title, artist: t.artist, album: t.album, fileName: t.fileName } : null; }).filter(Boolean) })) };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "sonora-playlists.json");
  };
  const exportM3U = (p: Playlist) => {
    const rows = ["#EXTM3U"];
    p.trackIds.forEach(id => { const t = tracks.find(x => x.id === id); if (t) rows.push(`#EXTINF:${Math.round(t.duration)},${t.artist} - ${t.title}`, t.fileName); });
    downloadBlob(new Blob([rows.join("\n")], { type: "audio/x-mpegurl" }), `${p.name.replace(/[^\wа-яё -]/gi, "_")}.m3u`);
    setToast("M3U сохранён. Пути могут потребовать настройки в локальном плеере.");
  };
  const importPlaylistJSON = async () => {
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed.playlists)) throw new Error("missing playlists");
      for (const p of parsed.playlists) {
        const name = typeof p.name === "string" ? p.name : "Импортированный плейлист";
        const matchedIds: string[] = [];
        for (const item of (Array.isArray(p.tracks) ? p.tracks : [])) {
          const match = tracks.find(t => t.title.toLowerCase() === String(item.title ?? "").toLowerCase() && t.artist.toLowerCase() === String(item.artist ?? "").toLowerCase());
          if (match) matchedIds.push(match.id);
        }
        await putPlaylist({ id: uid(), name, trackIds: matchedIds, createdAt: Date.now() });
      }
      await refresh(); setImportText(""); setToast("Импорт метаданных завершён. Совпавшие локальные треки добавлены.");
    } catch { setToast("Не удалось прочитать JSON SONORA/совместимого формата"); }
  };
  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const deleteP = async (p: Playlist) => {
    if (!window.confirm(`Удалить плейлист «${p.name}»? Файлы останутся в библиотеке.`)) return;
    await deletePlaylist(p.id); if (activePlaylist === p.id) setActivePlaylist(null); await refresh();
  };
  const title = activePlaylist ? playlists.find(p => p.id === activePlaylist)?.name ?? page : page;
  const renderTrack = (t: Track, i: number) => <div className={`track-row ${currentId === t.id ? "is-current" : ""}`} key={t.id}>
    <button className="track-art" onClick={() => startTrack(t)} aria-label={`Воспроизвести ${t.title}`}><Cover track={t} index={i} /></button>
    <div className="track-main" onDoubleClick={() => startTrack(t)}><strong>{t.title}</strong><span>{t.artist} · {t.album}</span></div>
    <span className="track-source">Локальный файл</span>
    <span className="track-time">{t.duration ? fmt(t.duration) : "—:—"}</span>
    <button className={`icon-button favorite ${t.favorite ? "active" : ""}`} onClick={() => void toggleFavorite(t)} aria-label="В избранное"><Heart size={17} fill={t.favorite ? "currentColor" : "none"} /></button>
    <button className="icon-button" onClick={() => void addToPlaylist(t)} aria-label="Добавить в плейлист"><Plus size={18} /></button>
    <button className="icon-button" onClick={() => void removeTrack(t)} aria-label="Удалить файл"><Trash2 size={16} /></button>
  </div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><AudioLines size={24} /></div><span>SONORA</span><small>BETA</small></div>
      <button className="import-cta" onClick={() => fileInputRef.current?.click()}><Plus size={18} /> Добавить музыку</button>
      <div className="nav-label">МЕНЮ</div>
      <nav>{nav.map(item => <button key={item.label} className={`nav-item ${page === item.label ? "selected" : ""}`} onClick={() => { setPage(item.label); setActivePlaylist(null); }}><item.icon size={19} /><span>{item.label}</span>{item.label === "Моя музыка" && <small>{tracks.length}</small>}</button>)}</nav>
      <div className="side-divider" />
      <div className="nav-label nav-label-row">ТВОИ ПЛЕЙЛИСТЫ <button onClick={createPlaylist} aria-label="Создать плейлист"><Plus size={16}/></button></div>
      <div className="side-playlists">{playlists.slice(0, 6).map(p => <button key={p.id} className={`side-playlist ${activePlaylist === p.id ? "selected" : ""}`} onClick={() => {setActivePlaylist(p.id); setPage("Плейлисты");}}><span className="mini-playlist-icon"><ListMusic size={15}/></span>{p.name}</button>)}</div>
      <div className="sidebar-bottom"><div className="storage-card"><div className="storage-top"><Download size={16}/><span>Локальная библиотека</span></div><div className="storage-bar"><i style={{width: `${Math.min(100, (tracks.reduce((s,t)=>s+t.size,0)/(storageEstimate.quota || 1))*100)}%`}}/></div><p>{fmtBytes(tracks.reduce((s,t)=>s+t.size,0))} · {tracks.length} треков</p><small>Хранится на этом устройстве</small></div><div className="profile"><div className="avatar">S</div><div><strong>Моя коллекция</strong><small>Локальный режим</small></div><MoreHorizontal size={19}/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="back-forward"><button className="round-button" onClick={() => setPage("Главная")} aria-label="На главную">‹</button><button className="round-button" onClick={() => setPage("Поиск")} aria-label="К поиску">›</button></div><label className="global-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Что хочешь послушать?" onFocus={() => setPage("Поиск")} /><kbd>⌘ K</kbd></label><button className="upgrade-button" onClick={()=>setPage("Настройки")}>Настроить сервис <ExternalLink size={14}/></button></header>
      <div className="content-scroll">
        {page === "Главная" && <>
          <section className="hero"><div className="hero-orb orb-one"/><div className="hero-orb orb-two"/><div className="hero-copy"><div className="eyebrow"><span className="pulse-dot"/> ТВОЁ МУЗЫКАЛЬНОЕ ПРОСТРАНСТВО</div><h1>Твой звук.<br/><em>Твои правила.</em></h1><p>Вся твоя музыка — в одном месте.<br/>Даже когда интернет исчезает.</p><div className="hero-actions"><button className="primary-button" onClick={()=>tracks[0] ? startTrack(tracks[0]) : fileInputRef.current?.click()}><Play size={17} fill="currentColor"/> Слушать музыку</button><button className="ghost-button" onClick={()=>fileInputRef.current?.click()}><Upload size={17}/> Импортировать файлы</button></div></div><div className="hero-art"><div className="hero-ring ring-a"/><div className="hero-ring ring-b"/><div className="hero-disc"><AudioLines size={75}/></div><span className="art-caption">SOUND IN<br/>YOUR SPACE</span></div><div className="hero-footer"><span><i/> ЛОКАЛЬНОЕ ВОСПРОИЗВЕДЕНИЕ</span><span>01 / YOUR LIBRARY</span></div></section>
          <section className="quick-grid"><button onClick={()=>{setFilter("favorites");setPage("Моя музыка");}} className="quick-card favorites-card"><div className="quick-icon"><Heart size={20} fill="currentColor"/></div><div><span>ТВОЁ ИЗБРАННОЕ</span><strong>Любимые треки</strong><small>{tracks.filter(t=>t.favorite).length} композиций</small></div><Play size={19} className="quick-play"/></button><button onClick={()=>setPage("Офлайн")} className="quick-card offline-card"><div className="quick-icon"><Download size={20}/></div><div><span>ВСЕГДА С ТОБОЙ</span><strong>Офлайн-библиотека</strong><small>{tracks.length} файлов на устройстве</small></div><Play size={19} className="quick-play"/></button><button onClick={createPlaylist} className="quick-card create-card"><div className="quick-icon"><Plus size={20}/></div><div><span>СОЗДАЙ СВОЁ</span><strong>Новый плейлист</strong><small>Собери свой вайб</small></div><Plus size={19} className="quick-play"/></button></section>
          <section className="section-block"><div className="section-heading"><div><span className="section-kicker">ТВОЯ КОЛЛЕКЦИЯ</span><h2>Недавно добавленные</h2></div><button className="text-link" onClick={()=>setPage("Моя музыка")}>Вся библиотека <span>↗</span></button></div>{tracks.length ? <div className="album-grid">{tracks.slice(-6).reverse().map((t,i)=><button className="album-card" key={t.id} onClick={()=>startTrack(t)}><div className="album-cover-wrap"><Cover track={t} index={i} large/><span className="album-play"><Play size={21} fill="currentColor"/></span></div><strong>{t.title}</strong><span>{t.artist}</span></button>)}</div> : <div className="empty-state"><div className="empty-icon"><Music2 size={25}/></div><h3>Здесь будет твоя музыка</h3><p>Добавь аудиофайлы с устройства — они сохранятся в локальной библиотеке и будут доступны офлайн.</p><button className="primary-button" onClick={()=>fileInputRef.current?.click()}><Upload size={17}/> Выбрать аудиофайлы</button></div>}</section>
        </>}
        {page === "Поиск" && <section className="page-section"><div className="page-title"><span className="section-kicker">НАЙДИ СВОЙ ЗВУК</span><h1>Поиск</h1><p>Ищи треки в своей локальной библиотеке.</p></div><div className="search-large"><Search/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название трека, исполнитель или альбом"/></div><div className="section-heading"><h2>Результаты <span className="count-pill">{visibleTracks.length}</span></h2></div>{visibleTracks.length ? visibleTracks.map(renderTrack) : <div className="empty-state compact"><Search size={26}/><h3>Ничего не найдено</h3><p>Попробуй другой запрос или добавь локальные аудиофайлы.</p></div>}</section>}
        {page === "Моя музыка" && <section className="page-section"><div className="page-title"><span className="section-kicker">ТВОЯ КОЛЛЕКЦИЯ</span><h1>Моя музыка</h1><p>{tracks.length} треков · {fmtBytes(tracks.reduce((s,t)=>s+t.size,0))} на устройстве</p></div><div className="toolbar"><div className="segmented"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Все треки</button><button className={filter==="favorites"?"active":""} onClick={()=>setFilter("favorites")}>Избранное</button></div><button className="secondary-button" onClick={()=>fileInputRef.current?.click()}><Plus size={16}/> Добавить</button></div>{visibleTracks.length ? <><div className="track-header"><span># / ТРЕК</span><span>ИСТОЧНИК</span><span>ДЛИТЕЛЬНОСТЬ</span></div>{visibleTracks.map(renderTrack)}</> : <div className="empty-state compact"><Library size={27}/><h3>Библиотека пока пуста</h3><p>Импортируй MP3, FLAC, OGG, WAV или другие поддерживаемые браузером файлы.</p><button className="primary-button" onClick={()=>fileInputRef.current?.click()}><Upload size={16}/> Импортировать музыку</button></div>}</section>}
        {page === "Плейлисты" && <section className="page-section"><div className="page-title"><span className="section-kicker">СОБЕРИ СВОЙ ВАЙБ</span><h1>Плейлисты</h1><p>Твои подборки, сохранённые на этом устройстве.</p></div><div className="playlist-tools"><button className="primary-button" onClick={createPlaylist}><Plus size={17}/> Создать плейлист</button><button className="secondary-button" onClick={exportJSON}><FileDown size={16}/> Экспорт JSON</button></div>{playlists.length ? <div className="playlist-grid">{playlists.map((p,i)=><div className={`playlist-card ${activePlaylist===p.id?"playlist-active":""}`} key={p.id}><button className="playlist-main" onClick={()=>setActivePlaylist(p.id)}><Cover index={i} large/><strong>{p.name}</strong><span>{p.trackIds.length} треков</span></button><div className="playlist-card-actions"><button onClick={()=>{setActivePlaylist(p.id);setPage("Плейлисты");}}><ListMusic size={15}/> Открыть</button><button onClick={()=>exportM3U(p)} title="Экспорт M3U"><Download size={15}/></button><button onClick={()=>void deleteP(p)} title="Удалить"><Trash2 size={15}/></button></div></div>)}</div> : <div className="empty-state compact"><ListMusic size={28}/><h3>Начни с первого плейлиста</h3><p>Создай подборку, а затем добавляй в неё треки из своей библиотеки.</p><button className="primary-button" onClick={createPlaylist}><Plus size={17}/> Создать плейлист</button></div>}{activePlaylist && <div className="playlist-tracklist"><div className="section-heading"><h2>{playlists.find(p=>p.id===activePlaylist)?.name}</h2><button className="icon-button" onClick={()=>setActivePlaylist(null)}><X size={17}/></button></div>{tracks.filter(t=>playlists.find(p=>p.id===activePlaylist)?.trackIds.includes(t.id)).map(renderTrack)}{!(playlists.find(p=>p.id===activePlaylist)?.trackIds.length) && <p className="subtle">Пока пусто. Добавляй треки кнопкой «+» в библиотеке.</p>}</div>}</section>}
        {page === "Импорт" && <section className="page-section"><div className="page-title"><span className="section-kicker">ОБЪЕДИНИ СВОЮ МУЗЫКУ</span><h1>Импорт</h1><p>Добавляй локальные файлы или переноси метаданные плейлистов.</p></div><div className="integration-grid"><div className="integration-card"><div className="integration-logo local-logo"><Upload/></div><h3>Локальные аудиофайлы</h3><p>MP3, OGG, FLAC, WAV, M4A и другие форматы, которые поддерживает браузер.</p><button className="primary-button" onClick={()=>fileInputRef.current?.click()}><Plus size={16}/> Выбрать файлы</button><span className="status-ready"><CheckCircle2 size={14}/> Доступно сейчас</span></div><div className="integration-card"><div className="integration-logo spotify-logo">◉</div><h3>Spotify</h3><p>Подключение OAuth требует регистрации приложения Spotify и настройки серверных переменных. Импортирует метаданные, не аудиофайлы.</p><button className="secondary-button" onClick={()=>setToast("Spotify OAuth ещё не настроен. См. README: требуется Client ID и callback URL.")}>Подключить Spotify <ExternalLink size={14}/></button><span className="status-pending"><AlertCircle size={14}/> Требуется настройка API</span></div><div className="integration-card"><div className="integration-logo soundcloud-logo">☁</div><h3>SoundCloud</h3><p>Доступность OAuth и API зависит от текущего статуса приложения и разрешений платформы.</p><button className="secondary-button" onClick={()=>setToast("SoundCloud API ещё не настроен. См. README и актуальные правила API платформы.")}>Подключить SoundCloud <ExternalLink size={14}/></button><span className="status-pending"><AlertCircle size={14}/> Требуется настройка API</span></div></div><div className="import-json-panel"><div><h3>Импорт плейлистов из JSON</h3><p>Импортируй экспортированные метаданные SONORA. Файлы музыки не загружаются и не копируются.</p></div><textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder={'{\n  "playlists": [{ "name": "Мой плейлист", "tracks": [{ "title": "Название", "artist": "Исполнитель" }] }]\n}'}/><button className="secondary-button" onClick={()=>void importPlaylistJSON()}><FileDown size={16}/> Импортировать JSON</button></div><div className="notice"><AlertCircle size={18}/><p>Перенос из Spotify/SoundCloud переносит только доступные метаданные и структуру плейлистов. Прослушивание и офлайн-сохранение зависят от прав источника; SONORA не обходит DRM и ограничения платформ.</p></div></section>}
        {page === "Офлайн" && <section className="page-section"><div className="page-title"><span className="section-kicker">МУЗЫКА ВСЕГДА РЯДОМ</span><h1>Офлайн-библиотека</h1><p>Здесь отображаются аудиофайлы, реально сохранённые в IndexedDB на этом устройстве.</p></div><div className="offline-summary"><div className="offline-summary-icon"><Download size={22}/></div><div><strong>{tracks.length} файлов доступны локально</strong><span>Занято аудиофайлами: {fmtBytes(tracks.reduce((s,t)=>s+t.size,0))}</span></div><div className="quota-info"><span>Оценка хранилища браузера</span><strong>{storageEstimate.quota ? fmtBytes(storageEstimate.quota) : "Не поддерживается"}</strong></div></div>{tracks.length ? tracks.map(renderTrack) : <div className="empty-state compact"><Download size={28}/><h3>Офлайн-библиотека пуста</h3><p>Добавь собственные аудиофайлы — они сохранятся в локальном хранилище браузера.</p><button className="primary-button" onClick={()=>fileInputRef.current?.click()}><Upload size={16}/> Добавить аудиофайлы</button></div>}<div className="notice"><AlertCircle size={18}/><p>Доступность локальных данных зависит от браузера, настроек хранения и свободного места. Для важных файлов сохраняй резервные копии отдельно.</p></div></section>}
        {page === "Исполнители" && <section className="page-section"><div className="page-title"><span className="section-kicker">ТВОЯ МУЗЫКА</span><h1>Исполнители</h1><p>Исполнители определяются из импортированных файлов, когда метаданные доступны.</p></div>{Array.from(new Set(tracks.map(t=>t.artist))).length ? <div className="artist-grid">{Array.from(new Set(tracks.map(t=>t.artist))).map((artist,i)=><button className="artist-card" key={artist} onClick={()=>{setQuery(artist);setPage("Моя музыка");}}><div className={`artist-avatar ${coverStyles[i%coverStyles.length]}`}><AudioLines size={29}/></div><strong>{artist}</strong><span>{tracks.filter(t=>t.artist===artist).length} треков</span></button>)}</div> : <div className="empty-state compact"><AudioLines size={28}/><h3>Пока нет исполнителей</h3><p>Добавь файлы, и они появятся здесь. Текущая версия использует имя файла, пока метаданные не обработаны.</p></div>}</section>}
        {page === "Настройки" && <section className="page-section"><div className="page-title"><span className="section-kicker">ПОД ТВОЙ СТИЛЬ</span><h1>Настройки</h1><p>Состояние приложения и локального хранилища.</p></div><div className="settings-panel"><div className="settings-row"><div className="settings-icon"><Disc3/></div><div><strong>SONORA Beta</strong><span>Локальная музыкальная библиотека</span></div><span className="settings-badge">0.1.0</span></div><div className="settings-row"><div className="settings-icon"><Download/></div><div><strong>Локальные данные</strong><span>{tracks.length} треков · {playlists.length} плейлистов · {fmtBytes(tracks.reduce((s,t)=>s+t.size,0))}</span></div><span className="status-ready">Активно</span></div><div className="settings-row"><div className="settings-icon"><ExternalLink/></div><div><strong>Spotify / SoundCloud</strong><span>Интеграции не подключены. Требуются официальные API-учётные данные.</span></div><button className="secondary-button" onClick={()=>setPage("Импорт")}>Настроить</button></div><div className="settings-row"><div className="settings-icon"><FileDown/></div><div><strong>Резервная копия метаданных</strong><span>Экспорт названий плейлистов и информации о треках.</span></div><button className="secondary-button" onClick={exportJSON}>Экспорт JSON</button></div></div><div className="notice"><AlertCircle size={18}/><p>Очистка данных браузера может удалить локальную библиотеку. Экспорт JSON сохраняет метаданные, но не копирует сами аудиофайлы.</p></div></section>}
      </div>
    </main>
    <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.ogg,.oga,.flac,.wav,.m4a,.aac,.opus,.webm" multiple hidden onChange={e=>void importFiles(e.target.files)}/>
    <audio ref={audioRef} onTimeUpdate={e=>setProgress(e.currentTarget.currentTime)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration || 0)} onEnded={()=>repeat && audioRef.current ? (audioRef.current.currentTime=0, void audioRef.current.play()) : nextTrack()} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} />
    {current && <div className="player-bar"><div className="player-track"><button onClick={()=>setFullPlayer(true)}><Cover track={current}/></button><div className="player-track-meta"><strong>{current.title}</strong><span>{current.artist}</span></div><button className={`icon-button favorite ${current.favorite?"active":""}`} onClick={()=>void toggleFavorite(current)}><Heart size={17} fill={current.favorite?"currentColor":"none"}/></button></div><div className="player-controls"><div className="control-buttons"><button className={shuffle?"control-active":""} onClick={()=>setShuffle(!shuffle)} aria-label="Перемешать"><Shuffle size={16}/></button><button onClick={prevTrack} aria-label="Предыдущий трек"><SkipBack size={18} fill="currentColor"/></button><button className="main-play" onClick={()=>void togglePlay()} aria-label={playing?"Пауза":"Воспроизвести"}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><button onClick={nextTrack} aria-label="Следующий трек"><SkipForward size={18} fill="currentColor"/></button><button className={repeat?"control-active":""} onClick={()=>setRepeat(!repeat)} aria-label="Повтор"><Repeat2 size={16}/></button></div><div className="progress-row"><span>{fmt(progress)}</span><input aria-label="Позиция воспроизведения" type="range" min={0} max={duration||100} value={Math.min(progress,duration||100)} onChange={e=>{const v=Number(e.target.value); if(audioRef.current)audioRef.current.currentTime=v;setProgress(v);}}/><span>{fmt(duration)}</span></div></div><div className="player-volume"><button onClick={()=>setFullPlayer(true)} aria-label="Открыть полноэкранный плеер"><ChevronDown size={17}/></button><Volume2 size={17}/><input aria-label="Громкость" type="range" min={0} max={1} step={0.01} value={volume} onChange={e=>setVolume(Number(e.target.value))}/></div></div>}
    {fullPlayer && current && <div className="full-player-overlay"><button className="full-close" onClick={()=>setFullPlayer(false)}><ChevronDown size={24}/></button><div className="full-player-content"><Cover track={current} large/><span className="section-kicker">СЕЙЧАС ИГРАЕТ</span><h2>{current.title}</h2><p>{current.artist}</p><div className="progress-row full-progress"><span>{fmt(progress)}</span><input aria-label="Позиция воспроизведения" type="range" min={0} max={duration||100} value={Math.min(progress,duration||100)} onChange={e=>{const v=Number(e.target.value);if(audioRef.current)audioRef.current.currentTime=v;setProgress(v);}}/><span>{fmt(duration)}</span></div><div className="full-controls"><button onClick={()=>setShuffle(!shuffle)}><Shuffle/></button><button onClick={prevTrack}><SkipBack size={26}/></button><button className="full-play" onClick={()=>void togglePlay()}>{playing?<Pause size={28} fill="currentColor"/>:<Play size={28} fill="currentColor"/>}</button><button onClick={nextTrack}><SkipForward size={26}/></button><button onClick={()=>setRepeat(!repeat)}><Repeat2/></button></div></div></div>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast("")}><X size={15}/></button></div>}
  </div>;
}