//! `tauri dev` 下切换工作区时的进程交接。
//!
//! 安装版切换工作区走 Tauri 的重启:拉起新实例后本进程退出。`npx tauri dev` 只盯着它启动的
//! 那一个进程(cargo run 的子进程),它一退出命令就结束并停掉开发服务器——切换后的新实例
//! 加载不出前端,还留下一个挡住下一次 `tauri dev` 的进程。
//!
//! 做法:开发构建里被 `tauri dev` 直接启动的那个进程不初始化应用,只拉起一份真正的应用并
//! 等它,充当“锚”。应用实例切换工作区时照旧“拉起下一个就退出”,只是把后继者的进程号写进
//! 一个约定文件,再以约定的退出码结束;锚看到这个退出码就改为等待后继者。cargo 的子进程
//! 因此始终活着,开发会话得以保留,多出来的只有一个不打开数据库、不建窗口的空闲进程。
//! 锚一旦消失,应用实例随之退出,不会留下脱离开发会话的进程。
//!
//! 只在开发构建里生效。验收用的独立构建和发布构建里 `cfg!(dev)` 为假,一切照旧。

use std::ffi::c_void;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut c_void;
    fn WaitForSingleObject(hHandle: *mut c_void, dwMilliseconds: u32) -> u32;
    fn GetExitCodeProcess(hHandle: *mut c_void, lpExitCode: *mut u32) -> i32;
    fn TerminateProcess(hProcess: *mut c_void, uExitCode: u32) -> i32;
    fn CloseHandle(hObject: *mut c_void) -> i32;
}

/// 应用实例启动时带着它(交接文件的路径),说明自己是锚拉起来的
const HANDOVER_FILE_VAR: &str = "TODOFLOW_DEV_HANDOVER_FILE";
/// 锚的进程号;锚消失时应用实例随之退出
const ANCHOR_PID_VAR: &str = "TODOFLOW_DEV_ANCHOR_PID";
/// 应用实例把接力棒交给后继者之后的退出码
pub const HANDOVER_EXIT_CODE: i32 = 87;

const SYNCHRONIZE: u32 = 0x0010_0000;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const PROCESS_TERMINATE: u32 = 0x0001;
const WAIT_OBJECT_0: u32 = 0;
/// 交棒之后一时读不到后继者时,最多再等这么久
const SUCCESSOR_WAIT: Duration = Duration::from_secs(5);

static ANCHOR_LOST: AtomicBool = AtomicBool::new(false);

fn handover_file() -> Option<PathBuf> {
    let path = PathBuf::from(std::env::var_os(HANDOVER_FILE_VAR)?);
    (!path.as_os_str().is_empty()).then_some(path)
}

fn anchor_pid() -> Option<u32> {
    std::env::var(ANCHOR_PID_VAR)
        .ok()
        .and_then(|raw| raw.trim().parse::<u32>().ok())
        .filter(|pid| *pid > 0)
}

fn handover_file_for(anchor_pid: u32) -> PathBuf {
    std::env::temp_dir().join(format!("todoflow-dev-handover-{anchor_pid}.pid"))
}

/// 被开发工具直接启动的那个进程在初始化应用之前调用。返回 `Some(退出码)` 表示本进程充当了
/// 锚、等应用结束之后应当以这个退出码结束;返回 `None` 表示照常启动。
pub fn anchor_dev_session() -> Option<i32> {
    if !cfg!(dev) || handover_file().is_some() {
        return None;
    }
    let anchor_pid = std::process::id();
    let file = handover_file_for(anchor_pid);
    let app = match spawn_app(Some((&file, anchor_pid))) {
        Ok(app) => app,
        Err(e) => {
            // 拉不起应用就当普通启动:本进程自己运行应用
            eprintln!("[workspace] tauri dev:无法拉起应用,改为本进程直接运行({e})");
            return None;
        }
    };
    eprintln!(
        "[workspace] tauri dev:本进程只负责保持开发会话,应用由进程 {} 运行",
        app.pid()
    );
    Some(follow(&file, app))
}

