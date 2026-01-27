// ============================================
// ANTONIO AI ASSISTANT 
// ============================================

let selectedRecipe = '';
let selectedRecipeName = '';
let conversationHistory = [];

function toggleAI() {
    const panel = document.getElementById('aiPanel');
    const pointer = document.getElementById('aiPointer');
    const isOpening = !panel.classList.contains('active');
    
    panel.classList.toggle('active');
    document.body.classList.toggle('ai-open');
    
    // Hide pointer permanently when AI is opened for the first time
    if (isOpening) {
        if (pointer) {
            pointer.style.display = 'none';
        }
        // Mark that AI has been clicked - pointer won't show again
        localStorage.setItem('ai_ever_clicked', 'true');
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
                <br><br>Ask me about ingredient substitutions, cooking techniques, or any questions you have!
                <br><br><small style="color: #d32f2f;">⚠️ Please be mindful: The 1,500 daily requests are shared among ALL users, not per person!</small>
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
    
    const chatArea = document.getElementById('aiChatArea');
    const sendBtn = document.getElementById('aiSendBtn');
    
    // Add user message
    chatArea.innerHTML += `<div class="ai-message user">${message}</div>`;
    input.value = '';
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Disable input during processing
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
                    maxOutputTokens: 2000,
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
            chatArea.innerHTML += `<div class="ai-message assistant" style="background: #ffebee; border-left: 3px solid #d32f2f; padding: 12px; font-size: 13px;">
                <strong style="color: #d32f2f;">🔑 API Key Not Set!</strong>
                <br><br>You need to add your FREE Google AI Studio API key.
                <br><br><strong>Steps:</strong>
                <br>1. Get FREE key: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #006633; font-weight: bold;">aistudio.google.com/app/apikey</a>
                <br>2. Sign in with Google (no credit card needed)
                <br>3. Click "Create API Key"
                <br>4. Open <code>js/config.js</code> in a text editor
                <br>5. Replace <code>YOUR_API_KEY_HERE</code> with your key
                <br>6. Save and reload!
                <br><br><strong>⚠️ Important:</strong> The 1,500 requests/day limit is shared among ALL users of this cookbook!
            </div>`;
        } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('401') || errorMsg.includes('403')) {
            chatArea.innerHTML += `<div class="ai-message assistant" style="background: #ffebee; border-left: 3px solid #d32f2f; padding: 12px; font-size: 13px;">
                <strong style="color: #d32f2f;">🔑 Invalid API Key!</strong>
                <br><br>Your Google AI Studio key is not working.
                <br><br><strong>Solutions:</strong>
                <br>1. Get a new key: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #006633; font-weight: bold;">aistudio.google.com/app/apikey</a>
                <br>2. Make sure you copied the entire key
                <br>3. Check for extra spaces
                <br><br><strong>Error:</strong> ${errorMsg}
            </div>`;
        } else if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
            chatArea.innerHTML += `<div class="ai-message assistant" style="background: #fff3cd; border-left: 3px solid #ff9800; padding: 12px; font-size: 13px;">
                <strong style="color: #ff6b00;">⏱️ Daily Limit Reached!</strong>
                <br><br><strong style="color: #d32f2f;">⚠️ IMPORTANT: The 1,500 requests/day are shared among ALL users of this cookbook, not per person!</strong>
                <br><br>Someone has used up today's quota. Please be mindful and avoid unnecessary requests.
                <br><br><strong>The limit resets at midnight GMT.</strong>
                <br><br>You can still use the cookbook - all recipes work without AI!
                <br><br><small>Error: ${errorMsg}</small>
            </div>`;
        } else {
            chatArea.innerHTML += `<div class="ai-message assistant" style="background: #ffebee; border-left: 3px solid #d32f2f; padding: 12px; font-size: 13px;">
                <strong style="color: #d32f2f;">⚠️ Connection Error</strong>
                <br><br><strong>Possible issues:</strong>
                <br>• You're offline (check internet connection)
                <br>• Google AI Studio is temporarily down
                <br>• Daily quota exhausted by all users
                <br><br><strong>Error:</strong> ${errorMsg}
                <br><br>Check browser console (F12) for more details.
            </div>`;
        }
        chatArea.scrollTop = chatArea.scrollHeight;
    }
    
    // Re-enable input
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
}