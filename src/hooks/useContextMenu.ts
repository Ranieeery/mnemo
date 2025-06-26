import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ProcessedVideo } from '../services/videoProcessor';

interface UseContextMenuProps {
    onOpenVideoDetails: (video: ProcessedVideo) => void;
}

export const useContextMenu = ({ onOpenVideoDetails }: UseContextMenuProps) => {
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

    // Função para abrir o menu de contexto
    const handleContextMenu = (event: React.MouseEvent, video: ProcessedVideo) => {
        event.preventDefault();
        setContextMenu({
            show: true,
            x: event.clientX,
            y: event.clientY,
            video: video
        });
    };

    // Função para fechar o menu de contexto
    const handleCloseContextMenu = () => {
        setContextMenu({
            show: false,
            x: 0,
            y: 0,
            video: null
        });
    };

    // Função para abrir arquivo externamente
    const handleOpenFile = async (filePath: string) => {
        try {
            await invoke('open_file_externally', { filePath });
            handleCloseContextMenu();
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Error opening file. Please check if the file exists.');
        }
    };

    // Função para abrir com diálogo
    const handleOpenWith = async (filePath: string) => {
        try {
            await invoke('open_file_with_dialog', { filePath });
            handleCloseContextMenu();
        } catch (error) {
            console.error('Error opening file dialog:', error);
            alert('Error opening file dialog.');
        }
    };

    // Função para abrir propriedades (detalhes do vídeo)
    const handleOpenProperties = (video: ProcessedVideo) => {
        handleCloseContextMenu();
        onOpenVideoDetails(video);
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

    return {
        // Estados
        contextMenu,

        // Funções
        handleContextMenu,
        handleCloseContextMenu,
        handleOpenFile,
        handleOpenWith,
        handleOpenProperties
    };
};
