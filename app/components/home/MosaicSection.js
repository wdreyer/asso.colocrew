"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const MOSAIC_PHOTOS = [
  { src: "/selection/mosaique/mosaique-1.jpeg", alt: "ColoCrew — session surf" },
  { src: "/selection/mosaique/mosaique-2.jpeg", alt: "ColoCrew — projet artistique" },
  { src: "/selection/mosaique/mosaique-3.jpeg", alt: "ColoCrew — vie collective" },
  { src: "/selection/mosaique/mosaique-4.jpeg", alt: "ColoCrew — paysage côtier" },
  { src: "/selection/mosaique/mosaique-5.jpeg", alt: "ColoCrew — groupe ados" },
];

const CSS = `
  .mosaic-tile {
    position: relative;
    overflow: hidden;
    cursor: zoom-in;
    transition: transform 0.32s cubic-bezier(0.22,1,0.36,1), box-shadow 0.32s ease;
    will-change: transform;
  }
  .mosaic-tile:hover {
    transform: scale(1.03);
    z-index: 5;
    box-shadow: 0 12px 36px rgba(0,0,0,0.28);
  }
  .mosaic-tile img {
    transition: transform 0.45s ease;
    will-change: transform;
  }
  .mosaic-tile:hover img { transform: scale(1.08); }

  .lb-backdrop {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(10,6,24,0.92);
    backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center;
    animation: lbIn 0.18s ease;
  }
  @keyframes lbIn { from { opacity:0 } to { opacity:1 } }
  .lb-inner {
    position: relative; border-radius: 12px; overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
    animation: lbPop 0.22s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes lbPop {
    from { transform: scale(0.88); opacity:0 }
    to   { transform: scale(1);    opacity:1 }
  }
  .lb-btn {
    position: fixed; z-index: 10000;
    background: rgba(255,255,255,0.14); border: 1.5px solid rgba(255,255,255,0.24);
    color:#fff; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; backdrop-filter:blur(6px);
    transition:background 0.15s; line-height:1;
  }
  .lb-btn:hover { background: rgba(255,255,255,0.28); }
`;

export default function MosaicSection() {
  const [lbIndex, setLbIndex] = useState(null);
  const total = MOSAIC_PHOTOS.length;

  useEffect(() => {
    if (lbIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape")      setLbIndex(null);
      if (e.key === "ArrowRight")  setLbIndex((i) => (i + 1) % total);
      if (e.key === "ArrowLeft")   setLbIndex((i) => (i - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lbIndex, total]);

  const [first, ...rest] = MOSAIC_PHOTOS;

  return (
    <>
      <style>{CSS}</style>

      <h2 style={{
        fontFamily: '"Baloo 2", cursive',
        fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)",
        fontWeight: 800,
        color: "#24173d",
        margin: "0 0 16px",
      }}>
        En photos
      </h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr",
        gridTemplateRows: "240px 180px",
        gap: "4px",
      }}>
        {/* Grande photo — span 2 rows */}
        <div
          className="mosaic-tile"
          style={{ gridRow: "span 2" }}
          onClick={() => setLbIndex(0)}
        >
          <Image
            src={first.src}
            alt={first.alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        {rest.map((photo, i) => (
          <div
            key={i}
            className="mosaic-tile"
            onClick={() => setLbIndex(i + 1)}
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lbIndex !== null && (
        <div className="lb-backdrop" onClick={() => setLbIndex(null)}>
          <button
            className="lb-btn"
            style={{ top: 18, right: 22, width: 44, height: 44, fontSize: "1.5rem" }}
            onClick={(e) => { e.stopPropagation(); setLbIndex(null); }}
          >
            ×
          </button>

          <button
            className="lb-btn"
            style={{ top: "50%", left: 16, transform: "translateY(-50%)", width: 46, height: 46, fontSize: "1.8rem" }}
            onClick={(e) => { e.stopPropagation(); setLbIndex((i) => (i - 1 + total) % total); }}
          >
            ‹
          </button>

          <div
            className="lb-inner"
            style={{ width: "min(90vw, 900px)", height: "min(88vh, 680px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              key={MOSAIC_PHOTOS[lbIndex].src}
              src={MOSAIC_PHOTOS[lbIndex].src}
              alt={MOSAIC_PHOTOS[lbIndex].alt}
              fill
              style={{ objectFit: "contain" }}
              sizes="(max-width: 900px) 90vw, 900px"
              priority
            />
          </div>

          <button
            className="lb-btn"
            style={{ top: "50%", right: 16, transform: "translateY(-50%)", width: 46, height: 46, fontSize: "1.8rem" }}
            onClick={(e) => { e.stopPropagation(); setLbIndex((i) => (i + 1) % total); }}
          >
            ›
          </button>

          <div style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", fontWeight: 600,
          }}>
            {lbIndex + 1} / {total}
          </div>
        </div>
      )}
    </>
  );
}
