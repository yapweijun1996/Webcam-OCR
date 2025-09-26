/**
 * Webcam OCR - Real-time Text Recognition
 * Uses Gemma-3-27B-IT model for OCR processing
 * Vanilla JavaScript implementation
 */

class WebcamOCR {
    constructor() {
        this.stream = null;
        this.autoCaptureInterval = null;
        this.asyncRunning = false;
        this.isProcessing = false;
        this.captureCount = 0;

        // DOM elements
        this.cameraFeed = document.getElementById('cameraFeed');
        this.captureCanvas = document.getElementById('captureCanvas');
        this.cameraOverlay = document.getElementById('cameraOverlay');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusDot = this.statusIndicator.querySelector('.status-dot');
        this.statusText = this.statusIndicator.querySelector('.status-text');

        // Buttons
        this.startBtn = document.getElementById('startBtn');
        this.captureBtn = document.getElementById('captureBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.testBtn = document.getElementById('testBtn');

        // Options
        this.showPreviewCheckbox = document.getElementById('showPreview');
        this.captureModeInputs = document.querySelectorAll('input[name="captureMode"]');
        this.modelSelect = document.getElementById('modelSelect');
        this.modelInfo = document.getElementById('modelInfo');
        this.getCaptureMode = () => {
            const el = document.querySelector('input[name="captureMode"]:checked');
            return el ? el.value : 'interval';
        };

        // Results
        this.resultsList = document.getElementById('resultsList');
        this.processingIndicator = document.getElementById('processingIndicator');
        this.errorMessage = document.getElementById('errorMessage');

        // Debug: Check if elements exist
        console.log('DOM Elements found:');
        console.log('resultsList:', this.resultsList);
        console.log('processingIndicator:', this.processingIndicator);
        console.log('errorMessage:', this.errorMessage);

        this.initializeEventListeners();
        this.initializeDebugInfo();
        this.autoStartCamera();

        // Ensure auto-capture starts based on selected mode
        if (!this.autoCaptureInterval && !this.asyncRunning) {
            const mode = this.getCaptureMode();
            if (mode === 'interval' || mode === 'async') {
                this.startAutoCapture();
            }
        }
    }

    async autoStartCamera() {
        try {
            console.log('Attempting auto-start camera...');

            // Check if already have permission
            const permissions = await navigator.permissions.query({ name: 'camera' });
            console.log('Camera permission status:', permissions.state);

            if (permissions.state === 'denied') {
                console.log('Camera permission denied, will prompt user');
                this.updateStatus('Click "Start Camera" to begin', 'warning');
                return;
            }

            // Auto-start camera
            await this.startCamera();
            console.log('Camera auto-started successfully');

            // Auto-enable auto-capture with a small delay to ensure camera is fully ready
            setTimeout(() => {
                if (!this.autoCaptureInterval && !this.asyncRunning && this.stream) {
                    console.log('Starting auto-capture after camera ready');
                    this.startAutoCapture();
                }
            }, 1000);

        } catch (error) {
            console.error('Auto-start camera failed:', error);
            this.updateStatus('Click "Start Camera" to begin', 'warning');

            // Provide specific guidance based on error type
            if (error.name === 'NotAllowedError') {
                console.log('User needs to grant camera permission');
            } else if (error.name === 'NotFoundError') {
                console.log('No camera available - user needs to connect camera');
                this.updateStatus('No camera detected', 'error');
            } else {
                console.log('Camera startup failed - user can retry manually');
            }
        }
    }

    initializeEventListeners() {
        // Button events
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.captureBtn.addEventListener('click', () => this.captureImage());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.clearBtn.addEventListener('click', () => this.clearResults());
        this.testBtn.addEventListener('click', () => this.testDisplay());

        // Capture mode radio events
        this.captureModeInputs.forEach(inp => {
            inp.addEventListener('change', () => {
                // Restart capture according to new mode
                this.stopAutoCapture();
                if (this.stream && (this.getCaptureMode() === 'interval' || this.getCaptureMode() === 'async')) {
                    this.startAutoCapture();
                }
            });
        });

        // Model selection events
        this.modelSelect.addEventListener('change', () => {
            this.updateModelInfo();
        });

        // Initialize model info
        this.updateModelInfo();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ') {
                e.preventDefault();
                this.captureImage();
            } else if (e.key === 'Escape') {
                this.stopCamera();
            }
        });

        // Handle page visibility change (pause when tab is not visible)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoCapture();
            } else if (this.stream && (this.getCaptureMode() === 'interval' || this.getCaptureMode() === 'async')) {
                this.startAutoCapture();
            }
        });
    }

    async startCamera() {
        try {
            this.updateStatus('Starting camera...', 'warning');

            // Check if camera is already active
            if (this.stream) {
                console.log('Camera already active');
                return;
            }

            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported in this browser');
            }

            // Camera constraints - more permissive for better compatibility
            const isMobile = this.detectMobile();
            const constraints = {
                video: {
                    width: { ideal: isMobile ? 640 : 1280, max: 1920 },
                    height: { ideal: isMobile ? 480 : 720, max: 1080 },
                    facingMode: 'user', // Use front camera by default for better compatibility
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: false
            };

            console.log('Requesting camera with constraints:', constraints);

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Camera stream obtained:', this.stream);

            this.cameraFeed.srcObject = this.stream;
            console.log('Video element source set');

            // Wait for video to be ready with multiple fallback methods
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Camera startup timeout'));
                }, 10000);

                const onReady = () => {
                    clearTimeout(timeout);
                    console.log('Camera ready, dimensions:', this.cameraFeed.videoWidth, 'x', this.cameraFeed.videoHeight);
                    resolve();
                };

                if (this.cameraFeed.readyState >= 2) {
                    onReady();
                } else {
                    this.cameraFeed.onloadedmetadata = onReady;
                    this.cameraFeed.onloadeddata = onReady;
                    // Fallback: check periodically
                    const checkReady = () => {
                        if (this.cameraFeed.readyState >= 2) {
                            onReady();
                        } else {
                            setTimeout(checkReady, 100);
                        }
                    };
                    setTimeout(checkReady, 100);
                }
            });

            // Set canvas size to match video
            this.captureCanvas.width = this.cameraFeed.videoWidth;
            this.captureCanvas.height = this.cameraFeed.videoHeight;
            console.log('Canvas size set to:', this.captureCanvas.width, 'x', this.captureCanvas.height);

            this.updateStatus('Camera active', 'success');
            this.updateButtonStates(true);
            this.updateDebugInfo();

        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus(`Camera error: ${error.message}`, 'error');

            // Provide helpful error messages
            if (error.name === 'NotAllowedError') {
                console.log('Camera permission denied - user needs to grant permission');
            } else if (error.name === 'NotFoundError') {
                console.log('No camera found on this device');
            } else if (error.name === 'NotSupportedError') {
                console.log('Camera not supported in this browser');
            } else if (error.name === 'NotReadableError') {
                console.log('Camera is being used by another application');
            }

            // Don't show error messages in UI - only log to console for debugging
            // this.showError(`Camera error: ${error.message}. Please check permissions and try again.`);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.stopAutoCapture();
        this.updateStatus('Camera stopped', 'warning');
        this.updateButtonStates(false);
        this.hideCameraOverlay();
        this.updateDebugInfo();
    }

    startAutoCapture() {
        if (!this.stream) return;
        const mode = this.getCaptureMode();
        // Prevent duplicate starts
        if (mode === 'interval') {
            if (this.autoCaptureInterval) return;
            this.stopAsyncCapture();
            this.autoCaptureInterval = setInterval(() => {
                // Send API request every second regardless of processing status
                this.captureImage();
            }, 1000); // 1 second
        } else if (mode === 'async') {
            if (this.asyncRunning) return;
            this.stopAutoCapture(); // clear interval if any
            this.startAsyncCapture();
        }
        this.updateStatus('Auto-capture active', 'success');
    }

    stopAutoCapture() {
        if (this.autoCaptureInterval) {
            clearInterval(this.autoCaptureInterval);
            this.autoCaptureInterval = null;
        }
        this.stopAsyncCapture();
        if (this.stream) {
            this.updateStatus('Camera active', 'success');
        }
    }

    // Async capture loop: capture -> send -> wait for response -> repeat
    async startAsyncCapture() {
        if (this.asyncRunning) return;
        this.asyncRunning = true;
        console.log('Starting async capture loop');

        while (this.asyncRunning && this.stream) {
            try {
                // respect global throttle
                if (this.throttleUntil && Date.now() < this.throttleUntil) {
                    const wait = this.throttleUntil - Date.now();
                    console.log(`Throttled, waiting ${Math.ceil(wait/1000)}s`);
                    await new Promise(r => setTimeout(r, wait));
                    if (!this.asyncRunning) break;
                }

                // capture frame
                const canvas = this.captureCanvas;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(this.cameraFeed, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/jpeg', 0.8);

                // show preview if enabled
                if (this.showPreviewCheckbox.checked) {
                    this.showCapturePreview(imageData);
                }

                // process OCR - errors are handled internally
                await this.processOCR(imageData);

                // wait before next capture
                await new Promise(r => setTimeout(r, 1000));

            } catch (e) {
                console.error('Async capture loop error:', e);
                this.updateStatus('Capture error - retrying...', 'warning');

                // on error, wait longer before retry to avoid tight loop
                await new Promise(r => setTimeout(r, 3000));

                // if still running, continue the loop
                if (!this.asyncRunning) break;
            }
        }

        this.asyncRunning = false;
        console.log('Async capture loop stopped');
    }

    stopAsyncCapture() {
        this.asyncRunning = false;
    }

    async captureImage() {
        if (!this.stream) return;

        this.showCameraOverlay();

        try {
            const canvas = this.captureCanvas;
            const ctx = canvas.getContext('2d');

            // Draw current video frame to canvas
            ctx.drawImage(this.cameraFeed, 0, 0, canvas.width, canvas.height);

            // Convert to base64
            const imageData = canvas.toDataURL('image/jpeg', 0.8);

            // Show preview if enabled
            if (this.showPreviewCheckbox.checked) {
                this.showCapturePreview(imageData);
            }

            // Send to OCR service (concurrent requests allowed)
            this.processOCR(imageData);

        } catch (error) {
            console.error('Error capturing image:', error);
            // Don't show error messages in UI - only log to console for debugging
            // this.showError('Failed to capture image. Please try again.');
        } finally {
            this.hideCameraOverlay();
        }
    }

    async processOCR(imageData) {
        this.showLoading(true);
        this.hideError();

        // Throttle: if previous 429/500 set a cooldown, skip sending new requests until cooldown expires
        const now = Date.now();
        if (this.throttleUntil && now < this.throttleUntil) {
            const remaining = Math.ceil((this.throttleUntil - now) / 1000);
            this.updateStatus(`Throttled - waiting ${remaining}s`, 'warning');
            this.showLoading(false);
            return;
        }

        // Get API key from environment variable or prompt user
        const apiKey = this.getApiKey();
        let currentApiKey = null; // Initialize for error logging

        if (!apiKey) {
            throw new Error('Gemini API key not found. Please set GEMINI_API_KEY environment variable or enter it when prompted.');
        }

        currentApiKey = apiKey; // Store for error logging

        try {
            // Convert image to base64
            const imageBase64 = this.extractBase64FromDataUrl(imageData);

            // Get current model configuration
            const currentModel = this.getCurrentModel();
            const CFG = (typeof window !== 'undefined' && window.GeminiConfig) ? window.GeminiConfig : {};
            const promptText = CFG.prompts?.jsonText || 'Extract all text from this image. Return only the text content without any additional formatting or explanation.';

            // Validate currentModel exists
            if (!currentModel) {
                throw new Error('No valid model configuration found. Please check your model selection.');
            }

            // Prepare request for Gemini Vision API
            const requestData = {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: promptText },
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: imageBase64
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: currentModel.temperature ?? 0.1,
                    maxOutputTokens: currentModel.maxOutputTokens ?? 1024,
                    topP: currentModel.topP ?? 0.8,
                    topK: currentModel.topK ?? 40,
                    thinkingConfig: {
                        thinkingBudget: 0
                    }
                }
            };

            // Make API call to Gemini with model-specific endpoint
            const modelName = currentModel.name;
            const apiEndpoint = currentModel.apiEndpoint || 'generateContent';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${apiEndpoint}?key=${apiKey}`;
            const maxRetries = (CFG.rateLimit?.maxRetries ?? 1);
            const baseDelay = (CFG.rateLimit?.retryDelay ?? 5000);
            const backoff = (CFG.rateLimit?.backoffMultiplier ?? 1);
    
            let attempt = 0;
            let response;
            let lastErrorData = null;

            while (attempt <= maxRetries) {
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                    });

                    if (response.ok) break;
                } catch (fetchError) {
                    console.error('Fetch error:', fetchError);
                    throw new Error(`Network error: ${fetchError.message}`);
                }
    
                // Attempt to parse error body if possible
                try {
                    lastErrorData = await response.json();
                } catch (e) {
                    lastErrorData = null;
                }
    
                // If rate limited (429) or server error (500) and we can retry, wait then retry
                if ((response.status === 429 || response.status === 500) && attempt < maxRetries) {
                    // Enforce a minimum global throttle of 5s for subsequent captures
                    this.throttleUntil = Date.now() + 5000;
    
                    const waitMs = Math.round(baseDelay * Math.pow(backoff, attempt));
                    console.warn(`Request failed with status ${response.status}. Waiting ${waitMs}ms before retry...`);
                    this.updateStatus(`Server busy - waiting ${Math.round(waitMs/1000)}s...`, 'warning');
                    this.showLoading(true);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    this.showLoading(false);
                    this.updateStatus('Retrying after wait...', 'warning');
                    attempt++;
                    continue;
                }
    
                // Non-retriable or out of retries -> set throttle and throw
                this.throttleUntil = Date.now() + 5000;
                throw new Error(`API error: ${lastErrorData?.error?.message || response.statusText || 'Unknown error'}`);
            }
    
            if (!response || !response.ok) {
                throw new Error(`API error after retries: ${lastErrorData?.error?.message || response?.statusText || 'Unknown error'}`);
            }
    
            let result;
            let extractedText = '';

            // Handle streaming vs non-streaming responses
            if (currentModel.supportsStreaming) {
                // Handle streaming response
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');

                        // Process complete lines
                        for (let i = 0; i < lines.length - 1; i++) {
                            const line = lines[i].trim();
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                                        extractedText += data.candidates[0].content.parts[0].text;
                                    }
                                } catch (e) {
                                    // Ignore parsing errors for incomplete chunks
                                }
                            }
                        }

                        // Keep incomplete line in buffer
                        buffer = lines[lines.length - 1];
                    }
                } finally {
                    reader.releaseLock();
                }
            } else {
                // Handle regular response
                result = await response.json();
                console.log('Raw API response:', result);

                // Parse JSON response
                extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // Fallback: try to extract text from the response in different ways
                if (!extractedText && result.candidates?.[0]?.content?.parts?.[0]) {
                    const part = result.candidates[0].content.parts[0];
                    if (typeof part === 'string') {
                        extractedText = part;
                    } else if (part.text) {
                        extractedText = part.text;
                    }
                }
            }

            console.log('Raw API response:', result);
            console.log('Extracted text:', extractedText);
            console.log('Text length:', extractedText.length);

            // Check for empty text or "no text" responses
            const noTextResponses = [
                'no text',
                'no text detected',
                'no text found',
                'no text in the image',
                'no visible text',
                'there is no text',
                'no readable text'
            ];

            const isNoText = noTextResponses.some(pattern =>
                extractedText.toLowerCase().includes(pattern.toLowerCase())
            );

            if (!extractedText.trim() || isNoText) {
                console.log('Filtering out no-text response:', extractedText.substring(0, 50) + '...');
                this.updateStatus('No text detected', 'warning');
                return;
            }

            // Calculate confidence based on response
            const confidence = this.calculateConfidence(extractedText, result);

            // Display the result
            console.log('OCR Result:', extractedText.trim(), 'Confidence:', confidence);
            console.log('About to call displayResult...');
            this.displayResult({
                text: extractedText.trim(),
                confidence: confidence
            });
            console.log('displayResult called successfully');

            this.updateStatus('OCR completed', 'success');

        } catch (error) {
            console.error('Error processing OCR:', error);

            // Provide specific error messages based on error type
            let errorMessage = 'OCR processing failed';
            if (error.message.includes('API key')) {
                errorMessage = 'API key required - please set GEMINI_API_KEY';
            } else if (error.message.includes('Network')) {
                errorMessage = 'Network connection error';
            } else if (error.message.includes('fetch')) {
                errorMessage = 'Failed to connect to OCR service';
            } else if (error.message.includes('429') || error.message.includes('500')) {
                errorMessage = 'Service temporarily unavailable';
            }

            this.updateStatus(errorMessage, 'error');
            console.log('OCR Error details:', {
                message: error.message,
                stack: error.stack,
                apiKey: currentApiKey ? 'Present' : 'Missing',
                model: currentModel?.name
            });
        } finally {
            this.showLoading(false);
        }
    }

    displayResult(data) {
        console.log('displayResult called with:', data);

        // Check if resultsList exists
        if (!this.resultsList) {
            console.error('resultsList element not found!');
            return;
        }

        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';

        const timestamp = new Date().toLocaleTimeString();
        const confidence = data.confidence ? Math.round(data.confidence * 100) : 'N/A';

        resultItem.innerHTML = `
            <div class="result-timestamp">
                ${timestamp} - Confidence: ${confidence}%
            </div>
            <div class="result-text">
                ${this.escapeHtml(data.text)}
            </div>
        `;

        console.log('Created result item:', resultItem);
        console.log('Results list before insert:', this.resultsList.children.length);

        // Add to top of results list
        this.resultsList.insertBefore(resultItem, this.resultsList.firstChild);

        console.log('Results list after insert:', this.resultsList.children.length);

        // Limit results to last 10
        while (this.resultsList.children.length > 10) {
            this.resultsList.removeChild(this.resultsList.lastChild);
        }

        console.log('Final results count:', this.resultsList.children.length);
    }

    showCapturePreview(imageData) {
        // Create a temporary preview (optional feature)
        // This could be implemented to show a thumbnail of captured image
    }

    clearResults() {
        this.resultsList.innerHTML = '';
        this.updateStatus('Results cleared', 'warning');
    }

    showLoading(show) {
        this.processingIndicator.style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const errorText = this.errorMessage.querySelector('.error-text');
        errorText.textContent = message;
        this.errorMessage.style.display = 'block';
    }

    hideError() {
        this.errorMessage.style.display = 'none';
    }

    showCameraOverlay() {
        this.cameraOverlay.classList.add('active');
    }

    hideCameraOverlay() {
        this.cameraOverlay.classList.remove('active');
    }

    updateStatus(text, type) {
        this.statusText.textContent = text;

        // Update status dot color
        this.statusDot.className = 'status-dot';
        switch (type) {
            case 'success':
                this.statusDot.style.backgroundColor = '#10b981';
                break;
            case 'error':
                this.statusDot.style.backgroundColor = '#ef4444';
                break;
            case 'warning':
                this.statusDot.style.backgroundColor = '#f59e0b';
                break;
            default:
                this.statusDot.style.backgroundColor = '#6b7280';
        }
    }

    updateButtonStates(cameraActive) {
        this.startBtn.disabled = cameraActive;
        this.captureBtn.disabled = !cameraActive;
        this.stopBtn.disabled = !cameraActive;

        if (cameraActive) {
            this.startBtn.textContent = 'Camera Active';
            this.startBtn.classList.add('btn-success');
        } else {
            this.startBtn.textContent = 'Start Camera';
            this.startBtn.classList.remove('btn-success');
        }
    }

    updateModelInfo() {
        try {
            const selectedModel = this.modelSelect.value;
            const config = (typeof window !== 'undefined' && window.GeminiConfig) ? window.GeminiConfig : {};
            const modelInfo = config.models?.[selectedModel];

            if (modelInfo && modelInfo.description) {
                this.modelInfo.textContent = modelInfo.description;
            } else {
                this.modelInfo.textContent = 'Model description not available';
            }
        } catch (error) {
            console.warn('Error updating model info:', error);
            this.modelInfo.textContent = 'Model description not available';
        }
    }

    getCurrentModel() {
        const config = (typeof window !== 'undefined' && window.GeminiConfig) ? window.GeminiConfig : {};
        const selectedModel = this.modelSelect.value;
        return config.models?.[selectedModel] || config.models?.[config.defaultModel] || null;
    }

    initializeDebugInfo() {
        // Show debug info only in development
        const isDevelopment = window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1' ||
                             window.location.protocol === 'file:';

        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            debugInfo.style.display = isDevelopment ? 'block' : 'none';
        }

        if (isDevelopment) {
            this.updateDebugInfo();
        }
    }

    updateDebugInfo() {
        const debugBrowser = document.getElementById('debugBrowser');
        const debugHttps = document.getElementById('debugHttps');
        const debugCameraAPI = document.getElementById('debugCameraAPI');
        const debugStream = document.getElementById('debugStream');
        const debugVideoSize = document.getElementById('debugVideoSize');

        if (debugBrowser) debugBrowser.textContent = navigator.userAgent.split(' ').pop();
        if (debugHttps) debugHttps.textContent = window.location.protocol === 'https:' ? '✅' : '❌';
        if (debugCameraAPI) debugCameraAPI.textContent = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? '✅' : '❌';
        if (debugStream) debugStream.textContent = this.stream ? '✅ Active' : '❌ Inactive';
        if (debugVideoSize) debugVideoSize.textContent = this.stream ?
            `${this.cameraFeed.videoWidth}x${this.cameraFeed.videoHeight}` : 'N/A';
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Get API key from environment variable or user input
    getApiKey() {
        // Try to get from environment variable first
        if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) {
            console.log('Using API key from environment variable');
            return GEMINI_API_KEY;
        }

        // Try to get from localStorage
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey) {
            console.log('Using API key from localStorage');
            return storedKey;
        }

        // Prompt user for API key with helpful message
        const userKey = prompt('Please enter your Gemini API key from Google AI Studio (https://aistudio.google.com/):');
        if (userKey && userKey.trim()) {
            localStorage.setItem('gemini_api_key', userKey.trim());
            console.log('API key saved to localStorage');
            return userKey.trim();
        }

        console.log('No API key provided');
        return null;
    }

    // Extract base64 data from data URL
    extractBase64FromDataUrl(dataUrl) {
        const parts = dataUrl.split(',');
        if (parts.length !== 2) {
            throw new Error('Invalid image data format');
        }
        return parts[1];
    }

    // Calculate confidence based on response quality
    calculateConfidence(text, response) {
        if (!text || text.trim().length === 0) {
            return 0.1; // Low confidence if no text
        }

        // Base confidence for Gemma model
        let confidence = 0.9;

        // Adjust based on text length (longer text usually means higher confidence)
        if (text.length > 100) {
            confidence = Math.min(confidence + 0.05, 0.98);
        } else if (text.length < 10) {
            confidence = Math.max(confidence - 0.1, 0.7);
        }

        // Check if response has usage metadata (indicates successful processing)
        if (response.usage) {
            confidence = Math.min(confidence + 0.02, 0.99);
        }

        return Math.round(confidence * 1000) / 1000;
    }

    // Generate demo OCR results for frontend-only demo (fallback)
    generateDemoOCR() {
        const demoTexts = [
            'Welcome to Webcam OCR - Real-time text recognition demo',
            'This application demonstrates real-time OCR capabilities',
            'Images are processed every 2 seconds automatically',
            'The quick brown fox jumps over the lazy dog',
            '0123456789 - Numbers and special characters detected',
            'Modern web technologies enable powerful applications',
            'Thank you for trying this OCR demonstration',
            'Real-time processing with instant results',
            'High accuracy text recognition system',
            'Cross-platform compatibility achieved'
        ];

        // Simulate varying confidence levels
        const baseConfidence = 0.85 + (Math.random() * 0.15); // 85-100%

        return {
            text: demoTexts[Math.floor(Math.random() * demoTexts.length)],
            confidence: Math.round(baseConfidence * 1000) / 1000
        };
    }

    // Utility method to test with mock data
    testWithMockData() {
        const mockResults = [
            'This is a test OCR result from the camera feed.',
            'Gemma-3-27B-IT model successfully processed the image.',
            'Real-time text recognition is working correctly.'
        ];

        mockResults.forEach((text, index) => {
            setTimeout(() => {
                this.displayResult({
                    text: text,
                    confidence: 0.95 - (index * 0.05)
                });
            }, index * 1000);
        });
    }

    // Test display function - call this from console to verify display works
    testDisplay() {
        console.log('Testing display function...');
        this.displayResult({
            text: 'Test OCR Result - Display is working!',
            confidence: 0.95
        });
        console.log('Test result should appear in the results list');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new WebcamOCR();

    // Add version info to footer
    const footer = document.querySelector('.app-footer p');
    footer.textContent += ` | v1.0.0 | ${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'}`;

    // Expose app instance for debugging (development only)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.webcamOCR = app;
    }
});

// Service Worker registration removed - not needed for core functionality
// The application works perfectly without service worker