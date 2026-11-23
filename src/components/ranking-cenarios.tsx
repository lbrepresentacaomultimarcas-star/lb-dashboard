/** Cenários e personagens originais do ranking, em SVG (leves e nítidos). */

const janelas = (x: number, y: number, w: number, h: number, cor: string) => {
  const out = [];
  for (let l = 0; l < Math.floor(h / 15); l++) {
    for (let c = 0; c < Math.floor((w - 6) / 10); c++) {
      if ((l * 3 + c * 5 + x) % 4 === 0) continue;
      out.push(<rect key={`${l}-${c}`} x={x + 5 + c * 10} y={y + 7 + l * 15} width="5" height="7" fill={cor} opacity={(l + c) % 3 ? 0.75 : 0.35} />);
    }
  }
  return out;
};

function Palmeira({ x, y, e = 1, flip = false }: { x: number; y: number; e?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -e : e} ${e})`} fill="#14082a">
      <path d="M-5 0C4-70 2-140 18-205l8 2C14-140 16-70 8 0Z" />
      {[-158, -122, -82, -44, -12, 22].map((r) => (
        <path key={r} transform={`translate(22 -205) rotate(${r})`} d="M0 0C34-22 78-20 112 10 76-2 38 0 0 8Z" />
      ))}
    </g>
  );
}

function Helicoptero({ x, y, e = 1 }: { x: number; y: number; e?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${e})`}>
      <ellipse cx="44" cy="-8" rx="62" ry="2.500" fill="#fff" opacity="0.55" />
      <path d="M0 16C4 0 28-4 52-2l54 8 22-10 3 7-17 16-52 4C30 28 2 30 0 16Z" fill="#b5172f" />
      <path d="M8 13C12 4 24 2 36 2v12Z" fill="#7fe3ff" />
      <path d="M12 36h56M24 26v10M54 26v10" stroke="#16091f" strokeWidth="3" />
      <path d="M44-8v8" stroke="#16091f" strokeWidth="4" />
    </g>
  );
}

