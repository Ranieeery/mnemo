// Utilitários para manipulação de vídeos

// Extensões de vídeo suportadas
export const VIDEO_EXTENSIONS = [
  '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', 
  '.mpg', '.mpeg', '.3gp', '.ogv', '.ts', '.mts', '.m2ts'
];

// Verifica se um arquivo é um vídeo baseado na extensão
export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.includes(ext);
}

// Converte segundos para formato HH:MM:SS
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Extrai o nome do arquivo sem extensão para usar como título inicial
export function getVideoTitle(filepath: string): string {
  const filename = filepath.split(/[/\\]/).pop() || '';
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
}
