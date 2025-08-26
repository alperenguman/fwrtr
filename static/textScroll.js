// Smooth middle-click drag scrolling with inertia
window.TextScroll = {
  init(cardId) {
    const textEl = document.getElementById(`txt-${cardId}`);
    if (!textEl) return;
    
    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;
    let velocity = 0;
    let lastY = 0;
    let lastTime = 0;
    let animationId = null;
    
    // Start drag on middle mouse down
    textEl.addEventListener('mousedown', (e) => {
      console.log(`[TextScroll] Mouse down: button=${e.button}, cardId=${cardId}`);
      if (e.button !== 1) return; // Only middle mouse button
      e.preventDefault();
      e.stopPropagation(); // Prevent focus/editing events
      
      // Remove focus and editing state
      textEl.blur();
      textEl.classList.remove('editing');
      
      console.log(`[TextScroll] Starting drag for card ${cardId}`);
      isDragging = true;
      startY = e.clientY;
      lastY = e.clientY;
      startScrollTop = textEl.scrollTop;
      lastTime = Date.now();
      velocity = 0;
      
      // Change cursor to grabbing
      textEl.style.cursor = 'grabbing';
      
      // Cancel any existing inertia animation
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    });
    
    // Handle drag movement
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation(); // Prevent other mouse events
      
      console.log(`[TextScroll] Mouse move: isDragging=${isDragging}, deltaY=${e.clientY - startY}`);
      
      const currentY = e.clientY;
      const currentTime = Date.now();
      const deltaY = currentY - startY;
      const timeDelta = currentTime - lastTime;
      
      // Calculate velocity for inertia
      if (timeDelta > 0) {
        velocity = (currentY - lastY) / timeDelta * 8; // Slower velocity calculation
      }
      
      // Heavy, resistant scrolling - reduce movement by half
      const heavyDelta = deltaY * 0.3; // Much more resistance
      textEl.scrollTop = startScrollTop - heavyDelta;
      
      lastY = currentY;
      lastTime = currentTime;
    });
    
    // End drag and start inertia
    document.addEventListener('mouseup', (e) => {
      if (!isDragging || e.button !== 1) return;
      
      isDragging = false;
      textEl.style.cursor = 'text';
      
      // Start inertia animation if there's velocity (higher threshold for heavy feel)
      if (Math.abs(velocity) > 1.0) {
        startInertiaAnimation();
      }
    });
    
    // Inertia animation with smooth deceleration
    const startInertiaAnimation = () => {
      const friction = 0.96; // Moderate friction for heavy feel
      const minVelocity = 0.1; // Higher threshold to stop sooner
      
      const animate = () => {
        if (Math.abs(velocity) < minVelocity) {
          animationId = null;
          return;
        }
        
        // Apply velocity to scroll position (inverted)
        textEl.scrollTop -= velocity;
        
        // Apply friction
        velocity *= friction;
        
        // Continue animation
        animationId = requestAnimationFrame(animate);
      };
      
      animationId = requestAnimationFrame(animate);
    };
    
    // Prevent context menu on middle click
    textEl.addEventListener('contextmenu', (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    });
    
    // Change cursor on hover when scrollable content
    const updateCursor = () => {
      if (textEl.scrollHeight > textEl.clientHeight) {
        textEl.style.cursor = 'grab';
      } else {
        textEl.style.cursor = 'text';
      }
    };
    
    // Update cursor on content change
    const observer = new MutationObserver(updateCursor);
    observer.observe(textEl, { childList: true, subtree: true, characterData: true });
    
    // Initial cursor update
    updateCursor();
  }
};