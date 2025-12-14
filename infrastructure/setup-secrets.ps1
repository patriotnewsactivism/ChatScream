$ErrorActionPreference = 'Stop'

param(
  [string]$ProjectId = 'wtp-apps'
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
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Set-FirebaseSecret([string]$Name, [string]$Prompt) {
  $value = Read-Secret $Prompt
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "Skipping $Name (empty)."
    return
  }

  $value | firebase functions:secrets:set $Name --project $ProjectId --data-file - | Out-Null
  Write-Host "Set $Name"
}

Require-Command firebase

Write-Host "Target Firebase project: $ProjectId"
Write-Host ""
Write-Host "Enter secrets (input hidden). Leave blank to skip."
Write-Host ""

Set-FirebaseSecret -Name 'STRIPE_SECRET_KEY' -Prompt 'Stripe Secret Key (sk_...)'
Set-FirebaseSecret -Name 'STRIPE_WEBHOOK_SECRET' -Prompt 'Stripe Webhook Secret (whsec_...)'
Write-Host ""
Set-FirebaseSecret -Name 'YOUTUBE_CLIENT_ID' -Prompt 'YouTube OAuth Client ID'
Set-FirebaseSecret -Name 'YOUTUBE_CLIENT_SECRET' -Prompt 'YouTube OAuth Client Secret'
Write-Host ""
Set-FirebaseSecret -Name 'FACEBOOK_APP_ID' -Prompt 'Facebook App ID'
Set-FirebaseSecret -Name 'FACEBOOK_APP_SECRET' -Prompt 'Facebook App Secret'
Write-Host ""
Set-FirebaseSecret -Name 'TWITCH_CLIENT_ID' -Prompt 'Twitch Client ID'
Set-FirebaseSecret -Name 'TWITCH_CLIENT_SECRET' -Prompt 'Twitch Client Secret'

Write-Host ""
Write-Host "Done setting secrets."
Write-Host "Next: firebase deploy --only functions --project $ProjectId"