/// 应用实例切换工作区时的重启。被锚拉起来的实例交棒后退出,由锚接着等后继者;
/// 其余情况走 Tauri 的重启(拉起新实例后本进程退出)。
pub fn restart(app: &tauri::AppHandle) {
    let Some(file) = handover_file() else {
        app.request_restart();
        return;
    };
    if !cfg!(dev) || ANCHOR_LOST.load(Ordering::SeqCst) {
        app.request_restart();
        return;
    }
    let mut successor = None;
    let handed_over = (|| {
        // 先确认交接文件写得进去,再拉后继者
        write_pid(&file, 0)?;
        let spawned = spawn_app(None)?;
        let pid = spawned.pid();
        successor = Some(spawned);
        write_pid(&file, pid)?;
        Ok::<u32, io::Error>(pid)
    })();
    match handed_over {
        Ok(pid) => {
            eprintln!(
                "[workspace] tauri dev:已把应用交给进程 {pid},本进程退出;开发会话由锚保持"
            );
            app.cleanup_before_exit();
            crate::on_exit(app);
            std::process::exit(HANDOVER_EXIT_CODE);
        }
        Err(e) => {
            // 后继者已经起来了就把它收掉,免得走普通重启时变成两个实例
            if let Some(spawned) = successor {
                spawned.kill();
            }
            eprintln!("[workspace] tauri dev:无法交接给后继者({e}),改用普通重启");
            app.request_restart();
        }
    }
}

/// 应用实例启动后调用:锚退出时本进程随之退出,不留下脱离开发会话的应用进程。
pub fn watch_anchor() {
    if !cfg!(dev) {
        return;
    }
    let Some(pid) = anchor_pid() else {
        return;
    };
    std::thread::spawn(move || {
        if let Some(anchor) = Process::open(pid) {
            anchor.wait();
        }
        ANCHOR_LOST.store(true, Ordering::SeqCst);
        eprintln!("[workspace] tauri dev:保持开发会话的进程已结束,应用随之退出");
        std::process::exit(0);
    });
}

/// 拉起一份应用。`handover` 为 `Some` 时告诉它交接文件在哪、锚是谁;为 `None` 时沿用本进程
/// 环境里的(后继者跟着同一个锚)。
fn spawn_app(handover: Option<(&Path, u32)>) -> io::Result<Process> {
    let exe = std::env::current_exe()?;
    let mut command = Command::new(exe);
    command.args(std::env::args_os().skip(1));
    if let Some((file, anchor_pid)) = handover {
        command
            .env(HANDOVER_FILE_VAR, file)
            .env(ANCHOR_PID_VAR, anchor_pid.to_string());
    }
    Process::from_child(command.spawn()?)
}

/// 锚的主循环:等当前的应用实例结束。它交棒时(以 `HANDOVER_EXIT_CODE` 退出)改为等后继者,
/// 否则以它的退出码结束。
fn follow(file: &Path, mut app: Process) -> i32 {
    loop {
        let Some(code) = app.wait() else {
            return 1;
        };
        if code != HANDOVER_EXIT_CODE {
            return code;
        }
        match successor_within(file, app.pid(), SUCCESSOR_WAIT) {
            Some(next) => app = next,
            None => return code,
        }
    }
}

