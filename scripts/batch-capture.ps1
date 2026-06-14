# Batch capture TodoFlow screenshots for wiki
# Navigates through views using keyboard shortcuts and mouse clicks

param([string]$OutputDir = "$PSScriptRoot\..\docs\images")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Win32 API
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }
public class Win {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
    [DllImport("user32.dll")]
    public static extern IntPtr SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, int dx, int dy, uint data, IntPtr extra);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vk);
    public const int SW_RESTORE = 9;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_SHIFT = 0x10;
    public const byte VK_T = 0x54;
    public const byte VK_B = 0x42;
    public const byte VK_K = 0x4B;
    public const byte VK_N = 0x4E;
    public const byte VK_1 = 0x31;
    public const byte VK_2 = 0x32;
    public const byte VK_3 = 0x33;
    public const byte VK_OEM_2 = 0xBF; // ? key
    public const byte VK_ESCAPE = 0x1B;
    public const byte VK_UP = 0x26;
    public const byte VK_DOWN = 0x28;
}
"@

# Find and activate TodoFlow main window
function Get-TodoFlowWindow {
    $proc = Get-Process -Name "todo-flow" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "TodoFlow" } | Select-Object -First 1
    if (-not $proc) { return $null }
    $h = $proc.MainWindowHandle
    if ($h -eq [IntPtr]::Zero) {
        $proc.Refresh()
        $h = $proc.MainWindowHandle
        if ($h -eq [IntPtr]::Zero) { return $null }
    }
    if ([Win]::IsIconic($h)) { [Win]::ShowWindow($h, [Win]::SW_RESTORE) | Out-Null }
    [Win]::SetForegroundWindow($h) | Out-Null
    Start-Sleep -Milliseconds 300
    return $h
}

