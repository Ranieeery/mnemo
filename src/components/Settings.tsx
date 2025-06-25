import { useState, useEffect } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { 
  exportLibraryData, 
  importLibraryData, 
  getLibraryStats, 
  LibraryExport,
  resetAllVideosAsUnwatched,
  debugDatabaseInfo,
  debugOrphanedVideos,
  cleanOrphanedVideos,
  getCorrectedLibraryStats,
  getAllLibraryFoldersDebug
} from "../database";
import { formatDuration } from "../utils/videoUtils";

interface LibraryStats {
  totalVideos: number;
  totalTags: number;
  totalFolders: number;
  watchedVideos: number;
  totalDuration: number;
}

interface SettingsProps {
  onClose: () => void;
  onLibraryChanged: () => void;
}

export function Settings({ onClose, onLibraryChanged }: SettingsProps) {
  const [stats, setStats] = useState<LibraryStats>({
    totalVideos: 0,
    totalTags: 0,
    totalFolders: 0,
    watchedVideos: 0,
    totalDuration: 0
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<string | null>(null);
  const [isResettingWatched, setIsResettingWatched] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const libraryStats = await getLibraryStats();
      setStats(libraryStats);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Solicitar local para salvar
      const filePath = await save({
        title: "Export Library",
        defaultPath: `mnemo-library-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          {
            name: "JSON Files",
            extensions: ["json"]
          }
        ]
      });

      if (filePath) {
        // Exportar dados
        const exportData = await exportLibraryData();
        
        // Salvar arquivo
        await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
        
        alert(`Library exported successfully to ${filePath}`);
      }
    } catch (error) {
      console.error("Export error:", error);
      alert(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportSelect = async () => {
    try {
      // Solicitar arquivo para importar
      const selected = await open({
        title: "Import Library",
        multiple: false,
        filters: [
          {
            name: "JSON Files",
            extensions: ["json"]
          }
        ]
      });

      if (selected && typeof selected === 'string') {
        setImportFile(selected);
        setShowImportConfirm(true);
      }
    } catch (error) {
      console.error("Import select error:", error);
      alert(`Failed to select file: ${error}`);
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    setShowImportConfirm(false);
    
    try {
      // Ler arquivo
      const fileContent = await readTextFile(importFile);
      const importData: LibraryExport = JSON.parse(fileContent);
      
      // Importar dados
      await importLibraryData(importData);
      
      // Recarregar estatísticas
      await loadStats();
      
      // Notificar componente pai sobre mudanças
      onLibraryChanged();
      
      alert("Library imported successfully! The application will refresh the data.");
    } catch (error) {
      console.error("Import error:", error);
      alert(`Import failed: ${error}`);
    } finally {
      setIsImporting(false);
      setImportFile(null);
    }
  };

  const handleImportCancel = () => {
    setShowImportConfirm(false);
    setImportFile(null);
  };

  const handleResetAllWatched = async () => {
    if (!confirm("Are you sure you want to mark ALL videos as unwatched? This action cannot be undone.")) {
      return;
    }

    setIsResettingWatched(true);
    try {
      await resetAllVideosAsUnwatched();
      
      // Recarregar estatísticas
      await loadStats();
      
      // Notificar componente pai sobre mudanças
      onLibraryChanged();
      
      alert("All videos have been marked as unwatched!");
    } catch (error) {
      console.error("Reset error:", error);
      alert(`Reset failed: ${error}`);
    } finally {
      setIsResettingWatched(false);
    }
  };

  // Função de debug para inspecionar o banco de dados
  const handleDebugDatabase = async () => {
    setIsDebugging(true);
    try {
      await debugDatabaseInfo();
      await getAllLibraryFoldersDebug();
      
      // Debug de vídeos órfãos
      const orphanedVideos = await debugOrphanedVideos();
      
      // Obter estatísticas corrigidas
      const correctedStats = await getCorrectedLibraryStats();
      console.log(`=== CORRECTED LIBRARY STATS ===`);
      console.log(`Total Videos (valid): ${correctedStats.totalVideos}`);
      console.log(`Total Duration (valid): ${correctedStats.totalDuration} seconds`);
      console.log(`Watched Videos (valid): ${correctedStats.watchedVideos}`);
      console.log(`Orphaned Videos: ${correctedStats.orphanedVideos}`);
      console.log(`Total Tags: ${correctedStats.totalTags}`);
      console.log(`Total Folders: ${correctedStats.totalFolders}`);
      
      let message = "Database info logged to console. Check the browser's developer tools.";
      
      if (orphanedVideos.length > 0) {
        message += `\n\nFound ${orphanedVideos.length} orphaned videos. Would you like to clean them?`;
        const shouldClean = confirm(message);
        
        if (shouldClean) {
          const cleanedCount = await cleanOrphanedVideos();
          alert(`Cleaned ${cleanedCount} orphaned videos. Statistics will be refreshed.`);
          
          // Recarregar estatísticas
          await loadStats();
          
          // Notificar componente pai sobre mudanças
          onLibraryChanged();
        }
      } else {
        alert(message);
      }
    } catch (error) {
      console.error('Error debugging database:', error);
      alert("Error debugging database. Check the console for details.");
    } finally {
      setIsDebugging(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      ></div>
      
      {/* Modal Content */}
      <div className="relative bg-gray-800 rounded-lg shadow-lg max-w-2xl w-full mx-4 p-6"
           onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-200">Settings</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Library Statistics */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-300 mb-4">Library Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{stats.totalVideos}</div>
              <div className="text-sm text-gray-400">Total Videos</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{stats.watchedVideos}</div>
              <div className="text-sm text-gray-400">Watched</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-400">{stats.totalTags}</div>
              <div className="text-sm text-gray-400">Tags</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">{stats.totalFolders}</div>
              <div className="text-sm text-gray-400">Folders</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4 md:col-span-2">
              <div className="text-2xl font-bold text-red-400">
                {stats.totalDuration > 0 ? formatDuration(stats.totalDuration) : "0:00"}
              </div>
              <div className="text-sm text-gray-400">Total Duration</div>
            </div>
          </div>
        </div>

        {/* Import/Export Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-300 mb-4">Library Management</h3>
          <div className="space-y-4">
            {/* Export */}
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-200">Export Library</h4>
                <p className="text-sm text-gray-400">
                  Save your entire library (videos, tags, metadata) to a JSON file
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-md transition-colors flex items-center space-x-2"
              >
                {isExporting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export</span>
                  </>
                )}
              </button>
            </div>

            {/* Import */}
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-200">Import Library</h4>
                <p className="text-sm text-gray-400">
                  Load a library from a JSON file (will replace current data)
                </p>
              </div>
              <button
                onClick={handleImportSelect}
                disabled={isImporting}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:opacity-50 text-white rounded-md transition-colors flex items-center space-x-2"
              >
                {isImporting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    <span>Import</span>
                  </>
                )}
              </button>
            </div>

            {/* Reset Watched Status */}
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-200">Reset Watch Status</h4>
                <p className="text-sm text-gray-400">
                  Mark all videos as unwatched (useful after importing)
                </p>
              </div>
              <button
                onClick={handleResetAllWatched}
                disabled={isResettingWatched}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 text-white rounded-md transition-colors flex items-center space-x-2"
              >
                {isResettingWatched ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Reset All</span>
                  </>
                )}
              </button>
            </div>

            {/* Debug Database */}
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-200">Debug Database</h4>
                <p className="text-sm text-gray-400">
                  Inspect database info and clean orphaned videos
                </p>
              </div>
              <button
                onClick={handleDebugDatabase}
                disabled={isDebugging}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white rounded-md transition-colors flex items-center space-x-2"
              >
                {isDebugging ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Debugging...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span>Debug</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="border-t border-gray-600 pt-4">
          <h3 className="text-lg font-semibold text-gray-300 mb-2">About Mnemo</h3>
          <p className="text-sm text-gray-400">
            Version 1.0.0 - Local Video Library Manager
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Built with Tauri, React, TypeScript, and Tailwind CSS
          </p>
        </div>
      </div>

      {/* Import Confirmation Modal */}
      {showImportConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-60">
          <div className="fixed inset-0 bg-black bg-opacity-75"></div>
          <div className="relative bg-gray-800 rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Confirm Import</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-300 mb-2">
                This will replace all current library data with the imported data.
              </p>
              <p className="text-sm text-yellow-400">
                ⚠️ This action cannot be undone!
              </p>
              <div className="mt-3 p-3 bg-gray-700 rounded text-xs text-gray-400 break-all">
                File: {importFile?.split(/[/\\]/).pop()}
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleImportCancel}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Import & Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
