/**
 * Webcam OCR - Refactored, Modular, Maintainable
 * Vanilla JS, no frameworks. Focus: simple, logical, cheap to maintain (便宜维护).
 *
 * Modules:
 * - UIManager: DOM refs + UX helpers
 * - CameraManager: camera lifecycle + capture
 * - OCRService: request building + streaming/normal parsing + retry/throttle
 * - CaptureController: orchestrates capture loop (interval/async)
 * - App: wires everything together
 */

/* ========== Utils ========== */
const U = {
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  },
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth <= 768;
  },
  now() { return Date.now(); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  extractBase64(dataUrl) {
    const parts = String(dataUrl).split(',');
    if (parts.length !== 2) throw new Error('Invalid image data format');
    return parts[1];
  },
  confidenceHeuristic(text, responseMeta = {}) {
    if (!text || !text.trim()) return 0.1;
    let c = 0.9;
    if (text.length > 100) c = Math.min(c + 0.05, 0.98);
    else if (text.length < 10) c = Math.max(c - 0.1, 0.7);
    if (responseMeta.usage) c = Math.min(c + 0.02, 0.99);
    return Math.round(c * 1000) / 1000;
  }
};

/* ========== UI Manager ========== */
class UIManager {
  constructor() {
    this.el = {
      video: document.getElementById('cameraFeed'),
      canvas: document.getElementById('captureCanvas'),
      overlay: document.getElementById('cameraOverlay'),
      statusDot: document.querySelector('#statusIndicator .status-dot'),
      statusText: document.querySelector('#statusIndicator .status-text'),
      start: document.getElementById('startBtn'),
      stop: document.getElementById('stopBtn'),
      clear: document.getElementById('clearBtn'),
      toggle: document.getElementById('toggleCameraBtn'),
      results: document.getElementById('resultsList'),
      processing: document.getElementById('processingIndicator'),
      errorBox: document.getElementById('errorMessage'),
      modelSelect: document.getElementById('modelSelect'),
      modelInfo: document.getElementById('modelInfo'),
      debugBrowser: document.getElementById('debugBrowser'),
      debugHttps: document.getElementById('debugHttps'),
      debugCameraAPI: document.getElementById('debugCameraAPI'),
      debugStream: document.getElementById('debugStream'),
      debugVideoSize: document.getElementById('debugVideoSize'),
      topLoader: document.getElementById('topLoader'),
      footer: document.querySelector('.app-footer p'),
      // Token usage elements
      tokenUsageSection: document.getElementById('tokenUsageSection'),
      inputTokens: document.getElementById('inputTokens'),
      outputTokens: document.getElementById('outputTokens'),
      totalTokens: document.getElementById('totalTokens'),
      inputCost: document.getElementById('inputCost'),
      outputCost: document.getElementById('outputCost'),
      totalCost: document.getElementById('totalCost'),
    };
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalInputCost: 0,
      totalOutputCost: 0,
      sessionStartTime: Date.now()
    };
  }

  on(event, handler) {
    document.addEventListener(event, handler);
  }

  setStatus(text, type = 'default') {
    if (this.el.statusText) this.el.statusText.textContent = text;
    if (!this.el.statusDot) return;
    const dot = this.el.statusDot;
    const color = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      default: '#6b7280'
    }[type] || '#6b7280';
    dot.style.backgroundColor = color;
  }

  setButtons(cameraActive) {
    if (!this.el.start || !this.el.stop) return;
    this.el.start.disabled = cameraActive;
    this.el.stop.disabled = !cameraActive;
    if (this.el.toggle) this.el.toggle.disabled = !cameraActive;
    this.el.start.textContent = cameraActive ? 'Camera Active' : 'Start Camera';
    this.el.start.classList.toggle('btn-success', cameraActive);
  }

  showLoading(show) {
    if (this.el.topLoader) {
      this.el.topLoader.style.display = show ? 'block' : 'none';
    }
  }

  showError(msg) {
    if (!this.el.errorBox) return;
    const p = this.el.errorBox.querySelector('.error-text');
    if (p) p.textContent = msg;
    this.el.errorBox.style.display = 'block';
  }

  hideError() {
    if (this.el.errorBox) this.el.errorBox.style.display = 'none';
  }

  showOverlay() {
    if (this.el.overlay) this.el.overlay.classList.add('active');
  }

  hideOverlay() {
    if (this.el.overlay) this.el.overlay.classList.remove('active');
  }

  clearResults() {
    if (this.el.results) this.el.results.innerHTML = '';
    this.setStatus('Results cleared', 'warning');
  }

  addResult(text, confidence) {
    if (!this.el.results) return;
    if (!text || !String(text).trim()) return;

    const item = document.createElement('div');
    item.className = 'result-item';

    const ts = new Date().toLocaleTimeString();
    const conf = typeof confidence === 'number' ? Math.round(confidence * 100) : 'N/A';
    const cls = typeof conf === 'number'
      ? (conf >= 90 ? 'high-confidence' : conf >= 70 ? 'medium-confidence' : 'low-confidence')
      : '';

    item.innerHTML = `
      <div class="result-timestamp ${cls}">
        ${ts} - Confidence: ${conf}%
      </div>
      <div class="result-text">${U.escapeHtml(text)}</div>
    `;

    this.el.results.insertBefore(item, this.el.results.firstChild);

    // Keep 15 latest
    while (this.el.results.children.length > 15) {
      this.el.results.removeChild(this.el.results.lastChild);
    }
    this.el.results.scrollTop = 0;
    item.style.animation = 'slideIn 0.3s ease, highlightNew 0.5s ease';
  }

  updateModelInfo() {
    try {
      const cfg = window.GeminiConfig || {};
      const selected = this.el.modelSelect?.value || cfg.defaultModel;
      const model = cfg.models?.[selected];
      const info = model?.description || 'Model description not available';
      if (this.el.modelInfo) this.el.modelInfo.textContent = info;
      this.updateFooter(model);
    } catch {
      if (this.el.modelInfo) this.el.modelInfo.textContent = 'Model description not available';
      this.updateFooter(null);
    }
  }

  updateFooter(model) {
   if (!this.el.footer) return;
   const modelName = model?.displayName || model?.name || 'AI';
   const baseText = `Powered by ${modelName} | Real-time OCR System`;
   const version = 'v1.2.0'; // Or get from a config
   const platform = U.isMobile() ? 'Mobile' : 'Desktop';
   this.el.footer.textContent = `${baseText} | ${version} | ${platform}`;
  }

  updateDebug({ streamActive, videoWidth, videoHeight }) {
    if (this.el.debugBrowser) this.el.debugBrowser.textContent = navigator.userAgent.split(' ').pop();
    if (this.el.debugHttps) this.el.debugHttps.textContent = window.location.protocol === 'https:' ? '✅' : '❌';
    if (this.el.debugCameraAPI) this.el.debugCameraAPI.textContent = !!(navigator.mediaDevices?.getUserMedia) ? '✅' : '❌';
    if (this.el.debugStream) this.el.debugStream.textContent = streamActive ? '✅ Active' : '❌ Inactive';
    if (this.el.debugVideoSize) this.el.debugVideoSize.textContent = streamActive ? `${videoWidth}x${videoHeight}` : 'N/A';
  }

  // Token usage and cost tracking methods
  showTokenUsageSection() {
    if (this.el.tokenUsageSection) {
      this.el.tokenUsageSection.style.display = 'block';
    }
  }

  hideTokenUsageSection() {
    if (this.el.tokenUsageSection) {
      this.el.tokenUsageSection.style.display = 'none';
    }
  }

  updateTokenUsage(inputTokens, outputTokens, modelName) {
    const CFG = window.GeminiConfig || {};
    const inputCost = CFG.tokenEstimation?.calculateCost(inputTokens, true, modelName) || 0;
    const outputCost = CFG.tokenEstimation?.calculateCost(outputTokens, false, modelName) || 0;
    const totalCost = inputCost + outputCost;

    // Update session totals
    this.tokenUsage.totalInputTokens += inputTokens;
    this.tokenUsage.totalOutputTokens += outputTokens;
    this.tokenUsage.totalInputCost += inputCost;
    this.tokenUsage.totalOutputCost += outputCost;

    // Update display
    this.updateTokenDisplay();
  }

  updateTokenDisplay() {
    const { totalInputTokens, totalOutputTokens, totalInputCost, totalOutputCost } = this.tokenUsage;
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalCostValue = totalInputCost + totalOutputCost;

    if (this.el.inputTokens) this.el.inputTokens.textContent = totalInputTokens.toLocaleString();
    if (this.el.outputTokens) this.el.outputTokens.textContent = totalOutputTokens.toLocaleString();
    if (this.el.totalTokens) this.el.totalTokens.textContent = totalTokens.toLocaleString();

    if (this.el.inputCost) this.el.inputCost.textContent = `$${totalInputCost.toFixed(6)}`;
    if (this.el.outputCost) this.el.outputCost.textContent = `$${totalOutputCost.toFixed(6)}`;
    if (this.el.totalCost) this.el.totalCost.textContent = `$${totalCostValue.toFixed(6)}`;
  }

  resetTokenUsage() {
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalInputCost: 0,
      totalOutputCost: 0,
      sessionStartTime: Date.now()
    };
    this.updateTokenDisplay();
  }

  getSessionDuration() {
    return Math.floor((Date.now() - this.tokenUsage.sessionStartTime) / 1000);
  }
}

