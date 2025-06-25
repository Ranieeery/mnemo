import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { saveVideo, getVideoByPath } from "../database";
import { getVideoTitle, isVideoFile } from "../utils/videoUtils";

// Interface para metadados de vídeo vindos do Rust
interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate?: number;
  codec?: string;
  file_size: number;
}

// Interface para vídeo processado
export interface ProcessedVideo {
  id?: number;
  file_path: string;
  title: string;
  description?: string;
  duration_seconds: number;
  thumbnail_path?: string;
  created_at?: string;
  updated_at?: string;
}

// Processa um único vídeo (extrai metadados e gera thumbnail)
export async function processVideo(videoPath: string): Promise<ProcessedVideo | null> {
  try {
    console.log(`Processing video: ${videoPath}`);
    
    // Verifica se o vídeo já foi processado
    const existingVideo = await getVideoByPath(videoPath);
    if (existingVideo) {
      console.log(`Video already processed: ${videoPath}`);
      return existingVideo;
    }

    // Extrai metadados usando ffprobe
    const metadata: VideoMetadata = await invoke('extract_video_metadata', {
      filePath: videoPath
    });

    // Gera nome para o thumbnail
    const appDir = await appDataDir();
    const thumbnailsDir = await join(appDir, 'thumbnails');
    const videoName = videoPath.split(/[/\\]/).pop() || 'unknown';
    const thumbnailName = `${videoName}_${Date.now()}.jpg`;
    const thumbnailPath = await join(thumbnailsDir, thumbnailName);

    // Gera thumbnail usando ffmpeg
    await invoke('generate_thumbnail', {
      videoPath,
      outputPath: thumbnailPath,
      timestamp: Math.min(10.0, metadata.duration / 4) // 10s ou 1/4 da duração
    });

    // Cria objeto do vídeo processado
    const processedVideo: ProcessedVideo = {
      file_path: videoPath,
      title: getVideoTitle(videoPath),
      duration_seconds: Math.round(metadata.duration),
      thumbnail_path: thumbnailPath,
    };

    // Salva no banco de dados
    await saveVideo(processedVideo);
    
    console.log(`Video processed successfully: ${videoPath}`);
    return processedVideo;

  } catch (error) {
    console.error(`Error processing video ${videoPath}:`, error);
    return null;
  }
}

// Processa todos os vídeos em uma pasta
export async function processVideosInDirectory(directoryPath: string): Promise<ProcessedVideo[]> {
  try {
    console.log(`Scanning directory for videos: ${directoryPath}`);
    
    // Lê o conteúdo do diretório
    const contents: any[] = await invoke('read_directory', { path: directoryPath });
    
    // Filtra apenas arquivos de vídeo
    const videoFiles = contents.filter(item => !item.is_dir && isVideoFile(item.name));
    
    console.log(`Found ${videoFiles.length} video files in ${directoryPath}`);
    
    const processedVideos: ProcessedVideo[] = [];
    
    // Processa cada vídeo sequencialmente para evitar sobrecarregar o sistema
    for (const videoFile of videoFiles) {
      try {
        const processedVideo = await processVideo(videoFile.path);
        if (processedVideo) {
          processedVideos.push(processedVideo);
        }
      } catch (error) {
        console.error(`Failed to process video ${videoFile.path}:`, error);
      }
    }
    
    console.log(`Successfully processed ${processedVideos.length} videos`);
    return processedVideos;
    
  } catch (error) {
    console.error(`Error scanning directory ${directoryPath}:`, error);
    return [];
  }
}

// Função para verificar se ffmpeg e ffprobe estão disponíveis
export async function checkVideoToolsAvailable(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  try {
    const ffprobeResult = await invoke('extract_video_metadata', {
      filePath: 'nonexistent_file_test.mp4'
    }).catch((error) => {
      // Se o erro contém "File does not exist", significa que ffprobe está disponível
      return error.includes('File does not exist') ? 'available' : 'not_available';
    });

    const ffmpegResult = await invoke('generate_thumbnail', {
      videoPath: 'nonexistent_file_test.mp4',
      outputPath: 'test.jpg'
    }).catch((error) => {
      // Se o erro não contém "Failed to execute", significa que ffmpeg está disponível
      return error.includes('Failed to execute') ? 'not_available' : 'available';
    });

    return {
      ffmpeg: ffmpegResult === 'available',
      ffprobe: ffprobeResult === 'available'
    };
  } catch (error) {
    console.error('Error checking video tools:', error);
    return { ffmpeg: false, ffprobe: false };
  }
}
