param(
  [switch] $NoOpen
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

function Get-ScriptFolder {
  if ($PSScriptRoot) {
    return (Resolve-Path -LiteralPath $PSScriptRoot).Path
  }
  return (Resolve-Path -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
}

function Get-XmlEscaped {
  param([string] $Value)
  return [System.Security.SecurityElement]::Escape($Value)
}

function Read-ZipEntryText {
  param(
    [Parameter(Mandatory = $true)] $Zip,
    [Parameter(Mandatory = $true)] [string] $EntryName
  )
  $entry = $Zip.GetEntry($EntryName)
  if ($null -eq $entry) {
    return $null
  }
  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Write-ZipEntryText {
  param(
    [Parameter(Mandatory = $true)] $Zip,
    [Parameter(Mandatory = $true)] [string] $EntryName,
    [Parameter(Mandatory = $true)] [string] $Text
  )
  $oldEntry = $Zip.GetEntry($EntryName)
  if ($null -ne $oldEntry) {
    $oldEntry.Delete()
  }
  $entry = $Zip.CreateEntry($EntryName)
  $writer = New-Object System.IO.StreamWriter($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    $writer.Write($Text)
  } finally {
    $writer.Dispose()
  }
}

function Test-WorkbookHasContainerExternalLink {
  param([Parameter(Mandatory = $true)] [string] $WorkbookPath)
  $zip = $null
  try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($WorkbookPath)
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -notmatch '^xl/externalLinks/_rels/externalLink\d+\.xml\.rels$') {
        continue
      }
      $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
      try {
        if ($reader.ReadToEnd() -match '___\d{14}\.xlsx') {
          return $true
        }
      } finally {
        $reader.Dispose()
      }
    }
    return $false
  } catch {
    return $false
  } finally {
    if ($null -ne $zip) {
      $zip.Dispose()
    }
  }
}

function Get-LatestContainerWorkbook {
  param([Parameter(Mandatory = $true)] [string] $Folder)
  $candidates = @()
  foreach ($file in Get-ChildItem -LiteralPath $Folder -Filter '*.xlsx' -File) {
    if ($file.Name.StartsWith('~$')) {
      continue
    }
    if ($file.BaseName -match '___(\d{14})$') {
      $candidates += [pscustomobject]@{
        File = $file
        Stamp = [int64]$Matches[1]
      }
    }
  }
  if ($candidates.Count -eq 0) {
    throw 'No source workbook was found. Put a container workbook named like ___YYYYMMDDHHMMSS.xlsx in this folder.'
  }
  return ($candidates | Sort-Object Stamp -Descending | Select-Object -First 1).File
}

function Get-OutputWorkbook {
  param([Parameter(Mandatory = $true)] [string] $Folder)
  $candidates = @()
  foreach ($file in Get-ChildItem -LiteralPath $Folder -Filter '*.xlsx' -File) {
    if ($file.Name.StartsWith('~$')) {
      continue
    }
    if ($file.BaseName -match '___\d{14}$') {
      continue
    }
    if (Test-WorkbookHasContainerExternalLink -WorkbookPath $file.FullName) {
      $candidates += $file
    }
  }
  if ($candidates.Count -eq 0) {
    throw 'No GLAPS output workbook was found. Keep the GLAPS output xlsx in the same folder as this BAT file.'
  }
  return $candidates | Sort-Object -Property LastWriteTime, Length -Descending | Select-Object -First 1
}

