
// ============================================
// UNIT CONVERSION FUNCTION
// Toggles between different units when user clicks ingredient amounts
// Conversions supported:
// - g <-> kg (grams to kilograms)
// - ml <-> L (millilitres to litres)
// - tsp <-> tbsp (teaspoons to tablespoons, 1 tbsp = 3 tsp)
// Preserves the scaled amount when toggling units
// ============================================
function toggleUnit(element) {
    const currentUnit = element.getAttribute('data-unit');
    const originalUnit = element.getAttribute('data-original-unit');
    
    // Set original unit if not already set
    if (!originalUnit) {
        element.setAttribute('data-original-unit', currentUnit);
    }
    
    const currentText = element.textContent;
    const currentValue = parseFloat(currentText);
    
    let newValue, newUnit;
    
    // Weight conversions: g <-> kg
    if (currentUnit === 'g') {
        newValue = (currentValue / 1000).toFixed(3).replace(/\.?0+$/, '');
        newUnit = 'kg';
    } else if (currentUnit === 'kg') {
        newValue = Math.round(currentValue * 1000);
        newUnit = 'g';
    }
    // Volume conversions: ml <-> L
    else if (currentUnit === 'ml') {
        newValue = (currentValue / 1000).toFixed(3).replace(/\.?0+$/, '');
        newUnit = 'L';
    } else if (currentUnit === 'L') {
        newValue = Math.round(currentValue * 1000);
        newUnit = 'ml';
    }
    // Small volume conversions: tsp <-> tbsp
    else if (currentUnit === 'tsp') {
        newValue = (currentValue / 3).toFixed(2).replace(/\.?0+$/, '');
        newUnit = 'tbsp';
    } else if (currentUnit === 'tbsp') {
        newValue = (currentValue * 3).toFixed(1).replace(/\.0$/, '');
        newUnit = 'tsp';
    }
    
    // Update element display only 
    element.textContent = `${newValue}${newUnit}`;
        element.setAttribute('data-unit', newUnit);
    
    }
