// 🖥️ BROWSER CONSOLE VERIFICATION SCRIPT
// Copy-paste this into your browser console (F12) to monitor parallel OCR

console.log("🚀 ============ PARALLEL OCR MONITOR STARTING ============");

const documentId = 'eeb2949a-feaf-4878-b79b-bb09a72290f7';
let lastPageCount = 0;
let startTime = Date.now();

// 1. 📡 Real-time SSE Progress Monitor
const monitorSSE = () => {
    const eventSource = new EventSource(`/api/documents/${documentId}/ocr/stream`);
    
    eventSource.addEventListener('ocr_progress', (event) => {
        const data = JSON.parse(event.data);
        const currentTime = new Date().toLocaleTimeString();
        const pagesAdded = data.done - lastPageCount;
        const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        
        console.log(`⚡ [${currentTime}] OCR Progress:`, {
            pages: `${data.done}/${data.total}`,
            pagesAdded: pagesAdded,
            percent: `${data.percent}%`,
            totalMinutes: totalTime,
            confidence: `${data.avg_conf}%`
        });
        
        // 🔥 PARALLEL DETECTION
        if (pagesAdded >= 10) {
            console.log(`🚀 PARALLEL CONFIRMED: ${pagesAdded} pages added in one batch!`);
        } else if (pagesAdded === 1) {
            console.log(`🐌 SERIAL DETECTED: Only 1 page added (slow processing)`);
        }
        
        lastPageCount = data.done;
    });
    
    eventSource.onerror = (error) => {
        console.log("❌ SSE connection error:", error);
    };
    
    return eventSource;
};

// 2. 📊 API Polling Monitor (backup method)
const monitorAPI = () => {
    const pollStatus = async () => {
        try {
            const response = await fetch(`/api/documents/${documentId}/ocr-status`);
            const data = await response.json();
            const currentTime = new Date().toLocaleTimeString();
            const pagesAdded = data.done - lastPageCount;
            
            console.log(`📊 [${currentTime}] API Status:`, {
                pages: `${data.done}/${data.total}`,
                pagesAdded: pagesAdded,
                status: data.status,
                progress: `${Math.round((data.done/data.total)*100)}%`
            });
            
            // Speed analysis
            if (pagesAdded >= 20) {
                console.log(`🚀 HIGH SPEED: ${pagesAdded} pages in 5 seconds = PARALLEL MODE`);
            } else if (pagesAdded === 1) {
                console.log(`🐌 LOW SPEED: 1 page in 5 seconds = SERIAL MODE`);
            }
            
            lastPageCount = data.done;
        } catch (error) {
            console.log("❌ API polling error:", error);
        }
    };
    
    return setInterval(pollStatus, 5000); // Poll every 5 seconds
};

// 3. 🎯 Start Monitoring
console.log("📡 Starting SSE monitor...");
const sseConnection = monitorSSE();

console.log("📊 Starting API polling backup...");
const apiInterval = monitorAPI();

// 4. 🛑 Stop Monitoring Function
window.stopOCRMonitor = () => {
    console.log("🛑 Stopping OCR monitoring...");
    sseConnection.close();
    clearInterval(apiInterval);
    console.log("✅ Monitoring stopped. Call startOCRMonitor() to restart.");
};

// 5. 🔄 Restart Monitoring Function
window.startOCRMonitor = () => {
    console.log("🔄 Restarting OCR monitoring...");
    lastPageCount = 0;
    startTime = Date.now();
    const newSSE = monitorSSE();
    const newAPI = monitorAPI();
    
    window.stopOCRMonitor = () => {
        newSSE.close();
        clearInterval(newAPI);
    };
};

console.log("✅ Monitor started! Commands available:");
console.log("   • stopOCRMonitor() - Stop monitoring");
console.log("   • startOCRMonitor() - Restart monitoring");
console.log("============================================");