function Remove-AbsoluteExternalLinkArtifacts {
  param(
    [Parameter(Mandatory = $true)] [string] $WorkbookPath,
    [Parameter(Mandatory = $true)] [string] $SourceFileName
  )
  $zip = [System.IO.Compression.ZipFile]::Open($WorkbookPath, [System.IO.Compression.ZipArchiveMode]::Update)
  try {
    $workbookXml = Read-ZipEntryText -Zip $zip -EntryName 'xl/workbook.xml'
    if ($null -ne $workbookXml) {
      $workbookXml = [regex]::Replace(
        $workbookXml,
        '(?s)<mc:AlternateContent\b.*?<x15ac:absPath\b.*?</mc:AlternateContent>',
        ''
      )
      $workbookXml = $workbookXml -replace '\s+xmlns:x15ac="http://schemas\.microsoft\.com/office/spreadsheetml/2010/11/ac"', ''
      Write-ZipEntryText -Zip $zip -EntryName 'xl/workbook.xml' -Text $workbookXml
    }

    $externalLinks = @($zip.Entries | Where-Object { $_.FullName -match '^xl/externalLinks/externalLink\d+\.xml$' })
    foreach ($entry in $externalLinks) {
      $externalLinkPath = $entry.FullName
      $relsPath = $externalLinkPath -replace '^xl/externalLinks/', 'xl/externalLinks/_rels/'
      $relsPath = "$relsPath.rels"

      $externalLinkXml = Read-ZipEntryText -Zip $zip -EntryName $externalLinkPath
      if ($null -ne $externalLinkXml) {
        $externalLinkXml = [regex]::Replace($externalLinkXml, '(?s)<xxl21:alternateUrls>.*?</xxl21:alternateUrls>', '')
        Write-ZipEntryText -Zip $zip -EntryName $externalLinkPath -Text $externalLinkXml
      }

      $relsXml = Read-ZipEntryText -Zip $zip -EntryName $relsPath
      if ($null -eq $relsXml) {
        continue
      }
      $relsXml = [regex]::Replace(
        $relsXml,
        '<Relationship\b(?=[^>]*\bType="http://schemas\.openxmlformats\.org/officeDocument/2006/relationships/externalLinkPath")(?=[^>]*\bTarget="file:///[^"]*")[^>]*/>',
        ''
      )

      $escapedFileName = [regex]::Escape($SourceFileName)
      if ($relsXml -notmatch "Target=`"$escapedFileName`"") {
        $xmlFileName = Get-XmlEscaped -Value $SourceFileName
        $relsXml = [regex]::Replace(
          $relsXml,
          '(<Relationship\b(?=[^>]*\bType="http://schemas\.openxmlformats\.org/officeDocument/2006/relationships/externalLinkPath")[^>]*\bTarget=")[^"]*("[^>]*/>)',
          "`${1}$xmlFileName`${2}",
          1
        )
      }
      Write-ZipEntryText -Zip $zip -EntryName $relsPath -Text $relsXml
    }
  } finally {
    $zip.Dispose()
  }
}

$folder = Get-ScriptFolder
$sourceWorkbook = Get-LatestContainerWorkbook -Folder $folder
$outputWorkbook = Get-OutputWorkbook -Folder $folder

Write-Host "[GLAPS] Source: $($sourceWorkbook.Name)"
Write-Host "[GLAPS] Output: $($outputWorkbook.Name)"

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.EnableEvents = $false

  $workbook = $excel.Workbooks.Open($outputWorkbook.FullName, 0, $false)
  if ($workbook.ReadOnly) {
    throw 'Output workbook is read-only. Close the output workbook and run again.'
  }

  $changed = $false
  $links = @()
  try {
    $rawLinks = $workbook.LinkSources(1)
    if ($null -ne $rawLinks) {
      foreach ($link in $rawLinks) {
        $links += [string]$link
      }
    }
  } catch {}

  foreach ($link in $links) {
    $linkName = Split-Path -Leaf $link
    if ($linkName -match '___\d{14}\.xlsx$') {
      if ($linkName -ne $sourceWorkbook.Name) {
        $workbook.ChangeLink($link, $sourceWorkbook.FullName, 1)
        $changed = $true
      }
    }
  }

  try { $workbook.ForceFullCalculation = $true } catch {}
  try { $workbook.FullCalculationOnLoad = $true } catch {}
  try { $excel.Calculation = -4105 } catch {}
  $excel.CalculateFullRebuild()
  $workbook.Save()
  $workbook.Close($true)
  $workbook = $null

  Remove-AbsoluteExternalLinkArtifacts -WorkbookPath $outputWorkbook.FullName -SourceFileName $sourceWorkbook.Name

  Write-Host "[GLAPS] Updated link: $($sourceWorkbook.Name)"
  if (-not $NoOpen) {
    Start-Process -FilePath $outputWorkbook.FullName
  }
} finally {
  if ($null -ne $workbook) {
    try { $workbook.Close($false) } catch {}
  }
  if ($null -ne $excel) {
    try { $excel.Quit() } catch {}
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
