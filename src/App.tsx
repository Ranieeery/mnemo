import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
  initDatabase, 
  getLibraryFolders, 
  saveLibraryFolder,
  removeLibraryFolder,
  debugVideosInFolder,
  getVideosInDirectoryOrderedByWatchStatus,
  updateVideoDetails,
  searchVideos,
  searchVideosRecursive,
  getRecentlyWatchedVideos,
  getVideosInProgress,
  getUnwatchedVideos,
  markVideoAsWatched,
  markVideoAsUnwatched,
  updateWatchProgress,
  getLibraryFoldersWithPreviews
} from "./database";
import { checkVideoToolsAvailable, ProcessedVideo, processVideo } from "./services/videoProcessor";
import { formatDuration, isVideoFile } from "./utils/videoUtils";
import { VideoTagsManager } from "./components/VideoTagsManager";
import { Settings } from "./components/Settings";
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
  const [processingVideos, setProcessingVideos] = useState<boolean>(false);
  const [videoToolsAvailable, setVideoToolsAvailable] = useState<{ffmpeg: boolean; ffprobe: boolean}>({ffmpeg: false, ffprobe: false});
  const [selectedVideo, setSelectedVideo] = useState<ProcessedVideo | null>(null);
  const [showVideoDetails, setShowVideoDetails] = useState<boolean>(false);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [editingDescription, setEditingDescription] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{show: boolean; x: number; y: number; video: ProcessedVideo | null}>({
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
  // Estados para funcionalidade de busca
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<ProcessedVideo[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [searchProgress, setSearchProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  }>({ current: 0, total: 0, currentFile: "" });
  
  // Estados para página inicial
  const [showHomePage, setShowHomePage] = useState<boolean>(true);
  const [recentVideos, setRecentVideos] = useState<ProcessedVideo[]>([]);
  const [videosInProgress, setVideosInProgress] = useState<ProcessedVideo[]>([]);
  const [suggestedVideos, setSuggestedVideos] = useState<ProcessedVideo[]>([]);
  const [libraryFoldersWithPreviews, setLibraryFoldersWithPreviews] = useState<{folder: string, videos: ProcessedVideo[]}[]>([]);
  
  // Estados para modal de confirmação de remoção
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState<boolean>(false);
  const [folderToRemove, setFolderToRemove] = useState<string | null>(null);
  
  // Estados para configurações
  const [showSettings, setShowSettings] = useState<boolean>(false);
  
  // Estados para histórico de navegação
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // Estados para progresso de processamento de vídeos
  const [processingProgress, setProcessingProgress] = useState<{
    total: number;
    processed: number;
    currentFile: string;
  }>({ total: 0, processed: 0, currentFile: "" });
  const [showProcessingProgress, setShowProcessingProgress] = useState<boolean>(false);
  
  // Estados para "próximo vídeo"
  const [showNextVideoPrompt, setShowNextVideoPrompt] = useState<boolean>(false);
  const [nextVideo, setNextVideo] = useState<ProcessedVideo | null>(null);
  const [savedPlaybackSettings, setSavedPlaybackSettings] = useState<{
    speed: number;
    volume: number;
    subtitlesEnabled: boolean;
  }>({ speed: 1, volume: 1, subtitlesEnabled: false });
  const [nextVideoTimeout, setNextVideoTimeout] = useState<number | null>(null);
  const [nextVideoCountdown, setNextVideoCountdown] = useState<number>(10);

  // Estados para indexação de pastas
  const [folderIndexingStatus, setFolderIndexingStatus] = useState<{[key: string]: boolean}>({});
  const [currentIndexingFolder, setCurrentIndexingFolder] = useState<string | null>(null);

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

  // Função para voltar à página inicial
  const goToHomePage = () => {
    setSelectedFolder(null);
    setShowHomePage(true);
    setShowSearchResults(false);
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
    setShowSearchResults(false);
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
      setShowSearchResults(false);
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
      setShowSearchResults(false);
      loadDirectoryContents(folderPath);
    }
  };

  // Verifica se pode voltar ou avançar
  const canGoBack = historyIndex > -1;
  const canGoForward = historyIndex < navigationHistory.length - 1;

  // Função para adicionar uma nova pasta
  const handleAddFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      
      if (selectedPath && typeof selectedPath === 'string' && !libraryFolders.includes(selectedPath)) {
        await saveLibraryFolder(selectedPath);
        const updatedFolders = await getLibraryFolders();
        setLibraryFolders(updatedFolders);
        
        // Inicia a indexação imediata da pasta
        await indexFolderRecursively(selectedPath);
        
        // Recarrega dados da página inicial
        await loadHomePageData();
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  // Função para indexar uma pasta recursivamente
  const indexFolderRecursively = async (folderPath: string) => {
    if (!videoToolsAvailable.ffmpeg || !videoToolsAvailable.ffprobe) {
      console.warn('Video tools not available. Skipping indexing.');
      return;
    }

    setCurrentIndexingFolder(folderPath);
    setFolderIndexingStatus(prev => ({ ...prev, [folderPath]: true }));
    setShowProcessingProgress(true);
    setProcessingProgress({ total: 0, processed: 0, currentFile: "" });

    try {
      console.log(`Starting recursive indexing for: ${folderPath}`);
      
      // Primeiro, conta quantos arquivos de vídeo existem recursivamente
      const allFiles: any[] = await invoke('scan_directory_recursive', { path: folderPath });
      const videoFiles = allFiles.filter(file => !file.is_dir && isVideoFile(file.name));
      
      setProcessingProgress(prev => ({ ...prev, total: videoFiles.length }));
      
      // Processa cada vídeo com callback de progresso
      let processedCount = 0;
      
      for (const videoFile of videoFiles) {
        setProcessingProgress(prev => ({ 
          ...prev, 
          processed: processedCount,
          currentFile: videoFile.name
        }));
        
        try {
          await processVideo(videoFile.path);
        } catch (error) {
          console.error(`Failed to process video ${videoFile.path}:`, error);
        }
        
        processedCount++;
      }
      
      setProcessingProgress(prev => ({ 
        ...prev, 
        processed: processedCount,
        currentFile: ""
      }));
      
      console.log(`Recursive indexing completed for ${folderPath}. Processed ${processedCount} videos.`);
    } catch (error) {
      console.error('Error in recursive folder indexing:', error);
    } finally {
      setFolderIndexingStatus(prev => ({ ...prev, [folderPath]: false }));
      setCurrentIndexingFolder(null);
      
      // Mantém a barra de progresso visível por um momento
      setTimeout(() => {
        setShowProcessingProgress(false);
      }, 2000);
    }
  };

  // Função para abrir modal de confirmação de remoção
  const handleRemoveFolderRequest = (folderPath: string) => {
    setFolderToRemove(folderPath);
    setShowRemoveConfirmation(true);
  };

  // Função para confirmar remoção da pasta
  const confirmRemoveFolder = async () => {
    if (!folderToRemove) return;
    
    try {
      // Debug: verificar vídeos antes da remoção
      console.log(`=== BEFORE REMOVAL ===`);
      await debugVideosInFolder(folderToRemove);
      
      // Remover a pasta e todos os vídeos indexados
      await removeLibraryFolder(folderToRemove);
      
      // Debug: verificar se os vídeos foram removidos
      console.log(`=== AFTER REMOVAL ===`);
      await debugVideosInFolder(folderToRemove);
      
      const updatedFolders = await getLibraryFolders();
      setLibraryFolders(updatedFolders);
      
      // Se a pasta removida estava selecionada, volta à página inicial
      if (selectedFolder === folderToRemove) {
        goToHomePage();
      }
      
      // Recarrega dados da página inicial
      await loadHomePageData();
      
      console.log(`Successfully removed folder: ${folderToRemove}`);
    } catch (error) {
      console.error('Error removing folder:', error);
    } finally {
      setShowRemoveConfirmation(false);
      setFolderToRemove(null);
    }
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
      const contents: DirEntry[] = await invoke('read_directory', { path });
      setDirectoryContents(contents);
      setCurrentPath(path);
      
      // Carrega vídeos já processados do banco de dados, ordenados por status de visualização
      const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(path);
      setProcessedVideos(existingVideos);
      
      // Processa vídeos em segundo plano se as ferramentas estão disponíveis
      if (videoToolsAvailable.ffmpeg && videoToolsAvailable.ffprobe) {
        processVideosInBackground(path);
      }
    } catch (error) {
      console.error('Error loading directory contents:', error);
      setDirectoryContents([]);
    } finally {
      setLoading(false);
    }
  };

  // Função para processar vídeos em segundo plano com progresso
  const processVideosInBackground = async (directoryPath: string) => {
    if (processingVideos) return; // Evita processamento simultâneo
    
    setProcessingVideos(true);
    setShowProcessingProgress(true);
    setProcessingProgress({ total: 0, processed: 0, currentFile: "" });
    
    try {
      console.log(`Starting background video processing for: ${directoryPath}`);
      
      // Primeiro, conta quantos arquivos de vídeo existem
      const allFiles: any[] = await invoke('scan_directory_recursive', { path: directoryPath });
      const videoFiles = allFiles.filter(file => !file.is_dir && isVideoFile(file.name));
      
      setProcessingProgress(prev => ({ ...prev, total: videoFiles.length }));
      
      // Processa cada vídeo com callback de progresso
      let processedCount = 0;
      const processedVideos = [];
      
      for (const videoFile of videoFiles) {
        setProcessingProgress(prev => ({ 
          ...prev, 
          processed: processedCount,
          currentFile: videoFile.name
        }));
        
        try {
          const processedVideo = await processVideo(videoFile.path);
          if (processedVideo) {
            processedVideos.push(processedVideo);
          }
        } catch (error) {
          console.error(`Failed to process video ${videoFile.path}:`, error);
        }
        
        processedCount++;
      }
      
      setProcessingProgress(prev => ({ 
        ...prev, 
        processed: processedCount,
        currentFile: ""
      }));
      
      if (processedVideos.length > 0) {
        // Atualiza a lista de vídeos processados com a nova ordenação
        const updatedVideos = await getVideosInDirectoryOrderedByWatchStatus(directoryPath);
        setProcessedVideos(updatedVideos);
        console.log(`Background processing completed. Processed ${processedVideos.length} new videos.`);
      }
    } catch (error) {
      console.error('Error in background video processing:', error);
    } finally {
      setProcessingVideos(false);
      // Mantém a barra de progresso visível por um momento
      setTimeout(() => {
        setShowProcessingProgress(false);
      }, 2000);
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
          ? { ...video, title: editingTitle, description: editingDescription }
          : video
      ));
      
      // Atualiza o vídeo selecionado
      setSelectedVideo(prev => prev ? { ...prev, title: editingTitle, description: editingDescription } : null);
      
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
      await invoke('open_file_externally', { filePath });
      handleCloseContextMenu();
    } catch (error) {
      console.error('Error opening file:', error);
      alert('Error opening file. Please check if the file exists.');
    }
  };

  const handleOpenWith = async (filePath: string) => {
    try {
      await invoke('open_file_with_dialog', { filePath });
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
    setSubtitlesEnabled(false);
    setCurrentSubtitle("");
    
    // Verifica e carrega legendas
    const subtitleData = await checkAndLoadSubtitles(video.file_path);
    if (subtitleData) {
      const parsedSubtitles = parseSubtitles(subtitleData);
      setSubtitles(parsedSubtitles);
    } else {
      setSubtitles([]);
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
    if (searchTerm) {
      setSearchTerm("");
      setSearchResults([]);
      setShowSearchResults(false);
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

  // Função para verificar e carregar legendas
  const checkAndLoadSubtitles = async (videoPath: string) => {
    try {
      // Gera os caminhos dos arquivos de legenda (.srt e .vtt)
      const srtPath = videoPath.replace(/\.[^/.]+$/, '.srt');
      const vttPath = videoPath.replace(/\.[^/.]+$/, '.vtt');
      
      // Verifica se algum arquivo de legenda existe (prioridade: .srt depois .vtt)
      let subtitlePath = null;
      let exists = await invoke('file_exists', { path: srtPath });
      
      if (exists) {
        subtitlePath = srtPath;
      } else {
        exists = await invoke('file_exists', { path: vttPath });
        if (exists) {
          subtitlePath = vttPath;
        }
      }
      
      setSubtitlesAvailable(exists as boolean);
      
      if (exists && subtitlePath) {
        // Carrega o conteúdo do arquivo de legenda
        const content = await invoke('read_subtitle_file', { path: subtitlePath });
        return { content: content as string, format: subtitlePath.endsWith('.vtt') ? 'vtt' : 'srt' };
      }
      return null;
    } catch (error) {
      console.error('Error checking subtitles:', error);
      setSubtitlesAvailable(false);
      return null;
    }
  };

  // Função para alternar legendas
  const toggleSubtitles = () => {
    if (subtitlesAvailable) {
      setSubtitlesEnabled(!subtitlesEnabled);
    }
  };

  // Função para processar legendas SRT e VTT
  const parseSubtitles = (subtitleData: { content: string; format: string }) => {
    const subtitles: Array<{start: number; end: number; text: string}> = [];
    const { content, format } = subtitleData;
    
    if (format === 'srt') {
      // Parser para formato SRT
      const blocks = content.trim().split('\n\n');
      
      blocks.forEach(block => {
        const lines = block.split('\n');
        if (lines.length >= 3) {
          const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
          if (timeMatch) {
            const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
            const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
            const text = lines.slice(2).join('\n');
            subtitles.push({ start, end, text });
          }
        }
      });
    } else if (format === 'vtt') {
      // Parser para formato VTT
      const lines = content.split('\n');
      let i = 0;
      
      // Pula o cabeçalho WEBVTT
      while (i < lines.length && !lines[i].includes('-->')) {
        i++;
      }
      
      while (i < lines.length) {
        const line = lines[i].trim();
        
        // Procura por linhas de tempo
        const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (timeMatch) {
          const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
          const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
          
          // Coleta o texto da legenda
          const textLines = [];
          i++;
          while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
          }
          
          const text = textLines.join('\n');
          if (text) {
            subtitles.push({ start, end, text });
          }
        }
        i++;
      }
    }
    
    return subtitles;
  };

  // Estado para armazenar legendas processadas
  const [subtitles, setSubtitles] = useState<Array<{start: number; end: number; text: string}>>([]);

  // Função para encontrar legenda atual baseada no tempo
  const getCurrentSubtitle = (currentTime: number) => {
    if (!subtitlesEnabled || !subtitles.length) return "";
    
    const currentSub = subtitles.find(sub => 
      currentTime >= sub.start && currentTime <= sub.end
    );
    
    return currentSub ? currentSub.text : "";
  };

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

  // Atualizar legenda atual baseada no tempo do vídeo
  useEffect(() => {
    if (showVideoPlayer && subtitlesEnabled) {
      const newSubtitle = getCurrentSubtitle(currentTime);
      setCurrentSubtitle(newSubtitle);
    } else {
      setCurrentSubtitle("");
    }
  }, [currentTime, subtitlesEnabled, showVideoPlayer]);

  // ====== FUNÇÕES DE BUSCA ======
  
  // Função para realizar busca
  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    
    if (!term.trim()) {
      if (!selectedFolder) {
        setShowHomePage(true);
      }
      setShowSearchResults(false);
      setSearchResults([]);
      setSearchProgress({ current: 0, total: 0, currentFile: "" });
      return;
    }
    
    setShowHomePage(false);
    setIsSearching(true);
    setSearchProgress({ current: 0, total: 0, currentFile: "" });
    
    try {
      let results: ProcessedVideo[];
      
      // Se não há pasta selecionada (página inicial), busca apenas nos vídeos indexados
      if (!selectedFolder) {
        results = await searchVideos(term);
      } else {
        // Se há pasta selecionada, usa busca recursiva completa
        results = await searchVideosRecursive(term, (current, total, currentFile) => {
          setSearchProgress({ current, total, currentFile });
        });
      }
      
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Error searching videos:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
      setSearchProgress({ current: 0, total: 0, currentFile: "" });
    }
  };
  
  // Função para limpar busca
  const clearSearch = () => {
    setSearchTerm("");
    setSearchResults([]);
    setShowSearchResults(false);
    
    // Se não há pasta selecionada, volta à página inicial
    if (!selectedFolder) {
      setShowHomePage(true);
    }
  };
  
  // Debounce para busca automática
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearch(searchTerm);
      }
    }, 300); // 300ms de delay
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // ====== FUNÇÕES DE STATUS DE VÍDEO ======
  
  // Marcar vídeo como assistido/não assistido
  const toggleVideoWatchedStatus = async (video: ProcessedVideo) => {
    try {
      if (video.id) {
        if (video.is_watched) {
          await markVideoAsUnwatched(video.id);
        } else {
          await markVideoAsWatched(video.id, video.duration_seconds);
        }
        
        // Atualiza as listas locais
        const updatedVideo = { ...video, is_watched: !video.is_watched };
        
        setProcessedVideos(prev => prev.map(v => 
          v.file_path === video.file_path ? updatedVideo : v
        ));
        
        setSearchResults(prev => prev.map(v => 
          v.file_path === video.file_path ? updatedVideo : v
        ));
        
        // Recarrega dados da página inicial
        await loadHomePageData();
      }
    } catch (error) {
      console.error('Error toggling video watched status:', error);
    }
  };
  
  // Atualizar progresso do vídeo durante reprodução
  const handleVideoProgress = async (video: ProcessedVideo, currentTime: number) => {
    if (video.id && video.duration_seconds && currentTime > 0) {
      try {
        await updateWatchProgress(video.id, currentTime, video.duration_seconds);
        
        // Se atingiu 75%, marcar como assistido
        const watchedThreshold = video.duration_seconds * 0.75;
        if (currentTime >= watchedThreshold && !video.is_watched) {
          const updatedVideo = { ...video, is_watched: true, watch_progress_seconds: currentTime };
          
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
      } else {
        setSubtitles([]);
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
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h1 
            className="text-xl font-bold text-blue-400 cursor-pointer hover:text-blue-300 transition-colors"
            onClick={goToHomePage}
            title="Return to Home"
          >
            Mnemo
          </h1>
          <p className="text-sm text-gray-400">Video Library</p>
        </div>

        {/* Library Section */}
        <div className="flex-1 p-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-2">LIBRARY</h2>
            <button 
              onClick={handleAddFolder}
              className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors mb-2"
            >
              + Add Folder
            </button>
            <button 
              onClick={handleOpenSettings}
              className="w-full px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            >
              ⚙️ Settings
            </button>
          </div>

          {/* Directories List */}
          <div className="space-y-1">
            {libraryFolders.length === 0 ? (
              <div className="text-sm text-gray-500">No folders added yet</div>
            ) : (
              libraryFolders.map((folder, index) => (
                <div
                  key={index}
                  className={`text-sm rounded-md p-2 transition-all group relative ${
                    selectedFolder === folder
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  <div 
                    onClick={() => handleSelectFolder(folder)}
                    className="cursor-pointer pr-8"
                  >
                    <div className="font-medium truncate flex items-center" title={folder}>
                      <span>{folder.split(/[/\\]/).pop() || folder}</span>
                      {/* Indicador de indexação */}
                      {folderIndexingStatus[folder] && (
                        <svg className="w-4 h-4 ml-2 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </div>
                    <div className="text-xs opacity-75 truncate">
                      {folderIndexingStatus[folder] ? 'Indexing videos...' : folder}
                    </div>
                  </div>
                  {/* Ícone de lixeira que aparece no hover */}
                  {!folderIndexingStatus[folder] && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFolderRequest(folder);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-1 rounded transition-all duration-200 hover:bg-red-400/20"
                      title="Remove folder from library"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Navigation Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={goBack}
                  disabled={!canGoBack}
                  className={`p-2 rounded-md transition-colors ${
                    canGoBack 
                      ? 'hover:bg-gray-700 text-gray-300 hover:text-white' 
                      : 'text-gray-600 cursor-not-allowed'
                  }`}
                  title="Go back (Alt + ←)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={goForward}
                  disabled={!canGoForward}
                  className={`p-2 rounded-md transition-colors ${
                    canGoForward 
                      ? 'hover:bg-gray-700 text-gray-300 hover:text-white' 
                      : 'text-gray-600 cursor-not-allowed'
                  }`}
                  title="Go forward (Alt + →)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              
              <h2 className="text-lg font-semibold">
                {selectedFolder || "Welcome to Mnemo"}
              </h2>
            </div>
            
            {/* Search Bar */}
            <div className="flex-1 max-w-md mx-4">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {/* Search Icon */}
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  {isSearching ? (
                    <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : searchTerm ? (
                    <button 
                      onClick={clearSearch}
                      className="text-gray-400 hover:text-gray-200"
                      title="Clear search"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar for Video Processing */}
        {showProcessingProgress && (
          <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
              <span>
                {currentIndexingFolder ? `Indexing folder: ${currentIndexingFolder.split(/[/\\]/).pop()}` : 'Processing videos...'}
              </span>
              <span>{processingProgress.processed} / {processingProgress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                style={{ 
                  width: processingProgress.total > 0 
                    ? `${(processingProgress.processed / processingProgress.total) * 100}%` 
                    : '0%' 
                }}
              ></div>
            </div>
            {processingProgress.currentFile && (
              <div className="text-xs text-gray-500 mt-1 truncate">
                Processing: {processingProgress.currentFile}
              </div>
            )}
          </div>
        )}

        {/* Progress Bar for Search */}
        {isSearching && searchProgress.total > 0 && (
          <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
              <span>Searching videos...</span>
              <span>{searchProgress.current} / {searchProgress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300" 
                style={{ 
                  width: searchProgress.total > 0 
                    ? `${(searchProgress.current / searchProgress.total) * 100}%` 
                    : '0%' 
                }}
              ></div>
            </div>
            {searchProgress.currentFile && (
              <div className="text-xs text-gray-500 mt-1 truncate">
                Checking: {searchProgress.currentFile}
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-auto">
          {showSearchResults ? (
            /* Search Results */
            <div>
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-32 space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                    <span className="text-gray-400">Searching videos...</span>
                  </div>
                  {searchProgress.total > 0 && (
                    <div className="w-64 text-center">
                      <div className="text-xs text-gray-500 mb-1">
                        {searchProgress.current} / {searchProgress.total} files checked
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1">
                        <div 
                          className="bg-blue-500 h-1 rounded-full transition-all duration-300" 
                          style={{ 
                            width: `${(searchProgress.current / searchProgress.total) * 100}%`
                          }}
                        ></div>
                      </div>
                      {searchProgress.currentFile && (
                        <div className="text-xs text-gray-600 mt-1 truncate">
                          {searchProgress.currentFile}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">
                      Search Results
                    </h3>
                    <p className="text-sm text-gray-400">
                      {searchResults.length === 0 
                        ? `No videos found for "${searchTerm}"`
                        : `Found ${searchResults.length} video${searchResults.length === 1 ? '' : 's'} for "${searchTerm}"`
                      }
                    </p>
                  </div>
                  
                  {/* Search Results Grid */}
                  {searchResults.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {searchResults.map((video, index) => (
                        <div
                          key={`search-${video.file_path}-${index}`}
                          className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer"
                          onClick={() => handlePlayVideo(video)}
                          onContextMenu={(e) => handleContextMenu(e, video)}
                        >
                          <div className="aspect-video bg-gray-700 relative">
                            {video.thumbnail_path ? (
                              <img 
                                src={convertFileSrc(video.thumbnail_path)}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* Watched indicator */}
                            {video.is_watched && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            {/* Progress bar for videos in progress */}
                            {video.watch_progress_seconds != null && video.watch_progress_seconds > 0 && video.duration_seconds && !video.is_watched && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                                <div 
                                  className="h-full bg-blue-500" 
                                  style={{ width: `${(video.watch_progress_seconds / video.duration_seconds) * 100}%` }}
                                ></div>
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <h4 className="font-medium text-gray-200 text-sm mb-1 line-clamp-2">
                              {video.title}
                            </h4>
                            <div className="flex items-center justify-between text-xs text-gray-400">
                              <span>{video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00'}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenVideoDetails(video);
                                }}
                                className="hover:text-gray-200 transition-colors"
                                title="Video details"
                              >
                                ⓘ
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : showHomePage && !selectedFolder ? (
            /* Página Inicial */
            <div>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-200 mb-2">Welcome to Mnemo</h2>
                <p className="text-gray-400">Your personal video library</p>
              </div>

              {libraryFolders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">Get Started</h3>
                  <p className="text-gray-400 mb-6 max-w-md">
                    Add folders containing your videos to start building your library. 
                    Mnemo will scan and organize your videos while preserving your folder structure.
                  </p>
                  <button 
                    onClick={handleAddFolder}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                  >
                    Add Your First Folder
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Continue Watching */}
                  {videosInProgress.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-300 mb-4">Continue Watching</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {videosInProgress.map((video, index) => (
                          <div
                            key={`progress-${video.file_path}-${index}`}
                            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer relative"
                            onClick={() => handlePlayVideo(video)}
                            onContextMenu={(e) => handleContextMenu(e, video)}
                          >
                            <div className="aspect-video bg-gray-700 relative">
                              {video.thumbnail_path ? (
                                <img 
                                  src={convertFileSrc(video.thumbnail_path)}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              {/* Progress bar */}
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                                <div 
                                  className="h-full bg-blue-500" 
                                  style={{ width: `${((video.watch_progress_seconds || 0) / (video.duration_seconds || 1)) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                            <div className="p-2">
                              <p className="text-sm font-medium text-gray-300 truncate" title={video.title}>
                                {video.title}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recently Watched */}
                  {recentVideos.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-300 mb-4">Recently Watched</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {recentVideos.map((video, index) => (
                          <div
                            key={`recent-${video.file_path}-${index}`}
                            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer relative"
                            onClick={() => handlePlayVideo(video)}
                            onContextMenu={(e) => handleContextMenu(e, video)}
                          >
                            <div className="aspect-video bg-gray-700 relative">
                              {video.thumbnail_path ? (
                                <img 
                                  src={convertFileSrc(video.thumbnail_path)}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              {/* Watched indicator */}
                              {video.is_watched && (
                                <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-sm font-medium text-gray-300 truncate" title={video.title}>
                                {video.title}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Videos */}
                  {suggestedVideos.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-300 mb-4">Suggestions for You</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {suggestedVideos.map((video, index) => (
                          <div
                            key={`suggested-${video.file_path}-${index}`}
                            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer"
                            onClick={() => handlePlayVideo(video)}
                            onContextMenu={(e) => handleContextMenu(e, video)}
                          >
                            <div className="aspect-video bg-gray-700 relative">
                              {video.thumbnail_path ? (
                                <img 
                                  src={convertFileSrc(video.thumbnail_path)}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-sm font-medium text-gray-300 truncate" title={video.title}>
                                {video.title}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Library Folders Preview */}
                  {libraryFoldersWithPreviews.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-300 mb-4">Your Library</h3>
                      <div className="space-y-6">
                        {libraryFoldersWithPreviews.map((folderData, folderIndex) => (
                          <div key={`folder-${folderIndex}`} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-md font-medium text-gray-400">
                                {folderData.folder.split(/[/\\]/).pop()}
                              </h4>
                              <button
                                onClick={() => {
                                  setSelectedFolder(folderData.folder);
                                  navigateToFolder(folderData.folder);
                                  setShowHomePage(false);
                                }}
                                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                View All →
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                              {folderData.videos.slice(0, 5).map((video, videoIndex) => (
                                <div
                                  key={`folder-video-${folderIndex}-${videoIndex}`}
                                  className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer relative"
                                  onClick={() => handlePlayVideo(video)}
                                  onContextMenu={(e) => handleContextMenu(e, video)}
                                >
                                  <div className="aspect-video bg-gray-700 relative">
                                    {video.thumbnail_path ? (
                                      <img 
                                        src={convertFileSrc(video.thumbnail_path)}
                                        alt={video.title}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      </div>
                                    )}
                                    {/* Watched indicator */}
                                    {video.is_watched && (
                                      <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    )}
                                    {/* Progress bar */}
                                    {(video.watch_progress_seconds || 0) > 0 && !video.is_watched && (
                                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                                        <div 
                                          className="h-full bg-blue-500" 
                                          style={{ width: `${((video.watch_progress_seconds || 0) / (video.duration_seconds || 1)) * 100}%` }}
                                        ></div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-2">
                                    <p className="text-xs font-medium text-gray-300 truncate" title={video.title}>
                                      {video.title}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : !selectedFolder ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Get Started</h3>
              <p className="text-gray-400 mb-6 max-w-md">
                Add folders containing your videos to start building your library. 
                Mnemo will scan and organize your videos while preserving your folder structure.
              </p>
              <button 
                onClick={handleAddFolder}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Add Your First Folder
              </button>
            </div>
          ) : showSearchResults ? (
            <div>
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-32 space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                    <span className="text-gray-400">Searching videos...</span>
                  </div>
                  {searchProgress.total > 0 && (
                    <div className="w-64 text-center">
                      <div className="text-xs text-gray-500 mb-1">
                        {searchProgress.current} / {searchProgress.total} files checked
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1">
                        <div 
                          className="bg-blue-500 h-1 rounded-full transition-all duration-300" 
                          style={{ 
                            width: `${(searchProgress.current / searchProgress.total) * 100}%`
                          }}
                        ></div>
                      </div>
                      {searchProgress.currentFile && (
                        <div className="text-xs text-gray-600 mt-1 truncate">
                          {searchProgress.currentFile}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">
                      Search Results
                    </h3>
                    <p className="text-sm text-gray-400">
                      {searchResults.length === 0 
                        ? `No videos found for "${searchTerm}"`
                        : `Found ${searchResults.length} video${searchResults.length === 1 ? '' : 's'} for "${searchTerm}"`
                      }
                    </p>
                  </div>
                  
                  {/* Search Results Grid */}
                  {searchResults.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {searchResults.map((video, index) => (
                        <div
                          key={`search-${video.file_path}-${index}`}
                          className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer"
                          onClick={() => handlePlayVideo(video)}
                          onContextMenu={(e) => handleContextMenu(e, video)}
                        >
                          <div className="aspect-video bg-gray-700 relative">
                            {video.thumbnail_path ? (
                              <img 
                                src={convertFileSrc(video.thumbnail_path)}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* Watched indicator */}
                            {video.is_watched && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            {/* Progress bar for videos in progress */}
                            {video.watch_progress_seconds != null && video.watch_progress_seconds > 0 && video.duration_seconds && !video.is_watched && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                                <div 
                                  className="h-full bg-blue-500" 
                                  style={{ width: `${(video.watch_progress_seconds / video.duration_seconds) * 100}%` }}
                                ></div>
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <h4 className="font-medium text-gray-200 text-sm mb-1 line-clamp-2">
                              {video.title}
                            </h4>
                            <div className="flex items-center justify-between text-xs text-gray-400">
                              <span>{video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00'}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenVideoDetails(video);
                                }}
                                className="hover:text-gray-200 transition-colors"
                                title="Video details"
                              >
                                ⓘ
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-gray-400">Loading...</div>
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-300 mb-2">
                        {currentPath.split(/[/\\]/).pop() || currentPath}
                      </h3>
                      <p className="text-sm text-gray-400">{currentPath}</p>
                    </div>
                    {processingVideos && (
                      <div className="flex items-center space-x-2 text-sm text-blue-400">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                        <span>Processing videos...</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Video Thumbnails Section */}
                  {processedVideos.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-md font-medium text-gray-300 mb-3">Videos</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {processedVideos
                          .sort((a, b) => naturalSort(a.title || a.file_path, b.title || b.file_path)) // Ordenação natural por título ou caminho
                          .map((video, index) => (
                          <div
                            key={`${video.file_path}-${index}`}
                            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer"
                            onClick={() => handlePlayVideo(video)} // Abre player interno ao clicar
                            onContextMenu={(e) => handleContextMenu(e, video)}
                          >
                            <div className="aspect-video bg-gray-700 relative">
                              {video.thumbnail_path ? (
                                <img 
                                  src={convertFileSrc(video.thumbnail_path)}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // Fallback para ícone se thumbnail não carregar
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      e.currentTarget.style.display = 'none';
                                      // Mostrar ícone de fallback
                                      const fallbackIcon = parent.querySelector('.fallback-icon');
                                      if (fallbackIcon) {
                                        (fallbackIcon as HTMLElement).style.display = 'flex';
                                      }
                                    }
                                  }}
                                />
                              ) : null}
                              {/* Ícone de fallback - só aparece quando não há thumbnail ou ela falha ao carregar */}
                              <div 
                                className={`fallback-icon absolute inset-0 flex items-center justify-center ${
                                  video.thumbnail_path ? 'hidden' : 'flex'
                                }`}
                              >
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </div>
                              {/* Watched indicator */}
                              {video.is_watched && (
                                <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                              {/* Progress bar for videos in progress */}
                              {video.watch_progress_seconds != null && video.watch_progress_seconds > 0 && video.duration_seconds && !video.is_watched && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                                  <div 
                                    className="h-full bg-blue-500" 
                                    style={{ width: `${(video.watch_progress_seconds / video.duration_seconds) * 100}%` }}
                                  ></div>
                                </div>
                              )}
                              {video.duration_seconds && video.duration_seconds > 0 && (
                                <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">
                                  {formatDuration(video.duration_seconds)}
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-sm font-medium text-gray-300 truncate" title={video.title}>
                                {video.title}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Directory Contents (folders and unprocessed files) */}
                  <div>
                    {(directoryContents.some(item => item.is_dir) || directoryContents.some(item => !item.is_video)) && (
                      <h4 className="text-md font-medium text-gray-300 mb-3">
                        {processedVideos.length > 0 ? "Folders & Other Files" : "Contents"}
                      </h4>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {directoryContents
                        .filter(item => item.is_dir || !item.is_video) // Mostra apenas pastas e arquivos não-vídeo
                        .sort((a, b) => naturalSort(a.name, b.name)) // Ordenação natural (numérica)
                        .map((item, index) => (
                        <div
                          key={index}
                          onClick={() => item.is_dir && navigateToDirectory(item.path)}
                          className={`p-4 rounded-lg border border-gray-700 transition-colors ${
                            item.is_dir 
                              ? "cursor-pointer hover:bg-gray-800 hover:border-gray-600"
                              : "cursor-default"
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {item.is_dir ? (
                                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                              ) : (
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-300 truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {item.is_dir ? "Folder" : "File"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {directoryContents.length === 0 && !loading && (
                    <div className="text-center py-8">
                      <div className="text-gray-400">This folder is empty</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal para detalhes do vídeo */}
      {showVideoDetails && selectedVideo && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={handleCloseVideoDetails}
          ></div>
          
          {/* Modal Content */}
          <div className="relative bg-gray-800 rounded-lg shadow-lg max-w-lg w-full mx-4 p-6"
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-300">
                Video Details
              </h3>
              <button 
                onClick={handleCloseVideoDetails}
                className="text-gray-400 hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Video Thumbnail */}
            <div className="mb-4">
              {selectedVideo.thumbnail_path ? (
                <img 
                  src={convertFileSrc(selectedVideo.thumbnail_path)}
                  alt={selectedVideo.title}
                  className="w-full h-auto rounded-lg"
                />
              ) : (
                <div className="w-full h-40 bg-gray-700 rounded-lg flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>
            
            {/* Title and Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={editingDescription}
                onChange={(e) => setEditingDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Add a description..."
              />
            </div>
            
            {/* Video Metadata */}
            <div className="mb-4 p-3 bg-gray-700 rounded-lg">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Video Information</h4>
              <div className="space-y-1 text-sm text-gray-400">
                {selectedVideo.duration_seconds && selectedVideo.duration_seconds > 0 && (
                  <div>
                    <span className="font-medium">Duration:</span> {formatDuration(selectedVideo.duration_seconds)}
                  </div>
                )}
                <div>
                  <span className="font-medium">File Path:</span>
                  <div className="break-all mt-1 text-xs">{selectedVideo.file_path}</div>
                </div>
              </div>
            </div>
            
            {/* Tags Section */}
            <VideoTagsManager video={selectedVideo} />
            
            {/* Actions */}
            <div className="flex justify-end space-x-2">
              <button 
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Reset
              </button>
              <button 
                onClick={handleCloseVideoDetails}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveVideoDetails}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu de contexto */}
      {contextMenu.show && contextMenu.video && (
        <div 
          className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 py-1"
          style={{ 
            left: `${contextMenu.x}px`, 
            top: `${contextMenu.y}px`,
            minWidth: '150px'
          }}
        >
          <button
            onClick={() => handlePlayVideo(contextMenu.video!)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            ▶️ Play in Internal Player
          </button>            <button
                onClick={() => handleOpenFile(contextMenu.video!.file_path)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                🎬 Open External
              </button>
              <button
                onClick={() => handleOpenWith(contextMenu.video!.file_path)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                📁 Show in Explorer
              </button>
              <hr className="border-gray-600 my-1" />
              <button
                onClick={() => {
                  toggleVideoWatchedStatus(contextMenu.video!);
                  handleCloseContextMenu();
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                {contextMenu.video!.is_watched ? '❌ Mark as Unwatched' : '✅ Mark as Watched'}
              </button>
              <button
                onClick={() => handleOpenProperties(contextMenu.video!)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                ⚙️ Properties
              </button>
        </div>
      )}

      {/* Player de Vídeo Interno Customizado */}
      {showVideoPlayer && playingVideo && (
        <div 
          className={`fixed inset-0 bg-black z-50 flex flex-col ${isFullscreen ? 'z-[100]' : ''}`}
          onMouseMove={resetControlsTimeout}
          onClick={resetControlsTimeout}
        >
          {/* Header minimalista - apenas nome do vídeo, esconde em fullscreen */}
          {!isFullscreen && (
            <div className="bg-gray-900 bg-opacity-95 p-3 flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <button
                  onClick={handleCloseVideoPlayer}
                  className="text-white hover:text-gray-300 transition-colors flex-shrink-0"
                  title="Close Player (Esc)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <h3 className="text-white font-medium text-lg truncate min-w-0 flex-1" title={playingVideo.title}>
                  {playingVideo.title}
                </h3>
              </div>
            </div>
          )}

          {/* Player de Vídeo */}
          <div className="flex-1 relative bg-black">
            <video
              src={convertFileSrc(playingVideo.file_path)}
              className="w-full h-full object-contain"
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                setDuration(video.duration);
                video.playbackRate = playbackSpeed;
                video.volume = volume;
              }}
              onTimeUpdate={(e) => {
                const video = e.currentTarget;
                setCurrentTime(video.currentTime);
                // Update progress tracking
                if (playingVideo) {
                  handleVideoProgress(playingVideo, video.currentTime);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
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
              autoPlay
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>

            {/* Exibição de Legendas */}
            {subtitlesEnabled && currentSubtitle && (
              <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none">
                <div className="bg-black bg-opacity-80 text-white px-4 py-2 rounded-lg max-w-4xl mx-4 text-center">
                  <div 
                    className="text-lg leading-tight"
                    style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}
                    dangerouslySetInnerHTML={{ __html: currentSubtitle.replace(/\n/g, '<br>') }}
                  />
                </div>
              </div>
            )}

            {/* Controles Customizados - estilo YouTube */}
            <div 
              className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent p-4 transition-all duration-300 ${
                (document.fullscreenElement && !showControls) ? 'opacity-0 pointer-events-none transform translate-y-4' : 'opacity-100 transform translate-y-0'
              }`}
            >
              {/* Barra de Progresso - mais compacta */}
              <div className="mb-3">
                <div className="relative group">
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider transition-all duration-200 group-hover:h-2"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%, #4b5563 100%)`
                    }}
                  />
                </div>
              </div>

              {/* Controles em linha única - estilo YouTube */}
              <div className="flex items-center justify-between">
                {/* Controles da esquerda */}
                <div className="flex items-center space-x-4">
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlayPause}
                    className="play-pause-button text-white hover:text-blue-400"
                    title="Play/Pause (Space)"
                  >
                    {isPlaying ? (
                      <svg className={`w-8 h-8 play-pause-icon ${isIconChanging ? 'changing' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                      </svg>
                    ) : (
                      <svg className={`w-8 h-8 play-pause-icon ${isIconChanging ? 'changing' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  {/* Volume */}
                  <div className="flex items-center space-x-2 group">
                    <button
                      onClick={() => handleVolumeChange(volume > 0 ? 0 : 1)}
                      className="text-white hover:text-blue-400 transition-colors"
                      title="Mute/Unmute"
                    >
                      {volume === 0 ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                      ) : volume < 0.5 ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider opacity-70 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #4b5563 ${volume * 100}%, #4b5563 100%)`
                      }}
                    />
                  </div>

                  {/* Tempo atual / duração */}
                  <div className="text-white text-sm font-mono">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                {/* Controles da direita */}
                <div className="flex items-center space-x-3">
                  {/* Botão de Legendas - agora funcional */}
                  <button
                    onClick={toggleSubtitles}
                    disabled={!subtitlesAvailable}
                    className={`transition-colors ${
                      !subtitlesAvailable 
                        ? 'text-gray-600 cursor-not-allowed' 
                        : subtitlesEnabled
                          ? 'text-blue-400 hover:text-blue-300'
                          : 'text-white hover:text-blue-400'
                    }`}
                    title={
                      !subtitlesAvailable 
                        ? 'No subtitles available' 
                        : subtitlesEnabled 
                          ? 'Hide subtitles' 
                          : 'Show subtitles'
                    }
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      {subtitlesEnabled && (
                        <circle cx="18" cy="6" r="3" fill="currentColor" className="text-blue-400" />
                      )}
                    </svg>
                  </button>

                  {/* Velocidade */}
                  <select
                    value={playbackSpeed}
                    onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    title="Playback Speed"
                  >
                    <option value={0.25}>0.25x</option>
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={1.75}>1.75x</option>
                    <option value={2}>2x</option>
                  </select>

                  {/* Tela Cheia */}
                  <button
                    onClick={toggleFullscreen}
                    className="text-white hover:text-blue-400 transition-all duration-200 hover:scale-110"
                    title="Toggle Fullscreen (F)"
                  >
                    {isFullscreen ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Próximo Vídeo */}
      {showNextVideoPrompt && nextVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Play Next Video?
              </div>
              {/* Countdown indicator */}
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
                  {nextVideoCountdown}
                </div>
              </div>
            </h3>
            <div className="mb-4">
              <div className="flex items-start space-x-3">
                {nextVideo.thumbnail_path && (
                  <img 
                    src={convertFileSrc(nextVideo.thumbnail_path)}
                    alt={nextVideo.title}
                    className="w-16 h-12 object-cover rounded bg-gray-700 flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {nextVideo.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Duration: {nextVideo.duration || '00:00'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Playing automatically in {nextVideoCountdown} seconds
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Settings preserved: {savedPlaybackSettings.speed}x speed, {Math.round(savedPlaybackSettings.volume * 100)}% volume, subtitles {savedPlaybackSettings.subtitlesEnabled ? 'on' : 'off'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={cancelNextVideo}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={playNextVideo}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Play Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Remoção */}
      {showRemoveConfirmation && folderToRemove && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={cancelRemoveFolder}
          ></div>
          
          {/* Modal Content */}
          <div className="relative bg-gray-800 rounded-lg shadow-lg max-w-md w-full mx-4 p-6"
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-200">
                  Remove Folder
                </h3>
              </div>
              <button 
                onClick={cancelRemoveFolder}
                className="text-gray-400 hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="mb-6">
              <p className="text-gray-300 mb-2">
                Are you sure you want to remove this folder from your library?
              </p>
              <div className="bg-gray-700 rounded-lg p-3 mb-4">
                <p className="text-sm font-medium text-gray-200 mb-1">
                  {folderToRemove.split(/[/\\]/).pop() || folderToRemove}
                </p>
                <p className="text-xs text-gray-400 break-all">
                  {folderToRemove}
                </p>
              </div>
              <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-3">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L2.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="text-sm">
                    <p className="text-yellow-200 font-medium mb-1">Important:</p>
                    <p className="text-yellow-300">
                      Your video files will remain untouched on your computer.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <div className="text-sm">
                    <p className="text-red-200 font-medium mb-1">This action will:</p>
                    <ul className="text-red-300 space-y-1">
                      <li>• Remove all indexed videos from this folder</li>
                      <li>• Delete watch progress and tags for these videos</li>
                      <li>• Remove videos from home page and statistics</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button 
                onClick={cancelRemoveFolder}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRemoveFolder}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Remove Folder
              </button>
            </div>
          </div>
        </div>
      )}

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
