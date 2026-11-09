"use client";

import { useEffect, useState } from "react";
import { useInView } from "framer-motion";
import React, { useRef } from "react";

export function Counter({
  end,
  duration = 1.6,
  suffix = "",
  prefix = "",
}: {
  end: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const stepTime = 16;
    const totalSteps = (duration * 1000) / stepTime;
    const increment = end / totalSteps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return (
    <span ref={ref} className="font-mono tabular-nums">
      {prefix}
      {count}
      {suffix}
    </span>
  );
}

