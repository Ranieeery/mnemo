import { useState, useEffect } from 'react';
import { getFolderStats } from '../database';
import { FolderStats } from '../types/video';

export function useFolderStats(folderPath: string | null) {
  const [stats, setStats] = useState<FolderStats>({
    totalVideos: 0,
    watchedVideos: 0,
    isFullyWatched: false,
    progressPercentage: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!folderPath) {
      setStats({
        totalVideos: 0,
        watchedVideos: 0,
        isFullyWatched: false,
        progressPercentage: 0
      });
      return;
    }

    const loadStats = async () => {
      setLoading(true);
      try {
        const folderStats = await getFolderStats(folderPath);
        setStats(folderStats);
      } catch (error) {
        console.error('Error loading folder stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [folderPath]);

  const refresh = async () => {
    if (!folderPath) return;
    
    setLoading(true);
    try {
      const folderStats = await getFolderStats(folderPath);
      setStats(folderStats);
    } catch (error) {
      console.error('Error refreshing folder stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return { stats, loading, refresh };
}
