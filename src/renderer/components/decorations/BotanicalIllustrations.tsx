import React from 'react';

/**
 * Botanical Vines with Pomegranates & Oranges
 * Features organic roots, creeping branches, olive leaves, pomegranates (رمّان),
 * oranges (برتقال), and delicate floral buds in Arabic Scholar Parchment colors.
 */
export function BotanicalVineLeft() {
  return (
    <div className="absolute left-0 top-0 bottom-0 w-48 sm:w-56 lg:w-64 pointer-events-none z-10 opacity-90 dark:opacity-70 select-none transition-opacity duration-700">
      <svg
        className="w-full h-full text-evergreen-600 dark:text-evergreen-400"
        viewBox="0 0 240 850"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMinYMin meet"
      >
        {/* Main Growing Stem / Root */}
        <path
          d="M -10,0 C 45,130 80,260 35,400 C -15,540 90,680 20,850"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="opacity-70"
        />

        {/* Secondary Branch 1 (Top Left - Orange Branch) */}
        <path
          d="M 45,160 Q 100,135 140,175 T 170,225"
          stroke="#7d6e57"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Secondary Branch 2 (Middle - Pomegranate Branch) */}
        <path
          d="M 32,390 Q 95,410 130,465 T 160,520"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Secondary Branch 3 (Bottom - Orange Branch) */}
        <path
          d="M 40,620 Q 110,640 150,700"
          stroke="#7d6e57"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* --- LEAVES --- */}
        {/* Top Branch Leaves */}
        <g fill="#78ba92" opacity="0.85">
          <path d="M 45,160 C 70,130 98,135 90,158 C 78,172 52,166 45,160 Z" />
          <path d="M 85,150 C 115,120 142,130 132,152 C 115,168 95,156 85,150 Z" />
          <path d="M 140,175 C 168,155 188,178 175,195 C 158,206 142,188 140,175 Z" />
        </g>

        {/* Middle Branch Leaves */}
        <g fill="#45875f" opacity="0.8">
          <path d="M 38,280 C 75,260 98,285 80,308 C 58,318 42,296 38,280 Z" />
          <path d="M 55,420 C 88,398 120,420 102,448 C 80,458 60,436 55,420 Z" />
          <path d="M 130,465 C 162,442 180,475 158,492 C 136,502 124,480 130,465 Z" />
        </g>

        {/* Bottom Branch Leaves */}
        <g fill="#78ba92" opacity="0.85">
          <path d="M 28,540 C 65,510 92,532 75,558 C 52,568 36,550 28,540 Z" />
          <path d="M 72,630 C 105,608 132,630 115,658 C 92,668 76,646 72,630 Z" />
        </g>

        {/* --- ORANGES (برتقال) --- */}
        {/* Top Orange 1 */}
        <g transform="translate(170, 225)">
          <circle cx="0" cy="0" r="16" fill="#D9824B" />
          <circle cx="-4" cy="-4" r="14" fill="#E6935C" />
          {/* Stem & Leaf on Orange */}
          <path d="M 0,-16 Q -5,-24 4,-26 Q 10,-24 0,-16 Z" fill="#45875f" />
          {/* Citrus Texture Dots */}
          <circle cx="-3" cy="2" r="1" fill="#B86530" opacity="0.6" />
          <circle cx="4" cy="-2" r="1" fill="#B86530" opacity="0.6" />
          <circle cx="2" cy="6" r="1" fill="#B86530" opacity="0.6" />
        </g>

        {/* Bottom Orange 2 */}
        <g transform="translate(150, 700)">
          <circle cx="0" cy="0" r="15" fill="#D9824B" />
          <circle cx="-3" cy="-3" r="13" fill="#E6935C" />
          <path d="M 0,-15 Q 6,-22 12,-20 Q 10,-14 0,-15 Z" fill="#78ba92" />
          <circle cx="1" cy="1" r="1" fill="#B86530" opacity="0.6" />
          <circle cx="-4" cy="4" r="1" fill="#B86530" opacity="0.6" />
        </g>

        {/* --- POMEGRANATES (رمّان) --- */}
        {/* Middle Pomegranate (with Crown Calyx & Seeds) */}
        <g transform="translate(160, 520)">
          {/* Body */}
          <circle cx="0" cy="0" r="18" fill="#9E4738" />
          <circle cx="-4" cy="-4" r="15" fill="#B55646" />
          
          {/* Pomegranate Crown Calyx */}
          <path
            d="M 12,-12 L 18,-22 L 10,-18 L 4,-24 L 2,-16 Z"
            fill="#7d6e57"
          />

          {/* Sliced Pomegranate Seeds Accent */}
          <circle cx="2" cy="4" r="2.5" fill="#EAE4D9" opacity="0.9" />
          <circle cx="6" cy="1" r="2" fill="#EAE4D9" opacity="0.9" />
          <circle cx="-2" cy="7" r="2" fill="#EAE4D9" opacity="0.9" />
          <circle cx="5" cy="7" r="1.8" fill="#7A2B20" />
          <circle cx="-1" cy="2" r="1.8" fill="#7A2B20" />
        </g>

        {/* Small Pomegranate Bud */}
        <g transform="translate(110, 465)">
          <circle cx="0" cy="0" r="8" fill="#9E4738" />
          <path d="M 4,-6 L 8,-12 L 3,-9 Z" fill="#7d6e57" />
        </g>

        {/* Delicate Tendril Curls */}
        <path
          d="M 90,158 Q 125,130 112,102 Q 100,75 122,62"
          stroke="#7d6e57"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 80,308 Q 115,300 128,325 Q 140,350 162,338"
          stroke="#45875f"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 115,658 Q 148,640 160,662"
          stroke="#7d6e57"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function BotanicalVineRight() {
  return (
    <div className="absolute right-0 top-0 bottom-0 w-48 sm:w-56 lg:w-64 pointer-events-none z-10 opacity-90 dark:opacity-70 select-none transition-opacity duration-700">
      <svg
        className="w-full h-full text-parchment-700 dark:text-parchment-500"
        viewBox="0 0 240 850"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMaxYMin meet"
      >
        {/* Main Growing Stem / Root */}
        <path
          d="M 250,0 C 190,120 150,260 195,400 C 240,540 145,680 215,850"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="opacity-70"
        />

        {/* Secondary Branch 1 (Pomegranate Branch Top) */}
        <path
          d="M 190,150 Q 130,130 90,170 T 55,220"
          stroke="#45875f"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Secondary Branch 2 (Orange Branch Middle) */}
        <path
          d="M 198,380 Q 135,400 100,455 T 70,510"
          stroke="#7d6e57"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Secondary Branch 3 (Pomegranate Branch Bottom) */}
        <path
          d="M 190,600 Q 120,620 80,680"
          stroke="#45875f"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* --- LEAVES --- */}
        {/* Top Branch Leaves */}
        <g fill="#7d6e57" opacity="0.8">
          <path d="M 190,150 C 162,118 135,122 142,146 C 152,162 178,156 190,150 Z" />
          <path d="M 145,138 C 112,108 85,118 95,140 C 112,156 135,144 145,138 Z" />
          <path d="M 90,170 C 62,148 42,170 55,188 C 72,198 90,180 90,170 Z" />
        </g>

        {/* Middle Branch Leaves */}
        <g fill="#78ba92" opacity="0.85">
          <path d="M 192,270 C 155,248 132,274 150,296 C 172,306 188,284 192,270 Z" />
          <path d="M 175,410 C 142,388 110,410 128,438 C 150,448 170,426 175,410 Z" />
          <path d="M 100,455 C 68,432 50,465 72,482 C 94,492 106,470 100,455 Z" />
        </g>

        {/* Bottom Branch Leaves */}
        <g fill="#45875f" opacity="0.8">
          <path d="M 205,520 C 168,490 140,512 158,538 C 180,548 198,530 205,520 Z" />
          <path d="M 155,610 C 122,588 95,610 112,638 C 135,648 152,626 155,610 Z" />
        </g>

        {/* --- POMEGRANATE 1 (Top Right) --- */}
        <g transform="translate(55, 220)">
          <circle cx="0" cy="0" r="17" fill="#9E4738" />
          <circle cx="-3" cy="-3" r="14" fill="#B55646" />
          {/* Calyx Crown */}
          <path d="M -10,-10 L -16,-20 L -8,-16 L -2,-22 L -1,-14 Z" fill="#45875f" />
          {/* Seed detail */}
          <circle cx="-2" cy="3" r="2" fill="#EAE4D9" opacity="0.9" />
          <circle cx="3" cy="5" r="2" fill="#EAE4D9" opacity="0.9" />
          <circle cx="-1" cy="4" r="1.5" fill="#7A2B20" />
        </g>

        {/* --- ORANGE (Middle Right) --- */}
        <g transform="translate(70, 510)">
          <circle cx="0" cy="0" r="16" fill="#D9824B" />
          <circle cx="-4" cy="-4" r="13.5" fill="#E6935C" />
          <path d="M 0,-16 Q 6,-24 -3,-26 Q -9,-24 0,-16 Z" fill="#7d6e57" />
          <circle cx="-2" cy="3" r="1" fill="#B86530" opacity="0.6" />
          <circle cx="3" cy="-1" r="1" fill="#B86530" opacity="0.6" />
        </g>

        {/* --- POMEGRANATE 2 (Bottom Right) --- */}
        <g transform="translate(80, 680)">
          <circle cx="0" cy="0" r="16" fill="#9E4738" />
          <circle cx="-3" cy="-3" r="13" fill="#B55646" />
          <path d="M -10,-10 L -16,-18 L -8,-14 Z" fill="#7d6e57" />
        </g>

        {/* Delicate Tendril Curls */}
        <path
          d="M 142,146 Q 108,120 120,95 Q 130,70 108,58"
          stroke="#45875f"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 150,296 Q 115,290 102,312 Q 90,335 68,322"
          stroke="#7d6e57"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 112,638 Q 78,620 68,642"
          stroke="#45875f"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Small Header Floral & Fruit Badge Accent
 */
export function HeaderBotanicalAccent() {
  return (
    <svg
      className="w-10 h-5 text-parchment-700 dark:text-parchment-500 inline-block opacity-85"
      viewBox="0 0 110 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M 10,20 Q 55,5 100,20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Leaves */}
      <path d="M 25,16 C 30,8 40,10 38,18 Z" fill="#45875f" />
      <path d="M 80,16 C 85,8 95,10 93,18 Z" fill="#78ba92" />
      
      {/* Mini Orange */}
      <circle cx="55" cy="12" r="5" fill="#D9824B" />
      
      {/* Mini Pomegranate */}
      <circle cx="35" cy="14" r="4" fill="#9E4738" />
      <path d="M 33,9 L 35,7 L 37,9 Z" fill="#7d6e57" />

      <circle cx="100" cy="20" r="3" fill="#7d6e57" />
      <circle cx="10" cy="20" r="3" fill="#45875f" />
    </svg>
  );
}
