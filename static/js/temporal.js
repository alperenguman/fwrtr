// ---------- Temporal Flow System ----------
// State variables
let currentTime = 0; // Current time in seconds
let timeResolution = 2; // Index into time resolutions array
let isPlaying = false; // Auto-advance state
let playInterval = null; // Interval for auto-advance

// Time resolution levels
const TIME_RESOLUTIONS = [
  { name: 'Second', step: 1, format: 's' },
  { name: 'Minute', step: 60, format: 'm' },
  { name: 'Hour', step: 3600, format: 'h' },
  { name: 'Day', step: 86400, format: 'd' },
  { name: 'Week', step: 604800, format: 'w' },
  { name: 'Month', step: 2629746, format: 'M' },
  { name: 'Year', step: 31556952, format: 'Y' }
];

// Get dynamic time range based on card positions
function getTimelineRange() {
  // TODO: In the future, scan all cards for their temporal positions
  // For now, default to ±1 hour when no cards exist
  
  // Default range: -1 hour to +1 hour (in seconds)
  return {
    min: -3600, // -1 hour
    max: 3600   // +1 hour
  };
  
  // Future implementation would look like:
  // let minTime = -3600, maxTime = 3600; // default ±1 hour
  // data.all.forEach(card => {
  //   if (card.temporalStart) minTime = Math.min(minTime, card.temporalStart);
  //   if (card.temporalEnd) maxTime = Math.max(maxTime, card.temporalEnd);
  // });
  // return { min: minTime, max: maxTime };
}

// Show temporal indicator
function showTemporalIndicator() {
  hideTemporalIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'temporalIndicator';
  indicator.style.cssText = `
    position: fixed;
    top: 35px;
    left: 50%;
    transform: translateX(-50%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 20px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    z-index: 10000;
    pointer-events: none;
    text-align: center;
    letter-spacing: 0.3px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  document.body.appendChild(indicator);
  updateTemporalDisplay();
}

// Hide temporal indicator
function hideTemporalIndicator() {
  const indicator = document.getElementById('temporalIndicator');
  if (indicator) indicator.remove();
}

// Format time for display
function formatTime(seconds) {
  const absSeconds = Math.abs(seconds);
  const sign = seconds < 0 ? '-' : seconds > 0 ? '+' : '';
  
  if (absSeconds < 60) {
    return seconds === 0 ? 'NOW' : `${sign}${absSeconds}s`;
  } else if (absSeconds < 3600) {
    const minutes = Math.floor(absSeconds / 60);
    const remainingSeconds = absSeconds % 60;
    return remainingSeconds === 0 ? `${sign}${minutes}m` : `${sign}${minutes}m ${remainingSeconds}s`;
  } else if (absSeconds < 86400) {
    const hours = Math.floor(absSeconds / 3600);
    const remainingMinutes = Math.floor((absSeconds % 3600) / 60);
    return remainingMinutes === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${remainingMinutes}m`;
  } else if (absSeconds < 604800) {
    const days = Math.floor(absSeconds / 86400);
    const remainingHours = Math.floor((absSeconds % 86400) / 3600);
    return remainingHours === 0 ? `${sign}${days}d` : `${sign}${days}d ${remainingHours}h`;
  } else if (absSeconds < 2629746) {
    const weeks = Math.floor(absSeconds / 604800);
    const remainingDays = Math.floor((absSeconds % 604800) / 86400);
    return remainingDays === 0 ? `${sign}${weeks}w` : `${sign}${weeks}w ${remainingDays}d`;
  } else if (absSeconds < 31556952) {
    const months = Math.floor(absSeconds / 2629746);
    const remainingWeeks = Math.floor((absSeconds % 2629746) / 604800);
    return remainingWeeks === 0 ? `${sign}${months}M` : `${sign}${months}M ${remainingWeeks}w`;
  } else {
    const years = Math.floor(absSeconds / 31556952);
    const remainingMonths = Math.floor((absSeconds % 31556952) / 2629746);
    return remainingMonths === 0 ? `${sign}${years}Y` : `${sign}${years}Y ${remainingMonths}M`;
  }
}

