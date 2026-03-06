@echo off
echo ============================================
echo   COUGH ANALYSIS SYSTEM - INTEGRATION TEST
echo ============================================
echo.

echo [1/4] Testing MATLAB Installation...
matlab -batch "disp('✅ MATLAB is working!'); exit"
if errorlevel 1 (
    echo ❌ MATLAB test failed!
    pause
    exit /b 1
)
echo.

echo [2/4] Testing MATLAB Path Access...
matlab -batch "addpath('C:\Users\Madhukumar\OneDrive\Desktop\MATHLAB COUGH PREDICTOR'); disp('✅ MATLAB files accessible!'); exit"
if errorlevel 1 (
    echo ❌ MATLAB path test failed!
    pause
    exit /b 1
)
echo.

echo [3/4] Testing Feature Extraction (with dummy audio)...
matlab -batch "addpath('C:\Users\Madhukumar\OneDrive\Desktop\MATHLAB COUGH PREDICTOR'); fs=44100; audio=randn(fs,1)*0.1; audiowrite('test_cough.wav',audio,fs); features=extract_features('test_cough.wav'); fprintf('✅ Extracted %%d features\n', length(features)); delete('test_cough.wav'); exit"
if errorlevel 1 (
    echo ❌ Feature extraction test failed!
    pause
    exit /b 1
)
echo.

echo [4/4] Checking Gemini API Key...
matlab -batch "key = getenv('GEMINI_API_KEY'); if isempty(key), disp('⚠️ GEMINI_API_KEY not set!'); else, disp('✅ API key found!'); end; exit"
echo.

echo ============================================
echo   INTEGRATION TEST SUMMARY
echo ============================================
echo ✅ MATLAB: Working
echo ✅ MATLAB Files: Accessible  
echo ✅ Feature Extraction: Working
echo.
echo NEXT STEPS:
echo 1. Set Gemini API key if not already set:
echo    PowerShell: $env:GEMINI_API_KEY = "YOUR_KEY"
echo.
echo 2. Start backend server:
echo    cd BACKEND
echo    npx nodemon server.js
echo.
echo 3. Open FRONTEND\cough-prediction.html
echo.
echo 4. Upload/record cough and click "Analyze Cough"
echo.
echo 5. Look for green "✅ REAL MATLAB" badge!
echo ============================================
echo.
pause
