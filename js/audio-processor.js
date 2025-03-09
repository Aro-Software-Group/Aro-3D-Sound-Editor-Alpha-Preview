// Aro 3D Sound Editor - Advanced 3D Audio Processing Engine

class AudioProcessor {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.impulseResponse = null;
        this.roomImpulseResponse = null;
        this.hallImpulseResponse = null;
        this.arenaImpulseResponse = null; // New impulse response for 32D mode
        this.liveQualityEnabled = false;
        this.liveQuality2Enabled = false; // New Live Quality Mode 2.0
        this.previousGainL = 0.5; // For smoother transitions
        this.previousGainR = 0.5; // For smoother transitions
        this.transitionBuffer = new Float32Array(8192); // Buffer for smoother transitions
        this.audioAnalysisResult = null; // Store audio analysis results
        
        // Initialize impulse responses for different reverb types
        this.initImpulseResponses();
    }
    
    // Initialize different impulse responses for various reverb types
    async initImpulseResponses() {
        try {
            // Create standard impulse response
            const sampleRate = this.audioContext.sampleRate;
            
            // Standard room impulse response (2 seconds)
            const roomLength = 2 * sampleRate;
            const roomBuffer = this.audioContext.createBuffer(2, roomLength, sampleRate);
            
            // Fill with decaying noise to simulate a room
            for (let channel = 0; channel < 2; channel++) {
                const channelData = roomBuffer.getChannelData(channel);
                for (let i = 0; i < roomLength; i++) {
                    // Decay curve with smoother profile
                    const decay = Math.exp(-i / (sampleRate * 0.5));
                    // Random noise with some frequency shaping but with seed to reduce instability
                    const seed = Math.sin(i * 0.0001) * 10000;
                    const pseudoRandom = Math.sin(seed) * 0.5 + 0.5;
                    channelData[i] = ((pseudoRandom * 2 - 1) * 0.8 + (Math.random() * 2 - 1) * 0.2) * decay;
                }
            }
            
            this.impulseResponse = roomBuffer;
            this.roomImpulseResponse = roomBuffer;
            
            // Create hall impulse response (longer, 3 seconds)
            const hallLength = 3 * sampleRate;
            const hallBuffer = this.audioContext.createBuffer(2, hallLength, sampleRate);
            
            // Fill with decaying noise to simulate a concert hall
            for (let channel = 0; channel < 2; channel++) {
                const channelData = hallBuffer.getChannelData(channel);
                for (let i = 0; i < hallLength; i++) {
                    // Slower decay curve for hall with smoother profile
                    const decay = Math.exp(-i / (sampleRate * 1.2));
                    // Add some early reflections
                    const earlyReflections = (i < sampleRate * 0.1) ? 0.8 : 0.0;
                    // More stable random noise with reflections
                    const seed = Math.sin(i * 0.0002) * 10000;
                    const pseudoRandom = Math.sin(seed) * 0.5 + 0.5;
                    channelData[i] = (((pseudoRandom * 2 - 1) * 0.8 + (Math.random() * 2 - 1) * 0.2) * decay) + 
                                    (Math.sin(i * 440 / sampleRate) * earlyReflections * decay);
                }
            }
            
            this.hallImpulseResponse = hallBuffer;
            
            // Create arena impulse response (longer, 4 seconds) for 32D mode
            const arenaLength = 4 * sampleRate;
            const arenaBuffer = this.audioContext.createBuffer(2, arenaLength, sampleRate);
            
            // Fill with decaying noise to simulate a large arena with complex reflections
            for (let channel = 0; channel < 2; channel++) {
                const channelData = arenaBuffer.getChannelData(channel);
                for (let i = 0; i < arenaLength; i++) {
                    // Even slower decay curve for arena
                    const decay = Math.exp(-i / (sampleRate * 1.8));
                    
                    // Complex early reflections pattern
                    let earlyReflections = 0;
                    if (i < sampleRate * 0.05) earlyReflections = 0.9;
                    else if (i < sampleRate * 0.1) earlyReflections = 0.7;
                    else if (i < sampleRate * 0.2) earlyReflections = 0.5;
                    else if (i < sampleRate * 0.3) earlyReflections = 0.3;
                    else earlyReflections = 0.0;
                    
                    // Create stable but complex reverb pattern
                    const seed1 = Math.sin(i * 0.0003) * 10000;
                    const seed2 = Math.cos(i * 0.0007) * 10000;
                    const pseudoRandom1 = Math.sin(seed1) * 0.5 + 0.5;
                    const pseudoRandom2 = Math.sin(seed2) * 0.5 + 0.5;
                    
                    // Mix multiple frequency components for richer sound
                    const reflection1 = Math.sin(i * 330 / sampleRate) * earlyReflections * decay;
                    const reflection2 = Math.sin(i * 550 / sampleRate) * earlyReflections * decay * 0.7;
                    
                    channelData[i] = (((pseudoRandom1 * 2 - 1) * 0.7 + (pseudoRandom2 * 2 - 1) * 0.3) * decay) + 
                                    reflection1 + reflection2;
                }
            }
            
            this.arenaImpulseResponse = arenaBuffer;
            
        } catch (error) {
            console.error('Error creating impulse responses:', error);
        }
    }
    
    // Analyze audio to determine optimal 3D processing parameters
    async analyzeAudio(audioBuffer) {
        if (this.audioAnalysisResult) {
            return this.audioAnalysisResult; // Return cached result if available
        }
        
        // Create a shorter buffer for analysis (first 30 seconds max)
        const analysisDuration = Math.min(30, audioBuffer.duration);
        const analysisSamples = Math.floor(analysisDuration * audioBuffer.sampleRate);
        
        // Get audio data for analysis
        let analysisDataL, analysisDataR;
        if (audioBuffer.numberOfChannels === 1) {
            analysisDataL = audioBuffer.getChannelData(0).slice(0, analysisSamples);
            analysisDataR = analysisDataL;
        } else {
            analysisDataL = audioBuffer.getChannelData(0).slice(0, analysisSamples);
            analysisDataR = audioBuffer.getChannelData(1).slice(0, analysisSamples);
        }
        
        // Perform frequency domain analysis
        const fftSize = 2048;
        const offlineContext = new OfflineAudioContext(1, analysisSamples, audioBuffer.sampleRate);
        const source = offlineContext.createBufferSource();
        const analyser = offlineContext.createAnalyser();
        
        // Configure analyzer
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = 0.8;
        
        // Create a mono buffer for analysis
        const monoBuffer = offlineContext.createBuffer(1, analysisSamples, audioBuffer.sampleRate);
        const monoData = monoBuffer.getChannelData(0);
        
        // Mix to mono for analysis
        for (let i = 0; i < analysisSamples; i++) {
            monoData[i] = (analysisDataL[i] + analysisDataR[i]) * 0.5;
        }
        
        source.buffer = monoBuffer;
        source.connect(analyser);
        analyser.connect(offlineContext.destination);
        
        // Start source
        source.start();
        await offlineContext.startRendering();
        
        // Get frequency data
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(frequencyData);
        
        // Calculate energy in different frequency bands
        const bands = {
            bass: {min: 20, max: 250},
            midLow: {min: 250, max: 500},
            mid: {min: 500, max: 2000},
            highMid: {min: 2000, max: 4000},
            high: {min: 4000, max: 20000}
        };
        
        const bandEnergy = {};
        const nyquist = audioBuffer.sampleRate / 2;
        const binSize = nyquist / analyser.frequencyBinCount;
        
        // Calculate energy in each band
        Object.keys(bands).forEach(band => {
            const minBin = Math.floor(bands[band].min / binSize);
            const maxBin = Math.ceil(bands[band].max / binSize);
            let energy = 0;
            
            for (let i = minBin; i < maxBin && i < frequencyData.length; i++) {
                energy += frequencyData[i] * frequencyData[i];
            }
            
            bandEnergy[band] = Math.sqrt(energy / (maxBin - minBin)) / 255; // Normalize to 0-1
        });
        
        // Analyze dynamics
        const rms = this.calculateRMS(monoData);
        const peakLevel = this.calculatePeakLevel(monoData);
        const crestFactor = peakLevel / (rms > 0 ? rms : 0.00001); // Avoid division by zero
        
        // Analyze stereo width
        const stereoWidth = this.calculateStereoWidth(analysisDataL, analysisDataR);
        
        // Determine if the audio is likely vocal-centric
        const isVocalCentric = bandEnergy.mid > 0.6 && bandEnergy.highMid > 0.4;
        
        // Determine if the audio is bass-heavy
        const isBassHeavy = bandEnergy.bass > 0.7;
        
        // Determine if the audio has wide dynamic range
        const hasWideDynamics = crestFactor > 10;
        
        // Store analysis results
        this.audioAnalysisResult = {
            bandEnergy,
            rms,
            peakLevel,
            crestFactor,
            stereoWidth,
            isVocalCentric,
            isBassHeavy,
            hasWideDynamics,
            
            // Optimal parameters based on analysis
            optimalParams: {
                // Rotation speed based on energy distribution
                rotationSpeed: this.calculateOptimalRotationSpeed(bandEnergy, rms),
                
                // Depth based on frequency content
                depth: this.calculateOptimalDepth(bandEnergy, stereoWidth),
                
                // Reverb based on dynamics and stereo width
                reverb: this.calculateOptimalReverb(crestFactor, stereoWidth, bandEnergy),
                
                // Spatial parameters for 32D mode
                spiralFactor: this.calculateOptimalSpiralFactor(bandEnergy, isVocalCentric),
                elevationFactor: this.calculateOptimalElevationFactor(bandEnergy, hasWideDynamics),
                particleEffect: this.calculateOptimalParticleEffect(bandEnergy, stereoWidth)
            }
        };
        
        return this.audioAnalysisResult;
    }
    
    // Helper methods for audio analysis
    calculateRMS(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }
    
    calculatePeakLevel(buffer) {
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            const abs = Math.abs(buffer[i]);
            if (abs > peak) peak = abs;
        }
        return peak;
    }
    
    calculateStereoWidth(leftBuffer, rightBuffer) {
        // Calculate correlation between left and right channels
        // Lower correlation means wider stereo image
        let sumProduct = 0;
        let sumLeftSquared = 0;
        let sumRightSquared = 0;
        
        const sampleSize = Math.min(leftBuffer.length, 44100); // Use at most 1 second for calculation
        
        for (let i = 0; i < sampleSize; i++) {
            sumProduct += leftBuffer[i] * rightBuffer[i];
            sumLeftSquared += leftBuffer[i] * leftBuffer[i];
            sumRightSquared += rightBuffer[i] * rightBuffer[i];
        }
        
        const correlation = sumProduct / (Math.sqrt(sumLeftSquared) * Math.sqrt(sumRightSquared) || 0.00001);
        return 1 - Math.abs(correlation); // 0 = mono, 1 = wide stereo
    }
    
    // Calculate optimal parameters based on audio analysis
    calculateOptimalRotationSpeed(bandEnergy, rms) {
        // Base rotation on energy distribution
        // More bass = slower rotation, more highs = faster rotation
        const baseSpeed = 0.8;
        const bassInfluence = -0.3 * bandEnergy.bass; // Bass slows down rotation
        const highInfluence = 0.5 * bandEnergy.high; // Highs speed up rotation
        const energyInfluence = 0.2 * rms; // Overall energy increases speed slightly
        
        return Math.max(0.3, Math.min(1.8, baseSpeed + bassInfluence + highInfluence + energyInfluence));
    }
    
    calculateOptimalDepth(bandEnergy, stereoWidth) {
        // More bass and wider stereo = more depth
        const baseDepth = 0.5;
        const bassInfluence = 0.2 * bandEnergy.bass;
        const stereoInfluence = 0.3 * stereoWidth;
        
        return Math.max(0.2, Math.min(0.9, baseDepth + bassInfluence + stereoInfluence));
    }
    
    calculateOptimalReverb(crestFactor, stereoWidth, bandEnergy) {
        // More dynamic range and narrower stereo = more reverb
        const baseReverb = 0.3;
        const dynamicsInfluence = 0.2 * (crestFactor > 10 ? 1 : crestFactor / 10);
        const stereoInfluence = -0.2 * stereoWidth; // Narrower stereo = more reverb
        const highFreqInfluence = 0.2 * bandEnergy.high; // More highs = more reverb
        
        return Math.max(0.1, Math.min(0.8, baseReverb + dynamicsInfluence + stereoInfluence + highFreqInfluence));
    }
    
    calculateOptimalSpiralFactor(bandEnergy, isVocalCentric) {
        // Vocal-centric tracks get less spiral movement to maintain clarity
        const baseFactor = 0.2;
        const vocalAdjustment = isVocalCentric ? -0.05 : 0.1;
        const energyInfluence = 0.1 * (bandEnergy.mid + bandEnergy.highMid) / 2;
        
        return Math.max(0.1, Math.min(0.4, baseFactor + vocalAdjustment + energyInfluence));
    }
    
    calculateOptimalElevationFactor(bandEnergy, hasWideDynamics) {
        // More dynamic range = more elevation movement
        const baseFactor = 0.3;
        const dynamicsAdjustment = hasWideDynamics ? 0.15 : 0;
        const highFreqInfluence = 0.1 * bandEnergy.high;
        
        return Math.max(0.2, Math.min(0.6, baseFactor + dynamicsAdjustment + highFreqInfluence));
    }
    
    calculateOptimalParticleEffect(bandEnergy, stereoWidth) {
        // More high frequencies and wider stereo = more particle effect
        const baseEffect = 0.5;
        const highFreqInfluence = 0.3 * bandEnergy.high;
        const stereoInfluence = 0.2 * stereoWidth;
        
        return Math.max(0.3, Math.min(0.9, baseEffect + highFreqInfluence + stereoInfluence));
    }
    
    // Process audio for preview (lighter processing)
    async processAudioPreview(audioBuffer, settings) {
        try {
            if (!audioBuffer) {
                console.error('Invalid audio buffer for preview processing');
                throw new Error('無効な音声データです。再度ファイルをアップロードしてください。');
            }
            
            if (!this.audioContext) {
                console.error('Audio context is not initialized');
                throw new Error('音声処理エンジンが初期化されていません。ページを再読み込みしてください。');
            }
            
            // For preview, we'll process a shorter version of the audio
            const previewDuration = Math.min(30, audioBuffer.duration || 0); // Max 30 seconds for preview
            if (previewDuration <= 0) {
                console.error('Invalid audio duration:', audioBuffer.duration);
                throw new Error('音声データの長さが無効です。別のファイルを試してください。');
            }
            
            const previewSamples = Math.floor(previewDuration * audioBuffer.sampleRate);
            console.log(`Creating preview buffer: ${previewSamples} samples, ${audioBuffer.numberOfChannels} channels`);
            
            // Create a shorter buffer for preview with error handling
            let previewBuffer;
            try {
                previewBuffer = this.audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    previewSamples,
                    audioBuffer.sampleRate
                );
            } catch (bufferError) {
                console.error('Failed to create preview buffer:', bufferError);
                // Try with safe fallback values if original values caused an error
                const safeChannels = Math.min(2, audioBuffer.numberOfChannels || 2);
                const safeSamples = Math.min(previewSamples, 44100 * 10); // Max 10 seconds at 44.1kHz
                
                previewBuffer = this.audioContext.createBuffer(
                    safeChannels,
                    safeSamples,
                    44100 // Standard sample rate
                );
            }
            
            // Copy data to preview buffer with error handling
            const channelsToCopy = Math.min(audioBuffer.numberOfChannels, previewBuffer.numberOfChannels);
            for (let channel = 0; channel < channelsToCopy; channel++) {
                try {
                    const channelData = audioBuffer.getChannelData(channel);
                    const previewData = previewBuffer.getChannelData(channel);
                    
                    if (channelData && previewData) {
                        // Use a safe copy method that won't overflow
                        const samplesToCopy = Math.min(channelData.length, previewData.length);
                        for (let i = 0; i < samplesToCopy; i++) {
                            previewData[i] = channelData[i] || 0;
                        }
                    }
                } catch (channelError) {
                    console.error(`Error copying channel ${channel} data:`, channelError);
                    // Continue with other channels instead of failing completely
                }
            }
            
            // If Live Quality Mode 2.0 is enabled and 32D is selected, analyze audio first
            if (this.liveQuality2Enabled && settings.dimension === '32d') {
                try {
                    await this.analyzeAudio(audioBuffer);
                } catch (analysisError) {
                    console.warn('Audio analysis failed, continuing without optimization:', analysisError);
                    // Continue without analysis rather than failing completely
                }
            }
            
            // Process the preview buffer
            console.log('Processing preview buffer with effects...');
            return await this.applyEffects(previewBuffer, settings);
        } catch (error) {
            console.error('Error in processAudioPreview:', error);
            throw new Error(`プレビューの処理中にエラーが発生しました: ${error.message}`);
        }
    }
    
    // Process full audio with all effects
    async processAudio(audioBuffer, settings) {
        return this.applyEffects(audioBuffer, settings);
    }
    
    // Apply 3D audio effects based on settings
    async applyEffects(audioBuffer, settings) {
        // Create a new buffer for processing
        const processedBuffer = this.audioContext.createBuffer(
            2, // Always output stereo
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        
        // Get audio data
        let inputL, inputR;
        if (audioBuffer.numberOfChannels === 1) {
            // Mono input - use the same channel for both L and R
            inputL = audioBuffer.getChannelData(0);
            inputR = audioBuffer.getChannelData(0);
        } else {
            // Stereo input
            inputL = audioBuffer.getChannelData(0);
            inputR = audioBuffer.getChannelData(1);
        }
        
        // Get output channels
        const outputL = processedBuffer.getChannelData(0);
        const outputR = processedBuffer.getChannelData(1);
        
        // Calculate parameters based on settings
        let rotationSpeed = settings.rotationSpeed; // Rotations per second
        let depth = settings.depth; // 0-1 depth effect
        const is16D = settings.dimension === '16d';
        const is32D = settings.dimension === '32d';
        const liveQuality = this.liveQualityEnabled;
        const liveQuality2 = this.liveQuality2Enabled && is32D; // Live Quality 2.0 only works with 32D
        
        // Number of positions in 3D space (8, 16, or 32)
        const positions = is32D ? 32 : (is16D ? 16 : 8);
        
        // Process each sample
        const bufferLength = processedBuffer.length;
        const sampleRate = processedBuffer.sampleRate;
        
        // Create modulation frequencies for various effects
        let heightModFreq = 0.5; // Hz - how fast the sound moves up and down
        let depthModFreq = 0.3; // Hz - how fast the sound moves in/out
        
        // Transition smoothing parameters
        let smoothingFactor = 0.01; // Lower = smoother transitions but less precise positioning
        let prevGainL = this.previousGainL;
        let prevGainR = this.previousGainR;
        
        // Additional parameters for 32D mode
        let spiralFactor = is32D ? 0.2 : 0;
        let elevationFactor = is32D && liveQuality ? 0.4 : 0.2;
        let particleEffect = 0.0; // New parameter for particle-like sound manipulation
        
        // Apply AI-based parameter optimization for Live Quality Mode 2.0
        if (liveQuality2 && this.audioAnalysisResult) {
            const optimalParams = this.audioAnalysisResult.optimalParams;
            
            // Override user settings with AI-optimized parameters
            rotationSpeed = optimalParams.rotationSpeed;
            depth = optimalParams.depth;
            
            // Enhanced 32D parameters
            spiralFactor = optimalParams.spiralFactor;
            elevationFactor = optimalParams.elevationFactor;
            particleEffect = optimalParams.particleEffect;
            
            // Adjust modulation frequencies based on audio content
            heightModFreq = 0.5 + (this.audioAnalysisResult.bandEnergy.high - 0.5) * 0.3;
            depthModFreq = 0.3 + (this.audioAnalysisResult.bandEnergy.mid - 0.5) * 0.2;
            
            // Adjust smoothing factor based on dynamics
            smoothingFactor = this.audioAnalysisResult.hasWideDynamics ? 0.015 : 0.008;
        }
        
        for (let i = 0; i < bufferLength; i++) {
            // Calculate the current angle based on time and rotation speed
            const timeInSeconds = i / sampleRate;
            const rotationAngle = (timeInSeconds * rotationSpeed * Math.PI * 2) % (Math.PI * 2);
            
            // Height modulation (vertical movement) with phase variation for stability
            const heightPhase = is32D ? timeInSeconds * 0.1 : 0;
            const heightModulation = Math.sin((timeInSeconds + heightPhase) * heightModFreq * Math.PI * 2) * 0.5 * depth;
            
            // Calculate position in the rotation cycle with fractional precision for smoother movement
            const positionFrac = (rotationAngle / (Math.PI * 2)) * positions;
            const positionIndex = Math.floor(positionFrac);
            const positionFraction = positionFrac - positionIndex; // Fractional part for interpolation
            
            // Calculate pan value (-1 to 1) based on position with more complex algorithm
            let pan;
            let verticalPan = 0;
            let elevationEffect = 1.0;
            let particleModulation = 1.0; // New particle effect modulation
            
            if (is32D) {
                // Advanced 32D positioning with spiral path and elevation
                const normalizedPosition = positionFrac / positions;
                const angle = normalizedPosition * Math.PI * 2;
                
                if (liveQuality2) {
                    // Live Quality Mode 2.0 - AI-optimized 32D audio with particle effects
                    // Create a complex spiral path with multiple harmonics for ultra-realistic movement
                    const timeVariation = Math.sin(timeInSeconds * 0.2) * 0.15 + Math.cos(timeInSeconds * 0.33) * 0.08;
                    const spiralRadius = 1.0 + spiralFactor * Math.sin(angle * 3 + timeInSeconds * 0.3) * 
                                        (1 + 0.2 * Math.cos(timeInSeconds * 0.5));
                    
                    // Complex panning with multiple harmonics and micro-movements
                    pan = Math.sin(angle) * spiralRadius * (1 + 0.3 * Math.cos(angle * 2 + timeInSeconds * 0.1)) +
                          0.05 * Math.sin(timeInSeconds * 7.3); // Micro-movements for particle effect
                    
                    // Enhanced vertical movement with multiple layers and micro-variations
                    const verticalBase = heightModulation * (1 + 0.5 * Math.sin(angle * 3));
                    const verticalHarmonic = 0.25 * depth * Math.sin(timeInSeconds * 0.7 * Math.PI * 2 + angle);
                    const verticalMicro = 0.08 * depth * Math.sin(timeInSeconds * 11.3); // Micro-movements
                    verticalPan = verticalBase + verticalHarmonic + verticalMicro;
                    
                    // Advanced elevation effect with multiple layers (front/back/up/down simulation)
                    const elevationAngle = angle * 2 + timeInSeconds * 0.15;
                    const elevationBase = 1.0 - elevationFactor * (0.5 - 0.5 * Math.cos(elevationAngle));
                    const elevationHarmonic = 0.1 * Math.sin(elevationAngle * 3 + timeInSeconds * 0.27);
                    elevationEffect = elevationBase + elevationHarmonic;
                    
                    // Particle effect - creates micro-variations in amplitude to simulate sound particles
                    const particleFreq1 = 17.3; // Fast micro-variations
                    const particleFreq2 = 23.7; // Even faster micro-variations
                    const particleDepth = particleEffect * 0.15; // Depth of effect
                    
                    // Create complex particle effect with multiple frequencies
                    particleModulation = 1.0 + 
                        particleDepth * Math.sin(timeInSeconds * particleFreq1) * 
                        Math.sin(timeInSeconds * particleFreq2 * 0.5 + angle);
                } else if (liveQuality) {
                    // Enhanced 32D positioning with spiral path and complex modulation
                    // Create a spiral path that changes over time for more immersive experience
                    const timeVariation = Math.sin(timeInSeconds * 0.2) * 0.15;
                    const spiralRadius = 1.0 + spiralFactor * Math.sin(angle * 3 + timeInSeconds * 0.3);
                    
                    // Complex panning with multiple harmonics for rich spatial movement
                    pan = Math.sin(angle) * spiralRadius * (1 + 0.25 * Math.cos(angle * 2 + timeInSeconds * 0.1));
                    
                    // Enhanced vertical movement with multiple layers
                    const verticalBase = heightModulation * (1 + 0.4 * Math.sin(angle * 3));
                    const verticalHarmonic = 0.2 * depth * Math.sin(timeInSeconds * 0.7 * Math.PI * 2 + angle);
                    verticalPan = verticalBase + verticalHarmonic;
                    
                    // Elevation effect (front/back simulation)
                    const elevationAngle = angle * 2 + timeInSeconds * 0.15;
                    elevationEffect = 1.0 - elevationFactor * (0.5 - 0.5 * Math.cos(elevationAngle));
                } else {
                    // Standard 32D positioning with basic enhancements
                    pan = Math.sin(angle) * (1 + 0.15 * Math.cos(angle * 2));
                    verticalPan = heightModulation * (1 + 0.2 * Math.sin(angle * 2));
                    elevationEffect = 1.0 - elevationFactor * 0.5 * (1 - Math.cos(angle * 2));
                }
            } else if (is16D) {
                // 16D mode - separates audio into multiple elements with individual control
                if (liveQuality) {
                    // Enhanced 16D positioning with elliptical path for Live Quality
                    const normalizedPosition = positionFrac / positions;
                    const angle = normalizedPosition * Math.PI * 2;
                    
                    // Create an elliptical path instead of circular with time variation
                    const timeVariation = Math.sin(timeInSeconds * 0.3) * 0.1;
                    pan = Math.sin(angle) * (1 + 0.2 * Math.cos(angle * 3 + timeInSeconds * 0.2));
                    
                    // Add vertical movement component with phase variation
                    verticalPan = heightModulation * (1 + 0.3 * Math.sin(angle * 2 + timeInSeconds * 0.15));
                    
                    // Subtle elevation effect
                    elevationEffect = 1.0 - 0.15 * (0.5 - 0.5 * Math.cos(angle * 2));
                } else {
                    // Standard 16D positioning with smoother interpolation
                    const normalizedPosition = positionFrac / positions;
                    pan = Math.sin(normalizedPosition * Math.PI * 2);
                    verticalPan = heightModulation;
                }
            } else {
                // 8D mode - simple rotation effects with enhanced quality
                if (liveQuality) {
                    // More complex panning for Live Quality with time variation
                    const timeVariation = Math.sin(timeInSeconds * 0.25) * 0.08;
                    pan = Math.sin(rotationAngle) * (1 + 0.15 * Math.sin(rotationAngle * 2 + timeInSeconds * 0.1));
                    verticalPan = heightModulation * (1 + 0.2 * Math.cos(rotationAngle * 3));
                } else {
                    // Standard 8D with basic height
                    pan = Math.sin(rotationAngle);
                    verticalPan = heightModulation;
                }
            }
            
            // Apply depth effect with enhanced algorithm
            // Makes the sound appear to move closer and further with more natural curve
            let depthEffect;
            if (liveQuality2) {
                // Advanced depth effect for Live Quality Mode 2.0 with multi-layered modulation
                const depthPhase = timeInSeconds * 0.2;
                const depthBase = 1 - (depth * 0.6 * (1 - Math.cos(rotationAngle * 2 + depthPhase)));
                const depthModulation = 0.2 * depth * Math.sin(timeInSeconds * depthModFreq * Math.PI * 2 + rotationAngle);
                const depthMicro = 0.05 * depth * Math.sin(timeInSeconds * 13.7); // Micro-variations
                depthEffect = depthBase + depthModulation + depthMicro;
                
                // Add complex depth variation based on elevation and particle effect
                depthEffect *= (1 - 0.15 * Math.sin(timeInSeconds * 0.4 + rotationAngle * 0.5));
            } else if (liveQuality) {
                // More complex depth curve for Live Quality with time-based modulation
                const depthPhase = is32D ? timeInSeconds * 0.2 : 0;
                const depthBase = 1 - (depth * 0.6 * (1 - Math.cos(rotationAngle * 2 + depthPhase)));
                const depthModulation = 0.15 * depth * Math.sin(timeInSeconds * depthModFreq * Math.PI * 2 + rotationAngle);
                depthEffect = depthBase + depthModulation;
                
                // Add subtle depth variation based on elevation for 32D
                if (is32D) {
                    depthEffect *= (1 - 0.1 * Math.sin(timeInSeconds * 0.4));
                }
            } else {
                // Standard depth effect with improved stability
                depthEffect = 1 - (depth * 0.5 * (1 - Math.cos(rotationAngle * 2)));
            }
            
            // Calculate left/right gain based on pan with smoother transitions
            let gainL, gainR;
            
            if (liveQuality2) {
                // Advanced natural panning curve for Live Quality Mode 2.0
                gainL = pan <= 0 ? 1 : Math.pow(Math.cos(pan * Math.PI/2), 0.8); // More precise curve
                gainR = pan >= 0 ? 1 : Math.pow(Math.cos(-pan * Math.PI/2), 0.8);
                
                // Apply frequency-dependent panning with multiple harmonics
                const freqVariation1 = 0.03 * Math.sin(timeInSeconds * 173.0);
                const freqVariation2 = 0.015 * Math.sin(timeInSeconds * 257.3);
                gainL += (pan > 0 ? -freqVariation1 : freqVariation1) + freqVariation2;
                gainR += (pan < 0 ? -freqVariation1 : freqVariation1) - freqVariation2;
                
                // Enhanced smooth transitions with adaptive smoothing
                const adaptiveFactor = smoothingFactor * (1 + 0.5 * Math.sin(timeInSeconds * 0.1));
                gainL = prevGainL + (gainL - prevGainL) * adaptiveFactor * 2.5;
                gainR = prevGainR + (gainR - prevGainR) * adaptiveFactor * 2.5;
            } else if (liveQuality) {
                // More natural panning curve for Live Quality
                gainL = pan <= 0 ? 1 : Math.cos(pan * Math.PI/2);
                gainR = pan >= 0 ? 1 : Math.cos(-pan * Math.PI/2);
                
                // Apply subtle frequency-dependent panning (higher frequencies pan more)
                // Using deterministic variation instead of random for stability
                const freqVariation = 0.025 * Math.sin(timeInSeconds * 173.0);
                gainL += pan > 0 ? -freqVariation : freqVariation;
                gainR += pan < 0 ? -freqVariation : freqVariation;
                
                // Smooth transitions between positions to prevent audio artifacts
                gainL = prevGainL + (gainL - prevGainL) * smoothingFactor * (is32D ? 2 : 1);
                gainR = prevGainR + (gainR - prevGainR) * smoothingFactor * (is32D ? 2 : 1);
            } else {
                // Standard panning with improved stability
                gainL = pan <= 0 ? 1 : 1 - Math.abs(pan);
                gainR = pan >= 0 ? 1 : 1 - Math.abs(pan);
            }
            
            // Store for next sample
            prevGainL = gainL;
            prevGainR = gainR;
            
            // Apply vertical panning effect (simulates height)
            const verticalEffect = 1 - Math.abs(verticalPan) * 0.3;
            
            // Apply all effects to the samples
            outputL[i] = inputL[i] * gainL * depthEffect * verticalEffect * elevationEffect * particleModulation;
            outputR[i] = inputR[i] * gainR * depthEffect * verticalEffect * elevationEffect * particleModulation;
        }
        
        // Store the last gain values for future processing
        this.previousGainL = prevGainL;
        this.previousGainR = prevGainR;
        
        // Apply reverb if needed
        if (settings.reverb > 0) {
            // Choose the appropriate impulse response based on settings and dimension
            let impulseToUse = this.impulseResponse;
            
            if (is32D) {
                // Use arena impulse response for 32D mode
                impulseToUse = this.arenaImpulseResponse || this.hallImpulseResponse || this.impulseResponse;
            } else if (liveQuality) {
                // Use hall impulse response for Live Quality mode
                impulseToUse = this.hallImpulseResponse || this.impulseResponse;
            }
            
            if (impulseToUse) {
                return this.applyReverb(processedBuffer, settings.reverb, impulseToUse, is32D);
            }
        }
        
        return processedBuffer;
    }
    
    // Apply reverb effect with enhanced quality options
    async applyReverb(audioBuffer, reverbAmount, impulseBuffer = null, is32D = false) {
        const impulseToUse = impulseBuffer || this.impulseResponse;
        if (!impulseToUse) return audioBuffer;
        
        // Create offline context for processing
        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        
        // Create source and convolver nodes
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        
        const convolver = offlineContext.createConvolver();
        convolver.buffer = impulseToUse;
        
        // Create dry and wet gain nodes
        const dryGain = offlineContext.createGain();
        const wetGain = offlineContext.createGain();
        
        // Set gain values based on reverb amount with enhanced curve for more natural sound
        // Use different curves for different modes to create appropriate immersive experience
        let dryAmount, wetAmount;
        
        if (is32D && this.liveQuality2Enabled) {
            // Premium reverb curve for 32D Live Quality Mode 2.0
            dryAmount = Math.pow(Math.cos(reverbAmount * Math.PI/2), 1.1); // Refined power curve
            wetAmount = Math.pow(Math.sin(reverbAmount * Math.PI/2), 0.85) * 1.3; // Enhanced wet signal
            
            // Apply AI-based analysis results if available
            if (this.audioAnalysisResult) {
                // Adjust wet/dry balance based on audio characteristics
                const bandEnergy = this.audioAnalysisResult.bandEnergy;
                const stereoWidth = this.audioAnalysisResult.stereoWidth;
                
                // Reduce reverb for vocal-centric content to maintain clarity
                if (this.audioAnalysisResult.isVocalCentric) {
                    wetAmount *= 0.85;
                    dryAmount = Math.min(1.0, dryAmount * 1.1);
                }
                
                // Increase reverb for wide stereo content
                if (stereoWidth > 0.7) {
                    wetAmount *= 1.15;
                }
                
                // Adjust based on frequency content
                if (bandEnergy.high > 0.7) {
                    // Reduce reverb for high-frequency heavy content
                    wetAmount *= 0.9;
                }
            }
        } else if (is32D && this.liveQualityEnabled) {
            // Enhanced reverb curve for 32D Live Quality mode
            dryAmount = Math.pow(Math.cos(reverbAmount * Math.PI/2), 1.2); // Adjusted power curve
            wetAmount = Math.pow(Math.sin(reverbAmount * Math.PI/2), 0.9) * 1.2; // Boosted wet signal
        } else {
            // Standard non-linear curve with slight enhancement
            dryAmount = Math.pow(Math.cos(reverbAmount * Math.PI/2), 1.05);
            wetAmount = Math.pow(Math.sin(reverbAmount * Math.PI/2), 0.95);
        }
        
        dryGain.gain.value = dryAmount;
        wetGain.gain.value = wetAmount;
        
        // Add advanced EQ processing for Live Quality modes
        if (this.liveQuality2Enabled && is32D) {
            // Premium EQ chain for Live Quality Mode 2.0
            
            // Create a multi-band EQ for precise control
            // High shelf filter - controls brightness of reverb
            const highShelf = offlineContext.createBiquadFilter();
            highShelf.type = 'highshelf';
            highShelf.frequency.value = 7000;
            highShelf.gain.value = -1.5; // Less reduction for cleaner highs
            
            // High-mid peak filter - adds presence and clarity
            const highMidPeak = offlineContext.createBiquadFilter();
            highMidPeak.type = 'peaking';
            highMidPeak.frequency.value = 3500;
            highMidPeak.Q.value = 1.2;
            highMidPeak.gain.value = 1.5; // Slight boost for clarity
            
            // Mid peak filter - enhances presence
            const midPeak = offlineContext.createBiquadFilter();
            midPeak.type = 'peaking';
            midPeak.frequency.value = 1200;
            midPeak.Q.value = 1.1;
            midPeak.gain.value = 2.5; // Enhanced boost for presence
            
            // Low-mid peak filter - controls warmth
            const lowMidPeak = offlineContext.createBiquadFilter();
            lowMidPeak.type = 'peaking';
            lowMidPeak.frequency.value = 600;
            lowMidPeak.Q.value = 1.0;
            lowMidPeak.gain.value = 1.0; // Slight boost for warmth
            
            // Low shelf filter - controls bass
            const lowShelf = offlineContext.createBiquadFilter();
            lowShelf.type = 'lowshelf';
            lowShelf.frequency.value = is32D ? 250 : 300;
            lowShelf.gain.value = is32D ? -1.5 : -2; // Less reduction for 32D mode
            
            // Mid peak filter - enhances presence for 32D mode
            const midPeak = offlineContext.createBiquadFilter();
            midPeak.type = 'peaking';
            midPeak.frequency.value = 1200;
            midPeak.Q.value = 1.0;
            midPeak.gain.value = is32D ? 2 : 0; // Boost mids only in 32D mode
            
            // Subtle stereo enhancement for 32D mode
            if (is32D) {
                // Split channels for stereo processing
                const splitter = offlineContext.createChannelSplitter(2);
                const merger = offlineContext.createChannelMerger(2);
                
                // Create separate filters for left/right channels
                const leftFilter = offlineContext.createBiquadFilter();
                leftFilter.type = 'peaking';
                leftFilter.frequency.value = 2000;
                leftFilter.Q.value = 1.5;
                leftFilter.gain.value = 1.5;
                
                const rightFilter = offlineContext.createBiquadFilter();
                rightFilter.type = 'peaking';
                rightFilter.frequency.value = 3000;
                rightFilter.Q.value = 1.5;
                rightFilter.gain.value = 1.5;
                
                // Connect the stereo enhancement chain
                convolver.connect(splitter);
                splitter.connect(leftFilter, 0);
                splitter.connect(rightFilter, 1);
                leftFilter.connect(merger, 0, 0);
                rightFilter.connect(merger, 0, 1);
                merger.connect(lowShelf);
            } else {
                // Standard connection
                convolver.connect(lowShelf);
            }
            
            // Connect the main EQ chain
            lowShelf.connect(highShelf);
            highShelf.connect(midPeak);
            midPeak.connect(wetGain);
        } else {
            // Standard connection
            convolver.connect(wetGain);
        }
        
        // Connect nodes
        source.connect(dryGain);
        
        // Only connect to convolver if not already connected in the EQ chain
        if (!this.liveQualityEnabled && !this.liveQuality2Enabled) {
            source.connect(convolver);
        } else {
            source.connect(convolver);
        }
        
        dryGain.connect(offlineContext.destination);
        wetGain.connect(offlineContext.destination);
        
        // Start source and render
        source.start();
        const renderedBuffer = await offlineContext.startRendering();
        
        return renderedBuffer;
    }
    
    // Export as WAV
    async exportWAV(audioBuffer) {
        const wavDataView = this.encodeWAV(audioBuffer, audioBuffer.numberOfChannels, audioBuffer.sampleRate);
        return new Blob([wavDataView], { type: 'audio/wav' });
    }
    
    // Export as MP3
    async exportMP3(audioBuffer, bitrate) {
        // For MP3 encoding, we'll use a Web Worker with lamejs
        // This is a simplified version - in a real app, you'd load lamejs and use it
        // Since we can't include the full MP3 encoder here, we'll simulate it
        
        // In a real implementation, you would:
        // 1. Load lamejs library
        // 2. Create a Web Worker to handle encoding
        // 3. Send the audio data to the worker
        // 4. Receive the encoded MP3 data back
        
        // For now, we'll just convert to WAV as a fallback
        console.warn('MP3 encoding not fully implemented - falling back to WAV');
        return this.exportWAV(audioBuffer);
        
        // Note: In a production app, you would implement proper MP3 encoding
        // using a library like lamejs or use a server-side solution
    }
    
    // Encode AudioBuffer to WAV format
    encodeWAV(audioBuffer, numChannels, sampleRate) {
        try {
            if (!audioBuffer) {
                console.error('Invalid audioBuffer for WAV encoding');
                throw new Error('Invalid parameters for WAV encoding');
            }
            
            // Ensure parameters are valid with fallbacks
            numChannels = numChannels || audioBuffer.numberOfChannels || 2;
            numChannels = Math.min(numChannels, audioBuffer.numberOfChannels);
            if (numChannels <= 0) numChannels = 1;
            
            sampleRate = sampleRate || audioBuffer.sampleRate || 44100;
            
            const interleaved = this.interleave(audioBuffer);
            const dataLength = interleaved.length * 2; // 2 bytes per sample (16-bit)
            const bufferLength = 44 + dataLength;
            
            const buffer = new ArrayBuffer(bufferLength);
            const view = new DataView(buffer);
            
            console.log(`Encoding WAV: channels=${numChannels}, sampleRate=${sampleRate}, length=${interleaved.length}`);
        
            // RIFF identifier
            this.writeString(view, 0, 'RIFF');
            // File length
            view.setUint32(4, 36 + dataLength, true);
            // RIFF type
            this.writeString(view, 8, 'WAVE');
            // Format chunk identifier
            this.writeString(view, 12, 'fmt ');
            // Format chunk length
            view.setUint32(16, 16, true);
            // Sample format (1 is PCM)
            view.setUint16(20, 1, true);
            // Channel count
            view.setUint16(22, numChannels, true);
            // Sample rate
            view.setUint32(24, sampleRate, true);
            // Byte rate (sample rate * block align)
            view.setUint32(28, sampleRate * numChannels * 2, true);
            // Block align (channel count * bytes per sample)
            view.setUint16(32, numChannels * 2, true);
            // Bits per sample
            view.setUint16(34, 16, true);
            // Data chunk identifier
            this.writeString(view, 36, 'data');
            // Data chunk length
            view.setUint32(40, dataLength, true);
            
            // Write the PCM samples
            this.floatTo16BitPCM(view, 44, interleaved);
            
            return view;
        } catch (error) {
            console.error('Error encoding WAV:', error);
            throw new Error('WAVファイルの生成中にエラーが発生しました。');
        }
    }
    
    // Interleave audio channels
    interleave(audioBuffer) {
        if (!audioBuffer) {
            console.error('Invalid audioBuffer for interleaving');
            throw new Error('音声データの処理中にエラーが発生しました。');
        }
        
        const numChannels = audioBuffer.numberOfChannels;
        if (numChannels <= 0) {
            console.error('Invalid number of channels:', numChannels);
            // Create a silent buffer instead of failing
            return new Float32Array(1024); // Return some silent data
        }
        
        const length = audioBuffer.length;
        const result = new Float32Array(length * numChannels);
        
        try {
            for (let channel = 0; channel < numChannels; channel++) {
                try {
                    const channelData = audioBuffer.getChannelData(channel);
                    if (!channelData) {
                        console.error(`Channel data is null or undefined for channel ${channel}`);
                        continue;
                    }
                    
                    for (let i = 0; i < length; i++) {
                        result[i * numChannels + channel] = channelData[i];
                    }
                } catch (channelError) {
                    console.error(`Error processing channel ${channel}:`, channelError);
                    // Continue with other channels instead of failing completely
                }
            }
            
            return result;
        } catch (error) {
            console.error('Error in interleave function:', error);
            throw new Error('音声データの処理中にエラーが発生しました。');
        }
    }
    
    // Convert Float32Array to 16-bit PCM
    floatTo16BitPCM(output, offset, input) {
        try {
            if (!output || !input) {
                console.error('Invalid input or output buffer in floatTo16BitPCM');
                throw new Error('Invalid input or output buffer');
            }
            
            // Validate offset
            if (typeof offset !== 'number' || offset < 0) {
                console.error('Invalid offset in floatTo16BitPCM:', offset);
                offset = 0;
            }
            
            // Calculate maximum safe length to prevent buffer overflow
            const maxSamples = Math.floor((output.byteLength - offset) / 2);
            const samplesToProcess = Math.min(input.length, maxSamples);
            
            if (samplesToProcess <= 0) {
                console.error('No samples to process in floatTo16BitPCM');
                return;
            }
            
            if (samplesToProcess < input.length) {
                console.warn(`Only processing ${samplesToProcess} of ${input.length} samples to prevent buffer overflow`);
            }
            
            for (let i = 0; i < samplesToProcess; i++) {
                // Ensure we have a valid sample value (handle NaN, undefined, etc.)
                let sample = input[i] || 0;
                if (isNaN(sample)) sample = 0;
                
                // Clamp to -1.0 to 1.0 range
                const s = Math.max(-1, Math.min(1, sample));
                
                // Convert to 16-bit PCM
                output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                offset += 2;
            }
        } catch (error) {
            console.error('Error in floatTo16BitPCM function:', error);
            throw new Error('音声データの変換中にエラーが発生しました。');
        }
    }
    
    // Write string to DataView
    writeString(view, offset, string) {
        try {
            if (!view) {
                console.error('Invalid DataView for writing string');
                throw new Error('Invalid parameters for writing string');
            }
            
            if (!string || typeof string !== 'string') {
                console.error('Invalid string parameter:', string);
                string = string ? string.toString() : '';
            }
            
            // Validate offset
            if (typeof offset !== 'number' || offset < 0 || offset >= view.byteLength) {
                console.error('Invalid offset in writeString:', offset);
                return; // Skip writing rather than failing
            }
            
            // Calculate maximum safe length to prevent buffer overflow
            const maxChars = view.byteLength - offset;
            const charsToWrite = Math.min(string.length, maxChars);
            
            if (charsToWrite < string.length) {
                console.warn(`Only writing ${charsToWrite} of ${string.length} characters to prevent buffer overflow`);
            }
            
            for (let i = 0; i < charsToWrite; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        } catch (error) {
            console.error('Error in writeString function:', error);
            // Continue execution instead of throwing to make the app more robust
            console.warn('Continuing despite WAV header writing error');
        }
    }
}