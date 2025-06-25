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
                        {processedVideos.map((video, index) => (
                          <div
                            key={`${video.file_path}-${index}`}
                            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors cursor-pointer"
                            onClick={() => handleOpenVideoDetails(video)} // Abre detalhes do vídeo ao clicar
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
    </div>
  );
}

export default App;
