import Database from "@tauri-apps/plugin-sql";

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

export async function getVideoByPath(filePath: string) {
  const database = await getDatabase();
  
  const result = await database.select(
    "SELECT * FROM videos WHERE file_path = $1",
    [filePath]
  ) as any[];
  
  return result.length > 0 ? result[0] : null;
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
