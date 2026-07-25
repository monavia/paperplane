param(
  [string]$BackupDir = "./backups",
  [int]$RetentionDays = 7
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

Write-Host "[backup] Starting backup at $timestamp"

$envPath = ".env"
$miniUri = $env:MONGO_URI

# MongoDB
$mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
if ($mongodump) {
  Write-Host "[backup] MongoDB dump..."
  $dumpDir = "$BackupDir\mongodump_$timestamp"
  & mongodump --uri="$miniUri" --out="$dumpDir" --quiet
  Compress-Archive -Path "$dumpDir\*" -DestinationPath "$BackupDir\mongodb_$timestamp.zip" -CompressionLevel Optimal
  Remove-Item -Path $dumpDir -Recurse -Force
  Write-Host "[backup] MongoDB dump: $BackupDir\mongodb_$timestamp.zip"
} else {
  Write-Host "[backup] mongodump not found — skipping MongoDB"
}

# .env
if (Test-Path $envPath) {
  Copy-Item $envPath "$BackupDir\env_$timestamp.txt"
  Write-Host "[backup] .env: $BackupDir\env_$timestamp.txt"
}

# Prune
$limit = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem $BackupDir | Where-Object { $_.CreationTime -lt $limit } | Remove-Item -Force

Write-Host "[backup] Done. Pruned backups older than $RetentionDays days."
