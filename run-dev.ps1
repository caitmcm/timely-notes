#Requires -Version 7.0

<#
.SYNOPSIS
    Runs the TimelyNotes API and UI together on their default ports.

.DESCRIPTION
    Starts the ASP.NET Core API on http://localhost:5186 and the Vite dev server on
    http://localhost:5173, streaming the output of both into this console.

    The two projects are only wired together by Vite's /api proxy, which points at
    http://localhost:5186 — so the API port in particular has to be the default one for the UI to
    load any notes.

    Ctrl+C stops both. If either process exits on its own, the other is stopped too.

.PARAMETER ApiPort
    Port for the API. Defaults to 5186. Changing it breaks the UI's /api proxy unless
    timely-notes-ui/vite.config.ts is changed to match, so the script warns when you do.

.PARAMETER UiPort
    Port for the Vite dev server. Defaults to 5173. Vite is started with --strictPort, so the
    script fails loudly rather than silently drifting onto the next free port.

.PARAMETER OpenBrowser
    Open the UI in the default browser once both are listening.

.EXAMPLE
    .\run-dev.ps1

.EXAMPLE
    .\run-dev.ps1 -OpenBrowser
#>

[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int] $ApiPort = 5186,

    [ValidateRange(1, 65535)]
    [int] $UiPort = 5173,

    [switch] $OpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$backendDir = Join-Path $PSScriptRoot 'TimelyNotes.Backend'
$uiDir = Join-Path $PSScriptRoot 'timely-notes-ui'

# --- helpers ---------------------------------------------------------------

function Resolve-Tool {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $Hint
    )

    # -CommandType Application skips PowerShell's own .ps1 shims, so npm resolves to npm.cmd.
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $command) {
        throw "'$Name' was not found on PATH. $Hint"
    }

    return $command.Source
}

function Test-PortListening {
    param([Parameter(Mandatory)] [int] $Port)

    # This has to be address-family agnostic. Kestrel binds both 127.0.0.1 and ::1, but Vite binds
    # ::1 only, so an IPv4-only check never sees the dev server come up and the script hangs.
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        return [bool] (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    }

    foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)) {
        $client = $null

        try {
            $client = [System.Net.Sockets.TcpClient]::new($address.AddressFamily)

            if ($client.ConnectAsync($address, $Port).Wait(250) -and $client.Connected) {
                return $true
            }
        }
        catch {
            # Nothing on this address family; try the next one.
        }
        finally {
            if ($client) { $client.Dispose() }
        }
    }

    return $false
}

function Get-PortOwner {
    param([Parameter(Mandatory)] [int] $Port)

    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        return $null
    }

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $connection) {
        return $null
    }

    $owner = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue

    if ($owner) {
        return "$($owner.ProcessName) (PID $($owner.Id))"
    }

    return "PID $($connection.OwningProcess)"
}

function Assert-PortFree {
    param(
        [Parameter(Mandatory)] [int] $Port,
        [Parameter(Mandatory)] [string] $For
    )

    if (-not (Test-PortListening -Port $Port)) {
        return
    }

    $owner = Get-PortOwner -Port $Port
    $heldBy = if ($owner) { " It is held by $owner." } else { '' }

    throw "Port $Port is already in use, so the $For cannot start on it.$heldBy"
}

function Wait-ForPort {
    param(
        [Parameter(Mandatory)] [int] $Port,
        [Parameter(Mandatory)] [string] $For,
        [Parameter(Mandatory)] [System.Diagnostics.Process] $Process,
        [int] $TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            throw "The $For exited with code $($Process.ExitCode) before it started listening on port $Port."
        }

        if (Test-PortListening -Port $Port) {
            return
        }

        Start-Sleep -Milliseconds 300
    }

    throw "The $For did not start listening on port $Port within $TimeoutSeconds seconds."
}

function Stop-Tree {
    param(
        [System.Diagnostics.Process] $Process,
        [Parameter(Mandatory)] [string] $For
    )

    if (-not $Process -or $Process.HasExited) {
        return
    }

    Write-Host "Stopping the $For..." -ForegroundColor DarkGray

    # /T takes the whole tree: `npm` spawns node, and `dotnet run` spawns the built API.
    & taskkill.exe /PID $Process.Id /T /F *>&1 | Out-Null
}

# --- run -------------------------------------------------------------------

$api = $null
$ui = $null
$script:failed = $false

try {
    # Preflight. Anything wrong here is a setup problem the developer has to fix, so it is reported
    # as a plain message by the catch below rather than as a PowerShell exception trace.
    $dotnet = Resolve-Tool -Name 'dotnet' -Hint 'Install the .NET 10 SDK.'
    $npm = Resolve-Tool -Name 'npm' -Hint 'Install Node.js.'

    if ($ApiPort -ne 5186) {
        Write-Warning "The UI proxies /api to http://localhost:5186. Running the API on $ApiPort leaves the day view unable to load notes until timely-notes-ui/vite.config.ts is pointed at the new port."
    }

    Assert-PortFree -Port $ApiPort -For 'API'
    Assert-PortFree -Port $UiPort -For 'UI'

    if (-not (Test-Path (Join-Path $uiDir 'node_modules'))) {
        Write-Host 'Installing UI dependencies (first run only)...' -ForegroundColor Cyan

        & $npm 'install' '--prefix' $uiDir

        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    Write-Host "Starting the API on http://localhost:$ApiPort ..." -ForegroundColor Cyan

    # --urls after `--` reaches the app itself, which beats both launchSettings and the environment.
    $api = Start-Process -FilePath $dotnet -PassThru -NoNewWindow `
        -WorkingDirectory $backendDir `
        -ArgumentList @(
            'run'
            '--project', 'TimelyNotes.API'
            '--launch-profile', 'http'
            '--'
            '--urls', "http://localhost:$ApiPort"
        )

    Wait-ForPort -Port $ApiPort -For 'API' -Process $api

    Write-Host "Starting the UI on http://localhost:$UiPort ..." -ForegroundColor Cyan

    $ui = Start-Process -FilePath $npm -PassThru -NoNewWindow `
        -WorkingDirectory $uiDir `
        -ArgumentList @('run', 'dev', '--', '--port', $UiPort, '--strictPort')

    Wait-ForPort -Port $UiPort -For 'UI' -Process $ui

    Write-Host ''
    Write-Host "  UI       http://localhost:$UiPort" -ForegroundColor Green
    Write-Host "  API      http://localhost:$ApiPort" -ForegroundColor Green
    Write-Host "  Swagger  http://localhost:$ApiPort/swagger" -ForegroundColor Green
    Write-Host '  Press Ctrl+C to stop both.' -ForegroundColor DarkGray
    Write-Host ''

    if ($OpenBrowser) {
        Start-Process "http://localhost:$UiPort"
    }

    while (-not $api.HasExited -and -not $ui.HasExited) {
        Start-Sleep -Milliseconds 500
    }

    $first = if ($api.HasExited) { 'API' } else { 'UI' }
    Write-Warning "The $first stopped on its own, so the other is being shut down too."
}
catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    $script:failed = $true
}
finally {
    Stop-Tree -Process $ui -For 'UI'
    Stop-Tree -Process $api -For 'API'
}

if ($script:failed) {
    exit 1
}
