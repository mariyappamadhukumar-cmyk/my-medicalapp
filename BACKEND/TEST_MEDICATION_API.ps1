# Test FDA API for Medication Information
# This script tests the medication lookup API

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FDA Medication API Test" -ForegroundColor Cyan
Write-Host "  Pranava Health AI" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test medications with 1mg dosages
$medications = @(
    "finasteride",      # Has 1mg dosage
    "anastrozole",      # Has 1mg dosage
    "lorazepam",        # Has 1mg dosage
    "alprazolam",       # Has 1mg dosage
    "paracetamol",
    "aspirin",
    "metformin"
)

Write-Host "Testing medications..." -ForegroundColor Yellow
Write-Host ""

foreach ($med in $medications) {
    Write-Host "Testing: $med" -ForegroundColor Green
    
    $body = @{
        drugName = $med
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5000/api/drug/info" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body
        
        if ($response.ok) {
            Write-Host "  ✓ Found: $($response.drug.genericName)" -ForegroundColor Green
            
            if ($response.drug.brandNames -and $response.drug.brandNames.Count -gt 0) {
                Write-Host "  Brand Names: $($response.drug.brandNames[0..2] -join ', ')..." -ForegroundColor Cyan
            }
            
            # Check for 1mg dosage
            $dosageText = $response.drug.dosageAndAdministration
            if ($dosageText -match '\b1\s?mg\b') {
                Write-Host "  ⚡ Contains 1mg dosage information!" -ForegroundColor Yellow
            }
            
            if ($response.drug.manufacturerName) {
                Write-Host "  Manufacturer: $($response.drug.manufacturerName)" -ForegroundColor Gray
            }
        } else {
            Write-Host "  ✗ Not found: $($response.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Open the medication lookup page:" -ForegroundColor Yellow
Write-Host "http://localhost:5000/medication-lookup.html" -ForegroundColor Cyan
Write-Host ""
