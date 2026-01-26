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
    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const urlKey = urlParams.get('key');
    
    if (urlKey) {
        // Save to localStorage for future visits
        localStorage.setItem('google_api_key', urlKey);
        console.log('API key loaded from URL and saved');
        return urlKey;
    }
    
    // Check localStorage
    const savedKey = localStorage.getItem('google_api_key');
    if (savedKey) {
        console.log('API key loaded from localStorage');
        return savedKey;
    }
    
    // Fallback to hardcoded key (for manual setup)
    console.log('Using hardcoded API key');
    return 'YOUR_API_KEY_HERE';
}

const GOOGLE_API_KEY = getAPIKey();
// ============================================

let selectedRecipe = '';
let selectedRecipeName = '';
let conversationHistory = [];

// Request tracking
let requestCount = parseInt(localStorage.getItem('ai_request_count') || '0');
let requestDate = localStorage.getItem('ai_request_date') || '';
const MAX_DAILY_REQUESTS = 1500;

// Reset counter if new day
const today = new Date().toDateString();
if (requestDate !== today) {
    requestCount = 0;
    requestDate = today;
    localStorage.setItem('ai_request_count', '0');
    localStorage.setItem('ai_request_date', today);
}

// Show request counter notification
function showRequestsRemaining() {
    const remaining = MAX_DAILY_REQUESTS - requestCount;
    const percentage = (remaining / MAX_DAILY_REQUESTS) * 100;
    
    let color = '#4caf50'; // Green
    if (percentage < 50) color = '#ff9800'; // Orange
    if (percentage < 20) color = '#f44336'; // Red
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 2px solid ${color};
        border-radius: 8px;
        padding: 15px 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">🤖</span>
            <div>
                <div style="font-weight: bold; color: #333; margin-bottom: 4px;">
                    AI Requests Today
                </div>
                <div style="font-size: 18px; font-weight: bold; color: ${color};">
                    ${remaining} / ${MAX_DAILY_REQUESTS} remaining
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                    Resets at midnight
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        notification.style.transform = 'translateX(400px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Check internet connection
function checkInternetConnection() {
    return navigator.onLine;
}

function toggleAI() {
    const panel = document.getElementById('aiPanel');
    const isOpening = !panel.classList.contains('active');
    
    panel.classList.toggle('active');
    
    // When opening panel, check internet and show requests remaining
    if (isOpening) {
        if (!checkInternetConnection()) {
            alert('⚠️ No Internet Connection!\n\nYou need to be online to see remaining AI requests and use the assistant.');
            return;
        }
        
        // Show requests remaining notification
        showRequestsRemaining();
    }
}

function showRecipeDropdown() {
    document.getElementById('recipeDropdown').classList.add('active');
}

function filterRecipes() {
    const searchInput = document.getElementById('ai-recipe-search');
    const searchTerm = searchInput.value.toLowerCase();
    const dropdown = document.getElementById('recipeDropdown');
    const options = dropdown.querySelectorAll('.recipe-option');
    
    let hasVisibleOptions = false;
    
    options.forEach(option => {
        const text = option.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            option.classList.remove('hidden');
            hasVisibleOptions = true;
        } else {
            option.classList.add('hidden');
        }
    });
    
    // Show dropdown if there are visible options
    if (hasVisibleOptions && searchTerm.length > 0) {
        dropdown.classList.add('active');
    } else if (searchTerm.length === 0) {
        dropdown.classList.add('active');
    }
}

function selectRecipe(recipeValue, recipeName) {
    selectedRecipe = recipeValue;
    selectedRecipeName = recipeName;
    const chatArea = document.getElementById('aiChatArea');
    const searchInput = document.getElementById('ai-recipe-search');
    const dropdown = document.getElementById('recipeDropdown');
    
    // Update search input and hide dropdown
    searchInput.value = recipeName;
    dropdown.classList.remove('active');
    
    if (selectedRecipe) {
        conversationHistory = [];
        chatArea.innerHTML = `
            <div class="ai-message assistant">
                Great! I'm ready to help with <strong>${recipeName}</strong>. 
                Ask me about ingredient substitutions, cooking techniques, or any questions you have! Take note that I may occasionally be wrong, so always make sure that tips I may give make sense.
            </div>
        `;
    }
}