// Update temporal display with accent pulse
function updateTemporalDisplay() {
  const indicator = document.getElementById('temporalIndicator');
  if (!indicator) return;
  
  const resolution = TIME_RESOLUTIONS[timeResolution];
  const timeText = formatTime(currentTime);
  
  // Format resolution step for display
  const stepText = resolution.step === 1 ? '1 sec' :
                  resolution.step === 60 ? '1 min' :
                  resolution.step === 3600 ? '1 hour' :
                  resolution.step === 86400 ? '1 day' :
                  resolution.step === 604800 ? '1 week' :
                  resolution.step === 2629746 ? '1 month' :
                  resolution.step === 31556952 ? '1 year' : `${resolution.step}s`;
  
  indicator.innerHTML = `
    <div id="temporalAccent" style="
      width: 4px; 
      height: 20px; 
      background: #00ff88; 
      transition: all 0.15s ease;
      opacity: 0.8;
    "></div>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="line-height: 1;">${timeText}</div>
      <div style="opacity: 0.5; font-size: 14px; font-weight: 400; line-height: 1;">${stepText}</div>
    </div>
    <div id="temporalPlayButton" style="
      margin-left: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      pointer-events: auto;
    ">
      <div style="
        width: 0; 
        height: 0; 
        border-left: 14px solid #666; 
        border-top: 8px solid transparent; 
        border-bottom: 8px solid transparent;
        margin-left: 2px;
      "></div>
    </div>
  `;
  
  // Accent pulse effect on change
  const accent = indicator.querySelector('#temporalAccent');
  if (accent) {
    accent.style.background = '#00ffaa';
    accent.style.boxShadow = '0 0 8px rgba(0, 255, 136, 0.6)';
    accent.style.opacity = '1';
    
    setTimeout(() => {
      accent.style.background = '#00ff88';
      accent.style.boxShadow = 'none';
      accent.style.opacity = '0.8';
    }, 150);
  }
  
  // Update play button state and bind click event
  const playButton = indicator.querySelector('#temporalPlayButton');
  const triangle = playButton?.querySelector('div');
  if (playButton && triangle) {
    triangle.style.borderLeftColor = isPlaying ? '#00ff88' : '#666';
    
    // Remove existing listener to prevent duplicates
    playButton.onclick = null;
    playButton.onclick = toggleTimePlayback;
  }
}

// Show temporal timeline on right edge
function showTemporalTimeline() {
  hideTemporalTimeline();
  
  const timeline = document.createElement('div');
  timeline.id = 'temporalTimeline';
  timeline.style.cssText = `
    position: fixed;
    right: 20px;
    top: 90px;
    bottom: 90px;
    width: 4px;
    background: rgba(255, 255, 255, 0.1);
    z-index: 9999;
    pointer-events: none;
    transition: all 0.15s ease;
  `;
  
  // Current position indicator
  const currentMarker = document.createElement('div');
  currentMarker.id = 'temporalCurrentMarker';
  currentMarker.style.cssText = `
    position: absolute;
    left: -3px;
    width: 10px;
    height: 4px;
    background: #00ff88;
    transition: all 0.15s ease;
    box-shadow: 0 0 4px rgba(0, 255, 136, 0.5);
    cursor: grab;
    z-index: 10000;
    pointer-events: auto;
    transform: translateX(-0.5px);
  `;
  
  // Create larger invisible hit area for easier grabbing
  const hitArea = document.createElement('div');
  hitArea.style.cssText = `
    position: absolute;
    left: -8px;
    top: -4px;
    width: 20px;
    height: 12px;
    cursor: grab;
    z-index: 10001;
    pointer-events: auto;
  `;
  
  currentMarker.appendChild(hitArea);
  
  // Add drag interaction
  let isDragging = false;
  
  // Bind mousedown to both marker and hit area
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    currentMarker.style.cursor = 'grabbing';
    hitArea.style.cursor = 'grabbing';
    currentMarker.style.transition = 'none'; // Disable transition during drag
    console.log('[Temporal] Drag started');
  };
  
  currentMarker.addEventListener('mousedown', startDrag);
  hitArea.addEventListener('mousedown', startDrag);
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    console.log('[Temporal] Dragging, y:', e.clientY);
    
    const rect = timeline.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = Math.max(0, Math.min(1, y / rect.height));
    
    // Get dynamic time range based on cards (default ±1 hour if no cards)
    const timeRange = getTimelineRange();
    const totalRange = timeRange.max - timeRange.min;
    currentTime = Math.round(timeRange.max - (percentage * totalRange)); // Fix direction: top=future
    
    // Clamp to min/max range
    currentTime = Math.max(timeRange.min, Math.min(timeRange.max, currentTime));
    
    updateTemporalDisplay();
    
    // Update marker position directly during drag (no pulse)
    const timelineHeight = timeline.offsetHeight;
    const clampedTime = Math.max(timeRange.min, Math.min(timeRange.max, currentTime));
    const relativePosition = (timeRange.max - clampedTime) / totalRange;
    const markerPosition = timelineHeight * relativePosition;
    currentMarker.style.top = markerPosition + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      currentMarker.style.cursor = 'grab';
      hitArea.style.cursor = 'grab';
      currentMarker.style.transition = 'all 0.15s ease'; // Re-enable transition
    }
  });
  
  timeline.appendChild(currentMarker);
  document.body.appendChild(timeline);
  updateTemporalTimeline();
}

