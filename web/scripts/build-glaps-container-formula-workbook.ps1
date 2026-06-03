param(
  [Parameter(Mandatory = $true)] [string] $ReferencePath,
  [Parameter(Mandatory = $true)] [string] $SourceDataPath,
  [Parameter(Mandatory = $true)] [string] $OutputPath,
  [Parameter(Mandatory = $true)] [string] $PlanPath
)

$ErrorActionPreference = 'Stop'

function Convert-ToComMatrix {
  param(
    [Parameter(Mandatory = $true)] $Rows,
    [Parameter(Mandatory = $true)] [int] $RowCount,
    [Parameter(Mandatory = $true)] [int] $ColCount
  )

  $matrix = New-Object 'object[,]' $RowCount, $ColCount
  for ($r = 0; $r -lt $RowCount; $r++) {
    $row = $Rows[$r]
    for ($c = 0; $c -lt $ColCount; $c++) {
      $matrix[$r, $c] = if ($null -eq $row[$c]) { $null } else { $row[$c] }
    }
  }
  return ,$matrix
}

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw '이 스크립트는 한글 경로/시트명 보존을 위해 PowerShell 7 이상(pwsh)에서 실행해야 합니다.'
}

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}
Copy-Item -LiteralPath $ReferencePath -Destination $OutputPath -Force

$excel = $null
$workbook = $null
$sourceWorkbook = $null

try {
  $plan = Get-Content -LiteralPath $PlanPath -Encoding UTF8 -Raw | ConvertFrom-Json
  $sourceMatrix = Convert-ToComMatrix -Rows $plan.sourceMatrix -RowCount $plan.sourceRows -ColCount $plan.sourceCols
  $helperMatrix = Convert-ToComMatrix -Rows $plan.helperMatrix -RowCount $plan.helperRows -ColCount $plan.helperCols
  $elsMatrix = Convert-ToComMatrix -Rows $plan.elsMatrix -RowCount $plan.elsRows -ColCount $plan.elsCols

  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.EnableEvents = $false
  try { $excel.Calculation = -4105 } catch {}

  $workbook = $excel.Workbooks.Open($OutputPath)

  foreach ($sheetName in @('GLAPS자동계산', 'GLAPS컨테이너배차관리')) {
    try {
      $workbook.Worksheets.Item($sheetName).Delete()
    } catch {
      # 기준 양식에 없으면 무시한다.
    }
  }

  $elsSheet = $workbook.Worksheets.Item('ELS')
  $missing = [System.Type]::Missing
  $copiedSourceSheet = $workbook.Worksheets.Add($missing, $elsSheet)
  $copiedSourceSheet.Name = 'GLAPS컨테이너배차관리'
  $copiedSourceSheet.Range($plan.sourceRange).Value2 = $sourceMatrix
  $copiedSourceSheet.Rows.Item(1).Font.Bold = $true
  $copiedSourceSheet.Range($plan.sourceAutoFilterRange).AutoFilter() | Out-Null
  foreach ($format in $plan.sourceColumnFormats) {
    $copiedSourceSheet.Columns.Item([int]$format.col).NumberFormat = [string]$format.numberFormat
  }
  $copiedSourceSheet.Columns.AutoFit() | Out-Null
  try {
    $copiedSourceSheet.Activate()
    $excel.ActiveWindow.SplitRow = 1
    $excel.ActiveWindow.FreezePanes = $true
  } catch {}

  $helperSheet = $workbook.Worksheets.Add($missing, $copiedSourceSheet)
  $helperSheet.Name = 'GLAPS자동계산'

  $lastUsedRow = $elsSheet.UsedRange.Row + $elsSheet.UsedRange.Rows.Count - 1
  if ($lastUsedRow -lt 202) { $lastUsedRow = 202 }
  $elsSheet.Range("B3:CL$lastUsedRow").ClearContents()

  $helperSheet.Range($plan.helperRange).Formula = $helperMatrix
  $elsSheet.Range($plan.elsRange).Formula = $elsMatrix

  $helperSheet.Rows.Item(1).Font.Bold = $true
  $helperSheet.Range('A1:AB1').AutoFilter() | Out-Null
  $helperSheet.Columns.AutoFit() | Out-Null

  try { $workbook.ForceFullCalculation = $true } catch {}
  try { $workbook.FullCalculationOnLoad = $true } catch {}
  try { $excel.Calculation = -4105 } catch {}
  $excel.CalculateFullRebuild()
  $workbook.Save()

  $containerCount = 0
  $dataSheet = $workbook.Worksheets.Item('GLAPS컨테이너배차관리')
  $lastSourceRow = $dataSheet.UsedRange.Row + $dataSheet.UsedRange.Rows.Count - 1
  $containerColumnNumber = [int]$plan.containerColumnNumber
  for ($r = 2; $r -le $lastSourceRow; $r++) {
    $container = $dataSheet.Cells.Item($r, $containerColumnNumber).Text
    if (-not [string]::IsNullOrWhiteSpace($container)) {
      $containerCount++
    }
  }

  [ordered]@{
    outputPath = $OutputPath
    sourceRows = $lastSourceRow
    sourceContainerRows = $containerCount
    helperB2 = $helperSheet.Range('B2').Formula
    elsB3 = $elsSheet.Range('B3').Formula
    elsT3Text = $elsSheet.Range('T3').Text
  } | ConvertTo-Json -Depth 4
} finally {
  if ($sourceWorkbook -ne $null) {
    try { $sourceWorkbook.Close($false) } catch {}
  }
  if ($workbook -ne $null) {
    try { $workbook.Close($true) } catch {}
  }
  if ($excel -ne $null) {
    try { $excel.Quit() } catch {}
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
