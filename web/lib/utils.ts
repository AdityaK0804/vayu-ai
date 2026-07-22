import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/Magic UI class merge helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