# Send a single key
function Send-Key([byte]$vk) {
    [Win]::keybd_event($vk, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 50
    [Win]::keybd_event($vk, 0, [Win]::KEYEVENTF_KEYUP, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 50
}

# Send Ctrl+Key combo
function Send-CtrlKey([byte]$vk) {
    [Win]::keybd_event([Win]::VK_CONTROL, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [Win]::keybd_event($vk, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 50
    [Win]::keybd_event($vk, 0, [Win]::KEYEVENTF_KEYUP, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [Win]::keybd_event([Win]::VK_CONTROL, 0, [Win]::KEYEVENTF_KEYUP, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 50
}

# Click at screen coordinates
function Click-Screen([int]$x, [int]$y) {
    [Win]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 50
    [Win]::mouse_event([Win]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 30
    [Win]::mouse_event([Win]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 100
}

# Capture screenshot (full screen, crop to window)
function Capture-Screen([string]$filename) {
    $outputFile = Join-Path $OutputDir $filename
    $hWnd = Get-TodoFlowWindow
    if ($hWnd -eq $null) {
        Write-Output "WARN: Window not found for $filename, using fullscreen"
        $hWnd = [IntPtr]::Zero
    }

    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $full = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($full)
    $g.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $screen.Bounds.Size)
    $g.Dispose()

    if ($hWnd -ne [IntPtr]::Zero) {
        $rect = New-Object RECT
        if ([Win]::GetWindowRect($hWnd, [ref]$rect)) {
            $x = [Math]::Max(0, $rect.Left)
            $y = [Math]::Max(0, $rect.Top)
            $w = [Math]::Min($rect.Right - $rect.Left, $full.Width - $x)
            $h = [Math]::Min($rect.Bottom - $rect.Top, $full.Height - $y)
            if ($w -gt 0 -and $h -gt 0) {
                $cropped = New-Object System.Drawing.Bitmap($w, $h)
                $cg = [System.Drawing.Graphics]::FromImage($cropped)
                $cg.DrawImage($full, 0, 0, (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
                $cg.Dispose()
                $full.Dispose()
                $full = $cropped
            }
        }
    }

    if ($full.Width -gt 1400) {
        $ratio = 1400 / $full.Width
        $nw = 1400; $nh = [int]($full.Height * $ratio)
        $resized = New-Object System.Drawing.Bitmap($nw, $nh)
        $rg = [System.Drawing.Graphics]::FromImage($resized)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($full, 0, 0, $nw, $nh)
        $rg.Dispose(); $full.Dispose(); $full = $resized
    }

    $full.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $full.Dispose()
    Write-Output "  Saved: $filename"
}

# Click sidebar nav item by index (0=all, 1=myday, 2=calendar, 3=matrix, 4=kanban, 5=habits, 6=dashboard)
function Click-SidebarItem([int]$index) {
    $hWnd = Get-TodoFlowWindow
    if ($hWnd -eq $null) { Write-Output "  ERROR: No window"; return }
    $rect = New-Object RECT
    [Win]::GetWindowRect($hWnd, [ref]$rect) | Out-Null

    # Sidebar nav items: top=56px(header) + 8px(padding) = 64px, each item 38px + 2px gap = 40px
    # Click x = 120 (center of 240px sidebar), y = 64 + 19 + index*40
    $clickX = $rect.Left + 120
    $clickY = $rect.Top + 83 + ($index * 40)
    Click-Screen $clickX $clickY
    Start-Sleep -Milliseconds 500
}

# Make sure app window is ready
$h = Get-TodoFlowWindow
if ($h -eq $null) {
    Write-Output "ERROR: TodoFlow window not found. Is it running?"
    exit 1
}

$r = New-Object RECT
[Win]::GetWindowRect($h, [ref]$r)
Write-Output "TodoFlow window: ($($r.Left),$($r.Top)) $($r.Right-$r.Left)x$($r.Bottom-$r.Top)"
Write-Output "Output: $OutputDir"
Write-Output ""

# Ensure sidebar is open (Ctrl+B if collapsed)
# First, check if sidebar is open by trying to find sidebar items
# We'll just make sure it's in a known state by toggling

Write-Output "=== Capturing P0 Screenshots ==="

# 01 - Main overview (today page, list view, sidebar open)
Write-Output "[01] Main overview - Today page, list view"
# Navigate to today: click sidebar '今天' item (index 2 in "计划中" section, but it's the first "今天" link)
# Actually let's use: click 全部任务 to go to all tasks, then switch views
Click-SidebarItem 0  # 全部任务
Start-Sleep -Milliseconds 300
Capture-Screen "01-main-overview.png"

# 02 - Task detail panel (click on first task)
Write-Output "[02] Task detail panel"
# Click on the first task card - approximately at x=sidebar+40px, y=header+60px
$taskClickX = $r.Left + 280
$taskClickY = $r.Top + 100
Click-Screen $taskClickX $taskClickY
Start-Sleep -Milliseconds 400
Capture-Screen "02-task-detail.png"

# Close detail panel
Send-Key([Win]::VK_ESCAPE)
Start-Sleep -Milliseconds 200

# 03 - Sticky Wall view
Write-Output "[03] Sticky Wall view"
# Click view mode toggle button (PageTitle has a toggle button)
# The toggle button is in the header area, right side
# Window width ~1216, the toggle is around x=windowRight-200
$toggleX = $r.Right - 180
$toggleY = $r.Top + 25
Click-Screen $toggleX $toggleY
Start-Sleep -Milliseconds 500
Capture-Screen "03-sticky-wall.png"

# Click again for unified view
Click-Screen $toggleX $toggleY
Start-Sleep -Milliseconds 500

# 04 - Unified view
Write-Output "[04] Unified view"
# Click a task in the unified left panel
$unifiedX = $r.Left + 280
$unifiedY = $r.Top + 120
Click-Screen $unifiedX $unifiedY
Start-Sleep -Milliseconds 400
Capture-Screen "04-unified-view.png"

# Switch back to list view
Click-Screen $toggleX $toggleY
Start-Sleep -Milliseconds 500

# 05 - Calendar view
Write-Output "[05] Calendar month view"
Click-SidebarItem 2  # 日历
Start-Sleep -Milliseconds 400
Capture-Screen "05-calendar-month.png"

# 06 - Four Quadrants (Matrix)
Write-Output "[06] Matrix view"
Click-SidebarItem 3  # 四象限
Start-Sleep -Milliseconds 400
Capture-Screen "06-matrix.png"

Write-Output ""
Write-Output "=== Capturing P1 Screenshots ==="

# 07 - Kanban
Write-Output "[07] Kanban view"
Click-SidebarItem 4  # 看板
Start-Sleep -Milliseconds 400
Capture-Screen "07-kanban.png"

# 08 - My Day
Write-Output "[08] My Day page"
Click-SidebarItem 1  # 我的一天
Start-Sleep -Milliseconds 400
Capture-Screen "08-myday.png"

# 09 - Habits
Write-Output "[09] Habits page"
Click-SidebarItem 5  # 习惯追踪
Start-Sleep -Milliseconds 400
Capture-Screen "09-habits.png"

# 10 - Dashboard
Write-Output "[10] Dashboard"
Click-SidebarItem 6  # 数据面板
Start-Sleep -Milliseconds 400
Capture-Screen "10-dashboard.png"

# 11 - Command palette
Write-Output "[11] Command palette"
Click-SidebarItem 0  # Back to all tasks
Start-Sleep -Milliseconds 300
Send-Key([Win]::VK_OEM_2)  # ? key
Start-Sleep -Milliseconds 500
Capture-Screen "11-command-palette.png"
Send-Key([Win]::VK_ESCAPE)

# 12 - Dark theme
Write-Output "[12] Dark theme"
Send-Key([Win]::VK_OEM_2)  # Open palette
Start-Sleep -Milliseconds 300
# Type "dark" and press enter - could use SendKey for characters
# Actually let me try cycling theme: click theme button in header
# Theme button is the leftmost button in header
$themeBtnX = $r.Left + 75
$themeBtnY = $r.Top + 25
# Click 2 times to get to dark theme (from light: 1=dark, 2=system, 3=glass, 4=warm, 5=lumina)
Click-Screen $themeBtnX $themeBtnY
Start-Sleep -Milliseconds 300
Send-Key([Win]::VK_ESCAPE)
Start-Sleep -Milliseconds 200
Capture-Screen "12-dark-theme.png"

Write-Output ""
Write-Output "=== Capturing P2 Screenshots ==="

# Switch back to light
Click-Screen $themeBtnX $themeBtnY
Start-Sleep -Milliseconds 200
Click-Screen $themeBtnX $themeBtnY
Start-Sleep -Milliseconds 200
Click-Screen $themeBtnX $themeBtnY
Start-Sleep -Milliseconds 200
Click-Screen $themeBtnX $themeBtnY
Start-Sleep -Milliseconds 200
Click-Screen $themeBtnX $themeBtnY
Start-Sleep -Milliseconds 200

# 13 - Search
Write-Output "[13] Global search"
Click-SidebarItem 0  # All tasks
Start-Sleep -Milliseconds 300
Send-CtrlKey([Win]::VK_K)  # Ctrl+K for search
Start-Sleep -Milliseconds 400
Capture-Screen "13-search.png"
Send-Key([Win]::VK_ESCAPE)
Start-Sleep -Milliseconds 200

# 14 - Quick add task
Write-Output "[14] Quick add task"
Send-Key([Win]::VK_N)  # N for new task
Start-Sleep -Milliseconds 400
Capture-Screen "14-quick-add.png"
Send-Key([Win]::VK_ESCAPE)
Start-Sleep -Milliseconds 200

# 15 - Settings
Write-Output "[15] Settings page"
Send-Key([Win]::VK_3)  # 3 = Settings
Start-Sleep -Milliseconds 400
Capture-Screen "15-settings.png"

Write-Output ""
Write-Output "=== Done! ==="
Write-Output "Screenshots saved to: $OutputDir"
Get-ChildItem $OutputDir -Filter "*.png" | ForEach-Object { Write-Output "  $($_.Name) ($([math]::Round($_.Length/1KB,1)) KB)" }