// Add click handlers to recipe options
document.addEventListener('DOMContentLoaded', function() {
    const options = document.querySelectorAll('.recipe-option');
    options.forEach(option => {
        option.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            const name = this.textContent;
            selectRecipe(value, name);
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const selector = document.querySelector('.ai-recipe-selector');
        const dropdown = document.getElementById('recipeDropdown');
        if (!selector.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
});

async function sendMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    
    if (!message) return;
    if (!selectedRecipe) {
        alert('Please select a recipe first!');
        return;
    }
    
    // Check if we've hit daily limit
    if (requestCount >= MAX_DAILY_REQUESTS) {
        alert(`❌ Daily Limit Reached!\n\nYou've used all ${MAX_DAILY_REQUESTS} requests for today.\n\nLimit resets at midnight. Come back tomorrow!`);
        return;
    }
    
    const chatArea = document.getElementById('aiChatArea');
    const sendBtn = document.getElementById('aiSendBtn');
    
    // Add user message
    chatArea.innerHTML += `<div class="ai-message user">${message}</div>`;
    input.value = '';
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Disable input while processing
    sendBtn.disabled = true;
    input.disabled = true;
    
    // Show loading
    chatArea.innerHTML += `<div class="ai-loading" id="loading">Thinking...</div>`;
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Get recipe context
    const recipeElement = document.getElementById(selectedRecipe);
    let recipeContext = '';
    if (recipeElement) {
        const intro = recipeElement.querySelector('.recipe-intro')?.textContent || '';
        const ingredients = Array.from(recipeElement.querySelectorAll('.ingredients li')).map(li => li.textContent).join(', ');
        const method = Array.from(recipeElement.querySelectorAll('.method li')).map(li => li.textContent).join(' ');
        const tip = recipeElement.querySelector('.chef-tip p')?.textContent || '';
        
        recipeContext = `Recipe: ${selectedRecipeName}

Introduction: ${intro}

Ingredients: ${ingredients}

Method: ${method}

Chef's Tip: ${tip}`;
    }
    
    try {
        // Check if API key is set
        if (GOOGLE_API_KEY === 'YOUR_API_KEY_HERE') {
            throw new Error('API_KEY_NOT_SET');
        }
        
        // Build conversation history for context
        let conversationText = '';
        if (conversationHistory.length > 0) {
            conversationText = '\n\nPrevious conversation:\n' + 
                conversationHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
        }
        
        const fullPrompt = `You are AntonioAI, a helpful cooking assistant for Antonio's cookbook. You're answering questions about this specific recipe:

${recipeContext}
${conversationText}

User question: ${message}

Provide a helpful, friendly, concise answer. If they ask about substitutions, explain if it will work and any adjustments needed. Keep responses brief (2-3 sentences unless more detail is needed). Use British English spelling.`;
        
        // Use Google AI Studio Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: fullPrompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000,  // Increased for complete responses
                }
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Validate response structure (Gemini format)
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            console.error('Invalid API response:', data);
            throw new Error(`Invalid response format. Got: ${JSON.stringify(data).substring(0, 200)}`);
        }
        
        const aiResponse = data.candidates[0].content.parts[0].text;
        const finishReason = data.candidates[0].finishReason;
        
        if (!aiResponse) {
            throw new Error('Empty response from AI');
        }
        
        // Increment request counter
        requestCount++;
        localStorage.setItem('ai_request_count', requestCount.toString());
        
        // Remove loading
        document.getElementById('loading')?.remove();
        
        // Add AI response
        chatArea.innerHTML += `<div class="ai-message assistant">${aiResponse}</div>`;
        
        // Check if response was cut off
        if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') {
            chatArea.innerHTML += `<div class="ai-message assistant" style="background: #fff3cd; border-left: 3px solid #ffc107; padding: 10px; margin-top: 10px; font-size: 0.9em;">
                ⚠️ <strong>Response was cut off!</strong> The answer was too long. Try asking a more specific question or ask me to continue.
            </div>`;
        }
        
        // Show updated counter after response
        const remaining = MAX_DAILY_REQUESTS - requestCount;
        if (remaining <= 100 && remaining % 20 === 0) {
            // Show warning at 100, 80, 60, 40, 20 remaining
            showRequestsRemaining();
        }
        
        chatArea.scrollTop = chatArea.scrollHeight;
        
        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiResponse }
        );
        
    } catch (error) {
        // Remove loading
        document.getElementById('loading')?.remove();
        
        // Handle errors
        let errorMsg = error.message;
        
        if (errorMsg === 'API_KEY_NOT_SET') {
            chatArea.innerHTML += `<div class="ai-message assistant" style="color: #d32f2f;">
                🔑 <strong>API Key Not Set!</strong>
                <br><br>You need to add your FREE Google AI Studio API key.
                <br><br><strong>Steps:</strong>
                <br>1. Get FREE key: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #006633;">aistudio.google.com/app/apikey</a>
                <br>2. Sign in with Google (no credit card needed)
                <br>3. Click "Create API Key"
                <br>4. Open this HTML file in a text editor
                <br>5. Find: <code>GOOGLE_API_KEY = 'YOUR_API_KEY_HERE'</code>
                <br>6. Replace YOUR_API_KEY_HERE with your key
                <br>7. Save and reload!
                <br><br><strong>Limits:</strong> 1,500 requests/day (much better than others!)
            </div>`;
        } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('401') || errorMsg.includes('403')) {
            chatArea.innerHTML += `<div class="ai-message assistant" style="color: #d32f2f;">
                🔑 <strong>Invalid API Key!</strong>
                <br><br>Your Google AI Studio key is not working.
                <br><br><strong>Solutions:</strong>
                <br>1. Get a new key: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #006633;">aistudio.google.com/app/apikey</a>
                <br>2. Make sure you copied the entire key
                <br>3. Check for extra spaces before/after the key
                <br><br><strong>Error:</strong> ${errorMsg}
            </div>`;
        } else if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
            chatArea.innerHTML += `<div class="ai-message assistant" style="color: #ff6b00;">
                ⏱️ <strong>Rate Limit Reached!</strong>
                <br><br>You've hit Google's rate limit (1,500 requests/day).
                <br><br><strong>Solutions:</strong>
                <br>• Wait until midnight (limit resets daily)
                <br>• Use the cookbook without AI (all recipes still work!)
                <br><br><strong>Your counter shows:</strong> ${requestCount} requests used today
                <br><br><strong>Error:</strong> ${errorMsg}
            </div>`;
        } else {
            chatArea.innerHTML += `<div class="ai-message assistant" style="color: #d32f2f;">
                ⚠️ Sorry, I'm having trouble connecting.
                <br><br><strong>Possible issues:</strong>
                <br>• You're offline (check internet)
                <br>• Google AI Studio is temporarily down
                <br>• API key has been revoked
                <br><br><strong>Error:</strong> ${errorMsg}
                <br><br>Check browser console (F12) for details.
            </div>`;
        }
        chatArea.scrollTop = chatArea.scrollHeight;
    }
    
    // Re-enable input
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
}