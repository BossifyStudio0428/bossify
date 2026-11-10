param(
  [Parameter(Mandatory = $true)]
  [string]$StripeKey
)

$ErrorActionPreference = 'Stop'
$headers = @{ Authorization = "Bearer $StripeKey" }

function Invoke-StripePost($path, $bodyString) {
  $resp = Invoke-RestMethod -Uri "https://api.stripe.com/v1/$path" -Method Post -Headers $headers -ContentType "application/x-www-form-urlencoded" -Body $bodyString
  return $resp
}

Write-Host "== Creating Product: Bossify Pro ==" -ForegroundColor Cyan
$proProduct = Invoke-StripePost "products" "name=Bossify Pro&description=Bossify Pro plan (2026-11 pricing)"
Write-Host "  product id: $($proProduct.id)"

Write-Host "== Creating Price: Pro Monthly RM19.90 ==" -ForegroundColor Cyan
$proMonthly = Invoke-StripePost "prices" "product=$($proProduct.id)&unit_amount=1990&currency=myr&recurring[interval]=month&nickname=Pro+Monthly"
Write-Host "  price id: $($proMonthly.id)"

Write-Host "== Creating Price: Pro Yearly RM199.00 ==" -ForegroundColor Cyan
$proYearly = Invoke-StripePost "prices" "product=$($proProduct.id)&unit_amount=19900&currency=myr&recurring[interval]=year&nickname=Pro+Yearly"
Write-Host "  price id: $($proYearly.id)"

Write-Host "== Creating Product: Bossify Business ==" -ForegroundColor Cyan
$bizProduct = Invoke-StripePost "products" "name=Bossify Business&description=Bossify Business plan (2026-11 pricing)"
Write-Host "  product id: $($bizProduct.id)"

Write-Host "== Creating Price: Business Monthly RM49.90 ==" -ForegroundColor Cyan
$bizMonthly = Invoke-StripePost "prices" "product=$($bizProduct.id)&unit_amount=4990&currency=myr&recurring[interval]=month&nickname=Business+Monthly"
Write-Host "  price id: $($bizMonthly.id)"

Write-Host "== Creating Price: Business Yearly RM499.00 ==" -ForegroundColor Cyan
$bizYearly = Invoke-StripePost "prices" "product=$($bizProduct.id)&unit_amount=49900&currency=myr&recurring[interval]=year&nickname=Business+Yearly"
Write-Host "  price id: $($bizYearly.id)"

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "DONE — copy this whole block back to Claude:" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "pro:monthly      = $($proMonthly.id)"
Write-Host "pro:yearly       = $($proYearly.id)"
Write-Host "business:monthly = $($bizMonthly.id)"
Write-Host "business:yearly  = $($bizYearly.id)"
Write-Host "=========================================================" -ForegroundColor Green

Write-Host ""
Write-Host "== Currently ACTIVE recurring prices (sanity check — should only show the 4 above, nothing old) ==" -ForegroundColor Cyan
$allPrices = Invoke-RestMethod -Uri "https://api.stripe.com/v1/prices?active=true&limit=100&expand[]=data.product" -Method Get -Headers $headers
foreach ($p in $allPrices.data) {
  if ($p.recurring) {
    $amt = [math]::Round($p.unit_amount / 100, 2)
    Write-Host "  $($p.id) | $($p.product.name) | $amt $($p.currency.ToUpper()) / $($p.recurring.interval)"
  }
}