function Carro({ x, y, cor, e = 1, flip = false }: { x: number; y: number; cor: string; e?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -e : e} ${e})`}>
      <ellipse cx="120" cy="78" rx="130" ry="9" fill={cor} opacity="0.45" />
      <path d="M4 58c0-14 14-20 40-24l34-22c10-6 60-8 78 2l32 22c24 2 44 8 48 22v14H4Z" fill={cor} />
      <path d="M84 16c14-5 44-6 62 0l22 20H58Z" fill="#150a28" />
      <path d="M112 14v22" stroke={cor} strokeWidth="4" />
      <path d="M6 54h26" stroke="#fff4a8" strokeWidth="5" strokeLinecap="round" />
      <path d="M214 54h22" stroke="#ff2d55" strokeWidth="5" strokeLinecap="round" />
      {[58, 184].map((c) => (
        <g key={c}><circle cx={c} cy="70" r="16" fill="#0b0614" /><circle cx={c} cy="70" r="7" fill="#d9d9e8" /></g>
      ))}
    </g>
  );
}

export function PersonagemNeon({ tipo, className }: { tipo: "ela" | "ele"; className?: string }) {
  const ela = tipo === "ela";
  const roupa = ela ? "#7a2ff0" : "#191426";
  const pele = ela ? "#c98a62" : "#e0ad85";
  return (
    <svg className={className} viewBox="0 0 220 460" role="img" aria-label={ela ? "Personagem ilustrada da Neon City" : "Personagem ilustrado da Neon City"}>
      <ellipse cx="110" cy="448" rx="82" ry="10" fill="#ff2d9b" opacity="0.5" />
      {ela && <path d="M66 62C60 8 150 2 158 58c7 44 14 84 2 118l-100 2C48 140 62 100 66 62Z" fill="#2a1020" />}
      <path d="M80 268 64 436h40l9-112 9 112h40l-16-168Z" fill={ela ? "#16101f" : "#231a3a"} />
      <path d="M58 440h48v12H52ZM118 440h48l6 12h-54Z" fill="#f4f0ff" />
      <path d="M70 124c12-12 72-12 84 0l18 150H52Z" fill={roupa} />
      <path d="M96 118h32l-16 74Z" fill={ela ? "#ffd166" : "#f4f0ff"} />
      <path d="m92 118 20 76 20-76 10 4-30 150-30-150Z" fill={ela ? "#5a1fc4" : "#2d2442"} />
      <path d="M152 126c20 8 28 62 34 104l-20 6-24-76Z" fill={roupa} />
      <circle cx="176" cy="240" r="12" fill={pele} />
      <path d="M70 128c-24 10-36 54-34 96l42-30 12-46Z" fill={roupa} />
      <path d="M38 222 84 196l6 14-44 30Z" fill={roupa} />
      <circle cx="92" cy="204" r="11" fill={pele} />
      <rect x="99" y="92" width="26" height="34" rx="9" fill={pele} />
      <ellipse cx="112" cy="66" rx="35" ry="41" fill={pele} />
      {ela ? (
        <path d="M76 66C72 22 112 14 144 34c8 12 8 24 6 34-14-4-26-14-34-26-8 14-24 22-40 24Z" fill="#2a1020" />
      ) : (
        <path d="M76 62C70 20 106 12 134 20c16 6 20 26 16 42-4-12-10-18-22-20-16 4-34 2-44 0-4 6-6 12-8 20Z" fill="#16101f" />
      )}
      <path d="M78 58h70l-3 17c-7 8-22 8-27-1l-5-8-5 8c-6 9-20 9-27 1Z" fill="#0a0612" />
      <path d="M88 62h14M126 62h14" stroke="#29d3ff" strokeWidth="2" opacity="0.8" />
      <path d="M100 90q12 8 25 0" stroke={ela ? "#b5174e" : "#7a4a33"} strokeWidth="3.500" fill="none" strokeLinecap="round" />
      <text x="112" y="172" textAnchor="middle" fontSize="20" fontWeight="900" fill="#ffd166" fontFamily="serif">LB</text>
    </svg>
  );
}

export function PapaiNoelGrande({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 470" role="img" aria-label="Papai Noel ilustrado apontando para o ranking">
      <ellipse cx="140" cy="456" rx="118" ry="11" fill="#000" opacity="0.4" />
      <path d="M62 432h70v24H50ZM150 432h72l12 24h-84Z" fill="#17100e" />
      <path d="M72 330 64 438h66l10-70 12 70h66l-14-108Z" fill="#a9142a" />
      <path d="M60 414h76v24H58ZM150 414h72l2 24h-74Z" fill="#fff" />
      <path d="M46 200c10-50 54-74 96-74s88 24 96 76l14 144H34Z" fill="#c8182f" />
      <path d="M126 150h30v200h-30Z" fill="#fff" />
      <path d="M32 322h222v34H32Z" fill="#17100e" />
      <rect x="120" y="318" width="44" height="42" rx="5" fill="#f2c94c" />
      <rect x="130" y="328" width="24" height="22" rx="2" fill="#17100e" />
      <path d="M58 190C26 214 14 270 28 320l34-6 20-74Z" fill="#b01428" />
      <path d="M22 310h46v24H22Z" fill="#fff" />
      <circle cx="44" cy="350" r="21" fill="#17100e" />
      <path d="M216 172c30 2 42 16 54 46l-44 30-32-30Z" fill="#c8182f" />
      <path d="m240 214 16 28-30 18-14-30Z" fill="#fff" />
      <path d="M232 256c-2-16 8-30 24-34l6-44c1-9 16-8 16 2l-2 40c14 2 22 12 20 26-2 18-16 30-34 28-16-1-28-6-30-18Z" fill="#17100e" />
      <path d="M58 118C62 40 126 14 182 28c34 10 54 38 62 70l-20 6c-8-14-20-26-34-30l-110 44Z" fill="#c8182f" />
      <circle cx="252" cy="110" r="20" fill="#fff" />
      <ellipse cx="146" cy="136" rx="62" ry="58" fill="#f5c7a4" />
      <path d="M78 150c-8 76 26 132 68 136 44-4 76-60 68-136-8 22-22 34-40 32-16 12-42 12-58 0-18 2-32-10-38-32Z" fill="#fff" />
      <path d="M116 174c10-10 22-8 30 0 8-8 20-10 30 0-10 12-22 12-30 6-8 6-20 6-30-6Z" fill="#ece8e4" />
      <path d="M134 194q12 10 24 0" stroke="#b5293a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M90 124h112l-4 22c-6 12-34 12-42 0l-10-12-10 12c-8 12-36 12-42 0Z" fill="#0d0a10" />
      <path d="M104 130h16M162 130h16" stroke="#7fd6ff" strokeWidth="3" opacity="0.8" />
      <circle cx="146" cy="160" r="9" fill="#ea8d80" />
      <path d="M68 104c26-22 130-30 164-8 10 8 8 28-6 28-52-12-104-10-154 4-14 2-18-16-4-24Z" fill="#fff" />
    </svg>
  );
}

function Arvore({ x, y, e = 1 }: { x: number; y: number; e?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${e})`}>
      <rect x="-12" y="-30" width="24" height="30" fill="#4a2c18" />
      <path d="M0-260 54-176H28l54 74H42l62 76H-104l62-76H-82l54-74H-54Z" fill="#14603a" />
      <path d="M0-260 54-176H28l54 74H42l62 76H0Z" fill="#0d4a2c" />
      <path d="M-46-150q50 24 86-4M-66-82q70 30 124-6M-82-42q90 26 160-8" stroke="#f2c94c" strokeWidth="3" fill="none" />
      {[[-24, -142, "#ff3b4e"], [26, -170, "#f2c94c"], [-48, -78, "#f2c94c"], [46, -96, "#ff3b4e"], [4, -58, "#7fd6ff"], [-70, -36, "#ff3b4e"], [72, -44, "#f2c94c"], [0, -200, "#ff3b4e"]].map(([cx, cy, f]) => (
        <circle key={`${cx}`} cx={cx as number} cy={cy as number} r="7" fill={f as string} />
      ))}
      <path d="m0-292 8 19 20 2-15 13 5 20-18-10-18 10 5-20-15-13 20-2Z" fill="#ffd95a" />
    </g>
  );
}

