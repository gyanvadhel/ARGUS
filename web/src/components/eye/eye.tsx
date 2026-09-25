"use client";

import dynamic from "next/dynamic";
import type { EyeSceneProps } from "./eye-scene";

export type { EyeMood } from "./eye-scene";

// three.js only runs in the browser; the placeholder keeps layout stable while it loads.
export const Eye = dynamic<EyeSceneProps>(() => import("./eye-scene").then((m) => m.EyeScene), {
  ssr: false,
  loading: () => <div className="size-full" />,
});
