import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
  initDatabase, 
  getLibraryFolders, 
  saveLibraryFolder,
  debugDatabaseInfo,
  getAllLibraryFoldersDebug,
  getVideosInDirectory,
  updateVideoDetails
} from "./database";
import { processVideosInDirectory, checkVideoToolsAvailable, ProcessedVideo } from "./services/videoProcessor";
import { formatDuration } from "./utils/videoUtils";
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

  // Carregar pastas do banco de dados na inicialização
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initDatabase();
        const folders = await getLibraryFolders();
        setLibraryFolders(folders);
        
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
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  // Função para selecionar uma pasta na sidebar
  const handleSelectFolder = (folder: string) => {
    setSelectedFolder(folder);
    loadDirectoryContents(folder);
  };

  // Função para carregar o conteúdo de um diretório
  const loadDirectoryContents = async (path: string) => {
    setLoading(true);
    try {
      const contents: DirEntry[] = await invoke('read_directory', { path });
      setDirectoryContents(contents);
      setCurrentPath(path);
      
      // Carrega vídeos já processados do banco de dados
      const existingVideos = await getVideosInDirectory(path);
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

  // Função para processar vídeos em segundo plano
  const processVideosInBackground = async (directoryPath: string) => {
    if (processingVideos) return; // Evita processamento simultâneo
    
    setProcessingVideos(true);
    try {
      console.log(`Starting background video processing for: ${directoryPath}`);
      const newVideos = await processVideosInDirectory(directoryPath);
      
      if (newVideos.length > 0) {
        // Atualiza a lista de vídeos processados
        const updatedVideos = await getVideosInDirectory(directoryPath);
        setProcessedVideos(updatedVideos);
        console.log(`Background processing completed. Processed ${newVideos.length} new videos.`);
      }
    } catch (error) {
      console.error('Error in background video processing:', error);
    } finally {
      setProcessingVideos(false);
    }
  };

  // Função para navegar para um diretório
  const navigateToDirectory = (path: string) => {
    loadDirectoryContents(path);
  };

  // Função de debug para inspecionar o banco de dados
  const handleDebugDatabase = async () => {
    try {
      await debugDatabaseInfo();
      await getAllLibraryFoldersDebug();
      alert("Database info logged to console. Check the browser's developer tools.");
    } catch (error) {
      console.error('Error debugging database:', error);
      alert("Error debugging database. Check the console for details.");
    }
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

  return (
    <div className="h-screen bg-gray-900 text-white flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-blue-400">Mnemo</h1>
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
              onClick={handleDebugDatabase}
              className="w-full px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              🔍 Debug Database
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
                  onClick={() => handleSelectFolder(folder)}
                  className={`cursor-pointer text-sm rounded-md p-2 transition-all ${
                    selectedFolder === folder
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  <div className="font-medium truncate" title={folder}>
                    {folder.split(/[/\\]/).pop() || folder}
                  </div>
                  <div className="text-xs opacity-75 truncate">
                    {folder}
                  </div>
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
              <h2 className="text-lg font-semibold">
                {selectedFolder || "Welcome to Mnemo"}
              </h2>
            </div>
            
            {/* Search Bar */}
            <div className="flex-1 max-w-md mx-4">
              <input
                type="text"
                placeholder="Search videos..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-auto">
          {!selectedFolder ? (
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
          </button>
          <button
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
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
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
    </div>
  );
}

export default App;
