$ErrorActionPreference = "Stop"

$pgBin = Join-Path $env:LOCALAPPDATA "Programs\HumraModa\PostgreSQL-17.11\pgsql\bin"
$dataDir = Join-Path $env:LOCALAPPDATA "HumraModa\postgres-data\humra_moda_local"
$secretDir = Join-Path $env:LOCALAPPDATA "HumraModa\secrets"
$superSecretFile = Join-Path $secretDir "postgres-superuser-password.txt"
$envFile = Join-Path (Get-Location) ".env"
$backupDir = Join-Path (Get-Location) "data\backups"
$envBackup = Join-Path $backupDir "phase7.1-pre-migration.env"
$psql = Join-Path $pgBin "psql.exe"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"

if (-not (Test-Path $psql) -or -not (Test-Path $pgCtl)) { throw "Portable PostgreSQL binaries are missing." }
if (-not (Test-Path $dataDir\PG_VERSION) -or -not (Test-Path $superSecretFile)) {
  throw "The partially initialized local cluster or its protected credential file is missing; refusing to recreate it."
}
if (-not (Test-Path $envFile)) { throw ".env not found; refusing to infer any database target." }
$databaseLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $databaseLine) { throw "DATABASE_URL is not configured in .env." }
$oldUrl = ($databaseLine -split "=", 2)[1].Trim().Trim('"').Trim("'")
try { $oldUri = [Uri]$oldUrl } catch { throw "DATABASE_URL is not a valid URL." }
if ($oldUri.Host.ToLowerInvariant() -notin @("localhost", "127.0.0.1", "::1")) {
  throw "DATABASE_URL is remote; refusing to connect or overwrite it."
}

$superPassword = [System.IO.File]::ReadAllText($superSecretFile).Trim()
$bytes = [byte[]]::new(32)
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($bytes)
$appPassword = ([BitConverter]::ToString($bytes)).Replace("-", "")
$random.Dispose()
$dataDir = (Resolve-Path -LiteralPath $dataDir).Path
$logFile = Join-Path $dataDir "postgres-server.log"

$status = & $pgCtl -D $dataDir status 2>&1
if ($LASTEXITCODE -ne 0) {
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded) {
    throw "Port 5432 belongs to an unverified process; refusing to connect."
  }
  & $pgCtl -D $dataDir -l $logFile -o "-h 127.0.0.1 -p 5432" start
  if ($LASTEXITCODE -ne 0) { throw "The dedicated local PostgreSQL cluster did not start." }
}

try {
  $env:PGPASSWORD = $superPassword
  $exists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname='humramoda_app'"
  if ($LASTEXITCODE -ne 0) { throw "Cannot authenticate to the dedicated local PostgreSQL cluster." }
  if ($exists.Trim() -eq "1") {
    "ALTER ROLE humramoda_app LOGIN CREATEDB PASSWORD '$appPassword';" | & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  } else {
    "CREATE ROLE humramoda_app LOGIN CREATEDB PASSWORD '$appPassword';" | & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  }
  if ($LASTEXITCODE -ne 0) { throw "Could not configure the application role." }
  $dbExists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='humra_moda_local'"
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect the local database catalog." }
  if ($dbExists.Trim() -ne "1") {
    & (Join-Path $pgBin "createdb.exe") -h 127.0.0.1 -p 5432 -U postgres -O humramoda_app humra_moda_local
    if ($LASTEXITCODE -ne 0) { throw "Could not create the dedicated local database." }
  }
  $env:PGPASSWORD = $appPassword
  $identity = (& $psql -X -h 127.0.0.1 -p 5432 -U humramoda_app -d humra_moda_local -Atqc "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, '')" | Out-String).Trim()
  $identityExit = $LASTEXITCODE
  if ($identityExit -ne 0 -or $identity -notmatch '^humra_moda_local\|127\.0\.0\.1(?:/32)?$') {
    throw "Local database identity verification failed (database/address='$identity', exit=$identityExit); .env was not changed."
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
if (-not (Test-Path $envBackup)) { Copy-Item -LiteralPath $envFile -Destination $envBackup }
$newUrl = "postgresql://humramoda_app:$appPassword@127.0.0.1:5432/humra_moda_local?schema=public"
$envText = [System.IO.File]::ReadAllText($envFile)
$envText = [regex]::Replace($envText, '(?m)^DATABASE_URL\s*=.*$', "DATABASE_URL=`"$newUrl`"")
if ($envText -match '(?m)^DIRECT_URL\s*=') {
  $envText = [regex]::Replace($envText, '(?m)^DIRECT_URL\s*=.*$', "DIRECT_URL=`"$newUrl`"")
} else {
  $envText = $envText.TrimEnd() + "`r`nDIRECT_URL=`"$newUrl`"`r`n"
}
[System.IO.File]::WriteAllText($envFile, $envText, [System.Text.UTF8Encoding]::new($false))

"PostgreSQL: 17.11 portable per-user cluster"
"Database: humra_moda_local"
"Host: 127.0.0.1:5432"
"Role: humramoda_app (not superuser)"
"Environment updated only after local identity verification."