// Hide temporal timeline
function hideTemporalTimeline() {
  const timeline = document.getElementById('temporalTimeline');
  if (timeline) timeline.remove();
}

// Update timeline with card positions and current marker
function updateTemporalTimeline() {
  const timeline = document.getElementById('temporalTimeline');
  const currentMarker = document.getElementById('temporalCurrentMarker');
  if (!timeline || !currentMarker) return;
  
  // For now, just show current position as percentage
  // In a real implementation, you'd calculate this based on card time ranges
  const timelineHeight = timeline.offsetHeight;
  const centerPosition = timelineHeight / 2;
  
  // Position current marker at center (representing "now")
  // Offset based on currentTime relative to some time range
  let markerPosition = centerPosition;
  
  // Position based on dynamic time range
  const timeRange = getTimelineRange();
  const totalRange = timeRange.max - timeRange.min;
  
  // Clamp currentTime to ensure it's within range
  const clampedTime = Math.max(timeRange.min, Math.min(timeRange.max, currentTime));
  
  const relativePosition = (timeRange.max - clampedTime) / totalRange; // 0 to 1, inverted
  markerPosition = timelineHeight * relativePosition; // up=future, down=past
  
  currentMarker.style.top = `${markerPosition}px`;
  
  // Pulse effect
  currentMarker.style.background = '#00ffaa';
  currentMarker.style.boxShadow = '0 0 8px rgba(0, 255, 136, 0.8)';
  
  setTimeout(() => {
    currentMarker.style.background = '#00ff88';
    currentMarker.style.boxShadow = '0 0 4px rgba(0, 255, 136, 0.5)';
  }, 150);
  
  // TODO: Add card dots along timeline based on their temporal positions
  // This would require cards to have temporal metadata (start/end times)
}

// Navigate time (called from scroll events)
export function navigateTime(direction) {
  if (!window.viewport.isTimelineMode) return;
  
  const resolution = TIME_RESOLUTIONS[timeResolution];
  if (direction === 'forward') {
    currentTime += resolution.step;
  } else {
    currentTime -= resolution.step;
  }
  
  updateTemporalDisplay();
  updateTemporalTimeline();
}

// Change time resolution (called from shift+scroll)
export function changeTimeResolution(direction) {
  if (!window.viewport.isTimelineMode) return;
  
  if (direction === 'up' && timeResolution < TIME_RESOLUTIONS.length - 1) {
    timeResolution++;
  } else if (direction === 'down' && timeResolution > 0) {
    timeResolution--;
  }
  
  updateTemporalDisplay();
  updateTemporalTimeline();
}

// Toggle time playback
export function toggleTimePlayback() {
  if (!window.viewport.isTimelineMode) return;
  
  isPlaying = !isPlaying;
  
  if (isPlaying) {
    // Start auto-advance
    const resolution = TIME_RESOLUTIONS[timeResolution];
    playInterval = setInterval(() => {
      // Advance time by current resolution step (continue indefinitely)
      currentTime += resolution.step;
      
      updateTemporalDisplay();
      updateTemporalTimeline();
    }, 1000); // Every second
    
    console.log('[Temporal] Started playback at', resolution.name, 'per second');
  } else {
    // Stop auto-advance
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
    console.log('[Temporal] Stopped playback');
  }
  
  // Update button appearance
  updateTemporalDisplay();
}

// Initialize temporal system
export function init() {
  showTemporalIndicator();
  showTemporalTimeline();
}

// Destroy temporal system  
export function destroy() {
  hideTemporalIndicator();
  hideTemporalTimeline();
  
  // Stop playback if running
  if (isPlaying) {
    toggleTimePlayback();
  }
}