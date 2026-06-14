# TodoFlow Screenshot Capture Script
# Captures the TodoFlow application window (or full screen as fallback)
param(
    [string]$OutputPath = "$PSScriptRoot\..\docs\images",
    [string]$FileName = "screenshot.png",
    [switch]$FullScreen,
    [int]$DelaySeconds = 0
)

# Load required assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# P/Invoke signatures for window enumeration
$winApiSig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class WinApi {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    public const uint GW_OWNER = 4;
    public const int SW_RESTORE = 9;
    public const int SW_SHOW = 5;

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }

    public static List<IntPtr> FindWindowsByTitle(string partialTitle) {
        var results = new List<IntPtr>();
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString().ToLower();
                if (title.Contains(partialTitle.ToLower())) {
                    results.Add(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);
        return results;
    }
}
'@
Add-Type -TypeDefinition $winApiSig -ReferencedAssemblies "System.Drawing"

# Ensure output directory exists
New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

if ($DelaySeconds -gt 0) {
    Start-Sleep -Seconds $DelaySeconds
}

$outputFile = Join-Path $OutputPath $FileName

if ($FullScreen) {
    # Full screen capture using CopyFromScreen (reliable for all content)
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $screen.Bounds.Size)
    $bitmap.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Output "Full screen saved: $outputFile"
} else {
    # Find TodoFlow window - try exact title, then fuzzy match
    $hWnd = [WinApi]::FindWindow($null, "TodoFlow")

    if ($hWnd -eq [IntPtr]::Zero) {
        $found = [WinApi]::FindWindowsByTitle("todo")
        if ($found.Count -gt 0) {
            # Pick the first one, excluding windows with owner (tooltips etc)
            foreach ($w in $found) {
                $owner = [WinApi]::GetWindow($w, [WinApi]::GW_OWNER)
                if ($owner -eq [IntPtr]::Zero) {
                    $hWnd = $w
                    break
                }
            }
            if ($hWnd -eq [IntPtr]::Zero) { $hWnd = $found[0] }
        }
    }

    # Capture: full screen then crop (more reliable than BitBlt for GPU-rendered windows)
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $fullBitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($fullBitmap)
    $g.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $screen.Bounds.Size)
    $g.Dispose()

    if ($hWnd -ne [IntPtr]::Zero) {
        # Bring window to front before capture
        if ([WinApi]::IsIconic($hWnd)) {
            [WinApi]::ShowWindow($hWnd, [WinApi]::SW_RESTORE) | Out-Null
        }
        [WinApi]::SetForegroundWindow($hWnd) | Out-Null
        Start-Sleep -Milliseconds 500
    }

    # If we have a window handle, crop to it
    if ($hWnd -ne [IntPtr]::Zero) {
        $rect = New-Object WinApi+RECT
        if ([WinApi]::GetWindowRect($hWnd, [ref]$rect)) {
            $x = [Math]::Max(0, $rect.Left)
            $y = [Math]::Max(0, $rect.Top)
            $w = [Math]::Min($rect.Right - $rect.Left, $fullBitmap.Width - $x)
            $h = [Math]::Min($rect.Bottom - $rect.Top, $fullBitmap.Height - $y)

            if ($w -gt 0 -and $h -gt 0) {
                $cropped = New-Object System.Drawing.Bitmap($w, $h)
                $cg = [System.Drawing.Graphics]::FromImage($cropped)
                $cg.DrawImage($fullBitmap, 0, 0, (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
                $cg.Dispose()
                $fullBitmap.Dispose()
                $fullBitmap = $cropped
            }
        }
    }

    # Resize if too large (max 1400px wide for wiki readability)
    if ($fullBitmap.Width -gt 1400) {
        $ratio = 1400 / $fullBitmap.Width
        $newW = 1400
        $newH = [int]($fullBitmap.Height * $ratio)
        $resized = New-Object System.Drawing.Bitmap($newW, $newH)
        $rg = [System.Drawing.Graphics]::FromImage($resized)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($fullBitmap, 0, 0, $newW, $newH)
        $rg.Dispose()
        $fullBitmap.Dispose()
        $fullBitmap = $resized
    }

    $fullBitmap.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $fullBitmap.Dispose()
    Write-Output "Screenshot saved: $outputFile ($($([System.Drawing.Image]::FromFile($outputFile)).Width)x$($([System.Drawing.Image]::FromFile($outputFile)).Height))"
}
