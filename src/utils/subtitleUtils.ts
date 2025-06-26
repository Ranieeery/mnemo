import { invoke } from "@tauri-apps/api/core";

export interface SubtitleData {
    content: string;
    format: string;
}

export interface Subtitle {
    start: number;
    end: number;
    text: string;
}

// Função para verificar e carregar legendas
export const checkAndLoadSubtitles = async (videoPath: string): Promise<SubtitleData | null> => {
    try {
        // Gera os caminhos dos arquivos de legenda (.srt e .vtt)
        const srtPath = videoPath.replace(/\.[^/.]+$/, '.srt');
        const vttPath = videoPath.replace(/\.[^/.]+$/, '.vtt');

        // Verifica se algum arquivo de legenda existe (prioridade: .srt depois .vtt)
        let subtitlePath = null;
        let exists = await invoke('file_exists', {path: srtPath});

        if (exists) {
            subtitlePath = srtPath;
        } else {
            exists = await invoke('file_exists', {path: vttPath});
            if (exists) {
                subtitlePath = vttPath;
            }
        }

        if (exists && subtitlePath) {
            // Carrega o conteúdo do arquivo de legenda
            const content = await invoke('read_subtitle_file', {path: subtitlePath});
            return {content: content as string, format: subtitlePath.endsWith('.vtt') ? 'vtt' : 'srt'};
        }
        return null;
    } catch (error) {
        console.error('Error checking subtitles:', error);
        return null;
    }
};

// Função para processar legendas SRT e VTT
export const parseSubtitles = (subtitleData: SubtitleData): Subtitle[] => {
    const subtitles: Subtitle[] = [];
    const {content, format} = subtitleData;

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
                    subtitles.push({start, end, text});
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
                    subtitles.push({start, end, text});
                }
            }
            i++;
        }
    }

    return subtitles;
};

// Função para encontrar legenda atual baseada no tempo
export const getCurrentSubtitle = (currentTime: number, subtitles: Subtitle[], subtitlesEnabled: boolean): string => {
    if (!subtitlesEnabled || !subtitles.length) return "";

    const currentSub = subtitles.find(sub =>
        currentTime >= sub.start && currentTime <= sub.end
    );

    return currentSub ? currentSub.text : "";
};
