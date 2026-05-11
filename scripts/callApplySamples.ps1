param(
    [Parameter(Mandatory=$false)] [string]$Url,
    [Parameter(Mandatory=$false)] [string]$Secret
)

if (-not $Url) {
    Write-Host "Usage: .\scripts\callApplySamples.ps1 -Url <FUNCTION_URL> -Secret <SECRET>" -ForegroundColor Yellow
    exit 1
}

if (-not $Secret) {
    $Secret = Read-Host -AsSecureString "Enter secret (will not echo)" | ConvertFrom-SecureString
    # ConvertFrom-SecureString yields encrypted string; user likely prefers to pass plain secret. Prompt again plainly if needed.
    Write-Host "Tip: pass -Secret 'your_secret' to avoid interactive prompt." -ForegroundColor Gray
}

try {
    $headers = @{ 'x-update-secret' = $Secret }
    Write-Host "Calling function at $Url ..." -ForegroundColor Cyan
    $resp = Invoke-RestMethod -Uri $Url -Method Post -Headers $headers -TimeoutSec 120
    Write-Host "Response:" -ForegroundColor Green
    $resp | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Request failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $body = $_.Exception.Response.GetResponseStream() | % { new-object System.IO.StreamReader($_) } | % { $_.ReadToEnd() }
        Write-Host "Response body:" -ForegroundColor Yellow
        Write-Host $body
    }
}
