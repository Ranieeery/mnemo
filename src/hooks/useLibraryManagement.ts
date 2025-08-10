import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
    debugVideosInFolder,
    getLibraryFolders,
    removeLibraryFolder,
    saveLibraryFolder
} from '../database';
import { processVideo } from '../services/videoProcessor';
import { isVideoFile } from '../utils/videoUtils';

export interface LibraryManagementState {
    // Folder indexing states
    folderIndexingStatus: { [key: string]: boolean };
    currentIndexingFolder: string | null;
    
    // Estados para progresso de processamento
    processingProgress: {
        total: number;
        processed: number;
        currentFile: string;
    };
    showProcessingProgress: boolean;
}

export interface LibraryManagementActions {
    handleAddFolder: () => Promise<void>;
    indexFolderRecursively: (folderPath: string) => Promise<void>;
    confirmRemoveFolder: (folderToRemove: string, selectedFolder: string | null, onSuccess: () => void) => Promise<void>;
    updateLibraryFolders: () => Promise<string[]>;
}

interface UseLibraryManagementProps {
    videoToolsAvailable: {
        ffmpeg: boolean;
        ffprobe: boolean;
    };
    libraryFolders: string[];
    setLibraryFolders: (folders: string[]) => void;
    loadHomePageData: () => Promise<void>;
}

export const useLibraryManagement = ({
    videoToolsAvailable,
    libraryFolders,
    setLibraryFolders,
    loadHomePageData
}: UseLibraryManagementProps): [LibraryManagementState, LibraryManagementActions] => {
    // Folder indexing states
    const [folderIndexingStatus, setFolderIndexingStatus] = useState<{ [key: string]: boolean }>({});
    const [currentIndexingFolder, setCurrentIndexingFolder] = useState<string | null>(null);
    
    // Processing progress states
    const [processingProgress, setProcessingProgress] = useState<{
        total: number;
        processed: number;
        currentFile: string;
    }>({ total: 0, processed: 0, currentFile: "" });
    const [showProcessingProgress, setShowProcessingProgress] = useState<boolean>(false);

    // Add a new folder
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

                // Start immediate folder indexing
                await indexFolderRecursively(selectedPath);

                // Reload home page data
                await loadHomePageData();
            }
        } catch (error) {
            console.error('Error selecting folder:', error);
        }
    };

    // Index a folder recursively
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

            // First, count how many video files exist recursively
            const allFiles: any[] = await invoke('scan_directory_recursive', { path: folderPath });
            const videoFiles = allFiles.filter(file => !file.is_dir && isVideoFile(file.name));

            setProcessingProgress(prev => ({ ...prev, total: videoFiles.length }));

            // Process each video with progress callback
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

            // Keep progress bar visible for a moment
            setTimeout(() => {
                setShowProcessingProgress(false);
            }, 2000);
        }
    };

    // Confirm folder removal
    const confirmRemoveFolder = async (folderToRemove: string, selectedFolder: string | null, onSuccess: () => void) => {
        try {
            // Debug: check videos before removal
            console.log(`=== BEFORE REMOVAL ===`);
            await debugVideosInFolder(folderToRemove);

            // Remove folder and all indexed videos
            await removeLibraryFolder(folderToRemove);

            // Debug: verificar se os vídeos foram removidos
            console.log(`=== AFTER REMOVAL ===`);
            await debugVideosInFolder(folderToRemove);

            const updatedFolders = await getLibraryFolders();
            setLibraryFolders(updatedFolders);

            // Se a pasta removida estava selecionada, executa callback de sucesso
            if (selectedFolder === folderToRemove) {
                onSuccess();
            }

            // Recarrega dados da página inicial
            await loadHomePageData();

            console.log(`Successfully removed folder: ${folderToRemove}`);
        } catch (error) {
            console.error('Error removing folder:', error);
        }
    };

    // Update library folders list
    const updateLibraryFolders = async (): Promise<string[]> => {
        try {
            const folders = await getLibraryFolders();
            setLibraryFolders(folders);
            return folders;
        } catch (error) {
            console.error('Error updating library folders:', error);
            return [];
        }
    };

    const state: LibraryManagementState = {
        folderIndexingStatus,
        currentIndexingFolder,
        processingProgress,
        showProcessingProgress
    };

    const actions: LibraryManagementActions = {
        handleAddFolder,
        indexFolderRecursively,
        confirmRemoveFolder,
        updateLibraryFolders
    };

    return [state, actions];
};
