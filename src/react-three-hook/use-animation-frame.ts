import { useRef, useLayoutEffect } from "react";

type ICallbackFn = (time: number) => void;

export const useAnimationFrame = (callback: ICallbackFn) => {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number>();

  const loop = (time: number) => {
    frameRef.current = requestAnimationFrame(loop);
    callbackRef.current(time);
  };

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useLayoutEffect(() => {
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current!);
  }, []);
};
