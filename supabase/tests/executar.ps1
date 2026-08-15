# =============================================================================
# Executa as migrations e a suíte de testes num PostgreSQL local.
#
# Serve para validar qualquer alteração no banco ANTES de aplicar no Supabase.
# Cria e destrói o banco "estoque_teste" a cada execução.
#
#   .\supabase\tests\executar.ps1
#   .\supabase\tests\executar.ps1 -Senha minhasenha -Porta 5433
# =============================================================================

# Atenção: $Host é variável reservada do PowerShell — por isso "Servidor".
param(
  [string]$Senha    = "postgres",
  [string]$Usuario  = "postgres",
  [string]$Servidor = "localhost",
  [int]$Porta       = 5432,
  [string]$Banco    = "estoque_teste"
)

# "Continue" de propósito: o psql escreve os NOTICE dos testes em stderr, e com
# "Stop" o PowerShell trataria cada mensagem de sucesso como falha. O controle
# de erro real é feito por $LASTEXITCODE depois de cada chamada.
$ErrorActionPreference = "Continue"

function Confirmar($etapa) {
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFalhou em: $etapa" -ForegroundColor Red
    exit 1
  }
}

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
  $candidato = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
               Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $candidato) {
    Write-Host "psql não encontrado. Instale o PostgreSQL ou adicione o psql ao PATH." -ForegroundColor Red
    exit 1
  }
  $psql = $candidato.FullName
}

$sqlDir  = Split-Path -Parent $PSScriptRoot
$env:PGPASSWORD = $Senha
$conexao = @("-U", $Usuario, "-h", $Servidor, "-p", $Porta)

Write-Host "Recriando o banco $Banco..." -ForegroundColor Cyan
& $psql @conexao -d postgres -q -c "drop database if exists $Banco;" | Out-Null
& $psql @conexao -d postgres -q -c "create database $Banco;" | Out-Null
Confirmar "criação do banco"

Write-Host "Aplicando os stubs do ambiente Supabase..." -ForegroundColor Cyan
& $psql @conexao -d $Banco -q -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot "00_stub_supabase.sql")
Confirmar "stubs do Supabase"

Write-Host "Aplicando as migrations..." -ForegroundColor Cyan
foreach ($arquivo in (Get-ChildItem (Join-Path $sqlDir "migrations\*.sql") | Sort-Object Name)) {
  Write-Host "  $($arquivo.Name)"
  & $psql @conexao -d $Banco -q -v ON_ERROR_STOP=1 -f $arquivo.FullName
  Confirmar "migration $($arquivo.Name)"
}

Write-Host "Aplicando o seed..." -ForegroundColor Cyan
& $psql @conexao -d $Banco -q -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "seed.sql")
Confirmar "seed"

Write-Host "`nRodando os testes funcionais...`n" -ForegroundColor Cyan
& $psql @conexao -d $Banco -q -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot "99_teste_funcional.sql")
Confirmar "testes funcionais"

Write-Host "`nTudo certo — todos os testes passaram." -ForegroundColor Green
