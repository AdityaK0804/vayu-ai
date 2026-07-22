"use client";

import type { ReactNode, SVGProps } from "react";

export interface IphoneProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  width?: number;
  height?: number;
  /** rendered inside the screen cut-out */
  children?: ReactNode;
  src?: string;
}

/**
 * Magic UI Iphone 15 Pro frame.
 *
 * Upstream only accepts an image/video `src`; this variant also takes children
 * so a live React node (our alert bubble) can render on the screen instead of a
 * static screenshot. The frame geometry and the 433x882 viewBox are unchanged.
 */
export function Iphone({ width = 433, height = 882, children, src, ...props }: IphoneProps) {
  return (
    <div style={{ position: "relative", width, height, maxWidth: "100%" }}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 433 882"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        {...props}
      >
        {/* outer titanium band */}
        <path
          d="M2 73C2 32.6832 34.6832 0 75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73Z"
          fill="#2b3230"
        />
        <path
          d="M6 74C6 34.2355 38.2355 2 78 2H354C393.765 2 426 34.2355 426 74V808C426 847.764 393.765 880 354 880H78C38.2355 880 6 847.764 6 808V74Z"
          fill="#0d1513"
        />
        {/* screen bed */}
        <path
          d="M21.25 75C21.25 44.2101 46.2101 19.25 77 19.25H355C385.79 19.25 410.75 44.2101 410.75 75V807C410.75 837.79 385.79 862.75 355 862.75H77C46.2101 862.75 21.25 837.79 21.25 807V75Z"
          fill="#07110f"
          stroke="#3a4a46"
          strokeWidth="0.5"
        />
        {/* side buttons */}
        <path d="M0 171C0 170.448 0.447715 170 1 170H3V204H1C0.447715 204 0 203.552 0 203V171Z" fill="#2b3230" />
        <path d="M1 234C1 233.448 1.44772 233 2 233H3V300H2C1.44772 300 1 299.552 1 299V234Z" fill="#2b3230" />
        <path d="M1 319C1 318.448 1.44772 318 2 318H3V385H2C1.44772 385 1 384.552 1 384V319Z" fill="#2b3230" />
        <path d="M430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z" fill="#2b3230" />
      </svg>

      {/* screen surface */}
      <div
        style={{
          position: "absolute",
          left: "5.1%",
          top: "2.4%",
          width: "89.8%",
          height: "95.4%",
          borderRadius: "12.6% / 6.2%",
          overflow: "hidden",
          background: "var(--surface)",
        }}
      >
        {/* dynamic island */}
        <div
          style={{
            position: "absolute",
            top: "1.6%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "31%",
            height: "3.6%",
            background: "#05100e",
            borderRadius: 999,
            zIndex: 3,
          }}
        />
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", overflow: "auto" }}>{children}</div>
        )}
      </div>
    </div>
  );
}

export default Iphone;
