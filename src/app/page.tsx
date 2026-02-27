"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, Target, UserCheck, Wallet, Users, TrendingUp,
  CheckCircle, Megaphone, Clipboard, SlidersHorizontal, ChevronDown,
  Zap, Shield, Play, Menu, X
} from "lucide-react";
import BillsCard from "@/components/bills/BillsCard";

// ─── Social Media SVG Icons ───────────────────────────────────────────────────
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

// ─── Animation hook ───────────────────────────────────────────────────────────
function useInView<T extends HTMLElement = HTMLDivElement>(threshold: number = 0.15): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref as React.RefObject<T>, visible];
}

// ─── Typewriter ───────────────────────────────────────────────────────────────
function TypedText({ strings }: { strings: string[] }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const full = strings[idx];
    const speed = deleting ? 40 : 80;
    const timeout = setTimeout(() => {
      if (!deleting) {
        if (text.length < full.length) setText(full.slice(0, text.length + 1));
        else setTimeout(() => setDeleting(true), 1800);
      } else {
        if (text.length > 0) setText(text.slice(0, -1));
        else { setDeleting(false); setIdx((idx + 1) % strings.length); }
      }
    }, speed);
    return () => clearTimeout(timeout);
  }, [text, deleting, idx, strings]);
  return (
    <span className="typed-text">
      {text}<span className="cursor">|</span>
    </span>
  );
}