/* ========== Camera Manager ========== */
class CameraManager {
  constructor(ui) {
    this.ui = ui;
    this.stream = null;
    this.currentFacing = U.isMobile() ? 'environment' : 'user';
    this.currentDeviceId = null;
    this._devicesCache = null;
  }

  async start(options = {}) {
    this.ui.setStatus('Starting camera...', 'warning');

    if (this.stream) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera not supported in this browser');
    }

    const preferredFacing = options.facing || this.currentFacing || (U.isMobile() ? 'environment' : 'user');

    const constraints = {
      video: {
        width: { ideal: U.isMobile() ? 640 : 1280, max: 1920 },
        height: { ideal: U.isMobile() ? 480 : 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    };

    if (options.deviceId) {
      constraints.video.deviceId = { exact: options.deviceId };
    } else {
      constraints.video.facingMode = { ideal: preferredFacing };
    }

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.ui.el.video.srcObject = this.stream;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Camera startup timeout')), 10000);
      const onReady = () => { clearTimeout(timeout); resolve(); };
      if (this.ui.el.video.readyState >= 2) onReady();
      else {
        this.ui.el.video.onloadedmetadata = onReady;
        this.ui.el.video.onloadeddata = onReady;
        setTimeout(function check() {
          if (this.ui.el.video.readyState >= 2) onReady();
          else setTimeout(check.bind(this), 100);
        }.bind(this), 100);
      }
    });