function Presente({ x, y, w, h, a, b }: { x: number; y: number; w: number; h: number; a: string; b: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={-h} width={w} height={h} rx="3" fill={a} />
      <rect x="-3" y={-h - 8} width={w + 6} height="12" rx="2" fill={a} stroke="#0003" />
      <rect x={w / 2 - 5} y={-h - 8} width="10" height={h + 8} fill={b} />
      <path d={`M${w / 2} ${-h - 8}c-20-20-34-6-20 2 6 2 14 0 20-2Zm0 0c20-20 34-6 20 2-6 2-14 0-20-2Z`} fill={b} />
    </g>
  );
}

export function CenarioNatal() {
  return (
    <div className="lbr-cenario lbr-cenario-natal" aria-hidden>
      <svg className="lbr-fundo-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="lbr-n1" cx="50%" cy="38%" r="62%">
            <stop offset="0" stopColor="#e8313f" /><stop offset="0.46" stopColor="#8f0f1f" /><stop offset="1" stopColor="#25040b" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#lbr-n1)" />
        <path d="M0 620V470l60-30 40 40 50-90 56 70 60-40 44 60 70-120 56 100 70-40 50 50 74-180 16-70 16 70 70 170 60-50 60 60 60-90 70 80 60-40 60 60 70-110 50 80 70-30 68 40v180Z" fill="#4b0914" opacity="0.72" />
        <path d="M0 0c90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 300 0v-10H0Z" fill="#0f5230" />
        <path d="M0 8c90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 260 0 90 62 170 62 300 0" stroke="#f2c94c" strokeWidth="3" fill="none" />
        {Array.from({ length: 13 }).map((_, i) => (
          <g key={i} transform={`translate(${130 * i} ${44 + (i % 2) * 6})`}>
            <path d="M0 0v18" stroke="#f2c94c" strokeWidth="2" />
            <circle cy="30" r="13" fill={["#ff3b4e", "#f2c94c", "#2fb56f"][i % 3]} />
            <circle cx="-4" cy="25" r="3.500" fill="#fff" opacity="0.8" />
          </g>
        ))}
        <path d="M0 900V770c180-44 330-30 520-6 200 26 380 18 560-12 200-34 360-30 520 16v132Z" fill="#fbf7f2" />
        <path d="M0 900V818c220-34 420-14 640 4 300 22 620-2 960-30v108Z" fill="#dfe7ee" />
        <Arvore x={1520} y={820} e={1.75} />
        <Arvore x={70} y={800} e={1.12} />
        <Presente x={1270} y={850} w={92} h={70} a="#c8182f" b="#f2c94c" />
        <Presente x={1370} y={868} w={110} h={88} a="#f2c94c" b="#c8182f" />
        <Presente x={230} y={872} w={84} h={62} a="#1f8a4e" b="#f2c94c" />
        <circle cx="1490" cy="838" r="42" fill="#b5172f" />
        <circle cx="1476" cy="822" r="10" fill="#fff" opacity="0.65" />
        <text x="1490" y="852" textAnchor="middle" fontSize="36" fontWeight="900" fontFamily="serif" fill="#ffd95a">LB</text>
      </svg>
      {Array.from({ length: 22 }).map((_, i) => (
        <span
          key={i}
          className="lbr-floco"
          style={{
            left: `${(i * 4.7 + 1) % 100}%`,
            fontSize: 8 + (i % 4) * 5,
            animationDuration: `${10 + (i % 6) * 2.4}s`,
            animationDelay: `-${(i * 1.7) % 12}s`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}

const PREDIOS: [number, number, number, string][] = [
  [0, 86, 300, "#ffb86b"], [92, 70, 410, "#29d3ff"], [168, 92, 340, "#ff6cbe"], [266, 62, 470, "#ffd166"],
  [334, 100, 380, "#29d3ff"], [440, 74, 520, "#ff6cbe"], [520, 110, 430, "#ffd166"], [636, 66, 590, "#29d3ff"],
  [708, 96, 470, "#ff6cbe"], [810, 72, 640, "#ffd166"], [888, 104, 500, "#29d3ff"], [998, 70, 570, "#ff6cbe"],
  [1074, 92, 440, "#ffd166"], [1172, 78, 530, "#29d3ff"], [1256, 104, 380, "#ff6cbe"], [1366, 72, 470, "#ffd166"],
  [1444, 88, 350, "#29d3ff"], [1538, 70, 420, "#ff6cbe"],
];

export function CenarioNeon() {
  return (
    <div className="lbr-cenario lbr-cenario-neon" aria-hidden>
      <svg className="lbr-fundo-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="lbr-c1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a0a55" /><stop offset="0.32" stopColor="#6d1fb8" /><stop offset="0.56" stopColor="#ff2d9b" /><stop offset="0.76" stopColor="#ff9f5a" /><stop offset="1" stopColor="#2a0b3e" />
          </linearGradient>
          <linearGradient id="lbr-c2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c1465" /><stop offset="1" stopColor="#0e0620" />
          </linearGradient>
          <linearGradient id="lbr-c3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe28a" /><stop offset="0.55" stopColor="#ff5fa8" /><stop offset="1" stopColor="#a02bd8" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#lbr-c1)" />
        <circle cx="800" cy="470" r="250" fill="url(#lbr-c3)" opacity="0.85" />
        {[430, 472, 512, 552, 590, 628, 664].map((y, i) => <rect key={y} x="520" y={y} width="560" height={4 + i * 1.5} fill="#7d1f9e" opacity="0.7" />)}
        <g opacity="0.92">
          {PREDIOS.map(([x, w, h, c]) => (
            <g key={x}>
              <rect x={x} y={780 - h} width={w} height={h} fill="url(#lbr-c2)" stroke={c} strokeOpacity="0.5" />
              {janelas(x, 780 - h, w, h, c)}
              {h > 520 && <path d={`M${x + w / 2} ${780 - h}v-44`} stroke={c} strokeWidth="3" />}
            </g>
          ))}
        </g>
        <Helicoptero x={1210} y={110} e={1.05} />
        <Helicoptero x={260} y={230} e={0.68} />
        <path d="M0 780h1600v120H0Z" fill="#10061f" />
        <path d="M0 782h1600" stroke="#ff2d9b" strokeWidth="3" />
        {Array.from({ length: 16 }).map((_, i) => <rect key={i} x={i * 104 + 12} y="842" width="58" height="5" fill="#ffd166" opacity="0.7" />)}
        <Palmeira x={70} y={800} e={1.65} />
        <Palmeira x={1530} y={800} e={1.75} flip />
        <Palmeira x={1400} y={790} e={1.05} />
        <Carro x={-22} y={796} cor="#e8263f" e={1.08} />
        <Carro x={1608} y={792} cor="#7a2ff0" e={1.18} flip />
      </svg>
    </div>
  );
}
