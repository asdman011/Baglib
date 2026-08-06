import React from 'react';

/**
 * Minimalist Continuous One-Line Art & Abstract Motifs
 * Drawn in Deep Ink / Earthy Clay
 */

export function OneLineBotanicalFace({ className = "w-24 h-24 text-main/30" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Continuous One-Line Profile Face & Leaf Motif */}
      <path
        d="M 40,160 
           C 40,120 55,90 70,80 
           C 80,73 90,70 100,75 
           C 112,81 108,105 100,110 
           C 92,115 82,105 85,95 
           C 90,80 110,60 130,50 
           C 145,42 165,45 170,60 
           C 176,78 150,110 130,135 
           C 115,154 90,175 60,180 
           C 50,182 42,175 40,160 Z
           M 100,75
           C 95,50 115,30 135,25
           C 155,20 175,35 165,60"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="120" cy="85" r="3" fill="currentColor" />
    </svg>
  );
}

export function OneLineSoundWave({ className = "w-32 h-12 text-muted/30" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Continuous One-Line Sound Loop */}
      <path
        d="M 10,30 
           Q 25,30 35,15 
           T 55,45 
           T 75,5 
           T 95,55 
           T 115,20 
           T 135,40 
           T 155,10 
           T 175,50 
           T 195,25 
           T 215,35 
           Q 225,30 235,30"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AbstractBotanicalFlourish({ className = "w-20 h-20 text-evergreen-600/35" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* One-Line Abstract Stem Loop */}
      <path
        d="M 20,80 
           C 20,40 40,20 60,20 
           C 80,20 90,40 75,65 
           C 60,90 30,70 45,45 
           C 55,28 75,30 85,45"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