    // Remember what we used
    this.currentFacing = preferredFacing;
    this.currentDeviceId = options.deviceId || null;

    // Resize canvas
    this.ui.el.canvas.width = this.ui.el.video.videoWidth;
    this.ui.el.canvas.height = this.ui.el.video.videoHeight;

    this.ui.setStatus('Camera active', 'success');
    this.ui.setButtons(true);
    this.ui.showTokenUsageSection(); // Show token usage when camera starts
    this.ui.updateDebug({
      streamActive: true,
      videoWidth: this.ui.el.video.videoWidth,
      videoHeight: this.ui.el.video.videoHeight
    });
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.ui.setStatus('Camera stopped', 'warning');
    this.ui.setButtons(false);
    this.ui.hideOverlay();
    this.ui.hideTokenUsageSection(); // Hide token usage when camera stops
    this.ui.updateDebug({ streamActive: false, videoWidth: 0, videoHeight: 0 });
  }

  isActive() { return !!this.stream; }

  async enumerateVideoDevices(force = false) {
    if (this._devicesCache && !force) return this._devicesCache;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === 'videoinput');
    this._devicesCache = videos;
    return videos;
  }

  async pickDeviceIdByFacing(facing = 'environment') {
    try {
      const videos = await this.enumerateVideoDevices(true);
      const labelMatch = (label, facing) => {
        label = (label || '').toLowerCase();
        if (facing === 'environment') return /back|rear|environment/.test(label);
        return /front|user|face/.test(label);
      };
      const labeled = videos.find(v => labelMatch(v.label, facing));
      if (labeled) return labeled.deviceId;
      if (videos.length === 2) {
        return facing === 'environment' ? videos[1].deviceId : videos[0].deviceId;
      }
      return videos[0]?.deviceId || null;
    } catch {
      return null;
    }
  }

  async toggleFacing() {
    const target = this.currentFacing === 'environment' ? 'user' : 'environment';
    const deviceId = await this.pickDeviceIdByFacing(target);

    this.stop();
    await this.start({ deviceId, facing: target });
    this.currentFacing = target;
    this.currentDeviceId = deviceId || null;
  }

  captureJpeg(quality = 0.8) {
    if (!this.isActive()) return null;
    const ctx = this.ui.el.canvas.getContext('2d');
    ctx.drawImage(this.ui.el.video, 0, 0, this.ui.el.canvas.width, this.ui.el.canvas.height);
    return this.ui.el.canvas.toDataURL('image/jpeg', quality);
  }
}

