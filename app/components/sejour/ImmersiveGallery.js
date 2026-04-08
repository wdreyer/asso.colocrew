"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

const TILE_LAYOUT = [
  { col: "1 / 3", row: "1 / 2" },
  { col: "3 / 4", row: "1 / 3" },
  { col: "4 / 5", row: "1 / 2" },
  { col: "1 / 2", row: "2 / 3" },
  { col: "2 / 3", row: "2 / 3" },
  { col: "4 / 5", row: "2 / 3" },
  { col: "1 / 2", row: "3 / 5" },
  { col: "2 / 4", row: "3 / 4" },
  { col: "4 / 5", row: "3 / 4" },
  { col: "2 / 3", row: "4 / 5" },
  { col: "3 / 5", row: "4 / 5" },
  { col: "2 / 3", row: "5 / 6" },
  { col: "3 / 4", row: "5 / 6" },
  { col: "4 / 5", row: "5 / 6" },
  { col: "1 / 2", row: "5 / 6" },
];

const CSS = `
  .gal-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 210px;
    gap: 6px;
  }

  .gal-tile {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    cursor: zoom-in;
    transition:
      transform   0.32s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow  0.32s ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.14);
    will-change: transform;
  }

  .gal-tile:hover {
    transform: translateY(-6px) scale(1.02);
    box-shadow: 0 16px 40px rgba(0,0,0,0.26);
    z-index: 5;
  }

  .gal-tile img {
    transition: transform 0.45s ease;
    will-change: transform;
  }
  .gal-tile:hover img {
    transform: scale(1.08);
  }

  .gal-tile::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(
      135deg,
      rgba(255,255,255,0.18) 0%,
      rgba(255,255,255,0)    60%
    );
    opacity: 0;
    transition: opacity 0.32s ease;
    pointer-events: none;
  }
  .gal-tile:hover::after { opacity: 1; }

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

export default function ImmersiveGallery({ images = [] }) {
  const galleryPhotos = useMemo(() => {
    const seen = new Set();
    const normalized = images
      .map((src) => String(src || "").trim())
      .filter((src) => {
        if (!src) return false;
        if (!src.startsWith("/") && !src.startsWith("http")) return false;
        if (seen.has(src)) return false;
        seen.add(src);
        return true;
      });

    return normalized.slice(0, TILE_LAYOUT.length).map((src, index) => ({
      src,
      ...TILE_LAYOUT[index],
    }));
  }, [images]);

  const [lbIndex, setLbIndex] = useState(null);
  const total = galleryPhotos.length;

  useEffect(() => {
    if (lbIndex === null) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setLbIndex(null);
      if (event.key === "ArrowRight") setLbIndex((index) => (index + 1) % total);
      if (event.key === "ArrowLeft") setLbIndex((index) => (index - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lbIndex, total]);

  if (total === 0) return null;

  return (
    <>
      <style>{CSS}</style>

      <section style={{ maxWidth: 1480, margin: "0 auto", padding: "8px 32px 0" }}>
        <h2
          style={{
            fontFamily: '"Baloo 2", cursive',
            fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)",
            fontWeight: 800,
            color: "#24173d",
            margin: "0 0 20px",
          }}
        >
          En images
        </h2>

        <div className="gal-grid">
          {galleryPhotos.map(({ src, col, row }, index) => (
            <div
              key={`${src}-${index}`}
              className="gal-tile"
              style={{ gridColumn: col, gridRow: row }}
              onClick={() => setLbIndex(index)}
            >
              <Image
                src={src}
                alt={`Photo ${index + 1}`}
                fill
                style={{ objectFit: "cover" }}
                sizes="(max-width: 768px) 50vw, 25vw"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </section>

      {lbIndex !== null ? (
        <div className="lb-backdrop" onClick={() => setLbIndex(null)}>
          <button
            className="lb-btn"
            style={{ top: 18, right: 22, width: 44, height: 44, fontSize: "1.5rem" }}
            onClick={(event) => {
              event.stopPropagation();
              setLbIndex(null);
            }}
          >
            ×
          </button>

          <button
            className="lb-btn"
            style={{
              top: "50%",
              left: 16,
              transform: "translateY(-50%)",
              width: 46,
              height: 46,
              fontSize: "1.8rem",
            }}
            onClick={(event) => {
              event.stopPropagation();
              setLbIndex((index) => (index - 1 + total) % total);
            }}
          >
            ‹
          </button>

          <div
            className="lb-inner"
            style={{ width: "min(90vw,900px)", height: "min(88vh,680px)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              key={galleryPhotos[lbIndex].src}
              src={galleryPhotos[lbIndex].src}
              alt={`Photo ${lbIndex + 1}`}
              fill
              style={{ objectFit: "contain" }}
              sizes="(max-width:900px) 90vw, 900px"
              priority
            />
          </div>

          <button
            className="lb-btn"
            style={{
              top: "50%",
              right: 16,
              transform: "translateY(-50%)",
              width: 46,
              height: 46,
              fontSize: "1.8rem",
            }}
            onClick={(event) => {
              event.stopPropagation();
              setLbIndex((index) => (index + 1) % total);
            }}
          >
            ›
          </button>

          <div
            style={{
              position: "fixed",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(255,255,255,0.6)",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {lbIndex + 1} / {total}
          </div>
        </div>
      ) : null}
    </>
  );
}
