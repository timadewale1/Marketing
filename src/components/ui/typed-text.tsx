"use client";

import { useEffect, useRef } from 'react';
import Typed from 'typed.js';

interface TypedTextProps {
  strings: string[];
  className?: string;
}

export function TypedText({ strings, className }: TypedTextProps) {
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!el.current) return;

    const typed = new Typed(el.current, {
      strings,
      typeSpeed: 50,
      backSpeed: 50,
      backDelay: 2000,
      loop: true,
      showCursor: true,
    });

    return () => {
      typed.destroy();
    };
  }, [strings]);

  return <span ref={el} className={className} />;
}