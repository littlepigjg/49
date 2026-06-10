import { useEffect, useRef, useState } from 'react';
import type { ReplayFile, Ball, Table } from '../game/types';
import { TABLE, BALL_RADIUS, TABLE_BORDER, CUSHION_WIDTH, PLAYFIELD_LEFT, PLAYFIELD_RIGHT, PLAYFIELD_TOP, PLAYFIELD_BOTTOM } from '../game/constants';
import { interpolateFrames, formatDuration } from '../game/replay';
import { Play, Pause, SkipBack, SkipForward, FastForward, ChevronLeft } from 'lucide-react';

const CANVAS_W = 880;
const CANVAS_H = 480;

interface Props {
  replay: ReplayFile;
  onBack: () => void;
}

export default function ReplayPlayer({ replay, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (playing && replay.frames.length > 0) {
        const totalFrames = replay.frames[replay.frames.length - 1].frameIndex;
        if (totalFrames > 0) {
          const frameRate = 30;
          const delta = (dt * speed * frameRate) / totalFrames;
          setProgress((prev) => {
            const next = Math.min(1, prev + delta);
            if (next >= 1) {
              setPlaying(false);
            }
            return next;
          });
        }
      }

      const state = interpolateFrames(replay.frames, progress);
      const balls = state ? state.balls : replay.initialBalls;
      draw(ctx, balls, TABLE);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, progress, speed, replay]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProgress(parseFloat(e.target.value));
  };

  const skipTo = (p: number) => {
    setProgress(Math.max(0, Math.min(1, p)));
  };

  const toggleSpeed = () => {
    const speeds = [0.5, 1, 1.5, 2];
    const idx = speeds.indexOf(speed);
    setSpeed(speeds[(idx + 1) % speeds.length]);
  };

  const totalFrames = replay.frames.length > 0 ? replay.frames[replay.frames.length - 1].frameIndex : 0;
  const currentFrame = Math.round(progress * totalFrames);
  const totalDuration = replay.duration;
  const currentDuration = Math.round(progress * totalDuration);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-amber-300 transition-all text-sm font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>返回列表</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
            <span className="text-xs text-zinc-500 mr-2">模式</span>
            <span className="text-sm font-bold text-amber-300">
              {replay.mode === '8ball' ? '8 球' : '9 球'}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
            <span className="text-xs text-zinc-500 mr-2">胜者</span>
            <span className="text-sm font-bold text-emerald-300">
              {replay.winner?.name || '未完成'}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
            <span className="text-xs text-zinc-500 mr-2">总杆数</span>
            <span className="text-sm font-bold text-sky-300">{replay.shots.length}</span>
          </div>
        </div>
      </div>

      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-xl shadow-2xl border border-amber-900/60"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      <div className="mt-5 rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-zinc-700/50 p-5">
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
            <span className="font-mono">{formatDuration(currentDuration)}</span>
            <span className="font-mono">帧 {currentFrame}/{totalFrames}</span>
            <span className="font-mono">{formatDuration(totalDuration)}</span>
          </div>
          <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all"
              style={{ width: `${progress * 100}%` }}
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progress}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => skipTo(progress - 0.1)}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-300 hover:text-amber-300 transition-all"
            title="后退10%"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={() => setPlaying(!playing)}
            className="p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-zinc-900 font-bold transition-all shadow-[0_0_30px_rgba(212,168,75,0.3)] hover:scale-105 active:scale-95"
          >
            {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
          </button>

          <button
            onClick={() => skipTo(progress + 0.1)}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-300 hover:text-amber-300 transition-all"
            title="前进10%"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <div className="w-px h-8 bg-zinc-700 mx-2" />

          <button
            onClick={toggleSpeed}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-300 hover:text-amber-300 transition-all"
          >
            <FastForward className="w-4 h-4" />
            <span className="font-mono font-bold">{speed}x</span>
          </button>

          <button
            onClick={() => skipTo(0)}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-zinc-300 hover:text-amber-300 transition-all text-sm font-semibold"
          >
            重新开始
          </button>
        </div>
      </div>
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, balls: Ball[], t: Table) {
  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawTable(ctx, t);

  for (const b of balls) {
    if (!b.pocketed) drawBall(ctx, b);
  }
}

