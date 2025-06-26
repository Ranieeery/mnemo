import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {
    getLibraryFolders,
    getLibraryFoldersWithPreviews,
    getRecentlyWatchedVideos,
    getUnwatchedVideos,
    getVideosInDirectoryOrderedByWatchStatus,
    getVideosInProgress,
    initDatabase,
    saveLibraryFolder,
    updateVideoDetails,
    updateWatchProgress
} from "./database";
import {checkVideoToolsAvailable, ProcessedVideo} from "./services/videoProcessor";
import {Settings} from "./components/Settings";
import ProcessingProgressBar from "./components/Progress/ProcessingProgressBar";
import SearchProgressBar from "./components/Progress/SearchProgressBar";
import TopBar from "./components/Navigation/TopBar";
import Sidebar from "./components/Sidebar/Sidebar";
import ConfirmRemovalModal from "./components/Modals/ConfirmRemovalModal";
import NextVideoModal from "./components/Modals/NextVideoModal";
import VideoDetailsModal from "./components/Modals/VideoDetailsModal";
import ContextMenu from "./components/ContextMenu/ContextMenu";
import HomePage from "./components/HomePage/HomePage";
import SearchResults from "./components/SearchResults/SearchResults";
import VideoPlayer from "./components/VideoPlayer/VideoPlayer";
import DirectoryView from "./components/DirectoryView/DirectoryView";
import { useLibraryManagement } from "./hooks/useLibraryManagement";
import { useVideoProcessing } from "./hooks/useVideoProcessing";
import { useVideoSearch } from "./hooks/useVideoSearch";
import { useVideoWatchedStatus } from "./hooks/useVideoWatchedStatus";
import { checkAndLoadSubtitles, parseSubtitles, getCurrentSubtitle, Subtitle } from "./utils/subtitleUtils";
import "./styles/player.css";

// Função para ordenação natural (numérica) de strings
const naturalSort = (a: string, b: string): number => {
    return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
    });
};

interface DirEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_video: boolean;
}

