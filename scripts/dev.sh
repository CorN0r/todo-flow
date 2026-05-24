#!/bin/bash
# Tauri dev environment setup for Git Bash on Windows

export MSVC_BASE="C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
export SDK_ROOT="C:/Program Files (x86)/Windows Kits/10"
export SDK_VER="10.0.26100.0"
export PATH="$HOME/.cargo/bin:$MSVC_BASE/bin/Hostx86/x64:$PATH"
export LIB="$MSVC_BASE/lib/x64;$SDK_ROOT/Lib/$SDK_VER/um/x64;$SDK_ROOT/Lib/$SDK_VER/ucrt/x64"
export INCLUDE="$MSVC_BASE/include;$SDK_ROOT/Include/$SDK_VER/ucrt;$SDK_ROOT/Include/$SDK_VER/um;$SDK_ROOT/Include/$SDK_VER/shared"

npx tauri "$@"
