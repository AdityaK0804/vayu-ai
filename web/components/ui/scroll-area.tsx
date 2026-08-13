"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Minimal scroll shell — enough for Magic UI Tree without @radix-ui/react-scroll-area. */
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("relative overflow-auto", className)} {...props}>
    {children}
  </div>
));
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
