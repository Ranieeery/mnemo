import Database from "@tauri-apps/plugin-sql";
import { ProcessedVideo } from "./services/videoProcessor";

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
    `INSERT OR REPLACE INTO videos (file_path, title, description, duration_seconds, thumbnail_path, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [
      videoData.file_path,
      videoData.title,
      videoData.description || null,
      videoData.duration_seconds || null,
      videoData.thumbnail_path || null,
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
      `SELECT file_path, title, description, duration_seconds, thumbnail_path, created_at, updated_at
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
  
  return result;
}

export async function getAllVideos() {
  const database = await getDatabase();
  
  const result = await database.select(
    "SELECT * FROM videos ORDER BY created_at DESC"
  ) as any[];
  
  return result;
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
