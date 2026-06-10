import type { Ball, FoulType, GameMode, Player, Shot } from './types';
import { FoulType as FoulTypeEnum } from './types';
import { FOUL_MESSAGES } from './constants';

export function getLegalFirstBalls(
  mode: GameMode,
  balls: Ball[],
  currentPlayer: Player,
  groupsAssigned: boolean,
): number[] {
  const activeBalls = balls.filter((b) => !b.pocketed && b.id !== 0);

  if (mode === '9ball') {
    const lowest = Math.min(...activeBalls.map((b) => b.id));
    return [lowest];
  }

  if (mode === '8ball') {
    if (!groupsAssigned) {
      return activeBalls.filter((b) => b.id !== 8).map((b) => b.id);
    }
    const group = currentPlayer.group;
    if (group === 'solid') {
      const solids = activeBalls.filter((b) => !b.stripe && b.id !== 8);
      if (solids.length > 0) return solids.map((b) => b.id);
      return [8];
    }
    if (group === 'stripe') {
      const stripes = activeBalls.filter((b) => b.stripe && b.id !== 8);
      if (stripes.length > 0) return stripes.map((b) => b.id);
      return [8];
    }
  }
  return activeBalls.map((b) => b.id);
}

export function checkFoul(
  mode: GameMode,
  balls: Ball[],
  shot: Shot,
  currentPlayer: Player,
  groupsAssigned: boolean,
): { foul: FoulType; message: string | null } {
  const legalFirstBalls = getLegalFirstBalls(mode, balls, currentPlayer, groupsAssigned);

  const cueBallPocketed = shot.pocketedBalls.includes(0);
  if (cueBallPocketed) {
    return { foul: FoulTypeEnum.CUE_BALL_POCKETED, message: FOUL_MESSAGES.CUE_BALL_POCKETED };
  }

  const firstHitId = shot.hits.length > 0 ? shot.hits[0].ballId : null;

  if (firstHitId === null) {
    return { foul: FoulTypeEnum.NO_BALL_HIT, message: FOUL_MESSAGES.NO_BALL_HIT };
  }

  if (!legalFirstBalls.includes(firstHitId)) {
    return { foul: FoulTypeEnum.WRONG_FIRST_CONTACT, message: FOUL_MESSAGES.WRONG_FIRST_CONTACT };
  }

  if (mode === '8ball') {
    const group = currentPlayer.group;
    const eightInThisShot = shot.pocketedBalls.includes(8);
    if (groupsAssigned && group) {
      const groupBallsRemaining = balls.filter(
        (b) => !b.pocketed && b.id !== 0 && b.id !== 8 && ((group === 'solid' && !b.stripe) || (group === 'stripe' && b.stripe)),
      ).length;

      if (eightInThisShot && groupBallsRemaining > 0) {
        return { foul: FoulTypeEnum.EIGHT_BALL_POCKETED_EARLY, message: FOUL_MESSAGES.EIGHT_BALL_POCKETED_EARLY };
      }
    }
  }

  return { foul: FoulTypeEnum.NONE, message: null };
}

export interface ResolveResult {
  switchTurn: boolean;
  assignGroups?: { p1Group: 'solid' | 'stripe' | null; p2Group: 'solid' | 'stripe' | null };
  gameOver: boolean;
  winnerId?: number;
  hintMessage: string | null;
}

export function resolveShot(
  mode: GameMode,
  balls: Ball[],
  shot: Shot,
  players: Player[],
  currentPlayerId: number,
  foul: FoulType,
  groupsAssigned: boolean,
): ResolveResult {
  const currentPlayer = players.find((p) => p.id === currentPlayerId)!;
  const otherPlayer = players.find((p) => p.id !== currentPlayerId)!;
  const hasFoul = foul !== FoulTypeEnum.NONE;
  let switchTurn = true;
  let hintMessage: string | null = null;

  const pocketedNonCue = shot.pocketedBalls.filter((id) => id !== 0);

  if (mode === '8ball') {
    if (!groupsAssigned && pocketedNonCue.length > 0 && !hasFoul) {
      const firstPocketed = pocketedNonCue[0];
      const ball = balls.find((b) => b.id === firstPocketed);
      if (ball && ball.id !== 8) {
        const p1Group = currentPlayer.id === 0
          ? ball.stripe ? 'stripe' : 'solid'
          : ball.stripe ? 'stripe' : 'solid';
        const p2Group = p1Group === 'solid' ? 'stripe' : 'solid';
        currentPlayer.group = p1Group;
        otherPlayer.group = p2Group;
        groupsAssigned = true;
        hintMessage = `${currentPlayer.name} 已分配：${p1Group === 'solid' ? '全色球' : '半色球'}`;
      }
    }

    const group = currentPlayer.group;
    if (group && !hasFoul) {
      const ownGroupPocketed = pocketedNonCue.filter((id) => {
        const ball = balls.find((b) => b.id === id);
        if (!ball || ball.id === 8) return false;
        return (group === 'solid' && !ball.stripe) || (group === 'stripe' && ball.stripe);
      });

      if (ownGroupPocketed.length > 0) {
        switchTurn = false;
        hintMessage = `好球！继续击打`;
      }
    }

    const eightBall = balls.find((b) => b.id === 8);
    if (eightBall?.pocketed) {
      const groupBallsRemaining = balls.filter(
        (b) => !b.pocketed && b.id !== 0 && b.id !== 8 && ((group === 'solid' && !b.stripe) || (group === 'stripe' && b.stripe)),
      ).length;

      if (groupBallsRemaining === 0 && !hasFoul) {
        return { switchTurn: false, gameOver: true, winnerId: currentPlayerId, hintMessage: `${currentPlayer.name} 获胜！` };
      }
      if (hasFoul || groupBallsRemaining > 0) {
        return { switchTurn: true, gameOver: true, winnerId: otherPlayer.id, hintMessage: `${otherPlayer.name} 获胜！` };
      }
    }
  }

  if (mode === '9ball') {
    if (pocketedNonCue.includes(9) && !hasFoul) {
      return { switchTurn: false, gameOver: true, winnerId: currentPlayerId, hintMessage: `${currentPlayer.name} 获胜！` };
    }

    if (pocketedNonCue.length > 0 && !hasFoul) {
      const lowestRemaining = Math.min(
        ...balls.filter((b) => !b.pocketed && b.id !== 0).map((b) => b.id),
      );
      const firstHit = shot.hits[0]?.ballId;
      if (firstHit === lowestRemaining) {
        switchTurn = false;
        hintMessage = `好球！继续击打`;
      }
    }
  }

  currentPlayer.score += pocketedNonCue.filter((id) => {
    if (mode === '8ball') {
      const ball = balls.find((b) => b.id === id);
      if (!ball || ball.id === 8) return false;
      const grp = currentPlayer.group;
      if (!grp) return true;
      return (grp === 'solid' && !ball.stripe) || (grp === 'stripe' && ball.stripe);
    }
    return id !== 9;
  }).length;

  return { switchTurn, gameOver: false, hintMessage };
}
