// ============================================
// RECIPE SCALING FUNCTION
// Updates all ingredient amounts when user changes serving size
// How it works:
// 1. Gets new serving count from input
// 2. Calculates scale factor (new servings / original servings)
// 3. Multiplies all ingredient amounts by scale factor
// 4. Handles unit conversions (g<->kg, ml<->L, tsp<->tbsp)
// 5. Updates display while maintaining current unit preference
// ============================================
function updateRecipe(recipeId) {
    const servingsInput = document.getElementById(`servings-${recipeId}`);
    const newServings = parseFloat(servingsInput.value);
    const originalServings = recipes[recipeId].original;
    
    if (isNaN(newServings) || newServings < 1) {
        alert('Please enter a valid number of servings (minimum 1)');
        servingsInput.value = originalServings;
        return;
    }
    
    const scaleFactor = newServings / originalServings;
    const ingredients = document.querySelectorAll(`[data-recipe="${recipeId}"]`);
    
    ingredients.forEach(ingredient => {
        const baseAmount = parseFloat(ingredient.getAttribute('data-base'));
        const scaledAmount = baseAmount * scaleFactor;
        const currentUnit = ingredient.getAttribute('data-unit');
        const originalUnit = ingredient.getAttribute('data-original-unit') || currentUnit;
        
        // Round all amounts to nearest whole number
        let displayAmount = Math.round(scaledAmount);
        
        // Convert to current unit if different from original
        if (currentUnit && originalUnit && currentUnit !== originalUnit) {
            if (originalUnit === 'g' && currentUnit === 'kg') {
                displayAmount = (displayAmount / 1000).toFixed(3).replace(/\.?0+$/, '');
            } else if (originalUnit === 'ml' && currentUnit === 'L') {
                displayAmount = (displayAmount / 1000).toFixed(3).replace(/\.?0+$/, '');
            } else if (originalUnit === 'tsp' && currentUnit === 'tbsp') {
                displayAmount = (displayAmount / 3).toFixed(2).replace(/\.?0+$/, '');
            }
        }
        
        // Update with unit if it has one
        if (currentUnit) {
            ingredient.textContent = `${displayAmount}${currentUnit}`;
        } else {
            ingredient.textContent = displayAmount;
        }
    });
}

document.querySelectorAll('input[type="number"]').forEach(input => {
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const recipeId = this.id.replace('servings-', '');
            updateRecipe(recipeId);
        }
    });
});

function updateVanillaType() {
    const vanillaType = document.getElementById('vanilla-type').value;
    const servings = parseInt(document.getElementById('servings-brulee').value) || 4;
    
    const vanillaIngredient = document.getElementById('vanilla-ingredient');
    const vanillaMethodStep = document.getElementById('vanilla-method-step');
    const vanillaTip = document.getElementById('vanilla-tip');
    
    if (vanillaType === 'extract') {
        const amount = Math.round(2 * (servings / 4));
        vanillaIngredient.innerHTML = `<span class="ingredient-amount clickable-unit" data-recipe="brulee" data-base="2" data-unit="tsp" data-original-unit="tsp" onclick="toggleUnit(this)">${amount}tsp</span> vanilla extract`;
        vanillaMethodStep.textContent = 'Pour cream into saucepan, heat until just starts to simmer. Remove immediately. Stir in vanilla extract. Let cool to lukewarm (15-20 minutes).';
        vanillaTip.textContent = 'Water bath prevents custard from curdling. The wobble test is key - center should jiggle like jelly when gently shaken. For best results, make custard day before and caramelise sugar just before serving.';
    } else if (vanillaType === 'essence') {
        const amount = Math.round(1.5 * (servings / 4));
        vanillaIngredient.innerHTML = `<span class="ingredient-amount clickable-unit" data-recipe="brulee" data-base="1.5" data-unit="tsp" data-original-unit="tsp" onclick="toggleUnit(this)">${amount}tsp</span> vanilla essence`;
        vanillaMethodStep.textContent = 'Pour cream into saucepan, heat until just starts to simmer. Remove immediately. Stir in vanilla essence. Let cool to lukewarm (15-20 minutes).';
        vanillaTip.textContent = 'Vanilla essence is more concentrated than extract, so use less. Water bath prevents custard from curdling. The wobble test is key - center should jiggle like jelly when gently shaken.';
    } else if (vanillaType === 'pods') {
        const amount = Math.round(1 * (servings / 4));
        vanillaIngredient.innerHTML = `<span class="ingredient-amount" data-recipe="brulee" data-base="1">${amount}</span> vanilla pod, split and scraped`;
        vanillaMethodStep.textContent = 'Split vanilla pod lengthwise and scrape out seeds. Pour cream into saucepan with vanilla pod and seeds, heat until just starts to simmer. Remove from heat, let infuse 15 minutes. Remove pod, reheat gently if needed. Let cool to lukewarm.';
        vanillaTip.textContent = 'Vanilla pods give the most authentic flavour with beautiful vanilla specks throughout. After removing the pod, you can rinse and dry it to make vanilla sugar. Water bath prevents custard from curdling. The wobble test is key - center should jiggle like jelly when gently shaken.';
    }
}
