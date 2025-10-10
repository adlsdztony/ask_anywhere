import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

let isSelecting = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const selectionBox = document.getElementById("selection-box") as HTMLDivElement;
const selectionInfo = document.getElementById(
  "selection-info",
) as HTMLDivElement;
const hint = document.getElementById("hint") as HTMLDivElement;

if (!canvas || !selectionBox || !selectionInfo || !hint) {
  console.error("Required DOM elements not found");
  throw new Error("Failed to initialize screenshot selector");
}

// Setup canvas to cover full screen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ctx = canvas.getContext("2d");
if (ctx) {
  // Semi-transparent black overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Mouse down - start selection
canvas.addEventListener("mousedown", (e) => {
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  currentX = e.clientX;
  currentY = e.clientY;

  selectionBox.style.display = "block";
  selectionInfo.style.display = "block";
  hint.style.display = "none";

  updateSelection();
});

// Mouse move - update selection
canvas.addEventListener("mousemove", (e) => {
  if (!isSelecting) return;

  currentX = e.clientX;
  currentY = e.clientY;

  updateSelection();
});

// Mouse up - complete selection
canvas.addEventListener("mouseup", async () => {
  if (!isSelecting) return;

  isSelecting = false;

  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  // Minimum selection size
  if (width < 10 || height < 10) {
    resetSelection();
    return;
  }

  try {
    // Hide all UI elements before capturing
    selectionBox.style.display = "none";
    selectionInfo.style.display = "none";
    hint.style.display = "none";
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Wait a bit for UI to hide completely
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the device pixel ratio from browser (works without special permissions)
    const scaleFactor = window.devicePixelRatio || 1;

    // Adjust coordinates for device pixel ratio
    const adjustedX = Math.floor(x * scaleFactor);
    const adjustedY = Math.floor(y * scaleFactor);
    const adjustedWidth = Math.floor(width * scaleFactor);
    const adjustedHeight = Math.floor(height * scaleFactor);

    // Capture the region
    await invoke("capture_screenshot_region", {
      x: adjustedX,
      y: adjustedY,
      width: adjustedWidth,
      height: adjustedHeight,
    });

    // Show the popup window with the captured screenshot
    await invoke("show_popup_window");

    // Close the selector window
    await getCurrentWindow().close();
  } catch (error) {
    console.error("Failed to capture screenshot:", error);
    alert("截图失败: " + error);
    resetSelection();
  }
});

// ESC key - cancel
document.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    await getCurrentWindow().close();
  }
});

function updateSelection() {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;

  selectionInfo.textContent = `${Math.floor(width)} × ${Math.floor(height)}`;
  selectionInfo.style.left = `${x}px`;
  selectionInfo.style.top = `${y - 30}px`;

  // Clear and redraw overlay with cutout
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(x, y, width, height);
  }
}

function resetSelection() {
  selectionBox.style.display = "none";
  selectionInfo.style.display = "none";
  hint.style.display = "block";

  if (ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
