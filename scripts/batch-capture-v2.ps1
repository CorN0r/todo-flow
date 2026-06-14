# Batch capture all TodoFlow screenshots - Lumina theme + theme comparisons
param([string]$OutputDir = "$PSScriptRoot\..\docs\images")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }
public class W {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, IntPtr e);
    public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
    public const uint KEYUP = 0x0002;
    public const byte VK_ESCAPE = 0x1B, VK_RETURN = 0x0D, VK_N = 0x4E, VK_3 = 0x33;
    public const byte VK_CONTROL = 0x11, VK_B = 0x42, VK_K = 0x4B, VK_OEM_2 = 0xBF;
}
"@

function Get-TFWindow {
    $p = Get-Process -Name "todo-flow" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "TodoFlow" } | Select-Object -First 1
    if (-not $p) { return $null }
    $h = $p.MainWindowHandle
    if ($h -eq [IntPtr]::Zero) { $p.Refresh(); $h = $p.MainWindowHandle; if ($h -eq [IntPtr]::Zero) { return $null } }
    [W]::SetForegroundWindow($h) | Out-Null
    Start-Sleep -Milliseconds 250
    return $h
}

function Send-Key([byte]$vk) {
    [W]::keybd_event($vk, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [W]::keybd_event($vk, 0, [W]::KEYUP, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 40
}

function Send-Ctrl([byte]$vk) {
    [W]::keybd_event([W]::VK_CONTROL, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 30
    [W]::keybd_event($vk, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 40
    [W]::keybd_event($vk, 0, [W]::KEYUP, [IntPtr]::Zero); Start-Sleep -Milliseconds 30
    [W]::keybd_event([W]::VK_CONTROL, 0, [W]::KEYUP, [IntPtr]::Zero); Start-Sleep -Milliseconds 40
}

function Click([int]$x, [int]$y, [int]$delayMs = 500) {
    [W]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 40
    [W]::mouse_event([W]::LEFTDOWN, 0, 0, 0, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds 30
    [W]::mouse_event([W]::LEFTUP, 0, 0, 0, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds $delayMs
}

function Click-Theme {
    $r = New-Object RECT; [W]::GetWindowRect((Get-TFWindow), [ref]$r) | Out-Null
    Click ($r.Left + 40) ($r.Top + 25) 400
}

function Click-SidebarItem([int]$index) {
    $h = Get-TFWindow; if ($h -eq $null) { return }
    $r = New-Object RECT; [W]::GetWindowRect($h, [ref]$r) | Out-Null
    Click ($r.Left + 120) ($r.Top + 83 + $index * 40) 400
}

function Click-ViewToggle {
    $r = New-Object RECT; [W]::GetWindowRect((Get-TFWindow), [ref]$r) | Out-Null
    Click ($r.Right - 180) ($r.Top + 25) 500
}

function Capture([string]$filename) {
    $h = Get-TFWindow
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $full = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($full)
    $g.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $screen.Bounds.Size)
    $g.Dispose()

    if ($h -ne $null) {
        $rect = New-Object RECT
        if ([W]::GetWindowRect($h, [ref]$rect)) {
            $x = [Math]::Max(0, $rect.Left); $y = [Math]::Max(0, $rect.Top)
            $w = [Math]::Min($rect.Right - $rect.Left, $full.Width - $x)
            $h2 = [Math]::Min($rect.Bottom - $rect.Top, $full.Height - $y)
            if ($w -gt 0 -and $h2 -gt 0) {
                $crop = New-Object System.Drawing.Bitmap($w, $h2)
                $cg = [System.Drawing.Graphics]::FromImage($crop)
                $cg.DrawImage($full, 0, 0, (New-Object System.Drawing.Rectangle($x, $y, $w, $h2)), [System.Drawing.GraphicsUnit]::Pixel)
                $cg.Dispose(); $full.Dispose(); $full = $crop
            }
        }
    }
    if ($full.Width -gt 1400) {
        $ratio = 1400 / $full.Width; $nw = 1400; $nh = [int]($full.Height * $ratio)
        $rz = New-Object System.Drawing.Bitmap($nw, $nh)
        $rg = [System.Drawing.Graphics]::FromImage($rz)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($full, 0, 0, $nw, $nh); $rg.Dispose(); $full.Dispose(); $full = $rz
    }
    $out = Join-Path $OutputDir $filename
    $full.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $full.Dispose()
    Write-Output "  $filename ($([math]::Round((Get-Item $out).Length/1KB,1)) KB)"
}

# =============================================
# Start: verify window and switch to Lumina
# =============================================
$h = Get-TFWindow
if ($h -eq $null) { Write-Output "ERROR: TodoFlow not found"; exit 1 }
Write-Output "=== Setting up Lumina theme ==="
# Default is Light. Click 5x to reach Lumina (Light→Dark→System→Glass→Warm→Lumina)
for ($i = 0; $i -lt 5; $i++) { Click-Theme }
Write-Output "Theme: Lumina"

# =============================================
# PART 1: All feature screenshots in Lumina
# =============================================
Write-Output "`n=== Part 1: Feature screenshots (Lumina) ==="

# Navigate to All Tasks, ensure sidebar open, ensure list view
Click-SidebarItem 0; Start-Sleep -Milliseconds 300

# 01 - Main overview (list view, all tasks)
Write-Output "[01] Main overview"
Capture "01-main-overview.png"

# Click first task for detail panel
$r = New-Object RECT; [W]::GetWindowRect($h, [ref]$r) | Out-Null
Click ($r.Left + 330) ($r.Top + 120)
Write-Output "[02] Task detail panel"
Capture "02-task-detail.png"
Send-Key([W]::VK_ESCAPE); Start-Sleep -Milliseconds 300

# 03 - List view (already in list view, show more clearly)
Write-Output "[03] List view"
Capture "03-list-view.png"

# 04 - Sticky wall view (click view toggle once from list)
Click-ViewToggle
Write-Output "[04] Sticky wall view"
Capture "04-sticky-wall.png"

# 05 - Unified view (click view toggle again)
Click-ViewToggle
Write-Output "[05] Unified view"
# Click a task in left panel to show selection
Click ($r.Left + 330) ($r.Top + 140)
Capture "05-unified-view.png"

# Back to list view
Click-ViewToggle

# 06 - Calendar
Click-SidebarItem 2
Start-Sleep -Milliseconds 300
Write-Output "[06] Calendar"
Capture "06-calendar-month.png"

# 07 - Matrix
Click-SidebarItem 3
Start-Sleep -Milliseconds 300
Write-Output "[07] Matrix"
Capture "07-matrix.png"

# 08 - Kanban
Click-SidebarItem 4
Start-Sleep -Milliseconds 300
Write-Output "[08] Kanban"
Capture "08-kanban.png"

# 09 - My Day
Click-SidebarItem 1
Start-Sleep -Milliseconds 300
Write-Output "[09] My Day"
Capture "09-myday.png"

# 10 - Habits
Click-SidebarItem 5
Start-Sleep -Milliseconds 300
Write-Output "[10] Habits"
Capture "10-habits.png"

# 11 - Dashboard
Click-SidebarItem 6
Start-Sleep -Milliseconds 300
Write-Output "[11] Dashboard"
Capture "11-dashboard.png"

# 12 - Command palette
Click-SidebarItem 0; Start-Sleep -Milliseconds 300
Send-Key([W]::VK_OEM_2); Start-Sleep -Milliseconds 400
Write-Output "[12] Command palette"
Capture "12-command-palette.png"
Send-Key([W]::VK_ESCAPE); Start-Sleep -Milliseconds 300

# 13 - Search (Ctrl+K)
Send-Ctrl([W]::VK_K); Start-Sleep -Milliseconds 400
Write-Output "[13] Search"
Capture "13-search.png"
Send-Key([W]::VK_ESCAPE); Start-Sleep -Milliseconds 300

# 14 - Quick add (N key)
Send-Key([W]::VK_N); Start-Sleep -Milliseconds 400
Write-Output "[14] Quick add"
Capture "14-quick-add.png"
Send-Key([W]::VK_ESCAPE); Start-Sleep -Milliseconds 300

# 15 - Settings (3 key)
Send-Key([W]::VK_3); Start-Sleep -Milliseconds 400
Write-Output "[15] Settings"
Capture "15-settings.png"

# =============================================
# PART 2: Theme comparison screenshots
# Cycle: Light→Dark→System→Glass→Warm→Lumina
# Currently: Lumina. Click 1x → Light
# =============================================
Write-Output "`n=== Part 2: Theme screenshots ==="

# Go to All Tasks page for consistent comparison
Click-SidebarItem 0; Start-Sleep -Milliseconds 300

# From Lumina → Light (1 click)
Click-Theme
Write-Output "[16] Light theme"
Capture "16-theme-light.png"

# Light → Dark (1 click)
Click-Theme
Write-Output "[17] Dark theme"
Capture "17-theme-dark.png"

# Dark → System (1 click, skip)
Click-Theme

# System → Glass (1 click)
Click-Theme
Write-Output "[18] Glass theme"
Capture "18-theme-glass.png"

# Glass → Warm (1 click)
Click-Theme
Write-Output "[19] Warm theme"
Capture "19-theme-warm.png"

# Warm → Lumina (1 click, back to Lumina)
Click-Theme
Write-Output "[20] Lumina theme"
Capture "20-theme-lumina.png"

Write-Output "`n=== All done! ==="
Get-ChildItem $OutputDir -Filter "*.png" | Sort-Object Name | ForEach-Object { Write-Output "  $($_.Name)" }
