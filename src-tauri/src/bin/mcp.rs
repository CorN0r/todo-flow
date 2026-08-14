//! todoflow-mcp:MCP stdio server + CLI 工具入口。
//!
//! 注意:serve 模式下 stdout 完全被 MCP 协议占用,任何 println! 都会
//! 污染协议 —— 诊断信息一律走 eprintln!。

use std::process::ExitCode;

use clap::Parser;
use todo_flow_lib::mcp::cli::{Cli, run};

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(Some(value)) => {
            println!("{}", serde_json::to_string_pretty(&value).unwrap_or_default());
            ExitCode::SUCCESS
        }
        Ok(None) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("错误: {e}");
            ExitCode::FAILURE
        }
    }
}
