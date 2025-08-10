// Central video domain types
// This consolidates video-related interfaces and helpers to reduce duplication.

export interface ProcessedVideo {
  id?: number;
  file_path: string;
  title: string;
  description?: string;
  duration_seconds: number; // raw duration in seconds
  thumbnail_path?: string;
  is_watched?: boolean;
  watch_progress_seconds?: number;
  last_watched_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // Derived fields
  duration?: string; // formatted duration
  size?: number; // optional file size
}

export type VideoDbRow = Record<string, any>;

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function mapDbRowToProcessedVideo(row: VideoDbRow) {
  return {
    id: row.id,
    file_path: row.file_path,
    title: row.title,
    description: row.description || '',
    duration_seconds: row.duration_seconds || 0,
    thumbnail_path: row.thumbnail_path || '',
    is_watched: !!row.is_watched,
    watch_progress_seconds: row.watch_progress_seconds || 0,
    last_watched_at: row.last_watched_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    duration: formatDuration(row.duration_seconds),
    size: 0
  };
}
