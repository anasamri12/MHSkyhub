$ErrorActionPreference = 'Stop'

function Split-AppHtml {
    param(
        [string]$SourceFile,
        [string]$AppName,
        [string]$RootRedirectTarget
    )

    $sourcePath = Join-Path $PSScriptRoot "..\$SourceFile"
    $appRoot = Join-Path $PSScriptRoot "..\$AppName"
    $cssDir = Join-Path $appRoot "css"
    $jsDir = Join-Path $appRoot "js"
    $appIndex = Join-Path $appRoot "index.html"
    $cssPath = Join-Path $cssDir "main.css"
    $jsPath = Join-Path $jsDir "app.js"
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)

    New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $cssDir | Out-Null
    New-Item -ItemType Directory -Force -Path $jsDir | Out-Null

    $html = [System.IO.File]::ReadAllText($sourcePath, [System.Text.Encoding]::UTF8)

    $styleMatch = [regex]::Match($html, '<style>\s*(?<css>[\s\S]*?)\s*</style>')
    $scriptMatch = [regex]::Match($html, '<script>\s*(?<js>[\s\S]*?)\s*</script>')

    if (-not $styleMatch.Success) {
        throw "Could not find inline style block in $SourceFile"
    }

    if (-not $scriptMatch.Success) {
        throw "Could not find inline script block in $SourceFile"
    }

    $css = $styleMatch.Groups['css'].Value.Trim()
    $js = $scriptMatch.Groups['js'].Value.Trim()

    $css = $css `
        -replace "url\((['""]?)assets/", "url(`$1../../assets/" `
        -replace "url\((['""]?)\./assets/", "url(`$1../../assets/"

    $html = $html.Replace($styleMatch.Value, "  <link rel=`"stylesheet`" href=`"css/main.css`">")
    $html = $html.Replace($scriptMatch.Value, "  <script src=`"js/app.js`"></script>")
    $html = $html `
        -replace '((?:src|href)=["''])assets/', '$1../assets/' `
        -replace '((?:src|href)=["''])\./assets/', '$1../assets/'

    $redirectHtml = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=$RootRedirectTarget">
  <title>MHSkyhub Redirect</title>
  <link rel="canonical" href="$RootRedirectTarget">
</head>
<body>
  <p>Redirecting to <a href="$RootRedirectTarget">$RootRedirectTarget</a>...</p>
</body>
</html>
"@

    [System.IO.File]::WriteAllText($cssPath, $css + [Environment]::NewLine, $utf8NoBom)
    [System.IO.File]::WriteAllText($jsPath, $js + [Environment]::NewLine, $utf8NoBom)
    [System.IO.File]::WriteAllText($appIndex, $html, $utf8NoBom)
    [System.IO.File]::WriteAllText($sourcePath, $redirectHtml, $utf8NoBom)
}

Split-AppHtml -SourceFile "index.html" -AppName "passenger" -RootRedirectTarget "passenger/index.html"
Split-AppHtml -SourceFile "crew.html" -AppName "crew" -RootRedirectTarget "crew/index.html"
