// ============================================
// UI ENHANCEMENTS - ARROW POINTER & BACK TO TOP
// ============================================

// Show AI pointer every time UNTIL AI is clicked
document.addEventListener('DOMContentLoaded', function() {
    const aiClicked = localStorage.getItem('ai_ever_clicked');
    
    if (!aiClicked) {
        // Create and show the pointer
        const pointer = document.createElement('div');
        pointer.id = 'aiPointer';
        pointer.className = 'ai-pointer';
        pointer.textContent = 'Click me to use AI assistant!';
        document.body.appendChild(pointer);
        
        // The pointer will be hidden when AI button is clicked (handled in ai.js)
        // Auto-hide after 15 seconds if not clicked (but will show again on next page load)
        setTimeout(() => {
            if (pointer && pointer.parentNode) {
                pointer.style.animation = 'fadeOut 0.5s ease-out';
                pointer.style.opacity = '0';
                setTimeout(() => {
                    pointer.remove();
                }, 500);
            }
        }, 15000);
    }
});

// Back to top button functionality
document.addEventListener('DOMContentLoaded', function() {
    // Create back-to-top button
    const backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.innerHTML = '↑';
    backToTop.title = 'Back to top';
    backToTop.setAttribute('aria-label', 'Back to top');
    document.body.appendChild(backToTop);
    
    // Show/hide based on scroll position
    let scrollTimeout;
    window.addEventListener('scroll', function() {
        clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
            if (window.pageYOffset > 300) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        }, 100);
    });
    
    // Scroll to top when clicked
    backToTop.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});

// Add fade out animation style
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
`;
document.head.appendChild(style);