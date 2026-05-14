use std::env;
use std::fs;
use std::io;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 18000;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[tauri::command]
fn desktop_health() -> &'static str {
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_process = Arc::new(Mutex::new(None::<Child>));
    let backend_process_for_setup = Arc::clone(&backend_process);

    tauri::Builder::default()
        .setup(move |_app| {
            let child = ensure_backend_ready()?;
            *backend_process_for_setup.lock().expect("backend mutex poisoned") = child;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_health])
        .run(tauri::generate_context!())
        .expect("error while running Planvas desktop");

    let mut backend_child = backend_process
        .lock()
        .expect("backend mutex poisoned")
        .take();
    if let Some(mut child) = backend_child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn ensure_backend_ready() -> io::Result<Option<Child>> {
    if wait_for_backend(Duration::from_secs(8)) {
        return Ok(None);
    }

    let backend_entry = resolve_backend_entry_script()?;
    let mut child = spawn_backend(&backend_entry)?;

    if wait_for_backend(Duration::from_secs(15)) {
        return Ok(Some(child));
    }

    let _ = child.kill();
    let _ = child.wait();

    Err(io::Error::other(
        "Planvas desktop could not start the local Node backend. Install Node.js or use npm run web:start.",
    ))
}

fn wait_for_backend(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if backend_healthz_ok() {
            return true;
        }

        if Instant::now() >= deadline {
            return false;
        }

        std::thread::sleep(Duration::from_millis(250));
    }
}

fn backend_healthz_ok() -> bool {
    let Ok(mut addrs) = format!("{BACKEND_HOST}:{BACKEND_PORT}").to_socket_addrs() else {
        return false;
    };
    let Some(address) = addrs.next() else {
        return false;
    };

    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));

    if stream
        .write_all(
            b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

fn spawn_backend(backend_entry: &Path) -> io::Result<Child> {
    let node_exe = find_node_exe().ok_or_else(|| {
        io::Error::other(
            "node.exe was not found. Install Node.js to let the Planvas desktop shell auto-start its backend.",
        )
    })?;

    let backend_root = runtime_backend_root();
    fs::create_dir_all(&backend_root)?;

    let mut command = Command::new(node_exe);
    command
        .arg(backend_entry)
        .arg("--host")
        .arg(BACKEND_HOST)
        .arg("--port")
        .arg(BACKEND_PORT.to_string())
        .current_dir(
            backend_entry
                .parent()
                .ok_or_else(|| io::Error::other("backend entry path has no parent"))?,
        )
        .env("WHITEBOARD_BACKEND_ROOT", &backend_root)
        .stdin(Stdio::null());

    if cfg!(debug_assertions) {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn()
}

fn resolve_backend_entry_script() -> io::Result<PathBuf> {
    let resources_dir = current_exe_dir()?.join("resources");
    for release_entry in [
        current_exe_dir()?
            .join("_up_")
            .join("backend")
            .join("dist")
            .join("src")
            .join("server.js"),
        resources_dir.join("backend").join("dist").join("src").join("server.js"),
        resources_dir.join("dist").join("src").join("server.js"),
    ] {
        if release_entry.exists() {
            return Ok(release_entry);
        }
    }

    let dev_entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("backend")
        .join("dist")
        .join("src")
        .join("server.js");
    if dev_entry.exists() {
        return Ok(dev_entry);
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "The packaged Node backend entry script was not found.",
    ))
}

fn find_node_exe() -> Option<PathBuf> {
    if let Some(path) = find_in_path("node.exe") {
        return Some(path);
    }

    [
        env::var_os("ProgramFiles").map(PathBuf::from),
        env::var_os("ProgramFiles(x86)").map(PathBuf::from),
    ]
    .into_iter()
    .flatten()
    .map(|base| base.join("nodejs").join("node.exe"))
    .find(|candidate| candidate.exists())
}

fn find_in_path(executable: &str) -> Option<PathBuf> {
    let paths = env::var_os("PATH")?;
    env::split_paths(&paths)
        .map(|path| path.join(executable))
        .find(|candidate| candidate.exists())
}

fn runtime_backend_root() -> PathBuf {
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        return PathBuf::from(local_app_data)
            .join("Planvas")
            .join("backend-runtime");
    }

    current_exe_dir()
        .unwrap_or_else(|_| env::temp_dir())
        .join("planvas-backend-runtime")
}

fn current_exe_dir() -> io::Result<PathBuf> {
    let exe = env::current_exe()?;
    exe.parent()
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::other("current exe path has no parent directory"))
}