/* ========== OCR Service ========== */
class OCRService {
  constructor(getApiKey) {
    this.getApiKey = getApiKey;
  }

  getModel() {
    const cfg = window.GeminiConfig || {};
    const selected = document.getElementById('modelSelect')?.value || cfg.defaultModel;
    let model = cfg.models?.[selected];
    if (!model && cfg.defaultModel) model = cfg.models?.[cfg.defaultModel];
    if (!model) {
      const keys = Object.keys(cfg.models || {});
      if (keys.length) model = cfg.models[keys[0]];
    }
    return model || null;
  }

  buildRequest(imageBase64, promptText, model) {
    const generationConfig = {
      temperature: model.temperature ?? 0.1,
      maxOutputTokens: model.maxOutputTokens ?? 1024,
      topP: model.topP ?? 0.8,
      topK: model.topK ?? 40
    };

    if (model.thinkingConfig) {
      generationConfig.thinkingConfig = model.thinkingConfig;
    }

    return {
      contents: [{
        role: 'user',
        parts: [
          { text: promptText },
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: generationConfig
    };
  }

  parseTextValue(value) {
    // value might be plain string or stringified JSON like {"text":"..."}
    if (typeof value !== 'string') return '';
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed.text === 'string') return parsed.text;
    } catch { /* not JSON */ }
    return value;
  }

  async request(imageBase64) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('Gemini API key not found. Please set GEMINI_API_KEY or enter when prompted.');

    const model = this.getModel();
    if (!model) throw new Error('No valid model configuration found.');

    const CFG = window.GeminiConfig || {};
    const promptText =
      (CFG.prompts?.textOnly && String(CFG.prompts.textOnly).trim()) ||
      'Extract ONLY the visible text from the image. Respond with TEXT ONLY, no JSON, no markdown, no code fences, no explanations.';

    const req = this.buildRequest(imageBase64, promptText, model);
    const rawEndpoint = model.apiEndpoint || 'generateContent';
    const endpoint = /stream/i.test(rawEndpoint) ? 'generateContent' : rawEndpoint; // 强制非流式
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:${endpoint}?key=${apiKey}`;

    const maxRetries = CFG.rateLimit?.maxRetries ?? 1;
    const baseDelay = CFG.rateLimit?.retryDelay ?? 5000;
    const backoff = CFG.rateLimit?.backoffMultiplier ?? 1;

    let attempt = 0;
    let response;
    let lastError = null;

    while (attempt <= maxRetries) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req)
        });
        if (response.ok) break;
      } catch (e) {
        throw new Error(`Network error: ${e.message}`);
      }

      try { lastError = await response.json(); } catch { lastError = null; }

      if ((response.status === 429 || response.status === 500) && attempt < maxRetries) {
        const waitMs = Math.round(baseDelay * Math.pow(backoff, attempt));
        await U.sleep(waitMs);
        attempt++;
        continue;
      }

      throw new Error(`API error: ${lastError?.error?.message || response.statusText || 'Unknown error'}`);
    }

    if (!response?.ok) {
      throw new Error(`API error after retries: ${lastError?.error?.message || response?.statusText || 'Unknown'}`);
    }

    // 统一使用非流式解析
     const json = await response.json();
     const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
     const text = raw || (typeof json?.candidates?.[0]?.content?.parts?.[0] === 'string'
       ? json.candidates[0].content.parts[0]
       : json?.candidates?.[0]?.content?.parts?.[0]?.text || '');

     // Extract token usage from response metadata
     const usage = json?.usageMetadata || {};
     const inputTokens = usage.promptTokenCount || 0;
     const outputTokens = usage.candidatesTokenCount || usage.responseTokenCount || 0;

     return {
       text: this.parseTextValue(text || ''),
       meta: json || {},
       tokenUsage: { inputTokens, outputTokens }
     };
  }
}

/* ========== Capture Controller ========== */
class CaptureController {
  constructor(ui, camera, ocr) {
    this.ui = ui;
    this.camera = camera;
    this.ocr = ocr;
    this.mode = 'async'; // default
    this.intervalId = null;
    this.asyncRunning = false;
    this.throttleUntil = 0;
    this.lastCaptureTime = 0;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
  }

  setMode(mode) { this.mode = mode; }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.asyncRunning = false;
    this.consecutiveErrors = 0; // 重置错误计数
    if (this.camera.isActive()) this.ui.setStatus('Camera active', 'success');
  }

  // 改进的异步循环逻辑
  async runAsyncLoop() {
    this.lastCaptureTime = Date.now();
    this.consecutiveErrors = 0;

    // 添加页面卸载监听，确保清理资源
    const handlePageUnload = () => {
      this.asyncRunning = false;
    };
    window.addEventListener('beforeunload', handlePageUnload);

    try {
      while (this.asyncRunning && this.camera.isActive()) {
        try {
          this.lastCaptureTime = Date.now();
          await this.captureOnce(true);
          this.consecutiveErrors = 0; // 成功时重置计数

          // 动态间隔：基于处理时间调整，避免过度请求
          const processingTime = Date.now() - this.lastCaptureTime;
          const dynamicDelay = Math.max(1000, processingTime * 0.1);
          await U.sleep(dynamicDelay);

        } catch (error) {
          this.consecutiveErrors++;
          console.warn('Async capture error:', error);

          // 错误退避策略：避免频繁错误时过度请求
          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            this.ui.setStatus('Too many errors - pausing capture', 'error');
            await U.sleep(5000); // 暂停5秒后重试
            this.consecutiveErrors = 0; // 重置计数
          } else {
            // 递增延迟：1秒、2秒、3秒...
            const backoffDelay = 1000 * this.consecutiveErrors;
            await U.sleep(backoffDelay);
          }
        }
      }
    } finally {
      // 清理事件监听器
      window.removeEventListener('beforeunload', handlePageUnload);
    }
  }

  async start() {
    if (!this.camera.isActive()) return;
    this.stop();

    if (this.mode === 'interval') {
      if (this.intervalId) return;
      this.intervalId = setInterval(() => this.captureOnce(false), 1000);
    } else {
      if (this.asyncRunning) return;
      this.asyncRunning = true;
      this.runAsyncLoop(); // 启动异步循环，不等待
    }
    this.ui.setStatus('Auto-capture active', 'success');
  }

  async captureOnce(waitForResponse) {
    // global throttle
    const now = U.now();
    if (this.throttleUntil > now) {
      const remain = Math.ceil((this.throttleUntil - now) / 1000);
      this.ui.setStatus(`Throttled - waiting ${remain}s`, 'warning');
      if (waitForResponse) await U.sleep(this.throttleUntil - now);
    }

    const dataUrl = this.camera.captureJpeg(0.8);
    if (!dataUrl) return;

    try {
      this.ui.showLoading(true);
      this.ui.hideError();

      const base64 = U.extractBase64(dataUrl);

      const { text, meta, tokenUsage } = await this.ocr.request(base64);

      // Update token usage if available
      if (tokenUsage && this.ui.showTokenUsageSection) {
        const model = this.ocr.getModel();
        const modelName = model?.name || 'gemini-2.5-flash-lite';
        this.ui.updateTokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, modelName);
      }

      // Trim and clean the OCR result
      const cleanedText = this.app.cleanOcrResult(text);
      const lower = (cleanedText || '').trim().toLowerCase();

      // Use configurable no-text patterns from config (case-insensitive)
      const cfg = window.GeminiConfig || {};
      const patterns = Array.isArray(cfg.noTextPatterns) && cfg.noTextPatterns.length
        ? cfg.noTextPatterns
        : ['no text','no text detected','no text visible','no readable text','no text found','no text in the image','no visible text','image blur','blurred','blurry','too blurry','no text detect and image blur'];

      const isNoText = !lower || patterns.some(p => lower.includes(String(p).toLowerCase()));
      const blurPhrase = 'no text detect and image blur';

      if (isNoText) {
        // Blur/no-text signals should NOT appear in results list; status only
        if (lower === blurPhrase) {
          this.ui.setStatus('Image blur', 'warning');
        } else {
          this.ui.setStatus('No text detected', 'warning');
        }
        return;
      }

      const confidence = U.confidenceHeuristic(cleanedText, meta);
      this.ui.addResult(cleanedText, confidence);
      this.ui.setStatus('OCR completed', 'success');
    } catch (e) {
      const msg =
        e.message.includes('API key') ? 'API key required - please set GEMINI_API_KEY'
        : e.message.includes('Network') ? 'Network connection error'
        : e.message.includes('429') || e.message.includes('500') ? 'Service temporarily unavailable'
        : 'OCR processing failed';
      this.ui.setStatus(msg, 'error');

      // backoff 5s after server-side issues to be polite
      if (e.message.includes('429') || e.message.includes('500')) {
        this.throttleUntil = U.now() + 5000;
      }
      console.warn('OCR error:', e);
    } finally {
      this.ui.showLoading(false);
    }
  }
}

/* ========== App (Composition Root) ========== */
class App {
  constructor() {
    this.ui = new UIManager();
    this.camera = new CameraManager(this.ui);
    this.ocr = new OCRService(this.getApiKey.bind(this));
    this.capture = new CaptureController(this.ui, this.camera, this.ocr);

    this.bindEvents();
    this.initDebugPanel();
    this.autoStartCamera();
  }

  cleanOcrResult(text) {
    if (!text) return '';
    // Define patterns to remove
    const patternsToRemove = [
      /@ezlink/i,
      /Check card balance and reload via/i,
      /Scan QR to download/i,
      /adult/i,
      /AD: \d{1,3}\/\d{1,3}/i
    ];
    
    let cleanedText = text;
    patternsToRemove.forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '');
    });

    // Split by lines, trim each line, and filter out empty lines
    const lines = cleanedText.split('\n').map(line => line.trim()).filter(Boolean);
    return lines.join('\n');
  }

  bindEvents() {
    // Buttons
    this.ui.el.start?.addEventListener('click', async () => {
      await this.camera.start(); // ensure camera is ready before OCR
      const modeEl = document.querySelector('input[name="captureMode"]:checked');
      const mode = modeEl ? modeEl.value : 'async'; // default to async
      this.capture.setMode(mode);
      // Do not await: continuous loop; keep UI responsive (中文解释: 不要等待, 让UI保持响应)
      this.capture.start();
    });
    this.ui.el.stop?.addEventListener('click', () => {
      this.capture.stop();
      this.camera.stop();
    });
    this.ui.el.toggle?.addEventListener('click', async () => {
      const wasRunning = !!(this.capture.asyncRunning || this.capture.intervalId);
      this.capture.stop();
      try {
        this.ui.setStatus('Switching camera...', 'warning');
        await this.camera.toggleFacing();
        this.ui.setStatus('Camera switched', 'success');
      } catch (e) {
        this.ui.setStatus('Switch camera failed', 'error');
        console.warn('Toggle camera error:', e);
      }
      if (wasRunning && this.camera.isActive()) {
        this.capture.start();
      }
    });
    this.ui.el.clear?.addEventListener('click', () => this.ui.clearResults());

    // Capture mode
    document.querySelectorAll('input[name="captureMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.capture.setMode(radio.value);
        this.capture.stop();
        if (this.camera.isActive()) this.capture.start();
      });
    });

    // Model selection
    this.ui.el.modelSelect?.addEventListener('change', () => this.ui.updateModelInfo());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.capture.stop(); this.camera.stop(); }
    });

    // Page visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.capture.stop();
      } else if (this.camera.isActive()) {
        this.capture.start();
      }
    });

    // Init model info
    this.ui.updateModelInfo();
  }

  async autoStartCamera() {
    try {
      const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
      // permissions API may not be available on all browsers
      const canQuery = navigator.permissions?.query;
      if (canQuery) {
        try {
          const res = await navigator.permissions.query({ name: 'camera' });
          if (res.state === 'denied') {
            this.ui.setStatus('Click "Start Camera" to begin', 'warning');
            return;
          }
        } catch { /* ignore */ }
      }

      await this.camera.start();

      setTimeout(() => {
        if (this.camera.isActive()) {
          const modeEl = document.querySelector('input[name="captureMode"]:checked');
          const mode = modeEl ? modeEl.value : 'interval';
          this.capture.setMode(mode);
          this.capture.start();
        }
      }, 1000);
    } catch (e) {
      console.warn('Auto-start camera failed', e);
      this.ui.setStatus('Click "Start Camera" to begin', 'warning');
      if (e.name === 'NotFoundError') this.ui.setStatus('No camera detected', 'error');
    }
  }

  initDebugPanel() {
    const isDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) debugInfo.style.display = isDevelopment ? 'block' : 'none';
    if (isDevelopment) {
      this.ui.updateDebug({
        streamActive: this.camera.isActive(),
        videoWidth: this.ui.el.video.videoWidth,
        videoHeight: this.ui.el.video.videoHeight
      });
    }
  }

  // Get API key from env / localStorage / prompt
  getApiKey() {
    try {
      if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) {
        return GEMINI_API_KEY;
      }
    } catch {}
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) return stored;

    const key = prompt('Enter your Gemini API key (https://aistudio.google.com/):');
    if (key && key.trim()) {
      localStorage.setItem('gemini_api_key', key.trim());
      return key.trim();
    }
    return null;
  }
}

/* ========== Bootstrap ========== */
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  // Expose in dev
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.webcamOCR = app;
  }
  
  // Pass app instance to controller
  if (app.capture) {
    app.capture.app = app;
  }
});