// ─── Stat Counter ─────────────────────────────────────────────────────────────
function CountUp({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const [ref, visible] = useInView();
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = end / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 20);
    return () => clearInterval(timer);
  }, [visible, end]);
  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PAMBALanding() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const [heroRef, heroVisible] = useInView(0.1);
  const [aboutRef, aboutVisible] = useInView();
  const [featuresRef, featuresVisible] = useInView();
  const [howRef, howVisible] = useInView();
  const [ctaRef, ctaVisible] = useInView();

  const navLinks = [
    { label: "About", href: "#about" },
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#howitworks" },
    { label: "Bills", href: "#bills" },
    { label: "FAQ", href: "/faq" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --amber: #F59E0B;
          --amber-light: #FCD34D;
          --amber-dark: #D97706;
          --stone-900: #1C1917;
          --stone-800: #292524;
          --stone-700: #44403C;
          --stone-600: #57534E;
          --stone-400: #A8A29E;
          --stone-200: #E7E5E4;
          --stone-100: #F5F5F4;
          --stone-50: #FAFAF9;
          --white: #FFFFFF;
          --red: #EF4444;
          --green: #10B981;
        }

        html { scroll-behavior: smooth; }

        body {
          font-family: 'DM Sans', sans-serif;
          color: var(--stone-800);
          background: var(--white);
          line-height: 1.6;
          overflow-x: hidden;
        }

        h1,h2,h3,h4,h5 { font-family: 'Sora', sans-serif; line-height: 1.15; }

        /* ── Navbar ── */
        .navbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          transition: all 0.3s ease;
          padding: 20px 0;
        }
        .navbar.scrolled {
          background: rgba(28,25,23,0.95);
          backdrop-filter: blur(20px);
          padding: 12px 0;
          box-shadow: 0 1px 0 rgba(245,158,11,0.2);
        }
        .nav-inner {
          max-width: 1200px; margin: 0 auto; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .nav-logo {
          font-family: 'Sora', sans-serif;
          font-size: 1.5rem; font-weight: 800;
          color: var(--white); text-decoration: none;
          display: flex; align-items: center; gap: 8px;
          letter-spacing: -0.02em;
        }
        .nav-logo span { color: var(--amber); }
        .nav-links {
          display: flex; align-items: center; gap: 32px;
          list-style: none;
        }
        .nav-links a {
          color: rgba(255,255,255,0.75);
          text-decoration: none; font-size: 0.9rem; font-weight: 500;
          transition: color 0.2s;
        }
        .nav-links a:hover { color: var(--amber); }
        .nav-actions { display: flex; gap: 12px; }
        .btn-ghost {
          background: transparent; border: 1px solid rgba(255,255,255,0.25);
          color: var(--white); padding: 8px 20px; border-radius: 8px;
          font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 0.875rem;
          cursor: pointer; transition: all 0.2s; text-decoration: none;
          display: inline-flex; align-items: center;
        }
        .btn-ghost:hover { border-color: var(--amber); color: var(--amber); }
        .btn-primary {
          background: var(--amber); color: var(--stone-900);
          padding: 8px 20px; border-radius: 8px; border: none;
          font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.875rem;
          cursor: pointer; transition: all 0.2s; text-decoration: none;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-primary:hover { background: var(--amber-light); transform: translateY(-1px); }
        .btn-primary-lg {
          background: var(--amber); color: var(--stone-900);
          padding: 16px 36px; border-radius: 12px; border: none;
          font-family: 'Sora', sans-serif; font-weight: 700; font-size: 1rem;
          cursor: pointer; transition: all 0.25s; text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-primary-lg:hover { background: var(--amber-light); transform: translateY(-2px); box-shadow: 0 12px 32px rgba(245,158,11,0.35); }
        .btn-outline-lg {
          background: transparent; color: var(--white);
          padding: 15px 36px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.35);
          font-family: 'Sora', sans-serif; font-weight: 600; font-size: 1rem;
          cursor: pointer; transition: all 0.25s; text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-outline-lg:hover { border-color: var(--amber); color: var(--amber); background: rgba(245,158,11,0.06); }
        .hamburger {
          display: none; background: none; border: none;
          color: white; cursor: pointer; padding: 4px;
        }

        /* ── Hero ── */
        .hero {
          min-height: 100vh;
          background: var(--stone-900);
          position: relative;
          display: flex; align-items: center;
          overflow: hidden;
        }
        .hero-bg-orb1 {
          position: absolute; top: -100px; right: -100px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 70%);
          border-radius: 50%; pointer-events: none;
        }
        .hero-bg-orb2 {
          position: absolute; bottom: -80px; left: -80px;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%);
          border-radius: 50%; pointer-events: none;
        }
        /* ── Fade-in animations ── */
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
          opacity: 0.4; pointer-events: none;
        }
        .hero-grid-lines {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(245,158,11,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.04) 1px, transparent 1px);
          background-size: 80px 80px;
          pointer-events: none;
        }
        .hero-inner {
          position: relative; z-index: 2;
          max-width: 1200px; margin: 0 auto; padding: 120px 24px 80px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center;
        }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3);
          color: var(--amber); padding: 6px 16px; border-radius: 100px;
          font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
          margin-bottom: 24px;
        }
        .hero-badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--amber);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
        }
        .hero h1 {
          font-size: clamp(2.2rem, 4vw, 3.5rem);
          color: var(--white); font-weight: 800;
          letter-spacing: -0.03em; margin-bottom: 20px;
          line-height: 1.1;
        }
        .hero h1 .highlight { color: var(--amber); }
        .typed-text { color: var(--amber-light); }
        .cursor {
          display: inline-block;
          animation: blink 0.8s infinite;
          color: var(--amber);
          font-weight: 300;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .hero-sub {
          color: rgba(255,255,255); font-size: 1rem; line-height: 1.7;
          margin-bottom: 36px; max-width: 480px;
        }
        .hero-cta { display: flex; gap: 12px; flex-wrap: wrap; }
        .hero-stats {
          display: flex; gap: 32px; margin-top: 52px; flex-wrap: wrap;
        }
        .hero-stat {
          display: flex; flex-direction: column;
        }
        .hero-stat-val {
          font-family: 'Sora', sans-serif;
          font-size: 1.6rem; font-weight: 800;
          color: var(--white); letter-spacing: -0.03em;
        }
        .hero-stat-val span { color: var(--amber); }
        .hero-stat-label { font-size: 0.8rem; color: rgba(255,255,255,0.5); font-weight: 500; }
        .hero-divider { width: 1px; background: rgba(255,255,255,0.1); }

        /* Hero right card */
        .hero-card-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
        }
        .hero-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 24px;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }
        .hero-card:hover { background: rgba(245,158,11,0.06); border-color: rgba(245,158,11,0.2); transform: translateY(-2px); }
        .hero-card:first-child { grid-column: 1 / -1; }
        .hero-card-icon {
          width: 44px; height: 44px; border-radius: 10px;
          background: rgba(245,158,11,0.15); color: var(--amber);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 14px;
        }
        .hero-card h4 {
          font-family: 'Sora', sans-serif;
          font-size: 0.95rem; font-weight: 700;
          color: var(--white); margin-bottom: 6px;
        }
        .hero-card p { font-size: 0.82rem; color: rgba(255,255,255,0.5); line-height: 1.5; }

        /* ── Scroll indicator ── */
        .scroll-indicator {
          position: absolute; bottom: 32px; left: 50%;
          transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          color: rgba(255,255,255,0.3); font-size: 0.7rem; letter-spacing: 0.1em;
          text-transform: uppercase;
          animation: bounce 2s infinite;
        }
        @keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(6px)} }

        /* ── Hero image bg ── */
        .hero-image-bg {
          position: absolute; inset: 0;
        }
        .hero-image-bg img { object-fit: cover; }
        .hero-image-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to right, rgba(28,25,23,0.96) 0%, rgba(28,25,23,0.75) 60%, rgba(28,25,23,0.5) 100%);
          backdrop-filter: blur(2px);
        }
        .fade-up { opacity: 0; transform: translateY(32px); transition: all 0.7s cubic-bezier(0.16,1,0.3,1); }
        .fade-up.visible { opacity: 1; transform: translateY(0); }
        .fade-up-1 { transition-delay: 0.1s; }
        .fade-up-2 { transition-delay: 0.2s; }
        .fade-up-3 { transition-delay: 0.3s; }
        .fade-up-4 { transition-delay: 0.4s; }
        .fade-up-5 { transition-delay: 0.5s; }

        /* ── Safety Banner ── */
        .safety {
          background: linear-gradient(135deg, #FEF2F2 0%, #FFF7ED 100%);
          border-bottom: 1px solid #FECACA;
          padding: 20px 0;
        }
        .safety-inner {
          max-width: 1200px; margin: 0 auto; padding: 0 24px;
          display: flex; align-items: flex-start; gap: 16px;
        }
        .safety-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: #FEE2E2; color: var(--red);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .safety h3 { font-family: 'Sora', sans-serif; font-size: 0.9rem; font-weight: 700; color: #991B1B; margin-bottom: 8px; }
        .safety-list { display: flex; flex-wrap: wrap; gap: 8px 24px; }
        .safety-item { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--stone-700); }
        .dot-red { color: var(--red); font-weight: 700; }
        .dot-green { color: var(--green); font-weight: 700; }
        .dot-amber { color: var(--amber-dark); font-weight: 700; }

        /* ── Section shared ── */
        .section { padding: 96px 0; }
        .section-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        .section-label {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--amber-dark);
          margin-bottom: 12px;
        }
        .section-label::before {
          content: ''; display: inline-block;
          width: 24px; height: 2px; background: var(--amber);
        }
        .section-title {
          font-size: clamp(1.8rem, 3vw, 2.6rem); font-weight: 800;
          color: var(--stone-900); letter-spacing: -0.03em;
          margin-bottom: 16px;
        }
        .section-sub { font-size: 1rem; color: var(--stone-600); max-width: 520px; line-height: 1.7; }
        .section-header { margin-bottom: 64px; }
        .section-header.center { text-align: center; }
        .section-header.center .section-sub { margin: 0 auto; }
        .section-header.center .section-label { justify-content: center; }

        /* ── About ── */
        .about-bg { background: var(--stone-900); }
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
        .about-left .section-title { color: var(--white); }
        .about-left .section-sub { color: rgba(255,255,255,0.6); max-width: 460px; }
        .about-left .section-label { color: var(--amber); }
        .about-cards { display: grid; gap: 16px; margin-top: 32px; }
        .about-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 28px;
          position: relative; overflow: hidden;
        }
        .about-card::before {
          content: ''; position: absolute; top: 0; left: 0;
          width: 4px; height: 100%; background: var(--amber);
        }
        .about-card h4 {
          font-family: 'Sora', sans-serif;
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--amber);
          margin-bottom: 8px;
        }
        .about-card h3 {
          font-family: 'Sora', sans-serif;
          font-size: 1.1rem; font-weight: 700;
          color: var(--white); margin-bottom: 10px;
        }
        .about-card p { font-size: 0.88rem; color: rgba(255,255,255,0.55); line-height: 1.7; }
        .about-right { display: flex; flex-direction: column; gap: 16px; }
        .about-stat-card {
          background: var(--amber); border-radius: 20px;
          padding: 32px; text-align: center;
        }
        .about-stat-card .big-num {
          font-family: 'Sora', sans-serif;
          font-size: 3rem; font-weight: 800;
          color: var(--stone-900); line-height: 1;
          margin-bottom: 4px;
        }
        .about-stat-card .big-label { font-size: 0.85rem; font-weight: 600; color: rgba(28,25,23,0.65); }
        .about-stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .about-mini-stat {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; padding: 24px; text-align: center;
        }
        .about-mini-stat .num {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem; font-weight: 800;
          color: var(--white); margin-bottom: 4px;
        }
        .about-mini-stat .label { font-size: 0.78rem; color: rgba(255,255,255,0.45); }

        /* ── Features ── */
        .features-bg { background: var(--stone-50); }
        .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .feature-card {
          background: var(--white); border: 1px solid var(--stone-200);
          border-radius: 20px; padding: 36px 28px;
          transition: all 0.3s ease; position: relative; overflow: hidden;
        }
        .feature-card::after {
          content: ''; position: absolute;
          bottom: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--amber), var(--amber-light));
          transform: scaleX(0); transition: transform 0.3s ease;
          transform-origin: left;
        }
        .feature-card:hover { transform: translateY(-6px); box-shadow: 0 20px 48px rgba(0,0,0,0.08); border-color: transparent; }
        .feature-card:hover::after { transform: scaleX(1); }
        .feature-icon {
          width: 56px; height: 56px; border-radius: 14px;
          background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06));
          color: var(--amber-dark); display: flex; align-items: center; justify-content: center;
          margin-bottom: 24px;
        }
        .feature-card h3 {
          font-family: 'Sora', sans-serif;
          font-size: 1.1rem; font-weight: 700;
          color: var(--stone-900); margin-bottom: 12px;
        }
        .feature-card p { font-size: 0.88rem; color: var(--stone-600); line-height: 1.7; }

        /* ── How It Works ── */
        .hiw-bg {
          background: linear-gradient(160deg, var(--stone-900) 0%, #1a1614 100%);
          position: relative; overflow: hidden;
        }
        .hiw-bg::before {
          content: ''; position: absolute;
          top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .hiw-bg .section-title { color: var(--white); }
        .hiw-bg .section-label { color: var(--amber); }
        .hiw-bg .section-sub { color: rgba(255,255,255,0.5); }
        .hiw-tabs {
          display: flex; gap: 8px; margin-bottom: 56px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 6px; width: fit-content;
        }
        .hiw-tab {
          padding: 10px 28px; border-radius: 8px; border: none;
          font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.9rem;
          cursor: pointer; transition: all 0.2s;
          color: rgba(255,255,255,0.5); background: transparent;
        }
        .hiw-tab.active {
          background: var(--amber); color: var(--stone-900);
        }
        .hiw-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; position: relative; }
        .hiw-steps::before {
          content: ''; position: absolute;
          top: 28px; left: 10%; right: 10%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(245,158,11,0.3), transparent);
        }
        .hiw-step {
          display: flex; flex-direction: column; align-items: center;
          text-align: center; position: relative;
        }
        .hiw-step-num {
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(245,158,11,0.1); border: 1.5px solid rgba(245,158,11,0.3);
          color: var(--amber); font-family: 'Sora', sans-serif;
          font-size: 1rem; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 20px; position: relative; z-index: 1;
          transition: all 0.3s;
        }
        .hiw-step:hover .hiw-step-num {
          background: var(--amber); color: var(--stone-900);
          transform: scale(1.1);
        }
        .hiw-step h4 {
          font-family: 'Sora', sans-serif;
          font-size: 0.95rem; font-weight: 700;
          color: var(--white); margin-bottom: 10px;
        }
        .hiw-step p { font-size: 0.82rem; color: rgba(255,255,255,0.45); line-height: 1.6; }

        /* ── HIW image ── */
        .hiw-image-wrap { margin-top: 64px; }
        .hiw-image-inner {
          position: relative; height: 340px; border-radius: 20px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .hiw-image-inner img { object-fit: cover; }

        /* ── Bills ── */
        .bills-bg { background: var(--white); }
        .bills-wrapper {
          max-width: 800px; margin: 0 auto;
        }

        /* ── CTA ── */
        .cta-bg {
          background: linear-gradient(135deg, var(--amber-dark) 0%, var(--amber) 50%, var(--amber-light) 100%);
          position: relative; overflow: hidden;
        }
        .cta-bg::before {
          content: '';
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231C1917' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
        .cta-inner { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 96px 24px; text-align: center; }
        .cta-inner h2 {
          font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;
          color: var(--stone-900); letter-spacing: -0.03em;
          margin-bottom: 16px;
        }
        .cta-inner p { font-size: 1.05rem; color: rgba(28,25,23,0.7); max-width: 480px; margin: 0 auto 40px; }
        .cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .btn-dark {
          background: var(--stone-900); color: var(--white);
          padding: 15px 32px; border-radius: 12px; border: none;
          font-family: 'Sora', sans-serif; font-weight: 700; font-size: 0.95rem;
          cursor: pointer; transition: all 0.25s; text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-dark:hover { background: var(--stone-800); transform: translateY(-2px); box-shadow: 0 12px 32px rgba(28,25,23,0.25); }
        .btn-white {
          background: var(--white); color: var(--stone-900);
          padding: 14px 32px; border-radius: 12px; border: none;
          font-family: 'Sora', sans-serif; font-weight: 700; font-size: 0.95rem;
          cursor: pointer; transition: all 0.25s; text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px;
          box-shadow: 0 2px 8px rgba(28,25,23,0.1);
        }
        .btn-white:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(28,25,23,0.15); }

        /* ── Footer ── */
        .footer { background: var(--stone-900); padding: 64px 0 32px; }
        .footer-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
        .footer-logo {
          font-family: 'Sora', sans-serif;
          font-size: 1.4rem; font-weight: 800;
          color: var(--white); text-decoration: none; margin-bottom: 16px; display: block;
        }
        .footer-logo span { color: var(--amber); }
        .footer-tagline { font-size: 0.85rem; color: rgba(255,255,255,0.4); line-height: 1.6; margin-bottom: 24px; max-width: 260px; }
        .footer-social { display: flex; gap: 10px; flex-wrap: wrap; }
        .footer-social a {
          width: 36px; height: 36px; border-radius: 8px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6); display: flex; align-items: center; justify-content: center;
          text-decoration: none; font-size: 0.75rem; font-weight: 700;
          transition: all 0.2s;
        }
        .footer-social a:hover { background: var(--amber); border-color: var(--amber); color: var(--stone-900); }
        .footer-logo-img { display: inline-block; margin-bottom: 16px; }
        .footer-social a svg { display: block; }
          font-family: 'Sora', sans-serif;
          font-size: 0.8rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.35); margin-bottom: 20px;
        }
        .footer-col ul { list-style: none; display: flex; flex-direction: column; gap: 12px; }
        .footer-col a {
          font-size: 0.88rem; color: rgba(255,255,255,0.55);
          text-decoration: none; transition: color 0.2s;
        }
        .footer-col a:hover { color: var(--amber); }
        .footer-bottom {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 24px;
          display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
        }
        .footer-bottom p { font-size: 0.8rem; color: rgba(255,255,255,0.3); }
        .footer-badges { display: flex; gap: 12px; }
        .footer-badge {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 6px 12px;
          font-size: 0.72rem; font-weight: 600;
          color: rgba(255,255,255,0.35); letter-spacing: 0.05em;
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .hero-inner { grid-template-columns: 1fr; gap: 48px; }
          .about-grid { grid-template-columns: 1fr; gap: 48px; }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
          .hiw-steps { grid-template-columns: repeat(2, 1fr); }
          .hiw-steps::before { display: none; }
          .footer-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 768px) {
          .nav-links, .nav-actions { display: none; }
          .hamburger { display: block; }
          .features-grid { grid-template-columns: 1fr; }
          .bills-grid { grid-template-columns: repeat(2, 1fr); }
          .hiw-steps { grid-template-columns: 1fr; }
          .footer-grid { grid-template-columns: 1fr; gap: 32px; }
          .about-stat-row { grid-template-columns: 1fr; }
          .hero-card-grid { grid-template-columns: 1fr; }
          .hero-card:first-child { grid-column: auto; }
          .section { padding: 64px 0; }
          .hero-stats { gap: 20px; }
        }
        .mobile-menu {
          position: fixed; inset: 0; z-index: 200;
          background: var(--stone-900);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 32px;
        }
        .mobile-menu a, .mobile-menu button {
          font-family: 'Sora', sans-serif;
          font-size: 1.5rem; font-weight: 700;
          color: var(--white); text-decoration: none; background: none; border: none;
          cursor: pointer; transition: color 0.2s;
        }
        .mobile-menu a:hover { color: var(--amber); }
        .mobile-close {
          position: absolute; top: 24px; right: 24px;
          background: none; border: none; color: white; cursor: pointer;
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <Image src="/Pamba.png" alt="PAMBA" width={110} height={44} style={{objectFit:"contain"}} />
          </Link>
          <ul className="nav-links">
            {navLinks.map(l => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}
          </ul>
          <div className="nav-actions">
            <Link href="/auth/sign-in" className="btn-ghost">Login</Link>
            <Link href="/auth/sign-up" className="btn-primary">Get Started <ArrowRight size={14} /></Link>
          </div>
          <button className="hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={24} />
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="mobile-menu">
          <button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={28} /></button>
          {navLinks.map(l => <a key={l.label} href={l.href} onClick={() => setMobileOpen(false)}>{l.label}</a>)}
          <Link href="/auth/sign-in" onClick={() => setMobileOpen(false)}>Login</Link>
          <Link href="/auth/sign-up" onClick={() => setMobileOpen(false)} style={{color: "var(--amber)"}}>Get Started →</Link>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-image-bg">
          <Image src="/hero-bg.jpg" alt="Marketing task illustration" fill className="object-cover" priority />
          <div className="hero-image-overlay" />
        </div>
        <div className="hero-grain" />
        <div className="hero-grid-lines" />
        <div className="hero-inner" ref={heroRef}>
          <div className={`fade-up ${heroVisible ? "visible" : ""}`}>
            <div className="hero-badge">
              <div className="hero-badge-dot" />
              Nigeria&apos;s Trusted Advertising Platform
            </div>
            <h1>
              <TypedText strings={[
                "Earn Money Through Social Impact",
                "Get Paid for Engagements",
                "Monetize Your Social Reach",
                "Grow Your Brand & Earn",
              ]} />
            </h1>
            <p className="hero-sub">
              PAMBA connects businesses with real audiences. Advertisers gain genuine visibility - users earn by completing simple marketing tasks. Earnings go straight to your wallet, withdrawable to your bank or usable for bills.
            </p>
            <div className="hero-cta">
              <Link href="/auth/sign-up" className="btn-primary-lg">
                Start Earning/Create Task <ArrowRight size={18} />
              </Link>
              <Link href="/advertise-directly" className="btn-outline-lg">
                <Play size={16} /> Advertise on Homepage
              </Link>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-val"><CountUp end={10000} suffix="+" prefix="" /></span>
                <span className="hero-stat-label">Active Users</span>
              </div>
              <div className="hero-divider" />
              <div className="hero-stat">
                <span className="hero-stat-val">₦<CountUp end={10} suffix="M+" /></span>
                <span className="hero-stat-label">Paid Out</span>
              </div>
              <div className="hero-divider" />
              <div className="hero-stat">
                <span className="hero-stat-val"><CountUp end={500} suffix="+" /></span>
                <span className="hero-stat-label">Tasks Available</span>
              </div>
            </div>
          </div>

          <div className={`hero-card-grid fade-up fade-up-2 ${heroVisible ? "visible" : ""}`}>
            <div className="hero-card">
              <div className="hero-card-icon"><Zap size={20} /></div>
              <h4>Instant Wallet Credits</h4>
              <p>Approved task submissions are credited to your wallet immediately - no waiting periods.</p>
            </div>
            <div className="hero-card">
              <div className="hero-card-icon"><Shield size={20} /></div>
              <h4>CAC Registered</h4>
              <p>Fully incorporated with Nigeria&apos;s Corporate Affairs Commission.</p>
            </div>
            <div className="hero-card">
              <div className="hero-card-icon"><Users size={20} /></div>
              <h4>Referral Bonuses</h4>
              <p>Earn when your referrals activate their accounts.</p>
            </div>
          </div>
        </div>
        <div className="scroll-indicator">
          <span>Scroll</span>
          <ChevronDown size={16} />
        </div>
      </section>

      {/* ── SAFETY NOTICE ── */}
      <div className="safety">
        <div className="safety-inner">
          <div className="safety-icon">
            <Shield size={20} />
          </div>
          <div>
            <h3>⚠️ Important Safety Notice</h3>
            <div className="safety-list">
              <div className="safety-item"><span className="dot-red">✕</span> Never send money to personal bank accounts claiming to represent PAMBA</div>
              <div className="safety-item"><span className="dot-red">✕</span> We never request money for investment, registration, or profit promises</div>
              <div className="safety-item"><span className="dot-green">✓</span> All payments only via our official website through <strong>Monnify</strong></div>
              <div className="safety-item"><span className="dot-amber">→</span> Report suspicious messages to us immediately</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ABOUT ── */}
      <section className="section about-bg" id="about">
        <div className="section-inner">
          <div className="about-grid" ref={aboutRef}>
            <div className={`fade-up ${aboutVisible ? "visible" : ""}`}>
              <div className="about-left">
                <div className="section-label">About PAMBA</div>
                <h2 className="section-title" style={{color: "var(--white)"}}>Built for Nigerians.<br />Trusted Nationwide.</h2>
                <p className="section-sub">
                  PAMBA is a fully registered digital advertising and services platform, duly incorporated with the Corporate Affairs Commission (CAC) of Nigeria - connecting advertisers, businesses, content creators, and everyday users through compliant digital marketing.
                </p>
              </div>
              <div className="about-cards">
                <div className="about-card">
                  <h4>Our Mission</h4>
                  <h3>Secure, Compliant Advertising Ecosystem</h3>
                  <p>To provide a technology-driven digital advertising ecosystem that connects advertisers with real audiences, enables individuals to earn through legitimate marketing, and supports seamless payments and bill services.</p>
                </div>
                <div className="about-card">
                  <h4>Our Vision</h4>
                  <h3>Nigeria&apos;s Most Trusted Ad Platform</h3>
                  <p>To empower businesses to grow, promote innovative products and services, and create sustainable earning opportunities through transparent digital engagement.</p>
                </div>
              </div>
            </div>
            <div className={`about-right fade-up fade-up-2 ${aboutVisible ? "visible" : ""}`}>
              <div className="about-stat-card">
                <div className="big-num">₦10M+</div>
                <div className="big-label">Total Earnings Paid to Users</div>
              </div>
              <div className="about-stat-row">
                <div className="about-mini-stat">
                  <div className="num">10k+</div>
                  <div className="label">Active Users</div>
                </div>
                <div className="about-mini-stat">
                  <div className="num">500+</div>
                  <div className="label">Tasks Created</div>
                </div>
              </div>
              <div className="about-mini-stat" style={{textAlign: "center"}}>
                <div className="num" style={{fontSize: "1.1rem", fontFamily: "Sora, sans-serif", fontWeight: 700, color: "rgba(255,255,255,0.7)"}}>CAC Registered · Monnify Powered · Instant Payouts</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="section features-bg" id="features">
        <div className="section-inner">
          <div className={`section-header center fade-up ${featuresVisible ? "visible" : ""}`} ref={featuresRef}>
            <div className="section-label">Platform Features</div>
            <h2 className="section-title">Everything You Need to Earn & Advertise</h2>
            <p className="section-sub">A platform built for advertisers and earners alike - with real-time payouts, bill payments, and a referral engine.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: <Zap size={24}/>, title: "Instant Withdrawals", desc: "Earnings are credited the moment your task is approved. Withdraw directly to your Nigerian bank account - fast manual processing with automated transfers coming soon." },
              { icon: <Users size={24}/>, title: "Referral Bonuses", desc: "Earn every time someone you invite activates their account or makes their first advertiser payment. Stack referrals to scale your income passively." },
              { icon: <Wallet size={24}/>, title: "Pay Bills & Utilities", desc: "Use your PAMBA wallet to pay airtime, data, electricity, and other utilities directly. Earn, spend, and transact - all from one place." },
              { icon: <Target size={24}/>, title: "Targeted Task Creation", desc: "Advertisers define demographics, budgets, and cost-per-lead. Tasks reach exactly the right users, ensuring quality engagements for your brand." },
              { icon: <CheckCircle size={24}/>, title: "Verified Engagements", desc: "Every task submission is reviewed before payment. Advertisers only pay for validated, real interactions - no bots, no fraud." },
              { icon: <TrendingUp size={24}/>, title: "Real-Time Analytics", desc: "Monitor campaign performance, track task completions, and optimize your budget in real-time through your advertiser dashboard." },
            ].map((f, i) => (
              <div key={i} className={`feature-card fade-up fade-up-${Math.min(i+1,5)} ${featuresVisible ? "visible" : ""}`}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section hiw-bg" id="howitworks">
        <div className="section-inner" ref={howRef}>
          <div className={`section-header center fade-up ${howVisible ? "visible" : ""}`}>
            <div className="section-label">How It Works</div>
            <h2 className="section-title">Simple Steps. Real Earnings.</h2>
            <p className="section-sub">Whether you&apos;re here to earn or to advertise, getting started takes less than 5 minutes.</p>
          </div>

          <HowItWorksTabs howVisible={howVisible} />

          {/* Decorative image */}
          {/* <div className={`hiw-image-wrap fade-up fade-up-3 ${howVisible ? "visible" : ""}`}>
            <div className="hiw-image-inner">
              <Image src="/howitworks.jpg" alt="Platform demonstration" fill className="object-cover" />
            </div>
          </div> */}
        </div>
      </section>

      {/* ── BILLS ── */}
      <section className="section bills-bg" id="bills">
        <div className="section-inner">
          <div className="section-header center">
            <div className="section-label">Bills & Utilities</div>
            <h2 className="section-title">Pay Bills With Your Wallet</h2>
            <p className="section-sub">Use your earnings directly to pay for airtime, data, TV subscriptions, electricity, and more.</p>
          </div>
          <div className="bills-wrapper">
            <BillsCard />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-bg" ref={ctaRef}>
        <div className="cta-inner">
          <div className={`fade-up ${ctaVisible ? "visible" : ""}`}>
            <h2>Ready to Start Your Journey?</h2>
            <p>Join thousands of Nigerians already earning through PAMBA. Start completing tasks or launch your first campaign today.</p>
            <div className="cta-btns">
              <Link href="/auth/sign-up" className="btn-dark">
                Start Earning/Create Task <ArrowRight size={16} />
              </Link>
              <Link href="/auth/sign-in" className="btn-white">Login to Account</Link>
              <Link href="/advertise-directly" className="btn-white">Advertise Directly on Homepage</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div>
              <Link href="/" className="footer-logo-img">
                <Image src="/Pamba.png" alt="PAMBA" width={120} height={48} style={{objectFit:"contain"}} />
              </Link>
              <p className="footer-tagline">Nigeria&apos;s trusted digital advertising platform. Earn, advertise, and pay bills - all in one place.</p>
              <div className="footer-social">
                <a href="https://www.facebook.com/share/17sDa24NET/" title="Facebook" target="_blank" rel="noopener noreferrer"><FacebookIcon /></a>
                <a href="https://www.instagram.com/pambaadverts" title="Instagram" target="_blank" rel="noopener noreferrer"><InstagramIcon /></a>
                <a href="https://www.tiktok.com/@pambaadverts" title="TikTok" target="_blank" rel="noopener noreferrer"><TikTokIcon /></a>
                <a href="https://wa.me/message/LVWEYWZSTQBQI1" title="WhatsApp" target="_blank" rel="noopener noreferrer"><WhatsAppIcon /></a>
                <a href="https://www.youtube.com/@pambaadvertisementcompany" title="YouTube" target="_blank" rel="noopener noreferrer"><YouTubeIcon /></a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Platform</h4>
              <ul>
                <li><Link href="/auth/sign-up">Start Earning</Link></li>
                <li><Link href="/auth/sign-up">Create Tasks</Link></li>
                <li><Link href="/advertise-directly">Advertise Directly</Link></li>
                <li><a href="#bills">Pay Bills</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Account</h4>
              <ul>
                <li><Link href="/auth/sign-in">Login</Link></li>
                <li><Link href="/auth/sign-up">Sign Up</Link></li>
                <li><Link href="/faq">FAQ</Link></li>
                <li><Link href="/contact">Contact Us</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li><Link href="/terms">Terms of Service</Link></li>
                <li><Link href="/privacy">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2025 PAMBA. All rights reserved. CAC Registered.</p>
            <div className="footer-badges">
              <span className="footer-badge">CAC VERIFIED</span>
              <span className="footer-badge">MONNIFY POWERED</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

// ── How It Works Tabs ─────────────────────────────────────────────────────────
function HowItWorksTabs({ howVisible }: { howVisible: boolean }) {
  const [tab, setTab] = useState("earner");

  const earnerSteps = [
    { num: "01", icon: <UserCheck size={20}/>, title: "Sign Up & Activate", desc: "Create your free account and activate with a one-time ₦2,000 fee to unlock all available tasks." },
    { num: "02", icon: <Target size={20}/>, title: "Browse Tasks", desc: "Explore available tasks - YouTube views, social follows, website visits, app downloads, and more." },
    { num: "03", icon: <CheckCircle size={20}/>, title: "Complete & Submit", desc: "Follow the task instructions carefully and submit your proof of completion for review." },
    { num: "04", icon: <Wallet size={20}/>, title: "Get Paid Instantly", desc: "Once approved, earnings are credited to your wallet and ready to withdraw to your bank account." },
  ];

  const advertiserSteps = [
    { num: "01", icon: <Megaphone size={20}/>, title: "Sign Up & Fund", desc: "Create an advertiser account, verify your details, and fund your wallet via Monnify to get started." },
    { num: "02", icon: <Clipboard size={20}/>, title: "Create a Task", desc: "Define your objective, upload creatives, set your budget, target demographics, and cost-per-lead." },
    { num: "03", icon: <SlidersHorizontal size={20}/>, title: "Target & Optimize", desc: "Choose who sees your task, set pacing, and monitor real-time performance to optimize for quality." },
    { num: "04", icon: <CheckCircle size={20}/>, title: "Launch & Track", desc: "Review submissions, approve quality leads, and pay only for validated, verified results." },
  ];

  const steps = tab === "earner" ? earnerSteps : advertiserSteps;

  return (
    <>
      <div className="hiw-tabs">
        <button className={`hiw-tab ${tab === "earner" ? "active" : ""}`} onClick={() => setTab("earner")}>For Earners</button>
        <button className={`hiw-tab ${tab === "advertiser" ? "active" : ""}`} onClick={() => setTab("advertiser")}>For Advertisers</button>
      </div>
      <div className="hiw-steps">
        {steps.map((s, i) => (
          <div key={s.num} className={`hiw-step fade-up fade-up-${i+1} ${howVisible ? "visible" : ""}`}>
            <div className="hiw-step-num">{s.num}</div>
            <h4>{s.title}</h4>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
