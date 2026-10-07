//! Recognizes a video file after a rename or move, even across drives or while the app was closed: its size and a
//! hash of its first and last 64 KiB. Cheap next to what ffmpeg reads, and stable across Rust versions (xxh3).

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;
use std::time::Duration;

use xxhash_rust::xxh3::Xxh3;

use crate::domain::media::FileIdentity;

const SAMPLE_BYTES: u64 = 64 * 1024;

/// Reads the identity of a file. Synchronous: run it on the blocking thread pool.
pub fn identify(path: &Path) -> io::Result<FileIdentity> {
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    let mut hasher = Xxh3::new();
    hasher.update(&size.to_le_bytes());
    let mut buffer = vec![0; SAMPLE_BYTES as usize];
    hash_range(&mut file, 0, size.min(SAMPLE_BYTES), &mut buffer, &mut hasher)?;
    if size > SAMPLE_BYTES {
        let tail = size.saturating_sub(SAMPLE_BYTES).max(SAMPLE_BYTES);
        hash_range(&mut file, tail, size - tail, &mut buffer, &mut hasher)?;
    }
    Ok(FileIdentity {
        size: i64::try_from(size).unwrap_or(i64::MAX),
        fingerprint: format!("{:016x}", hasher.digest()),
    })
}

fn hash_range(file: &mut File, start: u64, length: u64, buffer: &mut [u8], hasher: &mut Xxh3) -> io::Result<()> {
    file.seek(SeekFrom::Start(start))?;
    let chunk = &mut buffer[..length as usize];
    file.read_exact(chunk)?;
    hasher.update(chunk);
    Ok(())
}

/// Whether a file found at `size` a moment ago has stopped growing and can be opened, i.e. it is not being copied.
pub fn is_settled(path: &Path, size: i64) -> bool {
    let unchanged = std::fs::metadata(path).is_ok_and(|metadata| metadata.len() as i64 == size);
    unchanged && File::open(path).is_ok()
}

/// How long a new file must keep its size before it is read.
pub const SETTLE_TIME: Duration = Duration::from_secs(1);

#[cfg(test)]
mod tests {
    use super::*;

    fn file_with(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn same_content_gives_the_same_identity_wherever_it_is() {
        let dir = tempfile::tempdir().unwrap();
        let content: Vec<u8> = (0..300_000u32).map(|index| (index % 251) as u8).collect();
        let original = identify(&file_with(dir.path(), "a.mkv", &content)).unwrap();
        let copy = identify(&file_with(dir.path(), "renamed.mkv", &content)).unwrap();
        assert_eq!(original, copy);
        assert_eq!(original.size, 300_000);
        assert_eq!(original.fingerprint.len(), 16);
    }

    #[test]
    fn head_tail_and_size_all_count() {
        let dir = tempfile::tempdir().unwrap();
        let base = vec![7u8; 200_000];
        let mut tail_changed = base.clone();
        *tail_changed.last_mut().unwrap() = 8;
        let mut head_changed = base.clone();
        head_changed[0] = 8;
        let identities: Vec<FileIdentity> = [&base[..], &tail_changed, &head_changed, &base[..199_999]]
            .iter()
            .enumerate()
            .map(|(index, bytes)| identify(&file_with(dir.path(), &format!("{index}.mkv"), bytes)).unwrap())
            .collect();
        for (index, identity) in identities.iter().enumerate() {
            assert!(identities[index + 1..].iter().all(|other| other != identity));
        }
    }

    #[test]
    fn small_and_empty_files_are_identified_too() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(identify(&file_with(dir.path(), "empty.mkv", b"")).unwrap().size, 0);
        assert_ne!(
            identify(&file_with(dir.path(), "a.mkv", b"abc")).unwrap(),
            identify(&file_with(dir.path(), "b.mkv", b"abd")).unwrap()
        );
    }

    #[test]
    fn a_file_is_settled_once_its_size_holds() {
        let dir = tempfile::tempdir().unwrap();
        let path = file_with(dir.path(), "a.mkv", b"abc");
        assert!(is_settled(&path, 3));
        assert!(!is_settled(&path, 2));
        assert!(!is_settled(&dir.path().join("gone.mkv"), 3));
    }
}