/// 交接文件里记的后继者。和刚退出的那个相同、或一时读不到,都不算。
fn successor_within(file: &Path, exited_pid: u32, limit: Duration) -> Option<Process> {
    let deadline = Instant::now() + limit;
    loop {
        if let Some(process) = read_pid(file).filter(|pid| *pid != exited_pid).and_then(Process::open)
        {
            return Some(process);
        }
        if Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn read_pid(file: &Path) -> Option<u32> {
    let text = std::fs::read_to_string(file).ok()?;
    text.trim().parse::<u32>().ok().filter(|pid| *pid > 0)
}

fn write_pid(file: &Path, pid: u32) -> io::Result<()> {
    // 先写临时文件再改名,锚不会读到写了一半的内容
    let tmp = file.with_extension("pid.tmp");
    std::fs::write(&tmp, pid.to_string())?;
    std::fs::rename(&tmp, file)
}

struct Handle(*mut c_void);

// 句柄只是一个不透明指针,可以在多线程之间移动
unsafe impl Send for Handle {}

impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

/// 一个要等待的进程:只持有句柄,不负责结束它。
struct Process {
    handle: Handle,
    pid: u32,
}

impl Process {
    /// 给刚拉起的进程开一个句柄。之后丢弃 `Child` 没关系:只要本句柄在,进程对象就在,
    /// 退出码也读得到。
    fn from_child(child: Child) -> io::Result<Self> {
        Self::open(child.id())
            .ok_or_else(|| io::Error::other(format!("无法打开进程 {} 的句柄", child.id())))
    }

    fn open(pid: u32) -> Option<Self> {
        let raw = unsafe {
            OpenProcess(
                SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
                0,
                pid,
            )
        };
        (!raw.is_null()).then(|| Self {
            handle: Handle(raw),
            pid,
        })
    }

    fn pid(&self) -> u32 {
        self.pid
    }

    /// 等到进程结束,返回它的退出码
    fn wait(&self) -> Option<i32> {
        if unsafe { WaitForSingleObject(self.handle.0, u32::MAX) } != WAIT_OBJECT_0 {
            return None;
        }
        let mut code: u32 = 0;
        if unsafe { GetExitCodeProcess(self.handle.0, &mut code) } == 0 {
            return None;
        }
        Some(code as i32)
    }

    fn kill(&self) {
        unsafe { TerminateProcess(self.handle.0, 1) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 用系统自带的命令充当进程:`cmd /C <命令行>`
    fn script(command_line: &str) -> Process {
        Process::from_child(Command::new("cmd").args(["/C", command_line]).spawn().unwrap())
            .unwrap()
    }

    #[test]
    fn reports_the_exit_code_of_a_finished_process() {
        assert_eq!(script("exit 7").wait(), Some(7));
        assert_eq!(script("exit 0").wait(), Some(0));
    }

    #[test]
    fn pid_file_round_trip() {
        let file = std::env::temp_dir().join(format!("todoflow-handover-test-{}.pid", std::process::id()));
        assert!(read_pid(&file).is_none());

        write_pid(&file, 4242).unwrap();
        assert_eq!(read_pid(&file), Some(4242));

        // 交棒前先写的占位;它不代表任何进程
        write_pid(&file, 0).unwrap();
        assert_eq!(read_pid(&file), None);
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn follow_ends_with_the_exit_code_when_the_app_quits() {
        let file = PathBuf::from("unused.pid");
        assert_eq!(follow(&file, script("exit 3")), 3);
        assert_eq!(follow(&file, script("exit 0")), 0);
    }

    #[test]
    fn follow_picks_up_the_successor_after_a_handover() {
        let file = std::env::temp_dir().join(format!("todoflow-handover-test-follow-{}.pid", std::process::id()));
        // “应用”约一秒后交棒;后继者要跑四秒左右
        let app = script("ping -n 2 127.0.0.1 >NUL & exit 87");
        let successor = Command::new("ping").args(["-n", "4", "127.0.0.1"]).spawn().unwrap();
        write_pid(&file, successor.id()).unwrap();

        let started = Instant::now();
        let code = follow(&file, app);

        assert_eq!(code, 0, "后继者的退出码要原样返回");
        assert!(
            started.elapsed() >= Duration::from_millis(2500),
            "应当等到后继者结束,实际只用了 {:?}",
            started.elapsed()
        );
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn a_stale_pid_in_the_handover_file_is_not_a_successor() {
        let file = std::env::temp_dir().join(format!("todoflow-handover-test-stale-{}.pid", std::process::id()));
        write_pid(&file, std::process::id()).unwrap();
        let started = Instant::now();
        let found = successor_within(&file, std::process::id(), Duration::from_millis(300));
        assert!(found.is_none(), "文件里记的就是刚退出的那个,不算后继者");
        assert!(started.elapsed() >= Duration::from_millis(300));
        let _ = std::fs::remove_file(&file);
    }
}
