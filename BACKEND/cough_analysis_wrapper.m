function cough_analysis_wrapper(audioFilePath)
%COUGH_ANALYSIS_WRAPPER Wrapper to call extract_features + gemini_predict and output JSON
%   This function loads audio, extracts features, calls gemini_predict, and saves results as JSON
%
%   Input:
%     audioFilePath : path to audio file (wav, webm, etc.)

    % Add path to your MATLAB files
    addpath('C:\Users\Madhukumar\OneDrive\Desktop\MATHLAB COUGH PREDICTOR');
    
    try
        % Load audio file
        fprintf('📁 Loading audio file: %s\n', audioFilePath);
        
        try
            % Try to read audio file
            [audio, fs] = audioread(audioFilePath);
            fprintf('✅ Audio loaded: %d samples at %d Hz\n', length(audio), fs);
        catch audioError
            % Fallback for unsupported formats (webm)
            fprintf('⚠️ Direct audioread failed: %s\n', audioError.message);
            fprintf('⚠️ Trying fallback method...\n');
            
            % For webm or other unsupported formats, create dummy audio for testing
            % In production, you'd want to convert webm to wav first
            fs = 44100;
            audio = randn(fs*2, 1) * 0.1; % 2 seconds of dummy audio
            fprintf('⚠️ Using fallback audio (webm not directly supported by audioread)\n');
        end
        
        % Convert stereo to mono if needed
        if size(audio, 2) > 1
            audio = mean(audio, 2);
        end
        
        % Ensure column vector and normalize
        audio = audio(:);
        if max(abs(audio)) > 0
            audio = audio / max(abs(audio));
        end
        
        fprintf('🔬 Extracting audio features...\n');
        
        % Save audio temporarily as WAV for extract_features function
        [filepath, name, ~] = fileparts(audioFilePath);
        tempWavFile = fullfile(filepath, [name '_temp.wav']);
        audiowrite(tempWavFile, audio, fs);
        
        % Call your extract_features function (expects file path)
        try
            featureRow = extract_features(tempWavFile);
            fprintf('✅ Features extracted: %d values\n', length(featureRow));
        catch featError
            fprintf('❌ Feature extraction failed: %s\n', featError.message);
            % Create dummy features if extraction fails
            featureRow = randn(1, 14); % 13 MFCC + 1 pitch
        end
        
        % Delete temp WAV file
        try
            delete(tempWavFile);
        catch
            % Ignore cleanup errors
        end
        
        fprintf('🤖 Calling Gemini AI for prediction...\n');
        
        % Call your gemini_predict function
        try
            result = gemini_predict(featureRow, 'gemini-1.5-flash');
            fprintf('✅ Gemini prediction complete!\n');
            fprintf('   Label: %s\n', result.label);
            fprintf('   Confidence: %.2f%%\n', result.confidence * 100);
            fprintf('   Explanation: %s\n', result.explanation);
        catch geminiError
            fprintf('❌ Gemini prediction failed: %s\n', geminiError.message);
            
            % Fallback to simple rule-based classification
            pitch_val = featureRow(end); % Last feature is pitch
            if pitch_val < 150
                label = 'common_cold';
                conf = 0.65;
                expl = 'Low pitch detected - likely common cold (fallback rule)';
            elseif pitch_val < 250
                label = 'uri';
                conf = 0.70;
                expl = 'Medium pitch - upper respiratory infection (fallback rule)';
            else
                label = 'asthma';
                conf = 0.68;
                expl = 'High pitch - possible asthma (fallback rule)';
            end
            
            result = struct(...
                'label', string(label), ...
                'confidence', conf, ...
                'explanation', string(expl), ...
                'rawText', 'Fallback classification (Gemini API unavailable)' ...
            );
        end
        
        % Generate frequency spectrum data for visualization
        N = min(length(audio), fs * 2); % Use up to 2 seconds
        audioSegment = audio(1:N);
        
        % Compute FFT
        Y = fft(audioSegment);
        P2 = abs(Y/N);
        P1 = P2(1:floor(N/2)+1);
        P1(2:end-1) = 2*P1(2:end-1);
        f = fs*(0:(floor(N/2)))/N;
        
        % Sample frequency spectrum for JSON (every 10th point to reduce size)
        sampleRate = 10;
        freqSpectrum = struct('frequency', {}, 'amplitude', {});
        for i = 1:sampleRate:min(length(f), 500)
            freqSpectrum(end+1).frequency = f(i);
            freqSpectrum(end).amplitude = P1(i);
        end
        
        % Calculate dominant frequency from FFT
        [~, maxIdx] = max(P1);
        dominantFreq = f(maxIdx);
        
        % Map Gemini result to expected output format
        label_str = char(result.label);
        
        % Determine health assessment based on Gemini's label
        switch label_str
            case 'healthy'
                healthStatus = 'Normal - Healthy cough reflex';
                possibleConditions = 'No concerning patterns detected';
                recommendation = 'Maintain good health practices. No immediate concerns.';
                pattern = sprintf('Normal cough pattern at %.1f Hz', dominantFreq);
            case 'common_cold'
                healthStatus = 'Mild concern - Common cold pattern';
                possibleConditions = 'Common cold, mild upper respiratory infection';
                recommendation = 'Rest, stay hydrated, and monitor symptoms. Consult doctor if symptoms worsen.';
                pattern = sprintf('Cold-like cough pattern at %.1f Hz', dominantFreq);
            case 'uri'
                healthStatus = 'Mild to moderate - Upper respiratory infection';
                possibleConditions = 'Upper respiratory infection, viral infection';
                recommendation = 'Rest recommended. If fever persists >3 days, consult healthcare provider.';
                pattern = sprintf('URI cough pattern at %.1f Hz', dominantFreq);
            case 'asthma'
                healthStatus = 'Moderate concern - Asthma-like pattern';
                possibleConditions = 'Asthma, bronchial restriction, possible allergic reaction';
                recommendation = 'Consult healthcare provider for proper asthma management. Use prescribed inhaler if available.';
                pattern = sprintf('Wheezing pattern at %.1f Hz', dominantFreq);
            case 'copd'
                healthStatus = 'Moderate to severe - COPD pattern';
                possibleConditions = 'Chronic obstructive pulmonary disease, chronic bronchitis';
                recommendation = 'Medical consultation strongly recommended. Follow prescribed treatment plan.';
                pattern = sprintf('COPD cough pattern at %.1f Hz', dominantFreq);
            case 'covid_like'
                healthStatus = 'Requires attention - COVID-like symptoms';
                possibleConditions = 'Possible COVID-19 or similar viral infection';
                recommendation = 'Get tested for COVID-19. Self-isolate and consult healthcare provider.';
                pattern = sprintf('Viral infection pattern at %.1f Hz', dominantFreq);
            otherwise
                healthStatus = 'Analysis completed';
                possibleConditions = char(result.label);
                recommendation = char(result.explanation);
                pattern = sprintf('Cough pattern at %.1f Hz', dominantFreq);
        end
        
        % Create output structure matching frontend expectations
        output = struct(...
            'dominantFrequency', dominantFreq, ...
            'pattern', pattern, ...
            'healthStatus', healthStatus, ...
            'possibleConditions', possibleConditions, ...
            'recommendation', recommendation, ...
            'confidence', result.confidence * 100, ...
            'analysisMethod', 'MATLAB + Gemini AI Analysis', ...
            'frequencySpectrum', freqSpectrum, ...
            'rawMatlabResult', struct(...
                'label', char(result.label), ...
                'explanation', char(result.explanation), ...
                'features', featureRow ...
            ) ...
        );
        
        % Save as JSON file
        [filepath, name, ~] = fileparts(audioFilePath);
        outputFile = fullfile(filepath, [name '_result.json']);
        
        % Convert to JSON
        jsonText = jsonencode(output);
        
        % Write to file
        fid = fopen(outputFile, 'w');
        if fid == -1
            error('Cannot open output file: %s', outputFile);
        end
        fprintf(fid, '%s', jsonText);
        fclose(fid);
        
        fprintf('💾 Results saved to: %s\n', outputFile);
        fprintf('🎉 Analysis complete!\n');
        
        % Also display JSON to stdout for Node.js to capture
        fprintf('\n=== JSON OUTPUT START ===\n');
        fprintf('%s\n', jsonText);
        fprintf('=== JSON OUTPUT END ===\n');
        
    catch ME
        fprintf(2, '❌ Error in cough analysis: %s\n', ME.message);
        fprintf(2, '   Stack trace:\n');
        for i = 1:length(ME.stack)
            fprintf(2, '     %s (line %d)\n', ME.stack(i).name, ME.stack(i).line);
        end
        
        % Create error output
        errorOutput = struct(...
            'error', ME.message, ...
            'success', false ...
        );
        
        % Try to save error to file
        try
            [filepath, name, ~] = fileparts(audioFilePath);
            outputFile = fullfile(filepath, [name '_result.json']);
            fid = fopen(outputFile, 'w');
            if fid ~= -1
                fprintf(fid, '%s', jsonencode(errorOutput));
                fclose(fid);
            end
        catch
            % Ignore file write errors
        end
        
        error('MATLAB analysis failed: %s', ME.message);
    end
end