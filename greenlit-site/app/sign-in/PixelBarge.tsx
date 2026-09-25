/**
 * An eight-bit container ship, for the sign-in panel.
 *
 * It replaces the company mark, which was navy artwork inverted to white: its
 * anti-aliased edges came back as semi-transparent white, so at any size it
 * read as a smear rather than a logo. The mark is already on the other half of
 * the page, in its own colours, at a size that suits it.
 *
 * Drawn from a character map rather than a path, because that is what makes it
 * pixel art: every square is a square, the grid is legible in the source, and
 * changing the ship means editing a picture rather than a `d` attribute.
 *
 * `shapeRendering="crispEdges"` is the whole trick — without it the browser
 * antialiases every square edge and the result is a blurry ship, which is the
 * problem this was drawn to solve.
 */

/** `.` is sky, and the panel behind shows through it. */
const ART = [
  "............................................",
  "............................................",
  "............................................",
  "............................................",
  "............................................",
  "............................................",
  ".......FF...................................",
  ".......ff...................................",
  ".......ff...................................",
  "......bbbbbb................................",
  "......bwwbwb.....442442444........mmm.......",
  "......bbbbbb...333433334333343.....m........",
  "......bwwbwb.222122212221222122212.m........",
  "......bbbbbb.1311113111131111311113m1.......",
  ".....dddddddddddddddddddddddddddddddddd.....",
  ".....HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH....",
  ".....hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh....",
  ".....hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh......",
  ".......hhhhhhhhhhhhhhhhhhhhhhhhhhhh.........",
  "WW~~WW~~WW~~WW~~WW~~WW~~WW~~WW~~WW~~WW~~WW~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~WWW~~~WWW~~~WWW~~~WWW~~~WWW~~~WWW~~~WWW~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
];

/**
 * The palette, on the navy panel.
 *
 * The containers are the brand's Horizon Blue and white plus two steps
 * between, so the stack reads as cargo rather than as stripes. The water is
 * white at low opacity, which lets the panel's own navy be the sea.
 */
const INK: Record<string, string> = {
  h: "#0a1f3d",                        // hull
  H: "#38609c",                        // the deck edge catching the light
  d: "#16325c",                        // deck
  b: "#e8eef7",                        // bridge
  w: "#006eff",                        // its windows
  f: "#c8d6ea",                        // funnel
  F: "#006eff",                        // funnel band
  m: "#9fb6d4",                        // mast and derrick
  "1": "#ffffff",
  "2": "#006eff",
  "3": "#8fb6ff",
  "4": "#c8dcff",
  "~": "rgba(255,255,255,.07)",        // sea
  W: "rgba(255,255,255,.16)",          // a crest
};

export default function PixelBarge({ className = "" }: { className?: string }) {
  const squares = [];
  for (let y = 0; y < ART.length; y += 1) {
    const row = ART[y];
    for (let x = 0; x < row.length; x += 1) {
      const fill = INK[row[x]];
      if (!fill) continue;
      squares.push(
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${ART[0].length} ${ART.length}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="A container ship, drawn as pixel art"
    >
      {squares}
    </svg>
  );
}
