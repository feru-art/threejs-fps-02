// Procedural textures, painted on canvases at boot: no image files, no
// network, and the map stops looking like flat coloured boxes. Snow gets
// speckles and soft drifts, steel gets brushed streaks, crates get hazard
// stripes and stencilled letters, and each bomb site gets a big painted
// letter on the ground so it reads at a glance.
import * as THREE from 'three';

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function speckle(ctx, width, height, count, color, alpha) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = alpha * (0.3 + Math.random() * 0.7);
    const r = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function createTextures() {
  // Snow: pale blue-white with grey-blue speckles and faint drift streaks.
  const snow = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d7dee8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(174,191,208,0.5)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      const y = Math.random() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 14, w * 0.6, y - 14, w, y + 6);
      ctx.stroke();
    }
    speckle(ctx, w, h, 900, '#8fa3b8', 0.5);
    speckle(ctx, w, h, 500, '#ffffff', 0.7);
  });
  snow.repeat.set(10, 7);

  // Brushed steel: dark blue-grey with vertical streaks.
  const steel = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2a3138';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h);
    }
    speckle(ctx, w, h, 120, '#5a6a78', 0.4);
  });

  // Hazard stripes: amber and dark, for crate edges and walkway rails.
  const hazard = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d98a2b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c2228';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 + h, h);
      ctx.lineTo(x + h, h);
      ctx.closePath();
      ctx.fill();
    }
  });

  // Crate face: rust-red panels with a stencilled number.
  const crate = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#a34a32';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath();
    ctx.moveTo(4, h / 2);
    ctx.lineTo(w - 4, h / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(238,244,250,0.85)';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('07', w / 2, h / 2);
    speckle(ctx, w, h, 150, '#5e2c1e', 0.5);
  });

  // Site letters, painted flat on the snow: a big A or B in a ring.
  function siteLetter(letter) {
    return canvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 108, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 150px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, w / 2, h / 2 + 6);
    });
  }

  return { snow, steel, hazard, crate, siteA: siteLetter('A'), siteB: siteLetter('B') };
}
