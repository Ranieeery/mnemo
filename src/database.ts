import Database from "@tauri-apps/plugin-sql";
import { ProcessedVideo } from "./services/videoProcessor";
import { isVideoFile } from "./utils/videoUtils";

let db: Database | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  try {
    // Conecta ao banco de dados SQLite no diretório de dados da aplicação
    db = await Database.load("sqlite:mnemo.db");
    
    // Cria as tabelas se não existirem
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

  // Tabela de vídeos
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

  // Tabela de tags
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de relacionamento entre vídeos e tags
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

  // Tabela para armazenar os diretórios da biblioteca (migrar do localStorage)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS library_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de histórico de visualização
  await db.execute(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      watch_duration_seconds INTEGER DEFAULT 0,
      FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
    )
  `);

  // Migração para adicionar novas colunas se elas não existirem
  try {
    await db.execute(`ALTER TABLE videos ADD COLUMN is_watched BOOLEAN DEFAULT FALSE`);
  } catch (e) {
    // Coluna já existe, ignorar
  }
  
  try {
    await db.execute(`ALTER TABLE videos ADD COLUMN watch_progress_seconds INTEGER DEFAULT 0`);
  } catch (e) {
    // Coluna já existe, ignorar
  }
  
  try {
    await db.execute(`ALTER TABLE videos ADD COLUMN last_watched_at DATETIME`);
  } catch (e) {
    // Coluna já existe, ignorar
  }

  console.log("Database tables created successfully");
}

export async function getDatabase(): Promise<Database> {
  if (!db) {
    return await initDatabase();
  }
  return db;
}

// Funções utilitárias para vídeos
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
      0, // Sempre começar como não assistido
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
  
  const result = await database.select(
    "SELECT * FROM videos WHERE file_path LIKE $1 ORDER BY title",
    [`${directoryPath}%`]
  ) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Função para obter vídeos de um diretório ordenados por progresso de visualização
export async function getVideosInDirectoryOrderedByWatchStatus(directoryPath: string): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  const result = await database.select(`
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
  `, [`${directoryPath}%`]) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// ====== FUNÇÕES DE BUSCA ======

// Buscar vídeos por título
export async function searchVideosByTitle(searchTerm: string): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  if (!searchTerm.trim()) {
    return [];
  }
  
  const result = await database.select(
    `SELECT * FROM videos 
     WHERE title LIKE $1 
     ORDER BY title`,
    [`%${searchTerm.trim()}%`]
  ) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Buscar vídeos por título e tags (função combinada)
export async function searchVideos(searchTerm: string): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  if (!searchTerm.trim()) {
    return [];
  }
  
  const term = `%${searchTerm.trim()}%`;
  
  // Busca combinada: títulos, descrições e tags
  const result = await database.select(
    `SELECT DISTINCT v.* FROM videos v
     LEFT JOIN video_tags vt ON v.id = vt.video_id
     LEFT JOIN tags t ON vt.tag_id = t.id
     WHERE v.title LIKE $1 
        OR v.description LIKE $1
        OR t.name LIKE $1
     ORDER BY v.title`,
    [term]
  ) as any[];
  
  console.log(`Search for "${searchTerm}" returned ${result.length} results`);
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Nova função para busca recursiva em tempo real (busca em arquivos do sistema de arquivos)
export async function searchVideosRecursive(searchTerm: string, progressCallback?: (current: number, total: number, currentFile: string) => void, specificFolder?: string): Promise<ProcessedVideo[]> {
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

  // Primeiro, conta todos os arquivos para progress
  for (const folder of folders) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const allFiles: any[] = await invoke('scan_directory_recursive', { path: folder });
      const videoFiles = allFiles.filter(file => !file.is_dir && isVideoFile(file.name));
      totalFiles += videoFiles.length;
    } catch (error) {
      console.error(`Error scanning folder ${folder}:`, error);
    }
  }

  // Agora processa cada pasta recursivamente
  for (const folder of folders) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const allFiles: any[] = await invoke('scan_directory_recursive', { path: folder });
      const videoFiles = allFiles.filter(file => !file.is_dir && isVideoFile(file.name));

      for (const videoFile of videoFiles) {
        processedFiles++;
        
        if (progressCallback) {
          progressCallback(processedFiles, totalFiles, videoFile.name);
        }

        // Verifica se o nome do arquivo contém o termo de busca
        const fileName = videoFile.name.toLowerCase();
        
        if (fileName.includes(searchTermLower)) {
          // Verifica se já existe no banco de dados
          let existingVideo = await getVideoByPath(videoFile.path);
          
          if (existingVideo) {
            results.push(existingVideo);
          } else {
            // Se não existe no banco, cria um registro básico
            const basicVideo: ProcessedVideo = {
              file_path: videoFile.path,
              title: getVideoTitleFromFilename(videoFile.name),
              description: '',
              duration_seconds: 0,
              thumbnail_path: '',
              is_watched: false,
              watch_progress_seconds: 0,
              duration: '00:00',
              size: 0
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

// Função auxiliar para obter título do vídeo a partir do nome do arquivo
function getVideoTitleFromFilename(filename: string): string {
  // Remove extensão
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
  
  // Remove padrões comuns como [1080p], (2023), etc.
  let title = nameWithoutExt
    .replace(/\[.*?\]/g, '') // Remove [texto]
    .replace(/\(.*?\)/g, '') // Remove (texto)
    .replace(/_/g, ' ') // Substitui _ por espaço
    .replace(/\./g, ' ') // Substitui . por espaço
    .replace(/\s+/g, ' ') // Remove espaços extras
    .trim();
  
  // Capitaliza primeira letra de cada palavra
  title = title.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
  
  return title || filename;
}

// Buscar todos os vídeos (para quando a busca estiver vazia ou busca global)
export async function getAllVideos(): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    `SELECT * FROM videos ORDER BY title`
  ) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// ====== FUNÇÕES DE STATUS DE VÍDEO ======

// Marcar vídeo como assistido
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
  
  // Adicionar ao histórico
  await database.execute(
    `INSERT INTO watch_history (video_id, watch_duration_seconds) 
     VALUES ($1, $2)`,
    [videoId, watchProgressSeconds || 0]
  );
}

// Desmarcar vídeo como assistido
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

// Atualizar progresso de visualização
export async function updateWatchProgress(videoId: number, progressSeconds: number, durationSeconds: number): Promise<void> {
  const database = await getDatabase();
  
  // Se progresso >= 75% da duração, marcar como assistido
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
  
  // Se foi marcado como assistido, adicionar ao histórico
  if (isWatched) {
    await database.execute(
      `INSERT OR IGNORE INTO watch_history (video_id, watch_duration_seconds) 
       VALUES ($1, $2)`,
      [videoId, progressSeconds]
    );
  }
}

// ====== FUNÇÕES PARA PÁGINA INICIAL ======

// Obter últimos vídeos acessados
export async function getRecentlyWatchedVideos(limit: number = 10): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    `SELECT * FROM videos 
     WHERE last_watched_at IS NOT NULL 
     ORDER BY last_watched_at DESC 
     LIMIT $1`,
    [limit]
  ) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Obter vídeos em progresso (iniciados mas não terminados)
export async function getVideosInProgress(limit: number = 10): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    `SELECT * FROM videos 
     WHERE watch_progress_seconds > 0 
       AND is_watched = FALSE 
     ORDER BY last_watched_at DESC 
     LIMIT $1`,
    [limit]
  ) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Obter vídeos não assistidos (sugestões)
export async function getUnwatchedVideos(limit: number = 20): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    `SELECT * FROM videos 
     WHERE is_watched = FALSE 
       AND (watch_progress_seconds = 0 OR watch_progress_seconds IS NULL)
     ORDER BY created_at DESC 
     LIMIT $1`,
    [limit]
  ) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Obter preview de vídeos (4-5 vídeos) de uma pasta específica
export async function getVideoPreviewFromFolder(folderPath: string, limit: number = 5): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  const result = await database.select(`
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
  `, [`${folderPath}%`, limit]) as any[];
  
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    is_watched: video.is_watched || false,
    watch_progress_seconds: video.watch_progress_seconds || 0,
    last_watched_at: video.last_watched_at,
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0
  }));
}

// Obter preview de vídeos de todas as pastas da biblioteca
export async function getLibraryFoldersWithPreviews(): Promise<{folder: string, videos: ProcessedVideo[]}[]> {
  const folders = await getLibraryFolders();
  const foldersWithPreviews = [];
  
  for (const folder of folders) {
    const videos = await getVideoPreviewFromFolder(folder, 5);
    if (videos.length > 0) {
      foldersWithPreviews.push({
        folder,
        videos
      });
    }
  }
  
  return foldersWithPreviews;
}

// Funções utilitárias para pastas da biblioteca
export async function saveLibraryFolder(folderPath: string) {
  const database = await getDatabase();
  
  await database.execute(
    "INSERT OR IGNORE INTO library_folders (path) VALUES ($1)",
    [folderPath]
  );
}

export async function getLibraryFolders(): Promise<string[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    "SELECT path FROM library_folders ORDER BY created_at"
  ) as any[];
  
  return result.map((row: any) => row.path);
}

export async function removeLibraryFolder(folderPath: string) {
  const database = await getDatabase();
  
  await database.execute(
    "DELETE FROM library_folders WHERE path = $1",
    [folderPath]
  );
}

// Funções de debug para inspecionar o banco de dados
export async function debugDatabaseInfo() {
  const database = await getDatabase();
  
  console.log("=== DATABASE DEBUG INFO ===");
  
  // Listar todas as tabelas
  const tables = await database.select(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ) as any[];
  
  console.log("Tables:", tables.map(t => t.name));
  
  // Contar registros em cada tabela
  for (const table of tables) {
    if (table.name.startsWith('sqlite_')) continue;
    
    const count = await database.select(
      `SELECT COUNT(*) as count FROM ${table.name}`
    ) as any[];
    
    console.log(`${table.name}: ${count[0].count} records`);
    
    // Mostrar alguns registros de exemplo
    const samples = await database.select(
      `SELECT * FROM ${table.name} LIMIT 5`
    ) as any[];
    
    if (samples.length > 0) {
      console.log(`Sample data from ${table.name}:`, samples);
    }
  }
  
  console.log("=== END DEBUG INFO ===");
  
  return { tables, database };
}

export async function getAllLibraryFoldersDebug() {
  const database = await getDatabase();
  
  const result = await database.select(
    "SELECT * FROM library_folders ORDER BY created_at"
  ) as any[];
  
  console.log("All library folders:", result);
  return result;
}

// ====== FUNÇÕES DE TAGS ======

// Interface para Tag
export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

// Interface para VideoTag (relacionamento)
export interface VideoTag {
  id: number;
  video_id: number;
  tag_id: number;
  created_at: string;
  tag_name?: string; // Para joins
}

// Criar ou obter uma tag (se já existir, retorna a existente)
export async function createOrGetTag(tagName: string): Promise<Tag> {
  const database = await getDatabase();
  
  // Verifica se a tag já existe
  const existingTag = await database.select(
    "SELECT * FROM tags WHERE name = $1",
    [tagName.trim().toLowerCase()]
  ) as Tag[];
  
  if (existingTag.length > 0) {
    return existingTag[0];
  }
  
  // Cria a nova tag
  await database.execute(
    "INSERT INTO tags (name) VALUES ($1)",
    [tagName.trim().toLowerCase()]
  );
  
  // Retorna a tag criada
  const newTag = await database.select(
    "SELECT * FROM tags WHERE name = $1",
    [tagName.trim().toLowerCase()]
  ) as Tag[];
  
  return newTag[0];
}

// Obter todas as tags
export async function getAllTags(): Promise<Tag[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    "SELECT * FROM tags ORDER BY name"
  ) as Tag[];
  
  return result;
}

// Adicionar tag a um vídeo
export async function addTagToVideo(videoId: number, tagName: string): Promise<void> {
  const database = await getDatabase();
  
  // Criar ou obter a tag
  const tag = await createOrGetTag(tagName);
  
  // Verificar se a associação já existe
  const existing = await database.select(
    "SELECT * FROM video_tags WHERE video_id = $1 AND tag_id = $2",
    [videoId, tag.id]
  ) as VideoTag[];
  
  if (existing.length === 0) {
    // Adicionar a associação
    await database.execute(
      "INSERT INTO video_tags (video_id, tag_id) VALUES ($1, $2)",
      [videoId, tag.id]
    );
  }
}

// Remover tag de um vídeo
export async function removeTagFromVideo(videoId: number, tagId: number): Promise<void> {
  const database = await getDatabase();
  
  await database.execute(
    "DELETE FROM video_tags WHERE video_id = $1 AND tag_id = $2",
    [videoId, tagId]
  );
}

// Obter todas as tags de um vídeo
export async function getVideoTags(videoId: number): Promise<Tag[]> {
  const database = await getDatabase();
  
  const result = await database.select(
    `SELECT t.* FROM tags t
     INNER JOIN video_tags vt ON t.id = vt.tag_id
     WHERE vt.video_id = $1
     ORDER BY t.name`,
    [videoId]
  ) as Tag[];
  
  return result;
}

// Buscar vídeos por tags
export async function searchVideosByTags(tagNames: string[]): Promise<ProcessedVideo[]> {
  const database = await getDatabase();
  
  if (tagNames.length === 0) {
    return [];
  }
  
  // Criar placeholders para a query
  const placeholders = tagNames.map((_, index) => `$${index + 1}`).join(', ');
  const normalizedTags = tagNames.map(tag => tag.trim().toLowerCase());
  
  const result = await database.select(
    `SELECT DISTINCT v.* FROM videos v
     INNER JOIN video_tags vt ON v.id = vt.video_id
     INNER JOIN tags t ON vt.tag_id = t.id
     WHERE t.name IN (${placeholders})
     ORDER BY v.title`,
    normalizedTags
  ) as any[];
  
  // Converter para ProcessedVideo
  return result.map(video => ({
    id: video.id,
    file_path: video.file_path,
    title: video.title,
    description: video.description || '',
    duration_seconds: video.duration_seconds || 0,
    thumbnail_path: video.thumbnail_path || '',
    created_at: video.created_at,
    updated_at: video.updated_at,
    duration: video.duration_seconds ? formatDuration(video.duration_seconds) : '00:00',
    size: 0 // Campo obrigatório mas não usado aqui
  }));
}

// Função auxiliar para formatar duração
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Remover tags não utilizadas (limpeza)
export async function cleanupUnusedTags(): Promise<void> {
  const database = await getDatabase();
  
  await database.execute(
    `DELETE FROM tags 
     WHERE id NOT IN (
       SELECT DISTINCT tag_id FROM video_tags
     )`
  );
}

// ====== FUNÇÕES DE IMPORTAÇÃO E EXPORTAÇÃO ======

// Interface para exportação de dados
export interface LibraryExport {
  version: string;
  exportDate: string;
  videos: any[];
  tags: any[];
  videoTags: any[];
  libraryFolders: any[];
}

// Exportar toda a biblioteca para JSON
export async function exportLibraryData(): Promise<LibraryExport> {
  const database = await getDatabase();
  
  try {
    // Buscar todos os dados das tabelas
    const videos = await database.select("SELECT * FROM videos ORDER BY id") as any[];
    const tags = await database.select("SELECT * FROM tags ORDER BY id") as any[];
    const videoTags = await database.select("SELECT * FROM video_tags ORDER BY id") as any[];
    const libraryFolders = await database.select("SELECT * FROM library_folders ORDER BY id") as any[];
    
    const exportData: LibraryExport = {
      version: "1.0.0",
      exportDate: new Date().toISOString(),
      videos,
      tags,
      videoTags,
      libraryFolders
    };
    
    console.log(`Library export completed: ${videos.length} videos, ${tags.length} tags, ${libraryFolders.length} folders`);
    return exportData;
  } catch (error) {
    console.error("Error exporting library:", error);
    throw error;
  }
}

// Importar dados da biblioteca a partir de JSON
export async function importLibraryData(importData: LibraryExport): Promise<void> {
  const database = await getDatabase();
  
  try {
    console.log("Starting library import...");
    
    // Verificar formato dos dados
    if (!importData.version || !importData.videos || !importData.tags || !importData.videoTags || !importData.libraryFolders) {
      throw new Error("Invalid import data format");
    }
    
    // Limpar dados existentes (em ordem para respeitar foreign keys)
    await database.execute("DELETE FROM video_tags");
    await database.execute("DELETE FROM watch_history");
    await database.execute("DELETE FROM videos");
    await database.execute("DELETE FROM tags");
    await database.execute("DELETE FROM library_folders");
    
    // Reset auto-increment counters
    await database.execute("DELETE FROM sqlite_sequence WHERE name IN ('videos', 'tags', 'video_tags', 'library_folders', 'watch_history')");
    
    console.log("Existing data cleared");
    
    // Importar library_folders
    for (const folder of importData.libraryFolders) {
      await database.execute(
        "INSERT INTO library_folders (id, path, created_at) VALUES (?, ?, ?)",
        [folder.id, folder.path, folder.created_at]
      );
    }
    console.log(`Imported ${importData.libraryFolders.length} library folders`);
    
    // Importar tags
    for (const tag of importData.tags) {
      await database.execute(
        "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
        [tag.id, tag.name, tag.created_at]
      );
    }
    console.log(`Imported ${importData.tags.length} tags`);
    
    // Importar videos
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
          video.is_watched === true ? 1 : 0, // Converter explicitamente para 1/0
          video.watch_progress_seconds || 0,
          video.last_watched_at,
          video.created_at, 
          video.updated_at
        ]
      );
    }
    console.log(`Imported ${importData.videos.length} videos`);
    
    // Importar video_tags
    for (const videoTag of importData.videoTags) {
      await database.execute(
        "INSERT INTO video_tags (id, video_id, tag_id, created_at) VALUES (?, ?, ?, ?)",
        [videoTag.id, videoTag.video_id, videoTag.tag_id, videoTag.created_at]
      );
    }
    console.log(`Imported ${importData.videoTags.length} video-tag relationships`);
    
    console.log("Library import completed successfully");
  } catch (error) {
    console.error("Error importing library:", error);
    throw error;
  }
}

// Obter estatísticas da biblioteca para exibição
export async function getLibraryStats(): Promise<{
  totalVideos: number;
  totalTags: number;
  totalFolders: number;
  watchedVideos: number;
  totalDuration: number;
}> {
  const database = await getDatabase();
  
  try {
    const videoStats = await database.select(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_watched = TRUE THEN 1 END) as watched,
        COALESCE(SUM(duration_seconds), 0) as total_duration
       FROM videos`
    ) as any[];
    
    const tagStats = await database.select("SELECT COUNT(*) as total FROM tags") as any[];
    const folderStats = await database.select("SELECT COUNT(*) as total FROM library_folders") as any[];
    
    return {
      totalVideos: videoStats[0].total || 0,
      totalTags: tagStats[0].total || 0,
      totalFolders: folderStats[0].total || 0,
      watchedVideos: videoStats[0].watched || 0,
      totalDuration: videoStats[0].total_duration || 0
    };
  } catch (error) {
    console.error("Error getting library stats:", error);
    return {
      totalVideos: 0,
      totalTags: 0,
      totalFolders: 0,
      watchedVideos: 0,
      totalDuration: 0
    };
  }
}

// Função para resetar todos os vídeos como não assistidos
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
    console.log("All videos reset as unwatched");
  } catch (error) {
    console.error("Error resetting videos as unwatched:", error);
    throw error;
  }
}
