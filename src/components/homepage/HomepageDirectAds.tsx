"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type HomepageDirectAd = {
  id: string;
  brandName: string;
  phone: string;
  email: string;
  writeup: string;
  link?: string;
  mediaType: "image" | "video";
  mediaUrl: string;
};

type HomepageDirectAdsProps = {
  variant?: "homepage" | "compact";
};

const DIRECT_ADS_CACHE_KEY = "pamba-homepage-direct-ads-cache-v1";
const DIRECT_ADS_CACHE_TTL_MS = 10 * 60 * 1000;

export default function HomepageDirectAds({ variant = "homepage" }: HomepageDirectAdsProps) {
  const [ads, setAds] = useState<HomepageDirectAd[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cached = window.sessionStorage.getItem(DIRECT_ADS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { savedAt?: number; ads?: HomepageDirectAd[] };
          if (parsed.savedAt && Date.now() - parsed.savedAt < DIRECT_ADS_CACHE_TTL_MS && Array.isArray(parsed.ads)) {
            setAds(parsed.ads);
            return;
          }
        }

        const response = await fetch("/api/homepage-direct-ads", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) return;
        const nextAds = result.ads || [];
        setAds(nextAds);
        window.sessionStorage.setItem(DIRECT_ADS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ads: nextAds }));
      } catch (error) {
        console.error("Failed to load homepage direct ads", error);
      }
    };

    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!railRef.current) return;
      if (!railRef.current.contains(event.target as Node)) {
        setActiveId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [activeId]);

  const repeatedAds = useMemo(() => [...ads, ...ads], [ads]);

  if (ads.length === 0) return null;

  return (
    <section className={`homepage-direct-ads-shell ${variant === "compact" ? "homepage-direct-ads-shell--compact" : ""}`}>
      <style>{`
        .homepage-direct-ads-shell {
          background: linear-gradient(180deg, #1c1917 0%, #292524 100%);
          padding: 42px 0 26px;
          overflow: hidden;
        }
        .homepage-direct-ads-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .homepage-direct-ads-heading {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 22px;
        }
        .homepage-direct-ads-kicker {
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #fbbf24;
        }
        .homepage-direct-ads-title {
          color: #fff;
          font-family: "Sora", sans-serif;
          font-size: clamp(1.5rem, 2vw, 2.2rem);
          font-weight: 700;
          letter-spacing: -0.03em;
        }
        .homepage-direct-ads-sub {
          color: rgba(255,255,255,0.7);
          max-width: 740px;
          font-size: 0.96rem;
        }
        .homepage-direct-ads-track {
          display: flex;
          gap: 18px;
          width: max-content;
          animation: homepageDirectAdsSlide 24s linear infinite;
          will-change: transform;
        }
        .homepage-direct-ads-track.paused {
          animation-play-state: paused;
        }
        @keyframes homepageDirectAdsSlide {
          0% { transform: translateX(-8%); }
          100% { transform: translateX(-52%); }
        }
        .homepage-direct-ads-card {
          width: min(68vw, 320px);
          border: 1px solid rgba(255,255,255,0.08);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)),
            rgba(28,25,23,0.85);
          box-shadow: 0 30px 70px -40px rgba(0,0,0,0.55);
          border-radius: 26px;
          overflow: hidden;
          color: #fff;
          cursor: pointer;
          transition: transform 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease;
          flex: 0 0 auto;
        }
        .homepage-direct-ads-card:hover {
          transform: translateY(-4px);
          border-color: rgba(251,191,36,0.45);
        }
        .homepage-direct-ads-card.active {
          transform: scale(1.04) translateY(-6px);
          border-color: rgba(251,191,36,0.85);
          box-shadow: 0 40px 85px -40px rgba(245,158,11,0.48);
        }
        .homepage-direct-ads-media {
          position: relative;
          aspect-ratio: 16 / 9;
          background: #0c0a09;
        }
        .homepage-direct-ads-media img,
        .homepage-direct-ads-media video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .homepage-direct-ads-content {
          padding: 18px 18px 20px;
        }
        .homepage-direct-ads-brand {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .homepage-direct-ads-brand strong {
          font-family: "Sora", sans-serif;
          font-size: 1.02rem;
          color: #fff;
        }
        .homepage-direct-ads-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #fbbf24;
          background: rgba(245,158,11,0.16);
          border: 1px solid rgba(245,158,11,0.26);
        }
        .homepage-direct-ads-writeup {
          color: rgba(255,255,255,0.76);
          font-size: 0.92rem;
          line-height: 1.6;
          margin-bottom: 14px;
        }
        .homepage-direct-ads-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          color: rgba(255,255,255,0.85);
          font-size: 0.86rem;
        }
        .homepage-direct-ads-link {
          color: #fbbf24;
          text-decoration: none;
          word-break: break-word;
        }
        .homepage-direct-ads-link:hover {
          color: #fde68a;
        }
        @media (max-width: 768px) {
          .homepage-direct-ads-shell {
            padding-top: 34px;
          }
          .homepage-direct-ads-card {
            width: min(82vw, 280px);
          }
        }
        .homepage-direct-ads-shell--compact {
          border-radius: 28px;
          padding: 24px 0 18px;
          box-shadow: 0 28px 70px -42px rgba(28,25,23,0.65);
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-inner {
          padding: 0 18px;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-heading {
          margin-bottom: 16px;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-kicker {
          font-size: 0.66rem;
          letter-spacing: 0.22em;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-title {
          font-size: clamp(1.1rem, 1.5vw, 1.45rem);
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-sub {
          font-size: 0.82rem;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-card {
          width: min(58vw, 240px);
          border-radius: 20px;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-content {
          padding: 14px;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-writeup {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-size: 0.82rem;
        }
        .homepage-direct-ads-shell--compact .homepage-direct-ads-meta {
          font-size: 0.78rem;
        }
      `}</style>

      <div className="homepage-direct-ads-inner">
        <div className="homepage-direct-ads-heading">
          <span className="homepage-direct-ads-kicker">Featured Direct Adverts</span>
          <h2 className="homepage-direct-ads-title">Sponsored brands currently running on Pamba</h2>
          <p className="homepage-direct-ads-sub">
            Tap any card to pause the rail and look closer. The strip resumes once you continue exploring the page.
          </p>
        </div>

        <div ref={railRef}>
          <div className={`homepage-direct-ads-track ${activeId ? "paused" : ""}`}>
            {repeatedAds.map((ad, index) => {
              const isActive = activeId === ad.id;
              return (
                <article
                  key={`${ad.id}-${index}`}
                  className={`homepage-direct-ads-card ${isActive ? "active" : ""}`}
                  onClick={() => setActiveId(ad.id)}
                >
                  <div className="homepage-direct-ads-media">
                    {ad.mediaType === "video" ? (
                      <video
                        src={ad.mediaUrl}
                        muted
                        loop
                        autoPlay
                        playsInline
                        controls={isActive}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ad.mediaUrl} alt={ad.brandName} />
                    )}
                  </div>

                  <div className="homepage-direct-ads-content">
                    <div className="homepage-direct-ads-brand">
                      <strong>{ad.brandName}</strong>
                      <span className="homepage-direct-ads-badge">
                        {ad.mediaType === "video" ? "Video" : "Image"}
                      </span>
                    </div>
                    <p className="homepage-direct-ads-writeup">{ad.writeup}</p>
                    <div className="homepage-direct-ads-meta">
                      <span>{ad.phone}</span>
                      {ad.link ? (
                        <a
                          href={ad.link}
                          target="_blank"
                          rel="noreferrer"
                          className="homepage-direct-ads-link"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Visit link
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
