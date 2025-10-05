import Database from "@tauri-apps/plugin-sql";
import { ProcessedVideo, FolderStats } from "./types/video";
import { isVideoFile } from "./utils/videoUtils";
import { invoke } from "@tauri-apps/api/core";

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
    if (db) {
        return db;
    }

    try {
        db = await Database.load("sqlite:mnemo.db");

        await createTables();

        console.log("Database initialized successfully");
        return db;
    } catch (error) {
        console.error("Failed to initialize database:", error);
        throw error;
    }
}

async function createTables() {
    if (!db) {
        throw new Error("Database not initialized");
    }

    await db.execute(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration_seconds INTEGER,
      thumbnail_path TEXT,
      is_watched BOOLEAN DEFAULT FALSE,
      watch_progress_seconds INTEGER DEFAULT 0,
      last_watched_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS video_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
      UNIQUE(video_id, tag_id)
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS library_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      watch_duration_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
    )
  `);

    try {
        await db.execute(`ALTER TABLE videos ADD COLUMN is_watched BOOLEAN DEFAULT FALSE`);
    } catch (e) {}

    try {
        await db.execute(`ALTER TABLE videos ADD COLUMN watch_progress_seconds INTEGER DEFAULT 0`);
    } catch (e) {}

    try {
        await db.execute(`ALTER TABLE videos ADD COLUMN last_watched_at DATETIME`);
    } catch (e) {}

    try {
        await db.execute(`ALTER TABLE library_folders ADD COLUMN custom_icon TEXT`);
    } catch (e) {}

    console.log("Database tables created successfully");
}

export async function getDatabase(): Promise<Database> {
    if (!db) {
        return await initDatabase();
    }
    return db;
}

export async function saveVideo(videoData: {
    file_path: string;
    title: string;
    description?: string;
    duration_seconds?: number;
    thumbnail_path?: string;
}) {
    const database = await getDatabase();

    await database.execute(
        `INSERT OR REPLACE INTO videos (file_path, title, description, duration_seconds, thumbnail_path, is_watched, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
            videoData.file_path,
            videoData.title,
            videoData.description || null,
            videoData.duration_seconds || null,
            videoData.thumbnail_path || null,
            0,
        ]
    );
}

export async function updateVideoDetails(filePath: string, title: string, description: string): Promise<void> {
    if (!db) {
        await initDatabase();
    }

    if (!db) {
        throw new Error("Database not initialized");
    }

    try {
        await db.execute(
            `UPDATE videos 
       SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE file_path = ?`,
            [title, description, filePath]
        );
        console.log(`Updated video details for: ${filePath}`);
    } catch (error) {
        console.error("Error updating video details:", error);
        throw error;
    }
}

export async function getVideoByPath(filePath: string): Promise<ProcessedVideo | null> {
    if (!db) {
        await initDatabase();
    }

    if (!db) {
        throw new Error("Database not initialized");
    }

    try {
        const result = await db.select<ProcessedVideo[]>(
            `SELECT file_path, title, description, duration_seconds, thumbnail_path, 
              is_watched, watch_progress_seconds, last_watched_at, created_at, updated_at
       FROM videos 
       WHERE file_path = ?`,
            [filePath]
        );

        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error("Error getting video by path:", error);
        return null;
    }
}

