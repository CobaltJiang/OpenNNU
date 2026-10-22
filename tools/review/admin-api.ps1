param(
  [Parameter(Mandatory = $true)][ValidateSet('pending', 'file', 'reject')][string]$Mode,
  [string]$Id,
  [int]$Index = 0,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
# 重定向到管道时 PowerShell 默认用系统 ANSI 代码页，会让调用方拿到乱码。
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location 'C:\Users\谷晚钟\Documents\ChatGPT\OpenNNU'
$s = Import-Clixml '.local/upload-admin.xml'
$key = [Net.NetworkCredential]::new('', $s).Password
$h = @{ Authorization = "Bearer $key" }
$service = (Get-Content data/site.json -Raw | ConvertFrom-Json).uploadService.TrimEnd('/')
$result = switch ($Mode) {
  'pending' { Invoke-RestMethod -Uri "$service/api/admin/pending" -Headers $h -TimeoutSec 60 }
  'file' { Invoke-WebRequest -Uri "$service/api/admin/$Id/$Index" -Headers $h -OutFile $OutFile -TimeoutSec 180; @{ ok = $true } }
  'reject' { Invoke-RestMethod -Uri "$service/api/admin/$Id" -Method POST -Headers $h -ContentType 'application/json' -Body '{"state":"rejected"}' -TimeoutSec 60 }
}
# 始终输出合法 JSON：空队列在管道里会一行都不打印。
ConvertTo-Json -InputObject @($result) -Depth 8 -Compress
