import { execSync } from "node:child_process";

// PowerShell script that uses UI Automation to read the address bar
// from the foreground browser window. Works with Chromium browsers and Firefox.
const PS_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

# Get foreground window handle
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$hwnd = [WinAPI]::GetForegroundWindow()
$pid = 0
[WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue

# Get browser name
$browserName = if ($proc) { $proc.ProcessName } else { "unknown" }

# Use UI Automation to find the address bar
$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)

# Chromium browsers: look for the address bar edit control
$editCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Edit
)

$edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCondition)

$url = ""
foreach ($edit in $edits) {
  $name = $edit.Current.Name
  # Chromium address bars are typically named "Address and search bar" or similar
  if ($name -match "address|URL|search bar|Address and search" -or $name -eq "") {
    $pattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($pattern) {
      $val = ([System.Windows.Automation.ValuePattern]$pattern).Current.Value
      if ($val -match "^https?://") {
        $url = $val
        break
      }
    }
  }
}

# Output as JSON
@{ browser = $browserName; url = $url } | ConvertTo-Json -Compress
`;

export function detectWindows() {
  try {
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command ${JSON.stringify(PS_SCRIPT)}`,
      { timeout: 10000 }
    )
      .toString()
      .trim();

    const data = JSON.parse(result);

    if (!data.url || !data.url.startsWith("http")) {
      throw new Error(
        `Could not read URL from ${data.browser || "browser"} address bar.\n` +
          `Try: --url <url>, --clipboard, or --serve`
      );
    }

    return { app: data.browser, url: data.url };
  } catch (err) {
    if (err.message.includes("Could not read URL")) throw err;
    throw new Error(
      `Windows browser detection failed: ${err.message}\n` +
        `Try: --url <url>, --clipboard, or --serve`
    );
  }
}
