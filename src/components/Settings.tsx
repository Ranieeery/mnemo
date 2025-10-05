import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
    cleanOrphanedVideos,
    debugDatabaseInfo,
    debugOrphanedVideos,
    exportLibraryData,
    getAllLibraryFoldersDebug,
    getCorrectedLibraryStats,
    getLibraryStats,
    importLibraryData,
    LibraryExport,
    resetAllVideosAsUnwatched,
} from "../database";
import { formatDuration } from "../utils/videoUtils";
import ConfirmResetAllModal from "./Modals/ConfirmResetAllModal";

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
        totalDuration: 0,
    });
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportConfirm, setShowImportConfirm] = useState(false);
    const [importFile, setImportFile] = useState<string | null>(null);
    const [isResettingWatched, setIsResettingWatched] = useState(false);
    const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
    const [isDebugging, setIsDebugging] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        loadStats();
    }, []);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showImportConfirm) {
                    setShowImportConfirm(false);
                } else if (showResetAllConfirm) {
                    setShowResetAllConfirm(false);
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [onClose, showImportConfirm, showResetAllConfirm]);

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
            const filePath = await save({
                title: "Export Library",
                defaultPath: `mnemo-library-${new Date().toISOString().split("T")[0]}.json`,
                filters: [
                    {
                        name: "JSON Files",
                        extensions: ["json"],
                    },
                ],
            });

            if (filePath) {
                const exportData = await exportLibraryData();

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
            const selected = await open({
                title: "Import Library",
                multiple: false,
                filters: [
                    {
                        name: "JSON Files",
                        extensions: ["json"],
                    },
                ],
            });

            if (selected && typeof selected === "string") {
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
            const fileContent = await readTextFile(importFile);
            const importData: LibraryExport = JSON.parse(fileContent);

            await importLibraryData(importData);

            await loadStats();

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
        setShowResetAllConfirm(true);
    };

    const handleConfirmResetAll = async () => {
        setShowResetAllConfirm(false);
        setIsResettingWatched(true);
        try {
            await resetAllVideosAsUnwatched();

            await loadStats();

            onLibraryChanged();

            alert("All videos have been marked as unwatched!");
        } catch (error) {
            console.error("Reset error:", error);
            alert(`Reset failed: ${error}`);
        } finally {
            setIsResettingWatched(false);
        }
    };

    const handleCancelResetAll = () => {
        setShowResetAllConfirm(false);
    };

    const handleDebugDatabase = async () => {
        setIsDebugging(true);
        try {
            await debugDatabaseInfo();
            await getAllLibraryFoldersDebug();

            const orphanedVideos = await debugOrphanedVideos();

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

                    await loadStats();

                    onLibraryChanged();
                }
            } else {
                alert(message);
            }
        } catch (error) {
            console.error("Error debugging database:", error);
            alert("Error debugging database. Check the console for details.");
        } finally {
            setIsDebugging(false);
        }
    };

    const handleSyncLibrary = async () => {
        setIsSyncing(true);
        try {
            await onLibraryChanged();
            await loadStats();
            alert("Library synchronized successfully!");
        } catch (error) {
            console.error("Error syncing library:", error);
            alert("Error syncing library. Check the console for details.");
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8">
            <div
                className="absolute inset-0 backdrop-blur-md bg-black/30 transition-opacity animate-fade-in"
                onClick={onClose}
            />

            <div
                className="relative max-h-full overflow-y-auto w-full max-w-3xl bg-gray-900/90 border border-gray-700 shadow-2xl rounded-2xl p-6 backdrop-blur-xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <h2 className="text-2xl font-bold text-gray-100 tracking-tight">Settings</h2>
                    <button
                        onClick={onClose}
                        className="self-start sm:self-auto text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-300 mb-4">Library Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-gray-800/70 border border-gray-700/60 rounded-xl p-4 backdrop-blur">
                            <div className="text-2xl font-bold text-blue-400">{stats.totalVideos}</div>
                            <div className="text-xs uppercase tracking-wide text-gray-400 mt-1">Total Videos</div>
                        </div>
                        <div className="bg-gray-800/70 border border-gray-700/60 rounded-xl p-4 backdrop-blur">
                            <div className="text-2xl font-bold text-green-400">{stats.watchedVideos}</div>
                            <div className="text-xs uppercase tracking-wide text-gray-400 mt-1">Watched</div>
                        </div>
                        <div className="bg-gray-800/70 border border-gray-700/60 rounded-xl p-4 backdrop-blur">
                            <div className="text-2xl font-bold text-purple-400">{stats.totalTags}</div>
                            <div className="text-xs uppercase tracking-wide text-gray-400 mt-1">Tags</div>
                        </div>
                        <div className="bg-gray-800/70 border border-gray-700/60 rounded-xl p-4 backdrop-blur">
                            <div className="text-2xl font-bold text-yellow-400">{stats.totalFolders}</div>
                            <div className="text-xs uppercase tracking-wide text-gray-400 mt-1">Folders</div>
                        </div>
                        <div className="bg-gray-800/70 border border-gray-700/60 rounded-xl p-4 md:col-span-2 backdrop-blur">
                            <div className="text-2xl font-bold text-red-400">
                                {stats.totalDuration > 0 ? formatDuration(stats.totalDuration) : "0:00"}
                            </div>
                            <div className="text-xs uppercase tracking-wide text-gray-400 mt-1">Total Duration</div>
                        </div>
                    </div>
                </div>

                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-300 mb-4">Library Management</h3>
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gray-800/70 border border-gray-700/60 rounded-xl backdrop-blur">
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
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <span>Exporting...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                        <span>Export</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gray-800/70 border border-gray-700/60 rounded-xl backdrop-blur">
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
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <span>Importing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                                            />
                                        </svg>
                                        <span>Import</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gray-800/70 border border-gray-700/60 rounded-xl backdrop-blur">
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
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <span>Resetting...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                        <span>Reset All</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gray-800/70 border border-gray-700/60 rounded-xl backdrop-blur">
                            <div>
                                <h4 className="font-medium text-gray-200">Sync Library</h4>
                                <p className="text-sm text-gray-400">Rescan all folders and update video list</p>
                            </div>
                            <button
                                onClick={handleSyncLibrary}
                                disabled={isSyncing}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-md transition-colors flex items-center space-x-2"
                            >
                                {isSyncing ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <span>Syncing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                        <span>Sync Now</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gray-800/70 border border-gray-700/60 rounded-xl backdrop-blur">
                            <div>
                                <h4 className="font-medium text-gray-200">Debug Database</h4>
                                <p className="text-sm text-gray-400">Inspect database info and clean orphaned videos</p>
                            </div>
                            <button
                                onClick={handleDebugDatabase}
                                disabled={isDebugging}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white rounded-md transition-colors flex items-center space-x-2"
                            >
                                {isDebugging ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <span>Debugging...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <span>Debug</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-700/60 pt-5 mt-2">
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">About Mnemo</h3>
                    <p className="text-sm text-gray-400">Version 0.1.3 - Local Video Library Manager</p>
                    <p className="text-xs text-gray-500 mt-1">Built with Tauri, React, TypeScript, and Tailwind CSS</p>
                </div>
            </div>

            {showImportConfirm && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center px-4 py-8">
                    <div className="absolute inset-0 backdrop-blur-sm bg-black/50" />
                    <div className="relative w-full max-w-md bg-gray-900/90 border border-gray-700 shadow-xl rounded-2xl p-6 backdrop-blur-xl animate-scale-in">
                        <h3 className="text-lg font-semibold text-gray-200 mb-4">Confirm Import</h3>
                        <div className="mb-4">
                            <p className="text-sm text-gray-300 mb-2">
                                This will replace all current library data with the imported data.
                            </p>
                            <p className="text-sm text-yellow-400">⚠️ This action cannot be undone!</p>
                            <div className="mt-3 p-3 bg-gray-800/70 border border-gray-700/60 rounded text-xs text-gray-400 break-all">
                                File: {importFile?.split(/[/\\]/).pop()}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                            <button
                                onClick={handleImportCancel}
                                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImportConfirm}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm shadow"
                            >
                                Import & Replace
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmResetAllModal
                show={showResetAllConfirm}
                onConfirm={handleConfirmResetAll}
                onCancel={handleCancelResetAll}
            />
        </div>
    );
}
