"use client";

import { useCallback } from "react";
import { BarcodeData, generateCSV, downloadCSV } from "@/lib/barcode-utils";

interface CSVExportButtonProps {
  barcodeData: BarcodeData;
  jobId: string;
  title?: string;
}

export default function CSVExportButton({
  barcodeData,
  jobId,
  title,
}: CSVExportButtonProps) {
  const handleExport = useCallback(() => {
    const csvContent = generateCSV(barcodeData);
    const slug = title
      ? title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
      : `barcode_${jobId}_${barcodeData.barcode_type.toLowerCase()}`;
    downloadCSV(csvContent, `${slug}.csv`);
  }, [barcodeData, jobId, title]);

  const isDisabled =
    (barcodeData.barcode_type === "Color" && !barcodeData.colors?.length) ||
    (barcodeData.barcode_type === "Brightness" && !barcodeData.brightness?.length);

  return (
    <button
      onClick={handleExport}
      disabled={isDisabled}
      className="group inline-flex items-center gap-2 px-4 py-2.5 text-xs font-mono tracking-wider border border-cyan-500/30 rounded bg-black/40 hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(78,205,196,0.15)] transition-all duration-300 text-cyan-400/80 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-cyan-500/30 disabled:hover:shadow-none"
    >
      <svg
        className="w-4 h-4 transition-transform group-hover:-translate-y-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      EXPORT_CSV
    </button>
  );
}
