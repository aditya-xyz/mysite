import { useLayoutEffect, useRef, useState } from "react";

// Reveal once in view, so mobile visitors see the stagger as they reach each list.
export function useEntrance<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [entered, setEntered] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const reveal = () => {
      setEntered(true);
      observer?.disconnect();
    };
    // Settling is permanent: focus loss must never restart a CSS entrance.
    const settle = () => {
      node.dataset.entranceSettled = "true";
      reveal();
    };
    const animationEnded = (event: AnimationEvent) => {
      if (event.target === node) settle();
    };
    if (preference.matches || !("IntersectionObserver" in window)) settle();
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) reveal();
        },
        { threshold: 0.12, rootMargin: "0px 0px -32px 0px" }
      );
      observer.observe(node);
    }
    const preferenceChanged = () => {
      if (preference.matches) settle();
    };
    // Tabbing to a link or disclosure must immediately reveal its container.
    node.addEventListener("focusin", settle);
    node.addEventListener("animationend", animationEnded);
    preference.addEventListener("change", preferenceChanged);
    return () => {
      observer?.disconnect();
      node.removeEventListener("focusin", settle);
      node.removeEventListener("animationend", animationEnded);
      preference.removeEventListener("change", preferenceChanged);
    };
  }, []);
  return { ref, entered };
}
