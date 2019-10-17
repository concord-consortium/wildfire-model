import React from "react";
import { forwardRef, useEffect } from "react";

interface IProps {
  style: {
    height: string;
    width: string;
  };
}

const CanvasFC: React.FC<IProps> = ({ style }, ref) => {
  const onWindowResize = () => {
    ref.current.style.height = style.height;
    ref.current.style.width = style.width;
  };

  useEffect(() => {
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  return (
    <canvas ref={ref} height={style.height} width={style.width} style={style}/>
  );
};

export const Canvas = forwardRef(CanvasFC);
