param(
  [ValidateSet('List','Download','Publish','Reject')][string]$Mode='List',
  [string]$Id,
  [string]$CourseId,
  [string]$License,
  [ValidateSet('unverified','confirmed')][string]$PermissionState='unverified',
  [string]$Title,
  [string]$Source,
  [ValidateSet('原卷','回忆版','学生原创','教师授权','其他')][string]$Origin='其他',
  [ValidateSet('无答案','答案未核对','答案已校对','不适用')][string]$AnswerStatus='答案未核对'
)
$ErrorActionPreference='Stop'
# 输出被管道捕获时按 UTF-8 编码，避免本地工具收到乱码。
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)
$site=Get-Content data/site.json -Raw | ConvertFrom-Json
$service=$site.uploadService.TrimEnd('/')
$keyPath=Join-Path (Get-Location) '.local/upload-admin.xml'
if (!(Test-Path -LiteralPath $keyPath)) { throw '缺少本机加密的上传管理凭据，请由维护者配置；不要在聊天或公开仓库填写密钥。' }
$secure=Import-Clixml -LiteralPath $keyPath
$key=[Net.NetworkCredential]::new('', $secure).Password
$uploadHeaders=@{Authorization="Bearer $key"}
function Invoke-UploadApi([string]$Path,[string]$Method='GET',$Body=$null) {
  $options=@{Uri="$service/api/admin/$Path";Headers=$uploadHeaders;Method=$Method;TimeoutSec=120}
  if($null -ne $Body){$options.Body=[Text.Encoding]::UTF8.GetBytes(($Body|ConvertTo-Json -Compress));$options.ContentType='application/json'}
  Invoke-RestMethod @options
}
$pending=Invoke-UploadApi 'pending'
if(!$pending){$pending=@()}else{$pending=@($pending)}
if($Mode -eq 'List') { $pending | Select-Object id,@{n='课程';e={$_.metadata.course}},@{n='标题';e={$_.metadata.title}},@{n='文件数';e={$_.files.Count}} | Format-Table -AutoSize; return }
if($Id -notmatch '^[a-f0-9-]{36}$'){throw '请指定有效的投稿编号 -Id'}
$item=$pending | Where-Object id -eq $Id | Select-Object -First 1
if(!$item){throw '未找到待审核投稿'}
if($Mode -eq 'Reject'){ $null=Invoke-UploadApi $Id 'POST' @{state='rejected'}; Write-Output '已拒绝并清除待审文件。'; return }
$reviewDirectory=Join-Path (Get-Location) ".local/review/$Id"
$null=New-Item -ItemType Directory -Path $reviewDirectory -Force
for($index=0;$index -lt $item.files.Count;$index++) {
  $file=$item.files[$index]
  # Never trust remote filenames as local filesystem paths; previews use numbered names.
  $extension=[IO.Path]::GetExtension($file.name)
  if($extension -notmatch '^\.(pdf|docx|xlsx|pptx|zip|png|jpe?g|webp|txt|csv)$'){throw '文件格式无效'}
  Invoke-WebRequest -Uri "$service/api/admin/$Id/$index" -Headers $uploadHeaders -OutFile (Join-Path $reviewDirectory "$index$extension") -TimeoutSec 120
}
if($Mode -eq 'Download') { $item.metadata | Format-List; $item.files | Select-Object name,size | Format-Table; Write-Output "待审文件：$reviewDirectory（请勿运行或直接信任文件内容）"; return }
if(!$CourseId){throw '请指定 -CourseId'}
if($PermissionState -eq 'unverified'){$License='授权未核实'}
elseif(!$License -or $License -match '未获|待确认|不详|不明|未授权|未核实'){throw '明确授权状态需要填写实际许可'}
$courses=Get-Content data/courses.json -Raw | ConvertFrom-Json
if(!($courses | Where-Object id -eq $CourseId)){throw '课程编号不存在'}
$env:GIT_TERMINAL_PROMPT='0'; $env:GCM_INTERACTIVE='Never'
$pairs=@{}
"protocol=https`nhost=github.com`n`n" | git credential fill | ForEach-Object {$pair=$_.Split('=',2);if($pair.Length -eq 2){$pairs[$pair[0]]=$pair[1]}}
if(!$pairs.password){throw '本机 GitHub 登录不可用'}
$headers=@{Authorization="Bearer $($pairs.password)";Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28';'User-Agent'='OpenNNU-upload-review'}
function Invoke-GitHub([string]$Path,[string]$Method='GET',$Body=$null) {
  $apiArgs=@{Uri="https://api.github.com$Path";Headers=$headers;Method=$Method;TimeoutSec=120}
  if($null -ne $Body){$apiArgs.Body=[Text.Encoding]::UTF8.GetBytes(($Body|ConvertTo-Json -Depth 20 -Compress));$apiArgs.ContentType='application/json'}
  Invoke-RestMethod @apiArgs
}
$user=Invoke-GitHub '/user'
if($user.login -ne 'CobaltJiang'){throw '不是维护者 CobaltJiang 的账号，已停止'}
$repo='/repos/CobaltJiang/OpenNNU'
$head=Invoke-GitHub "$repo/git/ref/heads/main"
$commit=Invoke-GitHub "$repo/git/commits/$($head.object.sha)"
$indexFile=Invoke-GitHub "$repo/contents/data/resources.json`?ref=$($head.object.sha)"
$resources=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($indexFile.content)) | ConvertFrom-Json
if(!$resources){$resources=@()}else{$resources=@($resources)}
$already=@($resources | Where-Object submissionId -eq $Id)
if($already.Count){$null=Invoke-UploadApi $Id 'POST' @{state='imported';receipt=$head.object.sha}; Write-Output '此投稿已经收录，仅确认回执。';return}
$tree=@()
for($index=0;$index -lt $item.files.Count;$index++) {
  $file=$item.files[$index]; $extension=[IO.Path]::GetExtension($file.name).ToLowerInvariant()
  $localFile=Join-Path $reviewDirectory "$index$extension"
  $blob=Invoke-GitHub "$repo/git/blobs" 'POST' @{content=[Convert]::ToBase64String([IO.File]::ReadAllBytes($localFile));encoding='base64'}
  $path="courses/$CourseId/submissions/$Id/$index$extension"
  $tree+=@{path=$path;mode='100644';type='blob';sha=$blob.sha}
  # 维护者可改写公开展示的标题与来源：投稿原文里可能含可识别到具体个人的信息。
  $displayTitle=if($Title){$Title}else{"$($item.metadata.title) · $($file.name)"}
  $displaySource=if($Source){$Source}else{$item.metadata.source}
  $resources+=@{id="upload-$Id-$index";submissionId=$Id;courseId=$CourseId;title=$displayTitle;type=$item.metadata.type;year=$(if($item.metadata.year){$item.metadata.year}else{'年份待核'});source=$displaySource;license=$License;permission=$PermissionState;reviewStatus='approved';added=(Get-Date -Format 'yyyy-MM-dd');origin=$Origin;answerStatus=$AnswerStatus;url=$path}
}
$tree+=@{path='data/resources.json';mode='100644';type='blob';content=($resources|ConvertTo-Json -Depth 15 -AsArray)}
$newTree=Invoke-GitHub "$repo/git/trees" 'POST' @{base_tree=$commit.tree.sha;tree=$tree}
$newCommit=Invoke-GitHub "$repo/git/commits" 'POST' @{message="收录审核后的投稿 $Id";tree=$newTree.sha;parents=@($head.object.sha);author=@{name=$user.login;email="$($user.id)+$($user.login)@users.noreply.github.com"}}
# Non-forced update refuses concurrent changes. Pending files remain until successful commit.
$null=Invoke-GitHub "$repo/git/refs/heads/main" 'PATCH' @{sha=$newCommit.sha;force=$false}
$null=Invoke-UploadApi $Id 'POST' @{state='imported';receipt=$newCommit.sha}
Write-Output "已由 $($user.login) 收录：https://github.com/CobaltJiang/OpenNNU/commit/$($newCommit.sha)"
