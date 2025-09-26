/**
 * Webcam OCR - Real-time Text Recognition
 * Uses Gemma-3-27B-IT model for OCR processing
 * Vanilla JavaScript implementation
 */

class WebcamOCR {
    constructor() {
        this.stream = null;
        this.autoCaptureInterval = null;
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

        // Options
        this.showPreviewCheckbox = document.getElementById('showPreview');
        this.captureModeInputs = document.querySelectorAll('input[name="captureMode"]');
        this.getCaptureMode = () => {
            const el = document.querySelector('input[name="captureMode"]:checked');
            return el ? el.value : 'interval';
        };

        // Results
        this.resultsList = document.getElementById('resultsList');
        this.processingIndicator = document.getElementById('processingIndicator');
        this.errorMessage = document.getElementById('errorMessage');

        this.initializeEventListeners();
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
            // Auto-start camera
            await this.startCamera();

            // Auto-enable auto-capture immediately (no delay)
            // Start capture according to selected mode if not already running
            if (!this.autoCaptureInterval && !this.asyncRunning) {
                this.startAutoCapture();
            }

        } catch (error) {
            console.error('Auto-start camera failed:', error);
            this.updateStatus('Auto-start failed', 'error');
            // Don't show error messages in UI - only log to console for debugging
        }
    }

    initializeEventListeners() {
        // Button events
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.captureBtn.addEventListener('click', () => this.captureImage());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.clearBtn.addEventListener('click', () => this.clearResults());

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

            // Camera constraints - adaptive based on device
            const isMobile = this.detectMobile();
            const constraints = {
                video: {
                    width: isMobile ? 640 : 1280,
                    height: isMobile ? 480 : 720,
                    facingMode: 'environment', // Prefer back camera on mobile
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.cameraFeed.srcObject = this.stream;

            // Wait for video to be ready
            await new Promise((resolve) => {
                this.cameraFeed.onloadedmetadata = resolve;
            });

            // Set canvas size to match video
            this.captureCanvas.width = this.cameraFeed.videoWidth;
            this.captureCanvas.height = this.cameraFeed.videoHeight;

            this.updateStatus('Camera active', 'success');
            this.updateButtonStates(true);

        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateStatus('Camera error', 'error');
            // Don't show error messages in UI - only log to console for debugging
            // this.showError('Unable to access camera. Please check permissions and try again.');
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
        while (this.asyncRunning && this.stream) {
            // respect global throttle
            if (this.throttleUntil && Date.now() < this.throttleUntil) {
                const wait = this.throttleUntil - Date.now();
                await new Promise(r => setTimeout(r, wait));
                if (!this.asyncRunning) break;
            }
            try {
                // capture frame
                const canvas = this.captureCanvas;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(this.cameraFeed, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/jpeg', 0.8);
                if (this.showPreviewCheckbox.checked) this.showCapturePreview(imageData);
                await this.processOCR(imageData);
            } catch (e) {
                console.error('Async capture loop error:', e);
                // on error, wait 1s before retry to avoid tight loop
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        this.asyncRunning = false;
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
    
        try {
            // Get API key from environment variable or prompt user
            const apiKey = this.getApiKey();

            if (!apiKey) {
                throw new Error('Gemini API key not found. Please set GEMINI_API_KEY.');
            }

            // Convert image to base64
            const imageBase64 = this.extractBase64FromDataUrl(imageData);

            // Prepare request for Gemini Vision API (use external config when present)
            const CFG = (typeof window !== 'undefined' && window.GeminiConfig) ? window.GeminiConfig : {};
            const promptText = CFG.prompts?.jsonText || CFG.prompts?.invoice || CFG.prompts?.default || 'Extract all text from this image. Return only the text content without any additional formatting or explanation.';
            const generationConfig = {
                temperature: CFG.model?.temperature ?? 0.1,
                maxOutputTokens: CFG.model?.maxOutputTokens ?? 1024,
                ...(CFG.model?.topP ? { topP: CFG.model.topP } : {}),
                ...(CFG.model?.topK ? { topK: CFG.model.topK } : {})
            };
    
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
                generationConfig
            };
    
            // Make API call to Gemini with configurable retries and backoff
            const modelName = CFG.model?.name || 'gemma-3-27b-it';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const maxRetries = (CFG.rateLimit?.maxRetries ?? 1);
            const baseDelay = (CFG.rateLimit?.retryDelay ?? 5000);
            const backoff = (CFG.rateLimit?.backoffMultiplier ?? 1);
    
            let attempt = 0;
            let response;
            let lastErrorData = null;
    
            while (attempt <= maxRetries) {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                });
    
                if (response.ok) break;
    
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
    
            const result = await response.json();

            // Parse JSON response using config validator
            const parsed = CFG.validator?.parseOrEmpty(result.candidates?.[0]?.content?.parts?.[0]?.text || '', 'text');
            const extractedText = parsed?.text || '';

            if (!extractedText.trim()) {
                // No text detected - silently skip without showing error or result
                this.updateStatus('No text detected', 'warning');
                return;
            }

            // Calculate confidence based on response
            const confidence = this.calculateConfidence(extractedText, result);

            // Display the result
            this.displayResult({
                text: extractedText.trim(),
                confidence: confidence
            });

            this.updateStatus('OCR completed', 'success');

        } catch (error) {
            console.error('Error processing OCR:', error);
            this.updateStatus('OCR error', 'error');
            // Don't show error messages in UI - only log to console for debugging
            // this.showError(error.message || 'Failed to process image. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    displayResult(data) {
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

        // Add to top of results list
        this.resultsList.insertBefore(resultItem, this.resultsList.firstChild);

        // Limit results to last 10
        while (this.resultsList.children.length > 10) {
            this.resultsList.removeChild(this.resultsList.lastChild);
        }
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
        if (typeof GEMINI_API_KEY !== 'undefined') {
            return GEMINI_API_KEY;
        }

        // Try to get from localStorage
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey) {
            return storedKey;
        }

        // Prompt user for API key
        const userKey = prompt('Please enter your Gemini API key:');
        if (userKey) {
            localStorage.setItem('gemini_api_key', userKey);
            return userKey;
        }

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