export async function getVideosInDirectory(directoryPath: string) {
    const database = await getDatabase();

    const result = (await database.select("SELECT * FROM videos WHERE file_path LIKE $1 ORDER BY title", [
        `${directoryPath}%`,
    ])) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function getVideosInDirectoryOrderedByWatchStatus(
    directoryPath: string,
    limit?: number
): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    const limitClause = limit ? `LIMIT ${limit}` : "";

    const result = (await database.select(
        `
    SELECT * FROM videos 
    WHERE file_path LIKE $1 
    ORDER BY 
      CASE 
        WHEN is_watched = 0 AND (watch_progress_seconds IS NULL OR watch_progress_seconds = 0) THEN 0
        WHEN is_watched = 0 AND watch_progress_seconds > 0 THEN 1
        WHEN is_watched = 1 THEN 2
      END,
      last_watched_at DESC NULLS LAST,
      title
    ${limitClause}
  `,
        [`${directoryPath}%`]
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function searchVideosByTitle(searchTerm: string): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    if (!searchTerm.trim()) {
        return [];
    }

    const result = (await database.select(
        `SELECT * FROM videos 
     WHERE title LIKE $1 
     ORDER BY title`,
        [`%${searchTerm.trim()}%`]
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function searchVideos(searchTerm: string): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    if (!searchTerm.trim()) {
        return [];
    }

    const term = `%${searchTerm.trim()}%`;

    const result = (await database.select(
        `SELECT DISTINCT v.* FROM videos v
     LEFT JOIN video_tags vt ON v.id = vt.video_id
     LEFT JOIN tags t ON vt.tag_id = t.id
     WHERE v.title LIKE $1 
        OR v.description LIKE $1
        OR t.name LIKE $1
     ORDER BY v.title`,
        [term]
    )) as any[];

    console.log(`Search for "${searchTerm}" returned ${result.length} results`);

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function searchVideosRecursive(
    searchTerm: string,
    progressCallback?: (current: number, total: number, currentFile: string) => void,
    specificFolder?: string
): Promise<ProcessedVideo[]> {
    if (!searchTerm.trim()) {
        return [];
    }

    const results: ProcessedVideo[] = [];
    const folders = specificFolder ? [specificFolder] : await getLibraryFolders();
    const searchTermLower = searchTerm.trim().toLowerCase();

    console.log(`[searchVideosRecursive] Searching for "${searchTerm}" in folders:`, folders);
    console.log(`[searchVideosRecursive] Specific folder provided:`, specificFolder);

    let totalFiles = 0;
    let processedFiles = 0;

    for (const folder of folders) {
        try {
            const allFiles: any[] = await invoke("scan_directory_recursive", { path: folder });
            const videoFiles = allFiles.filter((file) => !file.is_dir && isVideoFile(file.name));
            totalFiles += videoFiles.length;
        } catch (error) {
            console.error(`Error scanning folder ${folder}:`, error);
        }
    }

    for (const folder of folders) {
        try {
            const allFiles: any[] = await invoke("scan_directory_recursive", { path: folder });
            const videoFiles = allFiles.filter((file) => !file.is_dir && isVideoFile(file.name));

            for (const videoFile of videoFiles) {
                processedFiles++;

                if (progressCallback) {
                    progressCallback(processedFiles, totalFiles, videoFile.name);
                }

                const fileName = videoFile.name.toLowerCase();

                if (fileName.includes(searchTermLower)) {
                    let existingVideo = await getVideoByPath(videoFile.path);

                    if (existingVideo) {
                        results.push(existingVideo);
                    } else {
                        const basicVideo: ProcessedVideo = {
                            file_path: videoFile.path,
                            title: getVideoTitleFromFilename(videoFile.name),
                            description: "",
                            duration_seconds: 0,
                            thumbnail_path: "",
                            is_watched: false,
                            watch_progress_seconds: 0,
                            duration: "00:00",
                            size: 0,
                        };
                        results.push(basicVideo);
                    }
                }
            }
        } catch (error) {
            console.error(`Error searching in folder ${folder}:`, error);
        }
    }

    console.log(`[searchVideosRecursive] Found ${results.length} results for "${searchTerm}"`);
    return results;
}

function getVideoTitleFromFilename(filename: string): string {
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."));

    let title = nameWithoutExt
        .replace(/\[.*?\]/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/_/g, " ")
        .replace(/\./g, " ")
        .replace(/\s+/g, " ")
        .trim();

    title = title.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

    return title || filename;
}

export async function getAllVideos(): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    const result = (await database.select(`SELECT * FROM videos ORDER BY title`)) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function markVideoAsWatched(videoId: number, watchProgressSeconds?: number): Promise<void> {
    const database = await getDatabase();

    await database.execute(
        `UPDATE videos 
     SET is_watched = TRUE, 
         watch_progress_seconds = $2,
         last_watched_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
        [videoId, watchProgressSeconds || 0]
    );

    await database.execute(
        `INSERT INTO watch_history (video_id, watch_duration_seconds) 
     VALUES ($1, $2)`,
        [videoId, watchProgressSeconds || 0]
    );
}

export async function markVideoAsUnwatched(videoId: number): Promise<void> {
    const database = await getDatabase();

    await database.execute(
        `UPDATE videos 
     SET is_watched = FALSE, 
         watch_progress_seconds = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
        [videoId]
    );
}

export async function updateWatchProgress(
    videoId: number,
    progressSeconds: number,
    durationSeconds: number
): Promise<void> {
    const database = await getDatabase();

    const watchedThreshold = durationSeconds * 0.75;
    const isWatched = progressSeconds >= watchedThreshold;

    await database.execute(
        `UPDATE videos 
     SET watch_progress_seconds = $2,
         is_watched = $3,
         last_watched_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
        [videoId, progressSeconds, isWatched]
    );

    if (isWatched) {
        await database.execute(
            `INSERT OR IGNORE INTO watch_history (video_id, watch_duration_seconds) 
       VALUES ($1, $2)`,
            [videoId, progressSeconds]
        );
    }
}

export async function getRecentlyWatchedVideos(limit: number = 10): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    const result = (await database.select(
        `SELECT * FROM videos 
     WHERE last_watched_at IS NOT NULL 
     ORDER BY last_watched_at DESC 
     LIMIT $1`,
        [limit]
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function getVideosInProgress(limit: number = 10): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    const result = (await database.select(
        `SELECT * FROM videos 
     WHERE watch_progress_seconds > 0 
       AND is_watched = FALSE 
     ORDER BY last_watched_at DESC 
     LIMIT $1`,
        [limit]
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function getUnwatchedVideos(limit: number = 5): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    const result = (await database.select(
        `SELECT * FROM videos 
     WHERE is_watched = FALSE 
       AND (watch_progress_seconds = 0 OR watch_progress_seconds IS NULL)
     ORDER BY created_at DESC 
     LIMIT $1`,
        [limit]
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function getVideoPreviewFromFolder(folderPath: string, limit: number = 5): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    const result = (await database.select(
        `
    SELECT * FROM videos 
    WHERE file_path LIKE $1 
    ORDER BY 
      CASE 
        WHEN is_watched = 0 AND (watch_progress_seconds IS NULL OR watch_progress_seconds = 0) THEN 0
        WHEN is_watched = 0 AND watch_progress_seconds > 0 THEN 1
        WHEN is_watched = 1 THEN 2
      END,
      last_watched_at DESC NULLS LAST,
      title
    LIMIT $2
  `,
        [`${folderPath}%`, limit]
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        is_watched: video.is_watched || false,
        watch_progress_seconds: video.watch_progress_seconds || 0,
        last_watched_at: video.last_watched_at,
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

export async function getLibraryFoldersWithPreviews(): Promise<
    { folder: string; videos: ProcessedVideo[]; customIcon: string | null }[]
> {
    const folders = await getLibraryFolders();
    const foldersWithPreviews = [];

    for (const folder of folders) {
        const videos = await getVideoPreviewFromFolder(folder, 5);
        if (videos.length > 0) {
            const customIcon = await getLibraryFolderIcon(folder);
            foldersWithPreviews.push({
                folder,
                videos,
                customIcon,
            });
        }
    }

    return foldersWithPreviews;
}

export async function saveLibraryFolder(folderPath: string) {
    const database = await getDatabase();

    await database.execute("INSERT OR IGNORE INTO library_folders (path) VALUES ($1)", [folderPath]);
}

export async function getLibraryFolders(): Promise<string[]> {
    const database = await getDatabase();

    const result = (await database.select("SELECT path FROM library_folders ORDER BY created_at")) as any[];

    return result.map((row: any) => row.path);
}

export async function getLibraryFoldersWithIcons(): Promise<{ folder: string; customIcon: string | null }[]> {
    const database = await getDatabase();

    const result = (await database.select(
        "SELECT path, custom_icon FROM library_folders ORDER BY created_at"
    )) as any[];

    return result.map((row: any) => ({
        folder: row.path,
        customIcon: row.custom_icon || null,
    }));
}

export async function removeLibraryFolder(folderPath: string) {
    const database = await getDatabase();

    await removeVideosFromFolder(folderPath);

    await database.execute("DELETE FROM library_folders WHERE path = $1", [folderPath]);
}

export async function updateLibraryFolderIcon(folderPath: string, icon: string | null) {
    const database = await getDatabase();

    await database.execute("UPDATE library_folders SET custom_icon = $1 WHERE path = $2", [icon, folderPath]);
}

export async function getLibraryFolderIcon(folderPath: string): Promise<string | null> {
    const database = await getDatabase();

    const result = (await database.select("SELECT custom_icon FROM library_folders WHERE path = $1", [
        folderPath,
    ])) as any[];

    if (result.length > 0) {
        return result[0].custom_icon || null;
    }

    return null;
}

export async function removeVideosFromFolder(folderPath: string) {
    const database = await getDatabase();

    const normalizedFolderPath = folderPath.replace(/\\/g, "/");

    const videosToRemove = (await database.select("SELECT id FROM videos WHERE REPLACE(file_path, '\\', '/') LIKE $1", [
        `${normalizedFolderPath}/%`,
    ])) as any[];

    const videoIds = videosToRemove.map((row: any) => row.id);

    if (videoIds.length === 0) {
        console.log(`No videos found in folder: ${folderPath}`);
        return;
    }

    console.log(`Removing ${videoIds.length} videos from folder: ${folderPath}`);

    const placeholders = videoIds.map(() => "?").join(",");

    await database.execute(`DELETE FROM video_tags WHERE video_id IN (${placeholders})`, videoIds);

    await database.execute(`DELETE FROM watch_history WHERE video_id IN (${placeholders})`, videoIds);

    await database.execute(`DELETE FROM videos WHERE id IN (${placeholders})`, videoIds);

    console.log(`Successfully removed ${videoIds.length} videos and their related data from folder: ${folderPath}`);
}

export async function debugDatabaseInfo() {
    const database = await getDatabase();

    console.log("=== DATABASE DEBUG INFO ===");

    const tables = (await database.select("SELECT name FROM sqlite_master WHERE type='table'")) as any[];

    console.log(
        "Tables:",
        tables.map((t) => t.name)
    );

    for (const table of tables) {
        if (table.name.startsWith("sqlite_")) continue;

        const count = (await database.select(`SELECT COUNT(*) as count FROM ${table.name}`)) as any[];

        console.log(`${table.name}: ${count[0].count} records`);

        const samples = (await database.select(`SELECT * FROM ${table.name} LIMIT 5`)) as any[];

        if (samples.length > 0) {
            console.log(`Sample data from ${table.name}:`, samples);
        }
    }

    console.log("=== END DEBUG INFO ===");

    return { tables, database };
}

export async function getAllLibraryFoldersDebug() {
    const database = await getDatabase();

    const result = (await database.select("SELECT * FROM library_folders ORDER BY created_at")) as any[];

    console.log("All library folders:", result);
    return result;
}

export interface Tag {
    id: number;
    name: string;
    created_at: string;
}

export interface VideoTag {
    id: number;
    video_id: number;
    tag_id: number;
    created_at: string;
    tag_name?: string;
}

export async function createOrGetTag(tagName: string): Promise<Tag> {
    const database = await getDatabase();

    const existingTag = (await database.select("SELECT * FROM tags WHERE name = $1", [
        tagName.trim().toLowerCase(),
    ])) as Tag[];

    if (existingTag.length > 0) {
        return existingTag[0];
    }

    await database.execute("INSERT INTO tags (name) VALUES ($1)", [tagName.trim().toLowerCase()]);

    const newTag = (await database.select("SELECT * FROM tags WHERE name = $1", [
        tagName.trim().toLowerCase(),
    ])) as Tag[];

    return newTag[0];
}

export async function getAllTags(): Promise<Tag[]> {
    const database = await getDatabase();

    const result = (await database.select("SELECT * FROM tags ORDER BY name")) as Tag[];

    return result;
}

export async function addTagToVideo(videoId: number, tagName: string): Promise<void> {
    const database = await getDatabase();

    const tag = await createOrGetTag(tagName);

    const existing = (await database.select("SELECT * FROM video_tags WHERE video_id = $1 AND tag_id = $2", [
        videoId,
        tag.id,
    ])) as VideoTag[];

    if (existing.length === 0) {
        await database.execute("INSERT INTO video_tags (video_id, tag_id) VALUES ($1, $2)", [videoId, tag.id]);
    }
}

export async function removeTagFromVideo(videoId: number, tagId: number): Promise<void> {
    const database = await getDatabase();

    await database.execute("DELETE FROM video_tags WHERE video_id = $1 AND tag_id = $2", [videoId, tagId]);
}

export async function getVideoTags(videoId: number): Promise<Tag[]> {
    const database = await getDatabase();

    const result = (await database.select(
        `SELECT t.* FROM tags t
     INNER JOIN video_tags vt ON t.id = vt.tag_id
     WHERE vt.video_id = $1
     ORDER BY t.name`,
        [videoId]
    )) as Tag[];

    return result;
}

export async function addTagToFolder(folderPath: string, tagName: string): Promise<number> {
    const database = await getDatabase();

    const normalizedFolderPath = folderPath.replace(/\\/g, "/");
    const tag = await createOrGetTag(tagName);

    const videos = (await database.select("SELECT id FROM videos WHERE REPLACE(file_path, '\\', '/') LIKE $1", [
        `${normalizedFolderPath}/%`,
    ])) as any[];

    let addedCount = 0;

    for (const video of videos) {
        const existing = (await database.select("SELECT * FROM video_tags WHERE video_id = $1 AND tag_id = $2", [
            video.id,
            tag.id,
        ])) as VideoTag[];

        if (existing.length === 0) {
            await database.execute("INSERT INTO video_tags (video_id, tag_id) VALUES ($1, $2)", [video.id, tag.id]);
            addedCount++;
        }
    }

    return addedCount;
}

export async function removeAllTagsFromFolder(folderPath: string): Promise<number> {
    const database = await getDatabase();

    const normalizedFolderPath = folderPath.replace(/\\/g, "/");

    const videos = (await database.select("SELECT id FROM videos WHERE REPLACE(file_path, '\\', '/') LIKE $1", [
        `${normalizedFolderPath}/%`,
    ])) as any[];

    if (videos.length === 0) {
        return 0;
    }

    const videoIds = videos.map((v) => v.id);
    const placeholders = videoIds.map((_, index) => `$${index + 1}`).join(", ");

    const countResult = (await database.select(
        `SELECT COUNT(*) as count FROM video_tags WHERE video_id IN (${placeholders})`,
        videoIds
    )) as any[];
    const removedCount = countResult[0]?.count || 0;

    await database.execute(`DELETE FROM video_tags WHERE video_id IN (${placeholders})`, videoIds);

    return removedCount;
}

export async function getFolderTagCount(folderPath: string): Promise<number> {
    const database = await getDatabase();

    const normalizedFolderPath = folderPath.replace(/\\/g, "/");

    const result = (await database.select(
        `SELECT COUNT(DISTINCT vt.id) as count 
         FROM video_tags vt
         INNER JOIN videos v ON vt.video_id = v.id
         WHERE REPLACE(v.file_path, '\\', '/') LIKE $1`,
        [`${normalizedFolderPath}/%`]
    )) as any[];

    return result[0]?.count || 0;
}

export async function searchVideosByTags(tagNames: string[]): Promise<ProcessedVideo[]> {
    const database = await getDatabase();

    if (tagNames.length === 0) {
        return [];
    }

    const placeholders = tagNames.map((_, index) => `$${index + 1}`).join(", ");
    const normalizedTags = tagNames.map((tag) => tag.trim().toLowerCase());

    const result = (await database.select(
        `SELECT DISTINCT v.* FROM videos v
     INNER JOIN video_tags vt ON v.id = vt.video_id
     INNER JOIN tags t ON vt.tag_id = t.id
     WHERE t.name IN (${placeholders})
     ORDER BY v.title`,
        normalizedTags
    )) as any[];

    return result.map((video) => ({
        id: video.id,
        file_path: video.file_path,
        title: video.title,
        description: video.description || "",
        duration_seconds: video.duration_seconds || 0,
        thumbnail_path: video.thumbnail_path || "",
        created_at: video.created_at,
        updated_at: video.updated_at,
        duration: video.duration_seconds ? formatDuration(video.duration_seconds) : "00:00",
        size: 0,
    }));
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export async function cleanupUnusedTags(): Promise<void> {
    const database = await getDatabase();

    await database.execute(
        `DELETE FROM tags 
     WHERE id NOT IN (
       SELECT DISTINCT tag_id FROM video_tags
     )`
    );
}

export interface LibraryExport {
    version: string;
    exportDate: string;
    videos: any[];
    tags: any[];
    videoTags: any[];
    libraryFolders: any[];
}

export async function exportLibraryData(): Promise<LibraryExport> {
    const database = await getDatabase();

    try {
        const videos = (await database.select("SELECT * FROM videos ORDER BY id")) as any[];
        const tags = (await database.select("SELECT * FROM tags ORDER BY id")) as any[];
        const videoTags = (await database.select("SELECT * FROM video_tags ORDER BY id")) as any[];
        const libraryFolders = (await database.select("SELECT * FROM library_folders ORDER BY id")) as any[];

        const exportData: LibraryExport = {
            version: "1.0.0",
            exportDate: new Date().toISOString(),
            videos,
            tags,
            videoTags,
            libraryFolders,
        };

        console.log(
            `Library export completed: ${videos.length} videos, ${tags.length} tags, ${libraryFolders.length} folders`
        );
        return exportData;
    } catch (error) {
        console.error("Error exporting library:", error);
        throw error;
    }
}

export async function importLibraryData(importData: LibraryExport): Promise<void> {
    const database = await getDatabase();

    try {
        console.log("Starting library import...");

        if (
            !importData.version ||
            !importData.videos ||
            !importData.tags ||
            !importData.videoTags ||
            !importData.libraryFolders
        ) {
            throw new Error("Invalid import data format");
        }

        await database.execute("DELETE FROM video_tags");
        await database.execute("DELETE FROM watch_history");
        await database.execute("DELETE FROM videos");
        await database.execute("DELETE FROM tags");
        await database.execute("DELETE FROM library_folders");

        await database.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('videos', 'tags', 'video_tags', 'library_folders', 'watch_history')"
        );

        console.log("Existing data cleared");

        for (const folder of importData.libraryFolders) {
            await database.execute("INSERT INTO library_folders (id, path, created_at) VALUES (?, ?, ?)", [
                folder.id,
                folder.path,
                folder.created_at,
            ]);
        }
        console.log(`Imported ${importData.libraryFolders.length} library folders`);

        for (const tag of importData.tags) {
            await database.execute("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)", [
                tag.id,
                tag.name,
                tag.created_at,
            ]);
        }
        console.log(`Imported ${importData.tags.length} tags`);

        for (const video of importData.videos) {
            await database.execute(
                `INSERT INTO videos (id, file_path, title, description, duration_seconds, thumbnail_path, 
         is_watched, watch_progress_seconds, last_watched_at, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    video.id,
                    video.file_path,
                    video.title,
                    video.description,
                    video.duration_seconds,
                    video.thumbnail_path,
                    video.is_watched === true ? 1 : 0,
                    video.watch_progress_seconds || 0,
                    video.last_watched_at,
                    video.created_at,
                    video.updated_at,
                ]
            );
        }
        console.log(`Imported ${importData.videos.length} videos`);

        for (const videoTag of importData.videoTags) {
            await database.execute("INSERT INTO video_tags (id, video_id, tag_id, created_at) VALUES (?, ?, ?, ?)", [
                videoTag.id,
                videoTag.video_id,
                videoTag.tag_id,
                videoTag.created_at,
            ]);
        }
        console.log(`Imported ${importData.videoTags.length} video-tag relationships`);

        console.log("Library import completed successfully");
    } catch (error) {
        console.error("Error importing library:", error);
        throw error;
    }
}

export async function getLibraryStats(): Promise<{
    totalVideos: number;
    totalTags: number;
    totalFolders: number;
    watchedVideos: number;
    totalDuration: number;
}> {
    const database = await getDatabase();

    try {
        const videoStats = (await database.select(
            `SELECT 
        COUNT(v.id) as total,
        COUNT(CASE WHEN v.is_watched = TRUE THEN 1 END) as watched,
        COALESCE(SUM(v.duration_seconds), 0) as total_duration
       FROM videos v
       WHERE EXISTS (
         SELECT 1 FROM library_folders lf 
         WHERE REPLACE(v.file_path, '\\', '/') LIKE REPLACE(lf.path, '\\', '/') || '/%'
       )`
        )) as any[];

        const tagStats = (await database.select("SELECT COUNT(*) as total FROM tags")) as any[];
        const folderStats = (await database.select("SELECT COUNT(*) as total FROM library_folders")) as any[];

        return {
            totalVideos: videoStats[0].total || 0,
            totalTags: tagStats[0].total || 0,
            totalFolders: folderStats[0].total || 0,
            watchedVideos: videoStats[0].watched || 0,
            totalDuration: videoStats[0].total_duration || 0,
        };
    } catch (error) {
        console.error("Error getting library stats:", error);
        return {
            totalVideos: 0,
            totalTags: 0,
            totalFolders: 0,
            watchedVideos: 0,
            totalDuration: 0,
        };
    }
}

export async function resetAllVideosAsUnwatched(): Promise<void> {
    const database = await getDatabase();

    try {
        await database.execute(
            `UPDATE videos 
       SET is_watched = 0, 
           watch_progress_seconds = 0, 
           last_watched_at = NULL,
           updated_at = CURRENT_TIMESTAMP`
        );

        await database.execute("DELETE FROM video_tags");

        console.log("All videos reset as unwatched and tags cleared");
    } catch (error) {
        console.error("Error resetting videos as unwatched:", error);
        throw error;
    }
}

export async function debugVideosInFolder(folderPath: string) {
    const database = await getDatabase();

    const normalizedFolderPath = folderPath.replace(/\\/g, "/");

    const videos = (await database.select(
        "SELECT id, title, file_path FROM videos WHERE REPLACE(file_path, '\\', '/') LIKE $1",
        [`${normalizedFolderPath}/%`]
    )) as any[];

    console.log(`=== VIDEOS IN FOLDER: ${folderPath} ===`);
    console.log(`Found ${videos.length} videos:`);
    videos.forEach((video: any) => {
        console.log(`- ID: ${video.id}, Title: ${video.title}, Path: ${video.file_path}`);
    });

    return videos;
}

export async function debugOrphanedVideos() {
    const database = await getDatabase();

    const orphanedVideos = (await database.select(
        `SELECT v.id, v.title, v.file_path, v.duration_seconds, v.is_watched
     FROM videos v
     LEFT JOIN library_folders lf ON (
       REPLACE(v.file_path, '\\', '/') LIKE REPLACE(lf.path, '\\', '/') || '/%'
     )
     WHERE lf.path IS NULL`
    )) as any[];

    console.log(`=== ORPHANED VIDEOS ===`);
    console.log(`Found ${orphanedVideos.length} orphaned videos (videos whose folders were removed):`);
    orphanedVideos.forEach((video: any) => {
        console.log(`- ID: ${video.id}, Title: ${video.title}, Path: ${video.file_path}`);
    });

    return orphanedVideos;
}

export async function cleanOrphanedVideos() {
    const database = await getDatabase();

    const orphanedVideos = (await database.select(
        `SELECT v.id
     FROM videos v
     LEFT JOIN library_folders lf ON (
       REPLACE(v.file_path, '\\', '/') LIKE REPLACE(lf.path, '\\', '/') || '/%'
     )
     WHERE lf.path IS NULL`
    )) as any[];

    const videoIds = orphanedVideos.map((row: any) => row.id);

    if (videoIds.length === 0) {
        console.log(`No orphaned videos found.`);
        return 0;
    }

    console.log(`Cleaning ${videoIds.length} orphaned videos...`);

    const placeholders = videoIds.map(() => "?").join(",");

    await database.execute(`DELETE FROM video_tags WHERE video_id IN (${placeholders})`, videoIds);

    await database.execute(`DELETE FROM video_progress WHERE video_id IN (${placeholders})`, videoIds);

    await database.execute(`DELETE FROM videos WHERE id IN (${placeholders})`, videoIds);

    console.log(`Successfully cleaned ${videoIds.length} orphaned videos.`);
    return videoIds.length;
}

export async function getCorrectedLibraryStats(): Promise<{
    totalVideos: number;
    totalTags: number;
    totalFolders: number;
    watchedVideos: number;
    totalDuration: number;
    orphanedVideos: number;
}> {
    const database = await getDatabase();

    try {
        const videoStats = (await database.select(
            `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN v.is_watched = TRUE THEN 1 END) as watched,
        COALESCE(SUM(v.duration_seconds), 0) as total_duration
       FROM videos v
       INNER JOIN library_folders lf ON (
         REPLACE(v.path, '\\', '/') LIKE REPLACE(lf.path, '\\', '/') || '/%'
       )`
        )) as any[];

        const orphanedStats = (await database.select(
            `SELECT COUNT(*) as total
       FROM videos v
       LEFT JOIN library_folders lf ON (
         REPLACE(v.path, '\\', '/') LIKE REPLACE(lf.path, '\\', '/') || '/%'
       )
       WHERE lf.path IS NULL`
        )) as any[];

        const tagStats = (await database.select("SELECT COUNT(*) as total FROM tags")) as any[];
        const folderStats = (await database.select("SELECT COUNT(*) as total FROM library_folders")) as any[];

        return {
            totalVideos: videoStats[0].total || 0,
            totalTags: tagStats[0].total || 0,
            totalFolders: folderStats[0].total || 0,
            watchedVideos: videoStats[0].watched || 0,
            totalDuration: videoStats[0].total_duration || 0,
            orphanedVideos: orphanedStats[0].total || 0,
        };
    } catch (error) {
        console.error("Error getting corrected library stats:", error);
        return {
            totalVideos: 0,
            totalTags: 0,
            totalFolders: 0,
            watchedVideos: 0,
            totalDuration: 0,
            orphanedVideos: 0,
        };
    }
}

export async function getFolderStats(folderPath: string): Promise<FolderStats> {
    const database = await getDatabase();

    try {
        const normalizedPath = folderPath.replace(/\\/g, "/");

        const result = (await database.select(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_watched = 1 THEN 1 ELSE 0 END) as watched
             FROM videos 
             WHERE REPLACE(file_path, '\\', '/') LIKE ? || '%'`,
            [normalizedPath]
        )) as any[];

        const stats = result[0];
        const total = stats.total || 0;
        const watched = stats.watched || 0;

        return {
            totalVideos: total,
            watchedVideos: watched,
            isFullyWatched: total > 0 && total === watched,
            progressPercentage: total > 0 ? Math.round((watched / total) * 100) : 0,
        };
    } catch (error) {
        console.error("Error getting folder stats:", error);
        return {
            totalVideos: 0,
            watchedVideos: 0,
            isFullyWatched: false,
            progressPercentage: 0,
        };
    }
}

export async function markAllVideosInFolderAsWatched(folderPath: string): Promise<number> {
    const database = await getDatabase();

    try {
        const normalizedPath = folderPath.replace(/\\/g, "/");

        const result = await database.execute(
            `UPDATE videos 
             SET is_watched = 1, 
                 last_watched_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE REPLACE(file_path, '\\', '/') LIKE ? || '%'
             AND is_watched = 0`,
            [normalizedPath]
        );

        console.log(`Marked all videos in ${folderPath} as watched`);
        return result.rowsAffected || 0;
    } catch (error) {
        console.error("Error marking all videos as watched:", error);
        throw error;
    }
}

export async function markAllVideosInFolderAsUnwatched(folderPath: string): Promise<number> {
    const database = await getDatabase();

    try {
        const normalizedPath = folderPath.replace(/\\/g, "/");

        const result = await database.execute(
            `UPDATE videos 
             SET is_watched = 0, 
                 watch_progress_seconds = 0,
                 updated_at = CURRENT_TIMESTAMP
             WHERE REPLACE(file_path, '\\', '/') LIKE ? || '%'
             AND is_watched = 1`,
            [normalizedPath]
        );

        console.log(`Marked all videos in ${folderPath} as unwatched`);
        return result.rowsAffected || 0;
    } catch (error) {
        console.error("Error marking all videos as unwatched:", error);
        throw error;
    }
}
