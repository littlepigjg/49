import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/useGameStore';
import type { Ball, Table } from '../game/types';
import {
  BALL_RADIUS,
  TABLE_BORDER,
  CUSHION_WIDTH,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
  PLAYFIELD_BOTTOM,
} from '../game/constants';
import { v } from '../utils/math';
import { predictShot } from '../game/prediction';

const CANVAS_W = 880;
const CANVAS_H = 480;

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef({ cueShrink: 0 });

  const phase = useGameStore((s) => s.phase);
  const balls = useGameStore((s) => s.balls);
  const table = useGameStore((s) => s.table);
  const aimAngle = useGameStore((s) => s.aimAngle);
  const power = useGameStore((s) => s.power);
  const isCharging = useGameStore((s) => s.isCharging);
  const showAimLine = useGameStore((s) => s.showAimLine);
  const freeBall = useGameStore((s) => s.freeBall);
  const foul = useGameStore((s) => s.foul);
  const foulMessage = useGameStore((s) => s.foulMessage);
  const winner = useGameStore((s) => s.winner);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const players = useGameStore((s) => s.players);

  const setAimAngle = useGameStore((s) => s.setAimAngle);
  const startCharge = useGameStore((s) => s.startCharge);
  const updateCharge = useGameStore((s) => s.updateCharge);
  const releaseShot = useGameStore((s) => s.releaseShot);
  const simulateStep = useGameStore((s) => s.simulateStep);
  const resolveTurn = useGameStore((s) => s.resolveTurn);
  const aiTakeTurn = useGameStore((s) => s.aiTakeTurn);
  const placeFreeBall = useGameStore((s) => s.placeFreeBall);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let lastAITime = 0;

    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      const curPhase = useGameStore.getState().phase;
      const curBalls = useGameStore.getState().balls;

      if (curPhase === 'charging') {
        updateCharge(dt);
        animRef.current.cueShrink = Math.min(0.6, power * 0.5);
      } else {
        animRef.current.cueShrink *= 0.9;
      }

      if (curPhase === 'simulating') {
        simulateStep();
      }

      if (curPhase === 'resolving') {
        resolveTurn();
      }

      if (curPhase === 'aiming' && !freeBall) {
        const curPlayer = players.find((p) => p.id === currentPlayerId);
        if (curPlayer?.isAI && time - lastAITime > 800) {
          lastAITime = time;
          aiTakeTurn();
        }
      }

      draw(ctx, curBalls, table);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [balls.length, freeBall, currentPlayerId, players]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toLocal = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy,
      };
    };

    const onMove = (e: MouseEvent) => {
      const pt = toLocal(e);
      mouseRef.current = pt;
      const cue = balls.find((b) => b.id === 0);
      if (cue && !freeBall) {
        const dx = pt.x - cue.pos.x;
        const dy = pt.y - cue.pos.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          setAimAngle(Math.atan2(dy, dx));
        }
      }
    };

    const onDown = (e: MouseEvent) => {
      const pt = toLocal(e);
      if (freeBall) {
        placeFreeBall(pt.x, pt.y);
        return;
      }
      if (phase === 'aiming') {
        const curPlayer = players.find((p) => p.id === currentPlayerId);
        if (!curPlayer?.isAI) {
          startCharge();
        }
      }
    };

    const onUp = () => {
      if (isCharging) {
        releaseShot();
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, [balls, phase, freeBall, isCharging, currentPlayerId, players]);

  const draw = (ctx: CanvasRenderingContext2D, curBalls: Ball[], t: Table) => {
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawTable(ctx, t);

    if (showAimLine && phase === 'aiming' && !freeBall) {
      const activePower = power > 0 ? power : 0.5;
      const prediction = predictShot(curBalls, aimAngle, activePower, 1, 120);
      drawAimLine(ctx, curBalls, prediction);
    }

    if (freeBall) {
      drawFreeBallHint(ctx);
    }

    for (const b of curBalls) {
      if (!b.pocketed) drawBall(ctx, b);
    }

    if (phase === 'aiming' && !freeBall) {
      const cue = curBalls.find((bb) => bb.id === 0);
      const curPlayer = players.find((p) => p.id === currentPlayerId);
      if (cue && !curPlayer?.isAI) {
        drawCue(ctx, cue, aimAngle, power);
      }
    }

    if (foulMessage && phase !== 'gameover') {
      drawFoulBanner(ctx, foulMessage);
    }

    if (winner) {
      drawWinnerBanner(ctx, winner.name);
    }
  };

  const drawTable = (ctx: CanvasRenderingContext2D, t: Table) => {
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
      ctx.strokeStyle = '#1a0f05';
      ctx.lineWidth = 2;
      ctx.stroke();
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

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(headX, (t.y + t.height) / 2, BALL_RADIUS * 3, -Math.PI / 2.2, Math.PI / 2.2);
    ctx.stroke();
  };

  const drawBall = (ctx: CanvasRenderingContext2D, b: Ball) => {
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

      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    if (b.id !== 0 && b.number !== undefined) {
      ctx.fillStyle = b.id === 8 ? '#F5F0E0' : '#F5F0E0';
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = b.id === 8 ? '#000' : '#1a1a1a';
      ctx.font = `bold ${Math.floor(b.radius * 0.8)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayNum = b.id > 8 ? b.id - 8 : b.id;
      ctx.fillText(String(b.id), b.pos.x, b.pos.y + 0.5);
    }

    ctx.beginPath();
    ctx.arc(b.pos.x - b.radius * 0.35, b.pos.y - b.radius * 0.35, b.radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    ctx.restore();
  };

  const drawCue = (ctx: CanvasRenderingContext2D, cue: Ball, angle: number, pwr: number) => {
    const shrink = animRef.current.cueShrink;
    const dist = BALL_RADIUS * 2 + 18 - shrink * 50;
    const startX = cue.pos.x + Math.cos(angle + Math.PI) * dist;
    const startY = cue.pos.y + Math.sin(angle + Math.PI) * dist;
    const endX = startX + Math.cos(angle + Math.PI) * 220;
    const endY = startY + Math.sin(angle + Math.PI) * 220;

    ctx.save();
    ctx.strokeStyle = '#f7f1e0';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const tipLen = 30;
    const tipEndX = cue.pos.x + Math.cos(angle + Math.PI) * (BALL_RADIUS + 2);
    const tipEndY = cue.pos.y + Math.sin(angle + Math.PI) * (BALL_RADIUS + 2);
    const tipStartX = startX + Math.cos(angle) * 8;
    const tipStartY = startY + Math.sin(angle) * 8;
    ctx.strokeStyle = '#2a6a3f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(tipStartX, tipStartY);
    ctx.lineTo(tipEndX, tipEndY);
    ctx.stroke();

    const tipTipX = cue.pos.x + Math.cos(angle + Math.PI) * (BALL_RADIUS + 1);
    const tipTipY = cue.pos.y + Math.sin(angle + Math.PI) * (BALL_RADIUS + 1);
    ctx.strokeStyle = '#11331f';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(tipEndX, tipEndY);
    ctx.lineTo(tipTipX, tipTipY);
    ctx.stroke();

    const buttEndX = endX;
    const buttEndY = endY;
    ctx.strokeStyle = '#3d2817';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(startX + Math.cos(angle + Math.PI) * 40, startY + Math.sin(angle + Math.PI) * 40);
    ctx.lineTo(buttEndX, buttEndY);
    ctx.stroke();

    ctx.strokeStyle = '#d4a84b';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      const tt = 50 + i * 35;
      const x1 = startX + Math.cos(angle + Math.PI) * tt;
      const y1 = startY + Math.sin(angle + Math.PI) * tt;
      const x2 = x1 + Math.cos(angle + Math.PI) * 4;
      const y2 = y1 + Math.sin(angle + Math.PI) * 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  };

  const drawAimLine = (ctx: CanvasRenderingContext2D, curBalls: Ball[], prediction: ReturnType<typeof predictShot>) => {
    const cue = curBalls.find((b) => b.id === 0);
    if (!cue) return;

    for (let i = 0; i < prediction.segments.length; i++) {
      const seg = prediction.segments[i];
      if (!seg.isCuePath) continue;

      ctx.save();
      ctx.strokeStyle = seg.isSolid ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash(seg.isSolid ? [] : [6, 6]);
      ctx.lineDashOffset = 0;
      ctx.beginPath();
      ctx.moveTo(seg.start.x, seg.start.y);
      ctx.lineTo(seg.end.x, seg.end.y);
      ctx.stroke();
      ctx.restore();
    }

    if (prediction.targetBallPath) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245,208,51,0.6)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(prediction.targetBallPath.start.x, prediction.targetBallPath.start.y);
      ctx.lineTo(prediction.targetBallPath.end.x, prediction.targetBallPath.end.y);
      ctx.stroke();
      ctx.restore();
    }

    if (prediction.willPocket.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(74,222,128,0.85)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      const ids = prediction.willPocket.filter((i) => i !== 0).join(', ');
      if (ids) {
        ctx.fillText(`预测进球: ${ids}号`, cue.pos.x + 20, cue.pos.y - 25);
      }
      if (prediction.willPocket.includes(0)) {
        ctx.fillStyle = 'rgba(248,113,113,0.9)';
        ctx.fillText('⚠ 白球可能落袋', cue.pos.x + 20, cue.pos.y - 45);
      }
      ctx.restore();
    }
  };

  const drawFreeBallHint = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.fillStyle = 'rgba(245,208,75,0.1)';
    ctx.fillRect(PLAYFIELD_LEFT, PLAYFIELD_TOP, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, PLAYFIELD_BOTTOM - PLAYFIELD_TOP);
    ctx.strokeStyle = 'rgba(245,208,75,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(PLAYFIELD_LEFT, PLAYFIELD_TOP, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, PLAYFIELD_BOTTOM - PLAYFIELD_TOP);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(245,208,75,0.95)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('自由球：点击任意位置放置白球', CANVAS_W / 2, CANVAS_H - 18);
    ctx.restore();
  };

  const drawFoulBanner = (ctx: CanvasRenderingContext2D, msg: string) => {
    ctx.save();
    const w = 400;
    const h = 44;
    const x = (CANVAS_W - w) / 2;
    const y = 70;
    ctx.fillStyle = 'rgba(127,29,29,0.92)';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248,113,113,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fecaca';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, x + w / 2, y + h / 2);
    ctx.restore();
  };

  const drawWinnerBanner = (ctx: CanvasRenderingContext2D, name: string) => {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const w = 420;
    const h = 120;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#2a1a0e');
    grad.addColorStop(1, '#5a3a1f');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = '#d4a84b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#d4a84b';
    ctx.font = 'bold 36px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${name} 获胜！`, x + w / 2, y + h / 2 + 10);
    ctx.restore();
  };

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="rounded-xl shadow-2xl border border-amber-900/60 cursor-crosshair"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
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