function App() {
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [libraryFolders, setLibraryFolders] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>("");
    const [directoryContents, setDirectoryContents] = useState<DirEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([]);
    const [videoToolsAvailable, setVideoToolsAvailable] = useState<{
        ffmpeg: boolean;
        ffprobe: boolean
    }>({ffmpeg: false, ffprobe: false});
    const [selectedVideo, setSelectedVideo] = useState<ProcessedVideo | null>(null);
    const [showVideoDetails, setShowVideoDetails] = useState<boolean>(false);
    const [editingTitle, setEditingTitle] = useState<string>("");
    const [editingDescription, setEditingDescription] = useState<string>("");
    const [contextMenu, setContextMenu] = useState<{
        show: boolean;
        x: number;
        y: number;
        video: ProcessedVideo | null
    }>({
        show: false,
        x: 0,
        y: 0,
        video: null
    });
    const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(false);
    const [playingVideo, setPlayingVideo] = useState<ProcessedVideo | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [volume, setVolume] = useState<number>(1);
    const [showControls, setShowControls] = useState<boolean>(true);
    const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(false);
    const [subtitlesAvailable, setSubtitlesAvailable] = useState<boolean>(false);
    const [currentSubtitle, setCurrentSubtitle] = useState<string>("");
    const [isIconChanging, setIsIconChanging] = useState<boolean>(false);

    // Estados para página inicial
    const [showHomePage, setShowHomePage] = useState<boolean>(true);
    const [recentVideos, setRecentVideos] = useState<ProcessedVideo[]>([]);
    const [videosInProgress, setVideosInProgress] = useState<ProcessedVideo[]>([]);
    const [suggestedVideos, setSuggestedVideos] = useState<ProcessedVideo[]>([]);
    const [libraryFoldersWithPreviews, setLibraryFoldersWithPreviews] = useState<{
        folder: string,
        videos: ProcessedVideo[]
    }[]>([]);

    // Estados para modal de confirmação de remoção
    const [showRemoveConfirmation, setShowRemoveConfirmation] = useState<boolean>(false);
    const [folderToRemove, setFolderToRemove] = useState<string | null>(null);

    // Estados para configurações
    const [showSettings, setShowSettings] = useState<boolean>(false);

    // Estados para histórico de navegação
    const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    // Estados para "próximo vídeo"
    const [showNextVideoPrompt, setShowNextVideoPrompt] = useState<boolean>(false);
    const [nextVideo, setNextVideo] = useState<ProcessedVideo | null>(null);
    const [savedPlaybackSettings, setSavedPlaybackSettings] = useState<{
        speed: number;
        volume: number;
        subtitlesEnabled: boolean;
    }>({speed: 1, volume: 1, subtitlesEnabled: false});
    const [nextVideoTimeout, setNextVideoTimeout] = useState<number | null>(null);
    const [nextVideoCountdown, setNextVideoCountdown] = useState<number>(10);

    // Função para carregar dados da página inicial
    const loadHomePageData = async () => {
        try {
            const [recent, inProgress, suggestions, foldersWithPreviews] = await Promise.all([
                getRecentlyWatchedVideos(8),
                getVideosInProgress(8),
                getUnwatchedVideos(16),
                getLibraryFoldersWithPreviews()
            ]);

            setRecentVideos(recent);
            setVideosInProgress(inProgress);
            setSuggestedVideos(suggestions);
            setLibraryFoldersWithPreviews(foldersWithPreviews);
        } catch (error) {
            console.error('Error loading home page data:', error);
        }
    };

    // Hook para gerenciamento da biblioteca
    const [libraryState, libraryActions] = useLibraryManagement({
        videoToolsAvailable,
        libraryFolders,
        setLibraryFolders,
        loadHomePageData
    });

    // Hook para processamento de vídeos
    const [videoProcessingState, videoProcessingActions] = useVideoProcessing({
        setProcessedVideos
    });

    // Hook para busca de vídeos
    const [searchState, searchActions] = useVideoSearch({
        selectedFolder,
        onShowHomePage: () => {
            setShowHomePage(true);
            loadHomePageData();
        }
    });

    // Hook para gerenciar status de vídeos assistidos
    const { toggleVideoWatchedStatus } = useVideoWatchedStatus({
        setProcessedVideos,
        setRecentVideos,
        setVideosInProgress,
        setSuggestedVideos,
        loadHomePageData,
        selectedFolder,
        searchState,
        searchActions
    });

    // Carregar pastas do banco de dados na inicialização
    useEffect(() => {
        const initializeApp = async () => {
            try {
                await initDatabase();
                const folders = await getLibraryFolders();
                setLibraryFolders(folders);

                // Carrega dados da página inicial
                await loadHomePageData();

                // Verifica se as ferramentas de vídeo estão disponíveis
                const tools = await checkVideoToolsAvailable();
                setVideoToolsAvailable(tools);

                if (!tools.ffmpeg || !tools.ffprobe) {
                    console.warn('Video tools not available. Video processing will be limited.');
                }

                // Migrar dados do localStorage se existirem
                const savedFoldersLegacy = localStorage.getItem('libraryFolders');
                if (savedFoldersLegacy) {
                    const legacyFolders = JSON.parse(savedFoldersLegacy);
                    for (const folder of legacyFolders) {
                        await saveLibraryFolder(folder);
                    }
                    localStorage.removeItem('libraryFolders');
                    // Recarregar após migração
                    const updatedFolders = await getLibraryFolders();
                    setLibraryFolders(updatedFolders);
                    await loadHomePageData();
                }
            } catch (error) {
                console.error('Failed to initialize app:', error);
                // Fallback para localStorage em caso de erro
                const savedFolders = localStorage.getItem('libraryFolders');
                if (savedFolders) {
                    setLibraryFolders(JSON.parse(savedFolders));
                }
            }
        };

        initializeApp();
    }, []);

    // Função para voltar à página inicial
    const goToHomePage = () => {
        setSelectedFolder(null);
        setShowHomePage(true);
        // Não limpa o termo de busca para mantê-lo persistente
        loadHomePageData();
    };

    // Função para navegar para uma pasta com histórico
    const navigateToFolder = (folderPath: string) => {
        // Adiciona à história se não estivermos navegando pelo histórico
        if (historyIndex === navigationHistory.length - 1) {
            const newHistory = [...navigationHistory, folderPath];
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        } else {
            // Se estivermos no meio da história, remove entradas posteriores
            const newHistory = navigationHistory.slice(0, historyIndex + 1);
            newHistory.push(folderPath);
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        }

        setSelectedFolder(folderPath);
        setCurrentPath(folderPath);
        setShowHomePage(false);
        // Não limpa o termo de busca para mantê-lo persistente
        loadDirectoryContents(folderPath);
    };

    // Função para voltar no histórico
    const goBack = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const folderPath = navigationHistory[newIndex];
            setSelectedFolder(folderPath);
            setCurrentPath(folderPath);
            setShowHomePage(false);
            loadDirectoryContents(folderPath);
        } else if (historyIndex === 0) {
            // Se estamos no primeiro item da história, volta à página inicial
            setHistoryIndex(-1);
            goToHomePage();
        }
    };

    // Função para avançar no histórico
    const goForward = () => {
        if (historyIndex < navigationHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const folderPath = navigationHistory[newIndex];
            setSelectedFolder(folderPath);
            setCurrentPath(folderPath);
            setShowHomePage(false);
            loadDirectoryContents(folderPath);
        }
    };

    // Verifica se pode voltar ou avançar
    const canGoBack = historyIndex > -1;
    const canGoForward = historyIndex < navigationHistory.length - 1;

    // Função para abrir modal de confirmação de remoção
    const handleRemoveFolderRequest = (folderPath: string) => {
        setFolderToRemove(folderPath);
        setShowRemoveConfirmation(true);
    };

    // Função para confirmar remoção da pasta
    const confirmRemoveFolder = async () => {
        if (!folderToRemove) return;

        await libraryActions.confirmRemoveFolder(folderToRemove, selectedFolder, goToHomePage);
        setShowRemoveConfirmation(false);
        setFolderToRemove(null);
    };

    // Função para cancelar remoção
    const cancelRemoveFolder = () => {
        setShowRemoveConfirmation(false);
        setFolderToRemove(null);
    };

    // Função para selecionar uma pasta na sidebar
    const handleSelectFolder = (folder: string) => {
        navigateToFolder(folder);
    };

    // Função para carregar o conteúdo de um diretório
    const loadDirectoryContents = async (path: string) => {
        setLoading(true);
        try {
            const contents: DirEntry[] = await invoke('read_directory', {path});
            setDirectoryContents(contents);
            setCurrentPath(path);

            // Carrega vídeos já processados do banco de dados, ordenados por status de visualização
            const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(path);
            setProcessedVideos(existingVideos);

            // Processa vídeos em segundo plano se as ferramentas estão disponíveis
            if (videoToolsAvailable.ffmpeg && videoToolsAvailable.ffprobe) {
                videoProcessingActions.processVideosInBackground(path);
            }
        } catch (error) {
            console.error('Error loading directory contents:', error);
            setDirectoryContents([]);
        } finally {
            setLoading(false);
        }
    };

    // Função para navegar para um diretório
    const navigateToDirectory = (path: string) => {
        navigateToFolder(path);
    };

    // Função para abrir o modal de detalhes do vídeo
    const handleOpenVideoDetails = (video: ProcessedVideo) => {
        setSelectedVideo(video);
        setEditingTitle(video.title);
        setEditingDescription(video.description || "");
        setShowVideoDetails(true);
    };

    // Função para fechar o modal de detalhes do vídeo
    const handleCloseVideoDetails = () => {
        setShowVideoDetails(false);
        setSelectedVideo(null);
    };

    // Função para salvar as alterações do vídeo
    const handleSaveVideoDetails = async () => {
        if (!selectedVideo) return;

        try {
            await updateVideoDetails(selectedVideo.file_path, editingTitle, editingDescription);

            // Atualiza o vídeo na lista local
            setProcessedVideos(prev => prev.map(video =>
                video.file_path === selectedVideo.file_path
                    ? {...video, title: editingTitle, description: editingDescription}
                    : video
            ));

            // Atualiza o vídeo selecionado
            setSelectedVideo(prev => prev ? {...prev, title: editingTitle, description: editingDescription} : null);

            console.log("Video details saved successfully");
        } catch (error) {
            console.error("Error saving video details:", error);
            alert("Error saving video details. Please try again.");
        }
    };

    // Função para cancelar a edição
    const handleCancelEdit = () => {
        if (selectedVideo) {
            setEditingTitle(selectedVideo.title);
            setEditingDescription(selectedVideo.description || "");
        }
    };

    // Funções para o menu de contexto
    const handleContextMenu = (event: React.MouseEvent, video: ProcessedVideo) => {
        event.preventDefault();
        setContextMenu({
            show: true,
            x: event.clientX,
            y: event.clientY,
            video: video
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu({
            show: false,
            x: 0,
            y: 0,
            video: null
        });
    };

    const handleOpenFile = async (filePath: string) => {
        try {
            await invoke('open_file_externally', {filePath});
            handleCloseContextMenu();
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Error opening file. Please check if the file exists.');
        }
    };

    const handleOpenWith = async (filePath: string) => {
        try {
            await invoke('open_file_with_dialog', {filePath});
            handleCloseContextMenu();
        } catch (error) {
            console.error('Error opening file dialog:', error);
            alert('Error opening file dialog.');
        }
    };

    const handleOpenProperties = (video: ProcessedVideo) => {
        handleCloseContextMenu();
        handleOpenVideoDetails(video);
    };

    // Fechar menu de contexto ao clicar fora
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.show) {
                handleCloseContextMenu();
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [contextMenu.show]);

    // Suporte para botões do mouse (voltar/avançar)
    useEffect(() => {
        const handleMouseButtons = (event: MouseEvent) => {
            if (event.button === 3) { // Botão "voltar" do mouse
                event.preventDefault();
                if (canGoBack) {
                    goBack();
                }
            } else if (event.button === 4) { // Botão "avançar" do mouse
                event.preventDefault();
                if (canGoForward) {
                    goForward();
                }
            }
        };

        document.addEventListener('mousedown', handleMouseButtons);
        return () => {
            document.removeEventListener('mousedown', handleMouseButtons);
        };
    }, [canGoBack, canGoForward]);

    // Suporte para teclas de atalho de navegação
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Alt + seta esquerda = voltar
            if (event.altKey && event.key === 'ArrowLeft') {
                event.preventDefault();
                if (canGoBack) {
                    goBack();
                }
            }
            // Alt + seta direita = avançar
            else if (event.altKey && event.key === 'ArrowRight') {
                event.preventDefault();
                if (canGoForward) {
                    goForward();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [canGoBack, canGoForward]);

    // Funções do player de vídeo interno
    const handlePlayVideo = async (video: ProcessedVideo) => {
        setPlayingVideo(video);
        setShowVideoPlayer(true);
        setPlaybackSpeed(1);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setVolume(1);
        setShowControls(true);
        setCurrentSubtitle("");

        // Verifica e carrega legendas
        const subtitleData = await checkAndLoadSubtitles(video.file_path);
        if (subtitleData) {
            const parsedSubtitles = parseSubtitles(subtitleData);
            setSubtitles(parsedSubtitles);
            setSubtitlesAvailable(true);
            setSubtitlesEnabled(true); // Ativa legendas automaticamente quando detectadas
        } else {
            setSubtitles([]);
            setSubtitlesAvailable(false);
            setSubtitlesEnabled(false);
        }
    };

    const handleCloseVideoPlayer = () => {
        setShowVideoPlayer(false);
        setPlayingVideo(null);
        setIsFullscreen(false);
        setIsPlaying(false);
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
            setControlsTimeout(null);
        }
    };

    // Função para abrir configurações
    const handleOpenSettings = () => {
        setShowSettings(true);
    };

    // Função para fechar configurações
    const handleCloseSettings = () => {
        setShowSettings(false);
    };

    // Função chamada após importação de biblioteca (para recarregar dados)
    const handleLibraryChanged = async () => {
        // Recarregar pastas da biblioteca
        const updatedFolders = await getLibraryFolders();
        setLibraryFolders(updatedFolders);

        // Recarregar dados da página inicial
        if (showHomePage) {
            await loadHomePageData();
        }

        // Se estiver em uma pasta, recarregar seus vídeos
        if (selectedFolder) {
            setProcessedVideos([]);
            const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(selectedFolder);
            setProcessedVideos(existingVideos);
        }

        // Limpar busca se estiver ativa
        if (searchState.searchTerm) {
            searchActions.clearSearch();
        }
    };

    const handleSpeedChange = (speed: number) => {
        setPlaybackSpeed(speed);
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            video.playbackRate = speed;
        }
    };

    const toggleFullscreen = async () => {
        try {
            if (!isFullscreen) {
                // Entra em tela cheia real (F11)
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            } else {
                // Sai da tela cheia real
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
            // Fallback para método simples se API não funcionar
            setIsFullscreen(!isFullscreen);
        }
    };

    const togglePlayPause = () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            // Ativa a animação de transição
            setIsIconChanging(true);

            setTimeout(() => {
                if (video.paused) {
                    video.play();
                    setIsPlaying(true);
                } else {
                    video.pause();
                    setIsPlaying(false);
                }

                // Remove a animação após a mudança
                setTimeout(() => setIsIconChanging(false), 150);
            }, 75); // Metade da duração da transição CSS
        }
    };

    const handleSeek = (time: number) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            video.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleVolumeChange = (newVolume: number) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
            video.volume = newVolume;
            setVolume(newVolume);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Função para alternar legendas
    const toggleSubtitles = () => {
        if (subtitlesAvailable) {
            setSubtitlesEnabled(!subtitlesEnabled);
        }
    };

    // Estado para armazenar legendas processadas
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);

    // Atualizar legenda atual baseada no tempo do vídeo
    useEffect(() => {
        if (showVideoPlayer && subtitlesEnabled) {
            const newSubtitle = getCurrentSubtitle(currentTime, subtitles, subtitlesEnabled);
            setCurrentSubtitle(newSubtitle);
        } else {
            setCurrentSubtitle("");
        }
    }, [currentTime, subtitlesEnabled, showVideoPlayer, subtitles]);

    // Auto-hide controls em fullscreen
    const resetControlsTimeout = () => {
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }

        setShowControls(true);

        // Só esconde controles se estiver em fullscreen REAL
        if (document.fullscreenElement) {
            const timeout = setTimeout(() => {
                setShowControls(false);
            }, 3000);
            setControlsTimeout(timeout);
        }
    };

    // Controles de teclado para o player
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (!showVideoPlayer) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'Escape':
                    if (isFullscreen) {
                        setIsFullscreen(false);
                    } else {
                        handleCloseVideoPlayer();
                    }
                    break;
                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handleSeek(Math.max(0, currentTime - 10));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleSeek(Math.min(duration, currentTime + 10));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    handleVolumeChange(Math.min(1, volume + 0.1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    handleVolumeChange(Math.max(0, volume - 0.1));
                    break;
            }

            resetControlsTimeout();
        };

        if (showVideoPlayer) {
            document.addEventListener('keydown', handleKeyPress);
            return () => {
                document.removeEventListener('keydown', handleKeyPress);
            };
        }
    }, [showVideoPlayer, isFullscreen, currentTime, duration, volume]);

    // Auto-hide controls em fullscreen
    useEffect(() => {
        if (document.fullscreenElement) {
            resetControlsTimeout();
        } else {
            setShowControls(true);
            if (controlsTimeout) {
                clearTimeout(controlsTimeout);
                setControlsTimeout(null);
            }
        }
    }, [isFullscreen]);

    // Listener para detectar mudanças na tela cheia
    useEffect(() => {
        if (!showVideoPlayer) return;

        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = document.fullscreenElement !== null;
            setIsFullscreen(isCurrentlyFullscreen);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [showVideoPlayer]);

    // Atualizar progresso do vídeo durante reprodução
    const handleVideoProgress = async (video: ProcessedVideo, currentTime: number) => {
        if (video.id && video.duration_seconds && currentTime > 0) {
            try {
                await updateWatchProgress(video.id, currentTime, video.duration_seconds);

                // Se atingiu 75%, marcar como assistido
                const watchedThreshold = video.duration_seconds * 0.75;
                if (currentTime >= watchedThreshold && !video.is_watched) {
                    const updatedVideo = {...video, is_watched: true, watch_progress_seconds: currentTime};

                    setProcessedVideos(prev => prev.map(v =>
                        v.file_path === video.file_path ? updatedVideo : v
                    ));

                    await loadHomePageData();
                }
            } catch (error) {
                console.error('Error updating video progress:', error);
            }
        }
    };

    // Função para reproduzir o próximo vídeo
    const playNextVideo = async () => {
        if (nextVideo) {
            if (nextVideoTimeout) {
                clearInterval(nextVideoTimeout);
                setNextVideoTimeout(null);
            }

            setShowNextVideoPrompt(false);

            // Primeiro, configura o próximo vídeo para reprodução
            setPlayingVideo(nextVideo);

            // Verifica e carrega legendas do próximo vídeo
            const subtitleData = await checkAndLoadSubtitles(nextVideo.file_path);
            if (subtitleData) {
                const parsedSubtitles = parseSubtitles(subtitleData);
                setSubtitles(parsedSubtitles);
                setSubtitlesAvailable(true);
            } else {
                setSubtitles([]);
                setSubtitlesAvailable(false);
            }

            // Aplica as configurações salvas após um pequeno delay para garantir que o vídeo foi carregado
            setTimeout(() => {
                const video = document.querySelector('video') as HTMLVideoElement;
                if (video) {
                    video.playbackRate = savedPlaybackSettings.speed;
                    video.volume = savedPlaybackSettings.volume;
                    setPlaybackSpeed(savedPlaybackSettings.speed);
                    setVolume(savedPlaybackSettings.volume);
                    setSubtitlesEnabled(savedPlaybackSettings.subtitlesEnabled);
                }
            }, 100);

            setNextVideo(null);
            setNextVideoCountdown(10);
        }
    };

    // Função para cancelar próximo vídeo
    const cancelNextVideo = () => {
        if (nextVideoTimeout) {
            clearInterval(nextVideoTimeout);
            setNextVideoTimeout(null);
        }
        setShowNextVideoPrompt(false);
        setNextVideo(null);
        setNextVideoCountdown(10);
    };

    return (
        <div className="h-screen bg-gray-900 text-white flex">
            {/* Sidebar */}
            <Sidebar
                libraryFolders={libraryFolders}
                selectedFolder={selectedFolder}
                folderIndexingStatus={libraryState.folderIndexingStatus}
                onAddFolder={libraryActions.handleAddFolder}
                onSelectFolder={handleSelectFolder}
                onRemoveFolderRequest={handleRemoveFolderRequest}
                onGoToHomePage={goToHomePage}
                onOpenSettings={handleOpenSettings}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
                {/* Top Bar */}
                <TopBar
                    selectedFolder={selectedFolder}
                    canGoBack={canGoBack}
                    canGoForward={canGoForward}
                    onGoBack={goBack}
                    onGoForward={goForward}
                    searchTerm={searchState.searchTerm}
                    setSearchTerm={searchActions.setSearchTerm}
                    isSearching={searchState.isSearching}
                    onClearSearch={searchActions.clearSearch}
                />

                {/* Progress Bar for Video Processing */}
                <ProcessingProgressBar
                    show={libraryState.showProcessingProgress}
                    progress={libraryState.processingProgress}
                    currentIndexingFolder={libraryState.currentIndexingFolder}
                />

                {/* Progress Bar for Search */}
                <SearchProgressBar
                    show={searchState.isSearching}
                    progress={searchState.searchProgress}
                />

                {/* Content Area */}
                <div className="flex-1 p-6 overflow-auto">
                    {searchState.showSearchResults ? (
                        /* Search Results */
                        <SearchResults
                            isSearching={searchState.isSearching}
                            searchTerm={searchState.searchTerm}
                            searchResults={searchState.searchResults}
                            searchProgress={searchState.searchProgress}
                            onPlayVideo={handlePlayVideo}
                            onContextMenu={handleContextMenu}
                            onOpenVideoDetails={handleOpenVideoDetails}
                        />
                    ) : showHomePage && !selectedFolder ? (
                        /* Página Inicial */
                        <HomePage
                            libraryFolders={libraryFolders}
                            videosInProgress={videosInProgress}
                            recentVideos={recentVideos}
                            suggestedVideos={suggestedVideos}
                            libraryFoldersWithPreviews={libraryFoldersWithPreviews}
                            onAddFolder={libraryActions.handleAddFolder}
                            onPlayVideo={handlePlayVideo}
                            onContextMenu={handleContextMenu}
                            onOpenVideoDetails={handleOpenVideoDetails}
                            onSelectFolder={handleSelectFolder}
                        />
                    ) : !selectedFolder ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor"
                                     viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-300 mb-2">Get Started</h3>
                            <p className="text-gray-400 mb-6 max-w-md">
                                Add folders containing your videos to start building your library.
                                Mnemo will scan and organize your videos while preserving your folder structure.
                            </p>
                            <button
                                onClick={libraryActions.handleAddFolder}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            >
                                Add Your First Folder
                            </button>
                        </div>
                    ) : (
                        <DirectoryView
                            loading={loading}
                            currentPath={currentPath}
                            processedVideos={processedVideos}
                            directoryContents={directoryContents}
                            videoProcessingState={videoProcessingState}
                            onPlayVideo={handlePlayVideo}
                            onContextMenu={handleContextMenu}
                            onNavigateToDirectory={navigateToDirectory}
                            naturalSort={naturalSort}
                        />
                    )}
                </div>
            </div>

            {/* Modal para detalhes do vídeo */}
            <VideoDetailsModal
                show={showVideoDetails}
                video={selectedVideo}
                editingTitle={editingTitle}
                editingDescription={editingDescription}
                onClose={handleCloseVideoDetails}
                onSave={handleSaveVideoDetails}
                onCancel={handleCancelEdit}
                onTitleChange={setEditingTitle}
                onDescriptionChange={setEditingDescription}
            />

            {/* Menu de contexto */}
            <ContextMenu
                show={contextMenu.show}
                x={contextMenu.x}
                y={contextMenu.y}
                video={contextMenu.video}
                onPlayVideo={handlePlayVideo}
                onOpenFile={handleOpenFile}
                onOpenWith={handleOpenWith}
                onToggleWatchedStatus={toggleVideoWatchedStatus}
                onOpenProperties={handleOpenProperties}
                onClose={handleCloseContextMenu}
            />

            {/* Player de Vídeo Interno Customizado */}
            {showVideoPlayer && playingVideo && (
                <VideoPlayer
                    video={playingVideo}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    volume={volume}
                    playbackSpeed={playbackSpeed}
                    isFullscreen={isFullscreen}
                    showControls={showControls}
                    subtitlesEnabled={subtitlesEnabled}
                    subtitlesAvailable={subtitlesAvailable}
                    currentSubtitle={currentSubtitle}
                    isIconChanging={isIconChanging}
                    onClose={handleCloseVideoPlayer}
                    onTogglePlayPause={togglePlayPause}
                    onSeek={handleSeek}
                    onVolumeChange={handleVolumeChange}
                    onSpeedChange={handleSpeedChange}
                    onToggleFullscreen={toggleFullscreen}
                    onToggleSubtitles={toggleSubtitles}
                    onVideoProgress={(video, time) => {
                        setCurrentTime(time);
                        handleVideoProgress(video, time);
                    }}
                    onVideoEnded={() => {
                        setIsPlaying(false);
                        // Salva as configurações atuais
                        setSavedPlaybackSettings({
                            speed: playbackSpeed,
                            volume: volume,
                            subtitlesEnabled: subtitlesEnabled
                        });

                        // Procura o próximo vídeo
                        if (playingVideo) {
                            const currentIndex = processedVideos.findIndex(v => v.file_path === playingVideo.file_path);
                            if (currentIndex !== -1 && currentIndex < processedVideos.length - 1) {
                                const next = processedVideos[currentIndex + 1];
                                setNextVideo(next);
                                setShowNextVideoPrompt(true);
                                setNextVideoCountdown(10);

                                // Inicia o countdown automático
                                const countdownInterval = setInterval(() => {
                                    setNextVideoCountdown(prev => {
                                        if (prev <= 1) {
                                            clearInterval(countdownInterval);
                                            // Auto-play do próximo vídeo
                                            playNextVideo();
                                            return 0;
                                        }
                                        return prev - 1;
                                    });
                                }, 1000);

                                setNextVideoTimeout(countdownInterval);
                            }
                        }
                    }}
                    onLoadedMetadata={(videoDuration) => {
                        setDuration(videoDuration);
                        // O playbackRate e volume já são setados no componente
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    formatTime={formatTime}
                    resetControlsTimeout={resetControlsTimeout}
                />
            )}

            {/* Modal de Próximo Vídeo */}
            <NextVideoModal
                show={showNextVideoPrompt}
                nextVideo={nextVideo}
                countdown={nextVideoCountdown}
                savedSettings={savedPlaybackSettings}
                onPlayNext={playNextVideo}
                onCancel={cancelNextVideo}
            />

            {/* Modal de Confirmação de Remoção */}
            <ConfirmRemovalModal
                show={showRemoveConfirmation}
                folderToRemove={folderToRemove}
                onConfirm={confirmRemoveFolder}
                onCancel={cancelRemoveFolder}
            />

            {/* Settings Modal */}
            {showSettings && (
                <Settings
                    onClose={handleCloseSettings}
                    onLibraryChanged={handleLibraryChanged}
                />
            )}
        </div>
    );
}

export default App;
