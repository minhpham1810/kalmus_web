"use client";

import { useCallback } from "react";
import { BarcodeData, generateCSV, downloadCSV } from "@/lib/barcode-utils";

interface CSVExportButtonProps {
  barcodeData: BarcodeData;
  jobId: string;
}

export default function CSVExportButton({
  barcodeData,
  jobId,
}: CSVExportButtonProps) {
  const handleExport = useCallback(() => {
    const csvContent = generateCSV(barcodeData);
    const filename = `barcode_${jobId}_${barcodeData.barcode_type.toLowerCase()}.csv`;
    downloadCSV(csvContent, filename);
  }, [barcodeData, jobId]);

  const isDisabled =
    (barcodeData.barcode_type === "Color" && !barcodeData.colors?.length) ||
    (barcodeData.barcode_type === "Brightness" && !barcodeData.brightness?.length);

  return (
    <button
      onClick={handleExport}
      disabled={isDisabled}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      Export CSV
    </button>
  );
}
