# 🔬 MATLAB Integration Guide for Cough Analysis

## Overview
This guide explains how to integrate your MATLAB cough analysis code with the web application.

## Current Setup
- ✅ Frontend: Audio recording and upload interface
- ✅ Backend: Node.js endpoint at `/api/cough/analyze`
- ⏳ MATLAB: Integration needed (currently simulated)

## MATLAB Integration Steps

### 1. Prepare Your MATLAB Function

Create a MATLAB function that accepts audio file path and returns analysis results:

```matlab
function result = cough_analysis(audioFilePath)
    % Load audio file
    [audioData, fs] = audioread(audioFilePath);
    
    % Your frequency analysis code here
    % Example:
    % - Apply FFT
    % - Find dominant frequencies
    % - Analyze cough patterns
    % - Classify health conditions
    
    % Calculate frequency spectrum
    Y = fft(audioData);
    P2 = abs(Y/length(audioData));
    P1 = P2(1:length(audioData)/2+1);
    P1(2:end-1) = 2*P1(2:end-1);
    f = fs*(0:(length(audioData)/2))/length(audioData);
    
    % Find dominant frequency
    [~, maxIdx] = max(P1);
    dominantFreq = f(maxIdx);
    
    % Your classification logic here
    % Based on frequency ranges, determine:
    % - Cough pattern (dry/wet/whooping)
    % - Health status (normal/mild/moderate/severe)
    % - Possible conditions
    % - Recommendations
    
    % Example classification (replace with your logic)
    if dominantFreq < 300
        pattern = 'Deep, low-frequency cough';
        healthStatus = 'Moderate concern';
        conditions = 'Possible bronchitis or lower respiratory infection';
    elseif dominantFreq < 500
        pattern = 'Normal cough pattern';
        healthStatus = 'Mild concern';
        conditions = 'Likely cold or minor respiratory irritation';
    else
        pattern = 'High-frequency dry cough';
        healthStatus = 'Moderate concern';
        conditions = 'Possible asthma or upper respiratory infection';
    end
    
    % Prepare result structure
    result = struct();
    result.dominantFrequency = dominantFreq;
    result.pattern = pattern;
    result.healthStatus = healthStatus;
    result.possibleConditions = conditions;
    result.recommendation = 'Consult healthcare professional if symptoms persist';
    result.confidence = 85; % Your confidence calculation
    result.frequencySpectrum = [f', P1']; % For visualization
    
    % Save result as JSON for Node.js to read
    jsonStr = jsonencode(result);
    resultFile = strrep(audioFilePath, '.wav', '_result.json');
    fid = fopen(resultFile, 'w');
    fprintf(fid, '%s', jsonStr);
    fclose(fid);
    
    fprintf('Analysis complete. Results saved to: %s\n', resultFile);
end
```

### 2. Update Backend Server (server.js)

Replace the simulation function with real MATLAB call:

```javascript
// Real MATLAB integration function
async function callMatlabAnalysis(audioFile) {
  const fs = require('fs').promises;
  const { exec } = require('child_process');
  const path = require('path');
  
  try {
    // Save audio file temporarily
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempFilePath = path.join(tempDir, `cough_${Date.now()}.wav`);
    await fs.writeFile(tempFilePath, audioFile.buffer);
    
    // Call MATLAB script
    const matlabCommand = `matlab -batch "addpath('${__dirname}'); cough_analysis('${tempFilePath}')"`;
    
    return new Promise((resolve, reject) => {
      exec(matlabCommand, { timeout: 30000 }, async (error, stdout, stderr) => {
        try {
          const resultFile = tempFilePath.replace('.wav', '_result.json');
          
          if (error) {
            await fs.unlink(tempFilePath); // cleanup
            reject(new Error(`MATLAB execution failed: ${error.message}`));
            return;
          }
          
          // Read MATLAB results
          const resultData = await fs.readFile(resultFile, 'utf8');
          const results = JSON.parse(resultData);
          
          // Clean up temp files
          await fs.unlink(tempFilePath);
          await fs.unlink(resultFile);
          
          resolve(results);
          
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp files:', cleanupError);
          if (error) reject(error);
          else resolve({ error: 'Failed to parse results' });
        }
      });
    });
    
  } catch (error) {
    throw new Error(`MATLAB analysis setup failed: ${error.message}`);
  }
}
```

### 3. Replace Simulation in Backend

In `server.js`, find the cough analysis endpoint and replace:

```javascript
// OLD: const analysisResult = await simulateMatlabCoughAnalysis(req.file);
// NEW:
const analysisResult = await callMatlabAnalysis(req.file);
```

### 4. Install Required Dependencies

```bash
cd BACKEND
npm install child_process fs
```

### 5. Test Your Integration

1. Start the backend server:
   ```bash
   cd BACKEND
   node server.js
   ```

2. Open the frontend:
   ```
   FRONTEND/cough-prediction.html
   ```

3. Record or upload a cough audio file

4. Check the console for MATLAB execution logs

## File Structure After Integration

```
BACKEND/
├── server.js                 # Contains MATLAB integration
├── temp/                     # Temporary audio files
├── cough_analysis.m          # Your MATLAB function
└── package.json
```

## Troubleshooting

### MATLAB Path Issues
- Ensure MATLAB is in your system PATH
- Or specify full MATLAB path: `/path/to/matlab/bin/matlab`

### Audio Format Issues
- Convert audio to WAV format if needed
- Ensure proper sampling rate (typically 44.1kHz)

### Permission Issues
- Ensure MATLAB has write permissions to temp directory
- Check file path separators (Windows vs Unix)

### Timeout Issues
- Increase timeout in `exec()` if analysis takes longer
- Current timeout is 30 seconds

## Example Integration Test

```javascript
// Test the MATLAB integration manually
const testAudio = {
  buffer: fs.readFileSync('test_cough.wav'),
  originalname: 'test_cough.wav'
};

callMatlabAnalysis(testAudio)
  .then(results => {
    console.log('MATLAB Results:', results);
  })
  .catch(error => {
    console.error('MATLAB Error:', error);
  });
```

## Next Steps

1. Implement your MATLAB cough analysis algorithm
2. Test with sample cough audio files
3. Adjust classification thresholds based on your research
4. Add more sophisticated pattern recognition
5. Consider adding machine learning models for better accuracy

## Sample MATLAB Command for Testing

```bash
# Test MATLAB function directly
matlab -batch "cough_analysis('path/to/test_audio.wav')"
```

This should output analysis results and create a JSON file with the results.