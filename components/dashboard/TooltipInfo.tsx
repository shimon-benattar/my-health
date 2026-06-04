"use client";

import { useState } from "react";
import type { TooltipContent } from "@/lib/tooltipContent";

interface Props {
  title: string;
  content: TooltipContent;
}

export default function TooltipInfo({ title, content }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        aria-label={`More info about ${title}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100"
        onClick={() => setOpen((prev) => !prev)}
      >
        i
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-xl">
          <p className="font-semibold text-gray-900">Why</p>
          <p className="mt-1">{content.why}</p>

          <p className="mt-3 font-semibold text-gray-900">Trend Meaning</p>
          <p className="mt-1">{content.trendMeaning}</p>

          <p className="mt-3 font-semibold text-gray-900">Actionable Recommendations</p>
          <p className="mt-1">{content.actionableRecommendations}</p>
        </div>
      )}
    </div>
  );
}
