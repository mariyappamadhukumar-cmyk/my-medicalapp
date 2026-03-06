# Simple FDA API Test
Write-Host "Testing FDA Medication API..." -ForegroundColor Cyan
Write-Host ""

# Test Finasteride (has 1mg dosage)
Write-Host "Testing: Finasteride (1mg medication)" -ForegroundColor Yellow

$body = @{
    drugName = "finasteride"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/drug/info" -Method POST -ContentType "application/json" -Body $body
    
    if ($response.ok) {
        Write-Host "SUCCESS!" -ForegroundColor Green
        Write-Host "Generic Name: $($response.drug.genericName)" -ForegroundColor Cyan
        Write-Host "Brand Names: $($response.drug.brandNames -join ', ')" -ForegroundColor Cyan
        
        if ($response.drug.dosageAndAdministration -match '1\s?mg') {
            Write-Host "HAS 1mg DOSAGE INFORMATION!" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Not found: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure the server is running!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Open medication lookup page:" -ForegroundColor Green
Write-Host "http://localhost:5000/medication-lookup.html" -ForegroundColor Cyan
