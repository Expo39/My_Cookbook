// ============================================
// RECIPE CONFIGURATION
// Original serving sizes for all recipes
// Used by scaling system to calculate ingredient amounts
// ============================================

const recipes = {
    charcuterie: { original: 10 },
    pasta1: { original: 4 },
    pasta2: { original: 2 },
    pasta3: { original: 4 },
    pasta4: { original: 3 },
    gnocchi: { original: 4 },
    korean: { original: 3 },
    katsu: { original: 2 },
    cotechino: { original: 4 },
    porchetta: { original: 6 },
    lamb: { original: 2 },
    ribeye: { original: 1 },
    fillet: { original: 1 },
    wellington: { original: 5 },
    shortribs: { original: 4 },
    soup: { original: 10 },
    brulee: { original: 4 },
    crepes: { original: 5 },
    asparagus: { original: 5 }
};

// ============================================
// MAGIC LINK SYSTEM - API KEY HANDLING
// ============================================
// This cookbook supports "magic links" - you can share a URL with the API key included!
// Example: https://yoursite.github.io/cookbook/?key=YOUR_API_KEY_HERE
//
// How it works:
// 1. Check URL for ?key= parameter
// 2. If found, use that key and save it
// 3. Otherwise, check localStorage for saved key
// 4. Otherwise, use hardcoded key below (for manual setup)
//
// Get a FREE key at: https://aistudio.google.com/app/apikey
// FREE LIMITS: 1,500 requests/day, no credit card required
// Model: Gemini 2.5 Flash (latest stable)
// ============================================

// Get API key from URL parameter, localStorage, or fallback to hardcoded
function getAPIKey() {
    try {
        // Check URL parameter first
        const urlParams = new URLSearchParams(window.location.search);
        const urlKey = urlParams.get('key');
        
        if (urlKey && urlKey.length > 20) {  // Basic validation
            // Save to localStorage for future visits
            localStorage.setItem('google_api_key', urlKey);
            console.log('API key loaded from URL and saved');
            return urlKey;
        }
        
        // Check localStorage
        const savedKey = localStorage.getItem('google_api_key');
        if (savedKey && savedKey !== 'YOUR_API_KEY_HERE') {
            console.log('API key loaded from localStorage');
            return savedKey;
        }
        
        // Fallback to hardcoded key (for manual setup)
        console.log('Using hardcoded API key');
        return 'YOUR_API_KEY_HERE';
    } catch (error) {
        console.error('Error getting API key:', error);
        return 'YOUR_API_KEY_HERE';
    }
}

// Initialize API key
const GOOGLE_API_KEY = getAPIKey();

// Log status
if (GOOGLE_API_KEY === 'YOUR_API_KEY_HERE') {
    console.warn('API key not set! Add ?key=YOUR_KEY to URL or set it manually in config.js');
} else {
    console.log('API key is configured');
}

// Make it available globally
window.GOOGLE_API_KEY = GOOGLE_API_KEY;