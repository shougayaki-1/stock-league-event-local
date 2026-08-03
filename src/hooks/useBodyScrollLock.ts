import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyle: Pick<CSSStyleDeclaration, "left" | "overflow" | "position" | "right" | "top" | "width"> | null = null;

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      savedBodyStyle = {
        left: document.body.style.left,
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        right: document.body.style.right,
        top: document.body.style.top,
        width: document.body.style.width,
      };

      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0 || !savedBodyStyle) return;

      document.body.style.position = savedBodyStyle.position;
      document.body.style.top = savedBodyStyle.top;
      document.body.style.left = savedBodyStyle.left;
      document.body.style.right = savedBodyStyle.right;
      document.body.style.width = savedBodyStyle.width;
      document.body.style.overflow = savedBodyStyle.overflow;
      window.scrollTo(0, savedScrollY);
      savedBodyStyle = null;
    };
  }, [isLocked]);
}
