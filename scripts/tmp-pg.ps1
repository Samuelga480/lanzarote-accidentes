param(
  [Parameter(Mandatory = $true)][string]$Script,
  [string[]]$Args = @()
)

# Reinicia PGlite y ejecuta un script de Prisma contra el.
# PGlite no admite "prepared statement ya existe", asi que cada ejecucion
# necesita el servidor limpio.

$ErrorActionPreference = "Stop"
$root = "C:\Users\samue\Documents\Proyecto predeterminado\lanzarote-accidentes-main"
$pg = "$env:TEMP\pglite"

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match "pglite" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 3
Set-Location $pg
Start-Process -FilePath "node" `
  -ArgumentList ".\node_modules\@electric-sql\pglite-socket\dist\scripts\server.js",
                "--db=$pg\pgdata", "--port=5432", "--host=127.0.0.1" `
  -WindowStyle Hidden
Start-Sleep -Seconds 10

Set-Location $root
$env:DATABASE_URL = "postgresql://POSTAL:POSTAL@127.0.0.1:5432/PORTAL?schema=public&connection_limit=1"
& ".\node_modules\.bin\tsx.cmd" $Script @Args