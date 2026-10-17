// Morphy vs. Duke Karl of Brunswick & Count Isouard, Paris 1858 ("the Opera Game").
// Each ply lists the squares that move; castling moves two pieces in one ply.
export const PLIES = [
  { san: 'e4', moves: [['e2', 'e4']] },
  { san: 'e5', moves: [['e7', 'e5']] },
  { san: 'Nf3', moves: [['g1', 'f3']] },
  { san: 'd6', moves: [['d7', 'd6']] },
  { san: 'd4', moves: [['d2', 'd4']] },
  { san: 'Bg4', moves: [['c8', 'g4']] },
  { san: 'dxe5', moves: [['d4', 'e5']] },
  { san: 'Bxf3', moves: [['g4', 'f3']] },
  { san: 'Qxf3', moves: [['d1', 'f3']] },
  { san: 'dxe5', moves: [['d6', 'e5']] },
  { san: 'Bc4', moves: [['f1', 'c4']] },
  { san: 'Nf6', moves: [['g8', 'f6']] },
  { san: 'Qb3', moves: [['f3', 'b3']] },
  { san: 'Qe7', moves: [['d8', 'e7']] },
  { san: 'Nc3', moves: [['b1', 'c3']] },
  { san: 'c6', moves: [['c7', 'c6']] },
  { san: 'Bg5', moves: [['c1', 'g5']] },
  { san: 'b5', moves: [['b7', 'b5']] },
  { san: 'Nxb5', moves: [['c3', 'b5']] },
  { san: 'cxb5', moves: [['c6', 'b5']] },
  { san: 'Bxb5+', moves: [['c4', 'b5']] },
  { san: 'Nbd7', moves: [['b8', 'd7']] },
  { san: 'O-O-O', moves: [['e1', 'c1'], ['a1', 'd1']] },
  { san: 'Rd8', moves: [['a8', 'd8']] },
  { san: 'Rxd7', moves: [['d1', 'd7']] },
  { san: 'Rxd7', moves: [['d8', 'd7']] },
  { san: 'Rd1', moves: [['h1', 'd1']] },
  { san: 'Qe6', moves: [['e7', 'e6']] },
  { san: 'Bxd7+', moves: [['b5', 'd7']] },
  { san: 'Nxd7', moves: [['f6', 'd7']] },
  { san: 'Qb8+', moves: [['b3', 'b8']] },
  { san: 'Nxb8', moves: [['d7', 'b8']] },
  { san: 'Rd8#', moves: [['d1', 'd8']] },
];

// What the readout says while the game is between these plies.
export const NOTES = [
  { from: 0, text: 'Paul Morphy plays the Duke of Brunswick and Count Isouard, together, in a box at the opera.' },
  { from: 6, text: 'White develops a piece with every move. Black spends moves holding on to a pawn.' },
  { from: 18, text: 'Morphy gives up a knight to tear the queenside open.' },
  { from: 24, text: 'Then a rook, to keep the pin on the d-file.' },
  { from: 30, text: 'Then the queen.' },
  { from: 32, text: 'Checkmate. A bishop and one rook finish it in seventeen moves.' },
];

const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const FILES = 'abcdefgh';

export function initialPieces() {
  const pieces = [];
  for (let f = 0; f < 8; f++) {
    pieces.push({ type: BACK[f], white: true, square: FILES[f] + '1' });
    pieces.push({ type: 'p', white: true, square: FILES[f] + '2' });
    pieces.push({ type: 'p', white: false, square: FILES[f] + '7' });
    pieces.push({ type: BACK[f], white: false, square: FILES[f] + '8' });
  }
  return pieces.map((p, id) => ({ ...p, id, start: p.square, track: [], capturedAt: null }));
}

// Plays the game once and records, per piece, which ply moved it and when it was taken.
export function buildTracks() {
  const pieces = initialPieces();
  const at = new Map(pieces.map((p) => [p.square, p]));
  PLIES.forEach((ply, i) => {
    const castling = ply.moves.length > 1;
    for (const [from, to] of ply.moves) {
      const mover = at.get(from);
      const victim = at.get(to);
      if (victim && !castling) victim.capturedAt = i;
      at.delete(from);
      at.set(to, mover);
      mover.track.push({ ply: i, from, to });
    }
  });
  return pieces;
}

export function squareXZ(sq) {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return [f - 3.5, 3.5 - r];
}

export function moveLabel(i) {
  const n = Math.floor(i / 2) + 1;
  return i % 2 === 0 ? `${n}. ${PLIES[i].san}` : `${n}… ${PLIES[i].san}`;
}
