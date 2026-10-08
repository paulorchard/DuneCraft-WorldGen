<#
.SYNOPSIS
    Turns an existing Hytale save into the Arrakis showcase world.

.DESCRIPTION
    The Create World screen cannot choose a world structure, so:
      1. Create a new world in the game with the Arrakis mod enabled, then exit to the main menu.
      2. Run this script with that world's name.
      3. Load the world again.

    The script points the world's generator at the Arrakis_Showcase world structure, deletes the chunks that were
    already generated, and deletes the saved player positions so you spawn at the showcase spawn point.
    Only use it on a world made for this purpose: everything built in that world is lost.

.EXAMPLE
    .\tools\showcase\Use-Showcase.ps1 -WorldName "Showcase"
#>
param(
    [Parameter(Mandatory = $true)][string]$WorldName,
    [string]$WorldStructure = "Arrakis_Showcase"
)

$ErrorActionPreference = "Stop"
$save = Join-Path $env:APPDATA "Hytale\UserData\Saves\$WorldName"
$world = Join-Path $save "universe\worlds\default"
$configPath = Join-Path $world "config.json"
if (-not (Test-Path $configPath)) { throw "No world config at $configPath. Create the world in the game first, then exit to the main menu." }

$config = Get-Content $configPath -Raw | ConvertFrom-Json
if ($config.WorldGen.Type -ne "Arrakis") { throw "World '$WorldName' uses generator '$($config.WorldGen.Type)', not 'Arrakis'. Create it with the Arrakis mod enabled." }
$config.WorldGen | Add-Member -NotePropertyName WorldStructure -NotePropertyValue $WorldStructure -Force
$json = $config | ConvertTo-Json -Depth 50
[System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))

$chunks = Join-Path $world "chunks"
$removed = 0
if (Test-Path $chunks) { $files = Get-ChildItem $chunks -File; $removed = $files.Count; $files | Remove-Item -Force -Confirm:$false }
$players = Join-Path $save "universe\players"
if (Test-Path $players) { Get-ChildItem $players -File | Remove-Item -Force -Confirm:$false }

Write-Host "World '$WorldName' now uses world structure '$WorldStructure'."
Write-Host "Removed $removed chunk file(s) and the saved player positions. Load the world to see the showcase."
