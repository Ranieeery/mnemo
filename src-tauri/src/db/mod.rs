//! SQLite access: connection management, migrations and one repository module per domain.
//!
//! Repositories are plain synchronous functions over a `&Connection` so they can be tested against an in-memory
//! database. Async code reaches them through [`Db::call`], which runs the closure on the blocking thread pool.

pub mod backup;
pub mod folders;
pub mod history;
mod migrations;
pub mod orphans;
pub mod settings;
pub mod tags;
pub mod videos;
pub mod watch;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

#[derive(Clone)]
pub struct Db {
    connection: Arc<Mutex<Connection>>,
}

impl Db {
    /// Opens (or creates) the database file and brings its schema up to date, preserving legacy data.
    pub fn open(path: &Path) -> AppResult<Self> {
        let connection = Connection::open(path)?;
        Self::initialize(connection)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(mut connection: Connection) -> AppResult<Self> {
        configure(&connection)?;
        migrations::run(&mut connection)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    /// Runs `operation` with exclusive access to the connection on the blocking thread pool.
    pub async fn call<T, F>(&self, operation: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> AppResult<T> + Send + 'static,
    {
        let connection = Arc::clone(&self.connection);
        tokio::task::spawn_blocking(move || {
            let mut guard = connection
                .lock()
                .map_err(|_| AppError::Internal("database connection lock poisoned".into()))?;
            operation(&mut guard)
        })
        .await?
    }
}

fn configure(connection: &Connection) -> AppResult<()> {
    // The legacy frontend keeps its own connection to the same file until it is removed, hence the busy timeout.
    // `journal_mode` reports the resulting mode (in-memory databases stay "memory"), so read and ignore it.
    connection.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

/// Escapes `%`, `_` and `\` so user input is matched literally by `LIKE ... ESCAPE '\'`.
pub(crate) fn like_pattern(term: &str) -> String {
    let mut escaped = String::with_capacity(term.len() + 2);
    escaped.push('%');
    for character in term.chars() {
        if matches!(character, '%' | '_' | '\\') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped.push('%');
    escaped
}

#[cfg(test)]
pub(crate) mod test_support {
    use rusqlite::Connection;

    /// A fresh in-memory database with the current schema.
    pub fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        super::configure(&connection).unwrap();
        super::migrations::run(&mut connection).unwrap();
        connection
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn like_pattern_escapes_wildcards() {
        assert_eq!(like_pattern("50%_off\\"), "%50\\%\\_off\\\\%");
    }

    #[tokio::test]
    async fn call_runs_the_operation_on_the_connection() {
        let db = Db::open_in_memory().unwrap();
        let answer = db
            .call(|connection| Ok(connection.query_row("SELECT 40 + 2", [], |row| row.get::<_, i64>(0))?))
            .await
            .unwrap();
        assert_eq!(answer, 42);
    }
}
