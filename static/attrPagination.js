// Simple attributes pagination system
window.AttrPagination = {
  state: new Map(), // cardId -> { page: 0, totalPages: 0 }
  
  init(cardId) {
    this.update(cardId);
    this.bindEvents(cardId);
  },
  
  update(cardId) {
    const attrList = document.getElementById(`attrs-${cardId}`);
    const container = document.getElementById(`attr-container-${cardId}`);
    const indicator = document.getElementById(`attr-page-${cardId}`);
    const prevBtn = document.getElementById(`attr-prev-${cardId}`);
    const nextBtn = document.getElementById(`attr-next-${cardId}`);
    
    if (!attrList || !container) return;
    
    const rows = attrList.querySelectorAll('.attr-row:not(.empty-row)');
    const emptyRow = attrList.querySelector('.attr-row.empty-row');
    
    // Calculate pagination - ensure empty row always has space
    const totalContentRows = rows.length;
    // Always reserve space for empty row: if content fills pages exactly, add one more page
    let totalPages;
    if (totalContentRows % 3 === 0 && totalContentRows > 0) {
      // 3,6,9 attributes need an extra page for empty row
      totalPages = Math.floor(totalContentRows / 3) + 1;
    } else {
      // 1,2,4,5,7,8... can fit empty row on existing pages
      totalPages = Math.max(1, Math.ceil(totalContentRows / 3));
    }
    
    console.log(`[DEBUG] Card ${cardId}: ${totalContentRows} rows, ${totalPages} pages`);
    
    const currentPage = this.state.get(cardId)?.page || 0;
    
    // Clamp page if it's out of bounds
    const validPage = Math.min(currentPage, totalPages - 1);
    
    this.state.set(cardId, { page: validPage, totalPages });
    
    // Show/hide rows based on current page (3 rows per page)
    const startIdx = validPage * 3;
    const endIdx = startIdx + 3;
    
    rows.forEach((row, index) => {
      const isVisible = (index >= startIdx && index < endIdx);
      
      if (isVisible) {
        row.style.display = 'grid';
      } else {
        row.style.display = 'none';
      }
      
      // Remove bottom border from last visible row on each page
      if (isVisible && (index === endIdx - 1 || index === totalContentRows - 1)) {
        row.style.borderBottom = 'none';
      } else if (isVisible) {
        row.style.borderBottom = '1px dashed #1b1b1b';
      }
    });
    
    // Show empty row on the last page (which always has space now)
    const visibleRowsOnPage = Math.min(3, totalContentRows - startIdx);
    const isLastPage = validPage === totalPages - 1;
    
    if (emptyRow) {
      // Empty row appears on the last page only (since we've ensured there's always space)
      const showEmpty = isLastPage;
      
      console.log(`[DEBUG] Card ${cardId}: Page ${validPage+1}/${totalPages}, isLastPage: ${isLastPage}, showEmpty: ${showEmpty}, visibleRows: ${visibleRowsOnPage}`);
      
      if (!showEmpty) {
        emptyRow.style.display = 'none';
      } else {
        // Always show empty row when page has 0 content items (first item on any page)
        // Otherwise respect focus state
        const pageHasNoContent = visibleRowsOnPage === 0;
        
        if (pageHasNoContent) {
          // Always show empty row when page is empty (allows adding first item on any page)
          emptyRow.style.display = 'grid';
          console.log(`[DEBUG] Card ${cardId}: Page has no content - always show empty row`);
        } else {
          // Page has content - always let CSS handle it (don't interfere with focus)
          emptyRow.style.display = '';
          console.log(`[DEBUG] Card ${cardId}: Page has content - letting CSS control`);
        }
        emptyRow.style.borderBottom = 'none';
      }
    }
    
    // Update UI visibility
    const needsPagination = totalPages > 1;
    
    if (needsPagination) {
      indicator.textContent = `(${validPage + 1}/${totalPages})`;
      indicator.classList.add('visible');
      
      prevBtn.classList.toggle('visible', validPage > 0);
      nextBtn.classList.toggle('visible', validPage < totalPages - 1);
    } else {
      indicator.classList.remove('visible');
      prevBtn.classList.remove('visible');
      nextBtn.classList.remove('visible');
    }
  },
  
  bindEvents(cardId) {
    const prevBtn = document.getElementById(`attr-prev-${cardId}`);
    const nextBtn = document.getElementById(`attr-next-${cardId}`);
    const attrList = document.getElementById(`attrs-${cardId}`);
    
    if (prevBtn && !prevBtn._attrPaginationBound) {
      prevBtn._attrPaginationBound = true;
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.goToPage(cardId, -1);
      });
    }
    
    if (nextBtn && !nextBtn._attrPaginationBound) {
      nextBtn._attrPaginationBound = true;
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.goToPage(cardId, 1);
      });
    }
    
    // No focus listeners - let CSS handle focus-based visibility
  },
  
  goToPage(cardId, direction) {
    const currentState = this.state.get(cardId) || { page: 0, totalPages: 1 };
    const newPage = Math.max(0, Math.min(currentState.totalPages - 1, currentState.page + direction));
    
    if (newPage !== currentState.page) {
      this.state.set(cardId, { ...currentState, page: newPage });
      this.update(cardId);
    }
  }
};