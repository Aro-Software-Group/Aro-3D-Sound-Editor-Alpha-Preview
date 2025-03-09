// Aro 3D Sound Editor - Main Application Script

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropArea = document.getElementById('dropArea');
    const audioFileInput = document.getElementById('audioFileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileType = document.getElementById('fileType');
    const editorSection = document.getElementById('editorSection');
    const resultSection = document.getElementById('resultSection');
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    // Audio Player Elements
    const playButton = document.getElementById('playButton');
    const pauseButton = document.getElementById('pauseButton');
    const stopButton = document.getElementById('stopButton');
    const currentTimeDisplay = document.getElementById('currentTime');
    const totalTimeDisplay = document.getElementById('totalTime');
    
    // Control Elements
    const dimensionSelect = document.getElementById('dimensionSelect');
    const rotationSpeed = document.getElementById('rotationSpeed');
    const rotationSpeedValue = document.getElementById('rotationSpeedValue');
    const depth = document.getElementById('depth');
    const depthValue = document.getElementById('depthValue');
    const reverb = document.getElementById('reverb');
    const reverbValue = document.getElementById('reverbValue');
    const liveQualityToggle = document.getElementById('liveQualityToggle');
    const liveQuality2Group = document.getElementById('liveQuality2Group');
    const liveQuality2Toggle = document.getElementById('liveQuality2Toggle');
    const formatSelect = document.getElementById('formatSelect');
    const mp3QualityGroup = document.getElementById('mp3QualityGroup');
    const mp3Quality = document.getElementById('mp3Quality');
    const processButton = document.getElementById('processButton');
    const downloadLink = document.getElementById('downloadLink');
    const downloadFileName = document.getElementById('downloadFileName');
    
    // WaveSurfer instance for audio visualization
    let wavesurfer = null;
    
    // Audio context and processor
    let audioContext = null;
    let audioProcessor = null;
    let originalAudioBuffer = null;
    let processedAudioBuffer = null;
    let audioFile = null;
    
    // Initialize WaveSurfer
    function initWaveSurfer() {
        if (wavesurfer) {
            wavesurfer.destroy();
        }
        
        wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4a74a8',
            progressColor: '#2575fc',
            cursorColor: '#333',
            barWidth: 2,
            barRadius: 3,
            cursorWidth: 1,
            height: 128,
            barGap: 2
        });
        
        // Update time displays
        wavesurfer.on('ready', () => {
            const duration = wavesurfer.getDuration();
            totalTimeDisplay.textContent = formatTime(duration);
            currentTimeDisplay.textContent = '0:00';
        });
        
        wavesurfer.on('audioprocess', () => {
            const currentTime = wavesurfer.getCurrentTime();
            currentTimeDisplay.textContent = formatTime(currentTime);
        });
        
        wavesurfer.on('finish', () => {
            playButton.style.display = 'flex';
            pauseButton.style.display = 'none';
        });
    }
    
    // Format time in mm:ss
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    // Handle file uploads
    function handleFileUpload(file) {
        // Show loading indicator
        loadingOverlay.style.display = 'flex';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner"></div>
            <p>ファイルを読み込み中...</p>
        `;
        
        try {
            if (!file) {
                throw new Error('ファイルが選択されていません。');
            }
            
            if (!file.type.includes('audio')) {
                throw new Error('選択されたファイルは音声ファイルではありません。サポートされている形式: MP3, WAV, OGG, AAC');
            }
            
            if (file.size > 100 * 1024 * 1024) { // 100MB limit
                throw new Error('ファイルサイズが大きすぎます。100MB以下のファイルを選択してください。');
            }
            
            audioFile = file;
            
            // Display file info with animation
            fileName.textContent = file.name;
            fileSize.textContent = formatFileSize(file.size);
            fileType.textContent = file.type;
            fileInfo.style.display = 'block';
            fileInfo.classList.add('file-info-appear');
            
            // Initialize audio context if needed
            if (!audioContext) {
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    if (!audioContext) {
                        throw new Error('お使いのブラウザは Web Audio API をサポートしていません。');
                    }
                    audioProcessor = new AudioProcessor(audioContext);
                } catch (contextError) {
                    console.error('Error creating audio context:', contextError);
                    throw new Error('音声処理エンジンの初期化に失敗しました。ブラウザを更新してください。');
                }
            }
            
            // Load audio file
            const reader = new FileReader();
            
            reader.onerror = () => {
                throw new Error('ファイルの読み込み中にエラーが発生しました。ファイルが破損している可能性があります。');
            };
            
            reader.onload = async (e) => {
                try {
                    // Update loading message
                    loadingOverlay.innerHTML = `
                        <div class="loading-spinner"></div>
                        <p>音声データを解析中...</p>
                    `;
                    
                    // Decode audio data
                    const arrayBuffer = e.target.result;
                    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                        throw new Error('ファイルデータが空または無効です。');
                    }
                    
                    // Use a timeout to ensure UI updates before heavy processing
                    setTimeout(async () => {
                        try {
                            originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                            
                            if (!originalAudioBuffer) {
                                throw new Error('音声データのデコードに失敗しました。サポートされていない形式の可能性があります。');
                            }
                            
                            console.log(`Audio loaded: ${originalAudioBuffer.duration.toFixed(2)}s, ${originalAudioBuffer.numberOfChannels} channels, ${originalAudioBuffer.sampleRate}Hz`);
                            
                            // Initialize wavesurfer and load audio
                            initWaveSurfer();
                            const blob = new Blob([arrayBuffer], { type: file.type });
                            
                            // Use promise to handle wavesurfer loading
                            await new Promise((resolve, reject) => {
                                wavesurfer.on('ready', resolve);
                                wavesurfer.on('error', reject);
                                wavesurfer.loadBlob(blob);
                                
                                // Set a timeout in case wavesurfer gets stuck
                                setTimeout(resolve, 5000);
                            });
                            
                            // Show editor section with animation
                            editorSection.style.display = 'block';
                            resultSection.style.display = 'none';
                            
                            // Scroll to editor section
                            setTimeout(() => {
                                editorSection.scrollIntoView({ behavior: 'smooth' });
                            }, 300);
                            
                            // Apply initial processing for preview
                            updateAudioPreview();
                        } catch (decodeError) {
                            console.error('Error decoding audio:', decodeError);
                            alert('音声ファイルのデコードに失敗しました。別の形式で保存されたファイルを試してください。');
                            loadingOverlay.style.display = 'none';
                        }
                    }, 100);
                } catch (error) {
                    console.error('Error processing audio file:', error);
                    alert(`音声ファイルの処理中にエラーが発生しました: ${error.message}`);
                    loadingOverlay.style.display = 'none';
                }
            };
            
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error('Error handling file upload:', error);
            alert(error.message || '音声ファイルの読み込み中にエラーが発生しました。');
            loadingOverlay.style.display = 'none';
        }
    }
    
    // Format file size in KB, MB
    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return bytes + ' bytes';
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(2) + ' KB';
        } else {
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }
    }
    
    // Update audio preview with current settings
    async function updateAudioPreview() {
        if (!originalAudioBuffer || !audioProcessor) {
            console.warn('Cannot update preview: missing audio buffer or processor');
            return;
        }
        
        // Show mini loading indicator in the waveform area
        const waveformEl = document.getElementById('waveform');
        waveformEl.innerHTML = '<div class="preview-loading">プレビュー処理中...</div>';
        
        // Disable controls during processing
        const controlElements = [
            dimensionSelect, rotationSpeed, depth, reverb, 
            liveQualityToggle, liveQuality2Toggle, processButton
        ];
        controlElements.forEach(el => { if(el) el.disabled = true; });
        
        // Get current settings with validation
        const settings = {
            dimension: dimensionSelect.value || '8d',
            rotationSpeed: parseFloat(rotationSpeed.value) || 1.0,
            depth: parseFloat(depth.value) || 0.5,
            reverb: parseFloat(reverb.value) || 0.3
        };
        
        // Update Live Quality mode settings in the audio processor
        audioProcessor.liveQualityEnabled = liveQualityToggle.checked;
        audioProcessor.liveQuality2Enabled = liveQuality2Toggle.checked;
        
        try {
            console.log('Processing audio preview with settings:', settings);
            
            // Process audio for preview (lightweight version)
            processedAudioBuffer = await audioProcessor.processAudioPreview(originalAudioBuffer, settings);
            
            if (!processedAudioBuffer) {
                throw new Error('処理後の音声データが生成されませんでした。');
            }
            
            // Convert to blob for wavesurfer
            const blob = await audioBufferToBlob(processedAudioBuffer, 'audio/wav');
            
            if (!blob) {
                throw new Error('音声データの変換に失敗しました。');
            }
            
            // Load the blob into wavesurfer with error handling
            try {
                await new Promise((resolve, reject) => {
                    wavesurfer.on('ready', resolve);
                    wavesurfer.on('error', reject);
                    wavesurfer.loadBlob(blob);
                    
                    // Set a timeout in case wavesurfer gets stuck
                    setTimeout(() => {
                        resolve(); // Resolve anyway after timeout
                    }, 5000);
                });
                
                console.log('Preview updated successfully');
            } catch (wavesurferError) {
                console.error('WaveSurfer error:', wavesurferError);
                throw new Error('波形の表示に失敗しました。');
            }
        } catch (error) {
            console.error('Error processing audio preview:', error);
            
            // Show a more user-friendly error message
            const errorMessage = error.message || 'プレビューの処理中に不明なエラーが発生しました。';
            alert('プレビュー処理エラー: ' + errorMessage);
            
            // Reinitialize wavesurfer to clear the loading indicator
            initWaveSurfer();
            
            // If original audio is available, try to at least show the original waveform
            try {
                if (audioFile) {
                    const reader = new FileReader();
                    reader.onload = e => {
                        const arrayBuffer = e.target.result;
                        const blob = new Blob([arrayBuffer], { type: audioFile.type });
                        wavesurfer.loadBlob(blob);
                    };
                    reader.readAsArrayBuffer(audioFile);
                }
            } catch (fallbackError) {
                console.error('Failed to load original audio as fallback:', fallbackError);
            }
        } finally {
            // Re-enable controls regardless of success or failure
            controlElements.forEach(el => { if(el) el.disabled = false; });
        }
    }
    
    // Convert AudioBuffer to Blob
    async function audioBufferToBlob(audioBuffer, type) {
        try {
            if (!audioBuffer) {
                console.error('Invalid audio buffer for conversion to blob');
                throw new Error('無効な音声データです');
            }
            
            if (!audioProcessor) {
                console.error('Audio processor not initialized');
                throw new Error('音声処理エンジンが初期化されていません');
            }
            
            const numberOfChannels = audioBuffer.numberOfChannels || 2;
            const length = audioBuffer.length || 0;
            const sampleRate = audioBuffer.sampleRate || 44100;
            
            if (length <= 0) {
                console.error('Audio buffer has invalid length:', length);
                throw new Error('音声データの長さが無効です');
            }
            
            console.log(`Converting audio buffer to blob: channels=${numberOfChannels}, sampleRate=${sampleRate}, length=${length}`);
            
            // Encode the audio buffer to WAV format
            const wavDataView = audioProcessor.encodeWAV(audioBuffer, numberOfChannels, sampleRate);
            
            if (!wavDataView) {
                console.error('WAV encoding failed, returned null or undefined');
                throw new Error('WAVエンコードに失敗しました');
            }
            
            // Create a blob from the WAV data
            return new Blob([wavDataView], { type: type || 'audio/wav' });
        } catch (error) {
            console.error('Error in audioBufferToBlob:', error);
            throw new Error(`音声データの変換中にエラーが発生しました: ${error.message}`);
        }
    }
    
    // Process and export audio
    async function processAndExportAudio() {
        if (!originalAudioBuffer || !audioProcessor) return;
        
        // Show loading overlay with animation
        loadingOverlay.style.display = 'flex';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner"></div>
            <p>処理中...</p>
            <div class="processing-steps">
                <div class="step active">音声データを準備中</div>
                <div class="step">3D効果を適用中</div>
                <div class="step">ファイルを生成中</div>
            </div>
        `;
        
        // Use setTimeout to ensure the display change takes effect before adding the active class
        setTimeout(() => {
            loadingOverlay.classList.add('active');
        }, 10);
        
        const settings = {
            dimension: dimensionSelect.value,
            rotationSpeed: parseFloat(rotationSpeed.value),
            depth: parseFloat(depth.value),
            reverb: parseFloat(reverb.value),
            format: formatSelect.value,
            mp3Quality: parseInt(mp3Quality.value)
        };
        
        // Update Live Quality mode settings in the audio processor
        audioProcessor.liveQualityEnabled = liveQualityToggle.checked;
        audioProcessor.liveQuality2Enabled = liveQuality2Toggle.checked;
        
        const steps = loadingOverlay.querySelectorAll('.step');
        
        try {
            // Update progress indicator
            steps[0].classList.add('completed');
            steps[1].classList.add('active');
            
            // Full quality processing
            const processedBuffer = await audioProcessor.processAudio(originalAudioBuffer, settings);
            
            // Update progress indicator
            steps[1].classList.remove('active');
            steps[1].classList.add('completed');
            steps[2].classList.add('active');
            
            // Convert to selected format
            let blob;
            let fileExtension;
            
            if (settings.format === 'wav') {
                blob = await audioProcessor.exportWAV(processedBuffer);
                fileExtension = 'wav';
            } else {
                blob = await audioProcessor.exportMP3(processedBuffer, settings.mp3Quality);
                fileExtension = 'mp3';
            }
            
            // Update progress indicator
            steps[2].classList.remove('active');
            steps[2].classList.add('completed');
            
            // Create download link
            const originalName = audioFile.name.split('.').slice(0, -1).join('.');
            const newFileName = `${originalName}_${settings.dimension}_3d.${fileExtension}`;
            
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = newFileName;
            downloadFileName.textContent = newFileName;
            
            // Show result section
            resultSection.style.display = 'block';
            window.scrollTo({ top: resultSection.offsetTop, behavior: 'smooth' });
        } catch (error) {
            console.error('Error processing audio:', error);
            const errorMessage = error.message || '音声処理中に不明なエラーが発生しました。';
            alert(`処理エラー: ${errorMessage}`);
            
            // Mark current step as failed
            const activeStep = loadingOverlay.querySelector('.step.active');
            if (activeStep) {
                activeStep.classList.remove('active');
                activeStep.classList.add('failed');
            }
        } finally {
            // Properly hide the loading overlay with animation
            setTimeout(() => {
                loadingOverlay.classList.remove('active');
                // Wait for the fade-out animation to complete before hiding
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                    // Reset steps for next time
                    steps.forEach(step => {
                        step.classList.remove('active', 'completed', 'failed');
                    });
                }, 300);
            }, 1000); // Show completed steps for a moment
        }
    }
    
    // Event Listeners
    
    // File Drop Area
    dropArea.addEventListener('click', () => {
        audioFileInput.click();
    });
    
    audioFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('active');
    });
    
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('active');
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('active');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    // Audio Player Controls
    playButton.addEventListener('click', () => {
        wavesurfer.play();
        playButton.style.display = 'none';
        pauseButton.style.display = 'flex';
    });
    
    pauseButton.addEventListener('click', () => {
        wavesurfer.pause();
        pauseButton.style.display = 'none';
        playButton.style.display = 'flex';
    });
    
    stopButton.addEventListener('click', () => {
        wavesurfer.stop();
        pauseButton.style.display = 'none';
        playButton.style.display = 'flex';
    });
    
    // Effect Controls
    dimensionSelect.addEventListener('change', () => {
        // Check if 32D mode is selected to enable/disable Live Quality Mode 2.0
        const is32D = dimensionSelect.value === '32d';
        liveQuality2Group.style.display = is32D ? 'block' : 'none';
        
        // If switching away from 32D, disable Live Quality Mode 2.0
        if (!is32D && liveQuality2Toggle.checked) {
            liveQuality2Toggle.checked = false;
        }
        
        updateAudioPreview();
    });
    
    rotationSpeed.addEventListener('input', () => {
        rotationSpeedValue.textContent = rotationSpeed.value;
        updateAudioPreview();
    });
    
    depth.addEventListener('input', () => {
        depthValue.textContent = depth.value;
        updateAudioPreview();
    });
    
    reverb.addEventListener('input', () => {
        reverbValue.textContent = reverb.value;
        updateAudioPreview();
    });
    
    liveQualityToggle.addEventListener('change', updateAudioPreview);
    
    liveQuality2Toggle.addEventListener('change', updateAudioPreview);
    
    // Format Selection
    formatSelect.addEventListener('change', () => {
        mp3QualityGroup.style.display = formatSelect.value === 'mp3' ? 'block' : 'none';
    });
    
    // Process Button
    processButton.addEventListener('click', processAndExportAudio);
    
    // Initialize
    initWaveSurfer();
    mp3QualityGroup.style.display = formatSelect.value === 'mp3' ? 'block' : 'none';
    pauseButton.style.display = 'none';
    
    // Initialize Live Quality Mode 2.0 visibility (only available for 32D mode)
    liveQuality2Group.style.display = dimensionSelect.value === '32d' ? 'block' : 'none';
});