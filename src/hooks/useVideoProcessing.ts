import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVideosInDirectoryOrderedByWatchStatus } from '../database';
import { ProcessedVideo } from '../types/video';
import { processVideo } from '../services/videoProcessor';
import { isVideoFile } from '../utils/videoUtils';

export interface VideoProcessingState {
    processingVideos: boolean;
    processingProgress: {
        total: number;
        processed: number;
        currentFile: string;
    };
    showProcessingProgress: boolean;
}

export interface VideoProcessingActions {
    processVideosInBackground: (directoryPath: string) => Promise<void>;
}

interface UseVideoProcessingProps {
    setProcessedVideos: (videos: ProcessedVideo[]) => void;
}

export const useVideoProcessing = ({
    setProcessedVideos
}: UseVideoProcessingProps): [VideoProcessingState, VideoProcessingActions] => {
    const [processingVideos, setProcessingVideos] = useState<boolean>(false);
    const [processingProgress, setProcessingProgress] = useState<{
        total: number;
        processed: number;
        currentFile: string;
    }>({ total: 0, processed: 0, currentFile: "" });
    const [showProcessingProgress, setShowProcessingProgress] = useState<boolean>(false);

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

    const state: VideoProcessingState = {
        processingVideos,
        processingProgress,
        showProcessingProgress
    };

    const actions: VideoProcessingActions = {
        processVideosInBackground
    };

    return [state, actions];
};
