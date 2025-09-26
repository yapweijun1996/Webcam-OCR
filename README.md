# Webcam OCR - Real-time Text Recognition

A modern, responsive webcam OCR application using Gemma-3-27B-IT model for real-time text extraction from camera feeds.

## ✨ Features

- **Auto-start**: Camera starts automatically when page loads, OCR begins immediately when camera is active
- **Real-time OCR**: Sends one API request per second (no waiting for previous requests to finish)
- **Concurrent Processing**: Multiple API requests can be in flight simultaneously for maximum responsiveness
- **Rate Limit Handling**: Automatically detects 429 errors and waits 5 seconds before retrying
- **Modern UI**: Clean, responsive design that works on mobile and desktop
- **Vanilla Technologies**: Pure HTML/CSS/JavaScript - no frameworks required
- **Cross-platform**: Works on desktop browsers and mobile devices
- **Direct API Integration**: Calls Gemini API directly from frontend
- **Frontend Only**: No server-side code required

## 🚀 Quick Start

### Prerequisites

- Modern web browser (Chrome 88+, Firefox 85+, Safari 14+, Edge 88+)
- Local web server (recommended for best experience)
- Gemini API key (get from Google AI Studio)

### Installation

1. **Clone or download** this repository to your local machine

2. **Get your Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

3. **Set up the API key** (choose one method):
   - **Environment variable**: `export GEMINI_API_KEY="your-api-key-here"`
   - **Browser console**: Open developer tools and run `GEMINI_API_KEY = "your-api-key-here"`
   - **Prompt**: The app will ask for your API key when you first use it

4. **Start a local web server** in the project directory:
   ```bash
   # Using Python 3
   python -m http.server 8000

   # Using PHP
   php -S localhost:8000

   # Using Node.js
   npx serve .
   ```

3. **Open your browser** and navigate to `http://localhost:8000`

4. **Grant camera permissions** when prompted

5. **Click "Start Camera"** to begin real-time OCR processing

## 📁 Project Structure

```
webcam-ocr/
├── index.html          # Main application page
├── styles.css          # Modern responsive CSS
├── script.js           # Core JavaScript functionality
├── test.html           # Testing and debugging page
└── README.md           # Complete documentation
```

## 🎯 How It Works

1. **Camera Access**: Uses `getUserMedia` API to access device camera
2. **Real-time Capture**: Automatically captures images every 2 seconds
3. **Image Processing**: Converts camera frames to base64 for transmission
4. **OCR Processing**: Sends images to backend API with Gemma-3-27B-IT model
5. **Result Display**: Shows extracted text with confidence scores

## ⚙️ Configuration

### Frontend Options

- **Auto-capture**: Enable/disable automatic 2-second interval capture
- **Preview**: Show/hide capture preview thumbnails
- **Results Limit**: Maximum number of results to display (default: 10)

### Backend Configuration

The API endpoint (`api/ocr.php`) includes:
- Input validation and error handling
- Real Gemini API integration with Gemma-3-27B-IT model
- Image processing and base64 encoding
- JSON response formatting
- CORS support for cross-origin requests
- Environment variable API key management

## 🔧 Development

### Adding Real OCR Integration

To integrate with actual OCR services:

1. **Replace mock processing** in `api/ocr.php`:
   ```php
   // Replace generateMockOCR() with actual OCR service call
   $ocrResult = callRealOCRService($imageData);
   ```

2. **Update response format** to match your OCR service:
   ```php
   return [
       'success' => true,
       'data' => [
           'text' => $ocrResult['text'],
           'confidence' => $ocrResult['confidence'],
           // ... additional fields
       ]
   ];
   ```

### Customization

- **Styling**: Modify `styles.css` for custom themes
- **Layout**: Update `index.html` structure for different layouts
- **Functionality**: Extend `script.js` for additional features

## 📱 Mobile Support

- **Responsive Design**: Automatically adapts to screen size
- **Touch Controls**: Optimized for touch interactions
- **Camera Selection**: Prefers back camera on mobile devices
- **Performance**: Optimized image processing for mobile devices

## 🛠️ Troubleshooting

### Common Issues

1. **Camera not working**:
   - Check browser permissions
   - Ensure HTTPS (required for camera access)
   - Try refreshing the page

2. **OCR not processing**:
   - Verify backend server is running
   - Check browser console for errors
   - Ensure API endpoint is accessible

3. **Poor performance**:
   - Close other applications
   - Check internet connection
   - Reduce image quality if needed

### Debug Mode

For development debugging, the application exposes a global `webcamOCR` object:
```javascript
// In browser console
webcamOCR.testWithMockData(); // Test with sample data
```

## 🔒 Security Considerations

- Camera access requires user permission
- Images are processed server-side only
- No data is stored permanently
- CORS headers configured for security

## 📈 Performance Tips

- Use modern browsers for best performance
- Close unnecessary browser tabs
- Ensure stable internet connection
- Consider using a local OCR service for faster processing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- **Gemma-3-27B-IT**: Advanced language model by Google
- **Modern Web APIs**: Camera, Canvas, and Fetch APIs
- **Open Source Community**: For inspiration and tools

---

**Ready to extract text from your camera feed? Start the application and begin real-time OCR processing!**