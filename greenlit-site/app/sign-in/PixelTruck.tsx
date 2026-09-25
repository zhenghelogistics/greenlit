/**
 * An eight-bit container truck, for the sign-in panel.
 *
 * It replaces the company mark, which was navy artwork inverted to white: its
 * anti-aliased edges came back as semi-transparent white, so at any size it
 * read as a smear rather than a logo. The mark is already on the other half of
 * the page, in its own colours, at a size that suits it.
 *
 * It was a ship first, which was the wrong trade. Zheng He is a haulier: the
 * vessel is somebody else's problem and arrives whatever anybody here does,
 * and what this company actually owns is the truck that meets it. So the
 * picture is a prime mover and a box with the company's mark on it.
 *
 * Drawn from a character map rather than a path, because that is what makes it
 * pixel art: every square is a square, the grid is legible in the source, and
 * changing the truck means editing a picture rather than a `d` attribute.
 *
 * The mark sits on a clear placard rather than straight on the corrugation —
 * a real box carries one, and three letters interleaved with ribs are three
 * letters nobody can read.
 *
 * `shapeRendering="crispEdges"` is the whole trick — without it the browser
 * antialiases every square edge and the result is a blurry ship, which is the
 * problem this was drawn to solve.
 */

/** `.` is sky, and the panel behind shows through it. */
const ART = [
  "....................................................................................",
  "....................................................................................",
  "....................................................................................",
  "...................................................SSSS.............................",
  "....................................................ss..............................",
  "....................................................ss..............................",
  "....................................................ss..............................",
  "....CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC...ss..............................",
  "...CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC..ss..............................",
  "...CcccccccccccccccccccccccccccccccccccccccccccccC..ss..............................",
  "...CccvccvccvccvccvccvccvccvccvccvccvccvccvccvcccC..ss..bbbbbbbbbbbbbbbbbb..........",
  "...CccvccvccvccpppppppppppppppppppppppcvccvccvcccC..ssbbbbbbbbbbbbbbbbbbbbbb........",
  "...CccvccvccvccppLLLLLppLpppLppLppppppcvccvccvcccC....bbbbWWWWWWWWWWWWWWWbbbb.......",
  "...CccvccvccvccppppppLppLpppLppLppppppcvccvccvcccC....bbbbwwwwwwwwwwwwwwwbbbb.......",
  "...CccvccvccvccpppppLpppLLLLLppLppppppcvccvccvcccC....bbbbwwwwwwwwwwwwwwwbbbb.......",
  "...CccvccvccvccppppLppppLpppLppLppppppcvccvccvcccC....bbbbwwwwwwwwwwwwwwwbbbb.......",
  "...CccvccvccvccpppLpppppLpppLppLppppppcvccvccvcccC....bbbbwwwwwwwwwwwwwwwbbb........",
  "...CccvccvccvccppLLLLLppLpppLppLLLLLppcvccvccvcccC....bbbbbbbbbbbbbbbbbbbyyy........",
  "...CccvccvccvccpppppppppppppppppppppppcvccvccvcccC....bbbbbbbbbbbbbbbbbbbyyy........",
  "...CccvccvccvccpppppppppppppppppppppppcvccvccvcccC....bbbbbbbbbbbbbbbbbbbbbb........",
  "...CccvccvccvccvccvccvccvccvccvccvccvccvccvccvcccC....bbbbbbbbbbbbbbbbbbbuuuu.......",
  "...CccvccvccvccvccvccvccvccvccvccvccvccvccvccvcccC....bbbbbbbbbbbbbbbbbbbuuuu.......",
  "...CcccccccccccccccccccccccccccccccccccccccccccccC....bbbbbbbbbbbbbbbbbbbuuuu.......",
  "....hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.........",
  "....hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.........",
  "..........ttttttt.....ttttttt............................ttttttt....ttttttt.........",
  ".........tttTTTttt...tttTTTttt..........................tttTTTttt..tttTTTttt........",
  "..........ttttttt.....ttttttt............................ttttttt....ttttttt.........",
  "....................................................................................",
  "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
  "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
  "rrrRRRRRRrrrrrRRRRRRrrrrrRRRRRRrrrrrRRRRRRrrrrrRRRRRRrrrrrRRRRRRrrrrrRRRRRRrrrrrRRRR",
  "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
  "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
];

/**
 * The palette, on the navy panel.
 *
 * The containers are the brand's Horizon Blue and white plus two steps
 * between, so the stack reads as cargo rather than as stripes. The water is
 * white at low opacity, which lets the panel's own navy be the sea.
 */
const INK: Record<string, string> = {
  c: "#dbe6f5",                        // the container's side
  C: "#ffffff",                        // its corner posts and top rail
  v: "#b9cbe4",                        // corrugation
  p: "#ffffff",                        // the placard the mark sits on
  L: "#003087",                        // ZHL, in the company's navy
  h: "#16325c",                        // chassis
  b: "#e8eef7",                        // the cab
  w: "#006eff",                        // its windscreen
  g: "#9fb6d4",                        // grille
  s: "#9fb6d4",                        // exhaust stack
  S: "#c8d6ea",                        // its cap
  W: "#8fb6ff",                        // the top of the windscreen
  u: "#9fb6d4",                        // bumper
  y: "#ffd166",                        // headlight
  t: "#0a1f3d",                        // tyres
  T: "#9fb6d4",                        // hubs
  r: "rgba(255,255,255,.07)",          // road
  R: "rgba(255,255,255,.18)",          // its markings
};

export default function PixelTruck({ className = "" }: { className?: string }) {
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
      // The sea fades out at the bottom so it becomes the panel rather than
      // ending on an edge. A hard stop reads as a sticker stuck on the navy.
      style={{
        maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
      }}
      role="img"
      aria-label="A Zheng He Logistics container truck, drawn as pixel art"
    >
      {squares}
    </svg>
  );
}
