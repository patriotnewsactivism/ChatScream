$ErrorActionPreference = 'Stop'

param(
  [string]$ProjectId = 'chatscream-prod'
)

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Set-GsmSecret([string]$Name, [string]$Prompt) {
  $value = Read-Secret $Prompt
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "Skipping $Name"
    return
  }

  $exists = $true
  try {
    gcloud secrets describe $Name --project $ProjectId | Out-Null
  }
  catch {
    $exists = $false
  }

  if ($exists) {
    $value | gcloud secrets versions add $Name --project $ProjectId --data-file - | Out-Null
  }
  else {
    $value | gcloud secrets create $Name --project $ProjectId --replication-policy automatic --data-file - | Out-Null
  }

  Write-Host "Set $Name"
}

Require-Command gcloud

gcloud config set project $ProjectId | Out-Null

Write-Host "Target project: $ProjectId"
Write-Host "Enter secret values (input hidden). Leave blank to skip."
Write-Host ""

Set-GsmSecret -Name 'STRIPE_SECRET_KEY' -Prompt 'Stripe Secret Key (sk_...)'
Set-GsmSecret -Name 'STRIPE_WEBHOOK_SECRET' -Prompt 'Stripe Webhook Secret (whsec_...)'
Set-GsmSecret -Name 'YOUTUBE_CLIENT_ID' -Prompt 'YouTube OAuth Client ID'
Set-GsmSecret -Name 'YOUTUBE_CLIENT_SECRET' -Prompt 'YouTube OAuth Client Secret'
Set-GsmSecret -Name 'FACEBOOK_APP_ID' -Prompt 'Facebook App ID'
Set-GsmSecret -Name 'FACEBOOK_APP_SECRET' -Prompt 'Facebook App Secret'
Set-GsmSecret -Name 'TWITCH_CLIENT_ID' -Prompt 'Twitch Client ID'
Set-GsmSecret -Name 'TWITCH_CLIENT_SECRET' -Prompt 'Twitch Client Secret'
Set-GsmSecret -Name 'CLAUDE_API_KEY' -Prompt 'Claude API Key'

Write-Host ""
Write-Host 'Secrets configured in Google Secret Manager.'
Write-Host 'Next: ./infrastructure/deploy.sh'