function drawTable(ctx: CanvasRenderingContext2D, t: Table) {
  const bx = t.x - TABLE_BORDER;
  const by = t.y - TABLE_BORDER;
  const bw = t.width + TABLE_BORDER * 2;
  const bh = t.height + TABLE_BORDER * 2;

  const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
  grad.addColorStop(0, '#5a3a1f');
  grad.addColorStop(0.5, '#3d2817');
  grad.addColorStop(1, '#2a1a0e');
  ctx.fillStyle = grad;
  roundRect(ctx, bx, by, bw, bh, 18);
  ctx.fill();

  ctx.strokeStyle = '#d4a84b';
  ctx.lineWidth = 3;
  roundRect(ctx, bx + 3, by + 3, bw - 6, bh - 6, 16);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, t.x, t.y, t.width, t.height, 8);
  ctx.clip();

  const feltGrad = ctx.createRadialGradient(
    t.x + t.width / 2,
    t.y + t.height / 2,
    50,
    t.x + t.width / 2,
    t.y + t.height / 2,
    Math.max(t.width, t.height),
  );
  feltGrad.addColorStop(0, '#257a50');
  feltGrad.addColorStop(0.7, '#1a5f3c');
  feltGrad.addColorStop(1, '#12452b');
  ctx.fillStyle = feltGrad;
  ctx.fillRect(t.x, t.y, t.width, t.height);

  ctx.globalAlpha = 0.06;
  for (let y = t.y; y < t.y + t.height; y += 3) {
    ctx.strokeStyle = y % 6 === 0 ? '#000' : '#fff';
    ctx.beginPath();
    ctx.moveTo(t.x, y);
    ctx.lineTo(t.x + t.width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.fillStyle = '#0a0805';
  for (const p of t.pockets) {
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#0e2a1a';
  ctx.lineWidth = CUSHION_WIDTH;
  roundRect(
    ctx,
    t.x + CUSHION_WIDTH / 2,
    t.y + CUSHION_WIDTH / 2,
    t.width - CUSHION_WIDTH,
    t.height - CUSHION_WIDTH,
    4,
  );
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const headX = t.x + t.width * 0.25;
  ctx.moveTo(headX, t.y + CUSHION_WIDTH);
  ctx.lineTo(headX, t.y + t.height - CUSHION_WIDTH);
  ctx.stroke();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  const grad = ctx.createRadialGradient(
    b.pos.x - b.radius * 0.35,
    b.pos.y - b.radius * 0.35,
    1,
    b.pos.x,
    b.pos.y,
    b.radius,
  );
  grad.addColorStop(0, lighten(b.color, 0.5));
  grad.addColorStop(0.45, b.color);
  grad.addColorStop(1, darken(b.color, 0.4));

  ctx.beginPath();
  ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = 'transparent';

  if (b.stripe) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#F5F0E0';
    ctx.fillRect(b.pos.x - b.radius, b.pos.y - b.radius * 0.45, b.radius * 2, b.radius * 0.9);
    ctx.restore();
  }

  if (b.id !== 0 && b.number !== undefined) {
    ctx.fillStyle = '#F5F0E0';
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = b.id === 8 ? '#000' : '#1a1a1a';
    ctx.font = `bold ${Math.floor(b.radius * 0.8)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.id), b.pos.x, b.pos.y + 0.5);
  }

  ctx.beginPath();
  ctx.arc(b.pos.x - b.radius * 0.35, b.pos.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number): string {
  const t = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${t(r)}${t(g)}${t(b)}`;
}
function lighten(hex: string, pct: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * pct, g + (255 - g) * pct, b + (255 - b) * pct);
}
function darken(hex: string, pct: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - pct), g * (1 - pct), b * (1 - pct));
}
