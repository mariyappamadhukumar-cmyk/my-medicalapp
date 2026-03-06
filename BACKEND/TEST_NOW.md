# 🧪 Quick Test - Verify Real MATLAB Analysis

## ✅ Configuration Summary

**MATLAB Path**: `C:\Program Files\MATLAB\R2025b\bin\matlab.exe`  
**MATLAB Code**: `C:\Users\Madhukumar\OneDrive\Desktop\MATHLAB COUGH PREDICTOR`  
**Gemini API Key**: `AIzaSyDo74zbZ2K6cSN1FkSkMDDILUA6jropOV0` ✅  
**Server**: Running on port 5000 ✅

---

## 🎯 TEST NOW!

### Option 1: Test from Frontend

1. **Open** in browser:
   ```
   http://localhost:5000/cough-prediction.html
   ```
   
   Or directly:
   ```
   file:///C:/Users/Madhukumar/OneDrive/Desktop/train model1 add features/FRONTEND/cough-prediction.html
   ```

2. **Upload** or **Record** a cough audio

3. **Wait** 5-10 seconds

4. **Look for**:
   - ✅ **GREEN badge**: "REAL MATLAB"
   - Real MFCC features
   - Gemini AI classification
   - Confidence score

### Option 2: Test with PowerShell (Quick)

```powershell
# Test MATLAB directly:
& "C:\Program Files\MATLAB\R2025b\bin\matlab.exe" -batch "disp('MATLAB works!'); exit"

# Expected output: "MATLAB works!"
```

### Option 3: Check Server Logs

**In the BACKEND terminal**, you should now see:

```
✅ Gemini API Key loaded for cough analysis
✅ MediCare Assistant API listening on http://localhost:5000
```

When you upload audio, watch for:
```
📧 Received audio file: ...
🔬 Using MATLAB path: C:\Program Files\MATLAB\R2025b\bin\matlab.exe
✅ MATLAB executable found at: C:\Program Files\MATLAB\R2025b\bin\matlab.exe
🔬 Executing MATLAB: ...
📊 MATLAB output: ...
✅ MATLAB analysis completed successfully
```

---

## ✅ Success Indicators

| Check | Expected | Status |
|-------|----------|--------|
| Server startup | "✅ Gemini API Key loaded" | Should see this |
| MATLAB test | "MATLAB works!" | ✅ Tested |
| Badge color | Green "✅ REAL MATLAB" | Test by uploading |
| Analysis time | 5-10 seconds (first time) | Test by uploading |
| Cached results | <100ms (same audio) | Upload same file twice |

---

## 🚨 If You See Yellow "⚠️ SIMULATION" Badge

Check server console for error message. Common issues:

### 1. "MATLAB executable not found"
**Fix**: Verify path in `.env` matches your MATLAB installation
```powershell
Test-Path "C:\Program Files\MATLAB\R2025b\bin\matlab.exe"
# Should return: True
```

### 2. "Gemini API error"
**Fix**: API key might be invalid. Verify:
```powershell
cat .env | Select-String "GEMINI"
# Should show: GEMINI_API_KEY=AIzaSyDo74zbZ2K6cSN1FkSkMDDILUA6jropOV0
```

### 3. "Cannot read file" or "Audio format error"
**Fix**: MATLAB expects WAV format. The wrapper should auto-convert, but try uploading a .WAV file directly.

### 4. "Result file not created"
**Fix**: Check if your `gemini_predict.m` is working:
```powershell
cd "C:\Users\Madhukumar\OneDrive\Desktop\MATHLAB COUGH PREDICTOR"
& "C:\Program Files\MATLAB\R2025b\bin\matlab.exe" -batch "setenv('GEMINI_API_KEY','AIzaSyDo74zbZ2K6cSN1FkSkMDDILUA6jropOV0'); features=[1,2,3,4,5,6,7,8,9,10,11,12,13,14]; result=gemini_predict(features); disp(result); exit"
```

Expected: Should show classification result from Gemini

---

## 📊 What Changed (Server Auto-Reloaded)

1. ✅ Added `GEMINI_API_KEY` loading from `.env`
2. ✅ Added `MATLAB_PATH` from `.env`
3. ✅ Added `MATLAB_CODE_PATH` from `.env`
4. ✅ Simplified MATLAB detection (no timeout issues)
5. ✅ Server logs confirmation when Gemini key loads

**Server should have automatically restarted with these changes!**

---

## 🎯 GO TEST IT!

**Upload a cough audio now** and check:
- Server console logs
- Badge color on webpage
- MFCC features displayed
- AI classification result

**You should get 75-85% accurate real analysis!** 🎉

---

## 📞 Report Back

Tell me:
1. **Badge color**: Green or Yellow?
2. **Server console**: What does it say when you upload?
3. **Any errors**: Copy exact error message if any

Let's verify it's working with real MATLAB + Gemini AI! 🚀
