use std::env;
use std::fs;
use std::io;
use std::io::{Read, Write};
use std::mem::{size_of, zeroed};
use std::net::{TcpStream, ToSocketAddrs};
#[cfg(target_os = "windows")]
use std::os::windows::io::AsRawHandle;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
#[cfg(target_os = "windows")]
use std::ptr::null;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 18000;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct ManagedBackendProcess {
    child: Child,
    #[cfg(target_os = "windows")]
    job_handle: isize,
}

#[tauri::command]
fn desktop_health() -> &'static str {
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_process = Arc::new(Mutex::new(None::<ManagedBackendProcess>));
    let backend_process_for_setup = Arc::clone(&backend_process);

    tauri::Builder::default()
        .setup(move |app| {
            let resource_dir = match app.path().resource_dir() {
                Ok(path) => Some(path),
                Err(error) => {
                    log_desktop_shell_error(format!(
                        "Could not resolve packaged resource directory: {error}"
                    ));
                    None
                }
            };

            match ensure_backend_ready(resource_dir.as_deref()) {
                Ok(child) => {
                    *backend_process_for_setup
                        .lock()
                        .expect("backend mutex poisoned") = child;
                }
                Err(error) => {
                    log_desktop_shell_error(format!("Could not start packaged backend: {error}"));
                    eprintln!("Could not start packaged backend: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_health])
        .run(tauri::generate_context!())
        .expect("error while running Planvas desktop");

    drop(
        backend_process
            .lock()
            .expect("backend mutex poisoned")
            .take(),
    );
}

fn ensure_backend_ready(resource_dir: Option<&Path>) -> io::Result<Option<ManagedBackendProcess>> {
    if wait_for_backend(Duration::from_secs(8)) {
        return Ok(None);
    }

    let backend_entry = resolve_backend_entry_script(resource_dir)?;
    let child = ManagedBackendProcess::new(spawn_backend(&backend_entry, resource_dir)?)?;

    if wait_for_backend(Duration::from_secs(15)) {
        return Ok(Some(child));
    }

    drop(child);

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
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
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

fn spawn_backend(backend_entry: &Path, resource_dir: Option<&Path>) -> io::Result<Child> {
    let node_exe = find_node_exe(resource_dir).ok_or_else(|| {
        io::Error::other(
            "node.exe was not found. Install Node.js to let the Planvas desktop shell auto-start its backend.",
        )
    })?;

    let backend_root = runtime_backend_root();
    fs::create_dir_all(&backend_root)?;

    let mut command = Command::new(node_exe);
    command
        .arg("--experimental-default-type=module")
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
        let log_dir = backend_root.join("logs");
        fs::create_dir_all(&log_dir)?;
        let stdout_log = fs::File::create(log_dir.join("desktop-backend.stdout.log"))?;
        let stderr_log = fs::File::create(log_dir.join("desktop-backend.stderr.log"))?;
        command
            .stdout(Stdio::from(stdout_log))
            .stderr(Stdio::from(stderr_log));
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn()
}

impl ManagedBackendProcess {
    fn new(child: Child) -> io::Result<Self> {
        #[cfg(target_os = "windows")]
        let job_handle = attach_child_to_kill_on_close_job(&child)?;

        Ok(Self {
            child,
            #[cfg(target_os = "windows")]
            job_handle: job_handle as isize,
        })
    }
}

impl Drop for ManagedBackendProcess {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }

        #[cfg(target_os = "windows")]
        unsafe {
            CloseHandle(self.job_handle as HANDLE);
        }
    }
}

#[cfg(target_os = "windows")]
fn attach_child_to_kill_on_close_job(child: &Child) -> io::Result<HANDLE> {
    unsafe {
        let job_handle = CreateJobObjectW(null(), null());
        if job_handle.is_null() {
            return Err(io::Error::last_os_error());
        }

        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let set_result = SetInformationJobObject(
            job_handle,
            JobObjectExtendedLimitInformation,
            &mut limits as *mut _ as *mut _,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if set_result == 0 {
            CloseHandle(job_handle);
            return Err(io::Error::last_os_error());
        }

        let assign_result = AssignProcessToJobObject(job_handle, child.as_raw_handle() as HANDLE);
        if assign_result == 0 {
            CloseHandle(job_handle);
            return Err(io::Error::last_os_error());
        }

        Ok(job_handle)
    }
}

fn resolve_backend_entry_script(resource_dir: Option<&Path>) -> io::Result<PathBuf> {
    if let Some(resources_dir) = resource_dir {
        for release_entry in [
            resources_dir
                .join("backend")
                .join("dist")
                .join("src")
                .join("server.js"),
            resources_dir.join("dist").join("src").join("server.js"),
        ] {
            if release_entry.exists() {
                return Ok(release_entry);
            }
        }
    }

    let resources_dir = current_exe_dir()?.join("resources");
    for release_entry in [
        current_exe_dir()?
            .join("_up_")
            .join("backend")
            .join("dist")
            .join("src")
            .join("server.js"),
        resources_dir
            .join("backend")
            .join("dist")
            .join("src")
            .join("server.js"),
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

fn find_node_exe(resource_dir: Option<&Path>) -> Option<PathBuf> {
    if let Some(resources_dir) = resource_dir {
        for packaged_node in [
            resources_dir.join("node.exe"),
            resources_dir.join("bin").join("node.exe"),
        ] {
            if packaged_node.exists() {
                return Some(packaged_node);
            }
        }
    }

    if let Ok(exe_dir) = current_exe_dir() {
        let resources_dir = exe_dir.join("resources");
        for packaged_node in [
            resources_dir.join("node.exe"),
            resources_dir.join("bin").join("node.exe"),
        ] {
            if packaged_node.exists() {
                return Some(packaged_node);
            }
        }
    }

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

fn log_desktop_shell_error(message: impl AsRef<str>) {
    let log_dir = runtime_backend_root().join("logs");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("desktop-shell.log"))
    {
        let _ = writeln!(file, "{}", message.as_ref());
    }
}

fn current_exe_dir() -> io::Result<PathBuf> {
    let exe = env::current_exe()?;
    exe.parent()
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::other("current exe path has no parent directory"))
}
