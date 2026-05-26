interface BarcodeResultMetadata {
  barcode_type?: string;
  color_metric?: string;
  frame_type?: string;
}

type BarcodeResultPayload = Record<string, unknown>;

export function hydrateBarcodeResult(
  barcodeData: BarcodeResultPayload,
  metadata: BarcodeResultMetadata,
): BarcodeResultPayload {
  const resolvedBarcodeType =
    typeof metadata.barcode_type === "string" && metadata.barcode_type.trim()
      ? metadata.barcode_type
      : typeof barcodeData.barcode_type === "string" && barcodeData.barcode_type.trim()
        ? barcodeData.barcode_type
        : "Color";

  const resolvedColorMetric =
    typeof metadata.color_metric === "string" && metadata.color_metric.trim()
      ? metadata.color_metric
      : typeof barcodeData.color_metric === "string" && barcodeData.color_metric.trim()
        ? barcodeData.color_metric
        : typeof barcodeData.metric === "string" && barcodeData.metric.trim()
          ? barcodeData.metric
          : undefined;

  const resolvedFrameType =
    typeof metadata.frame_type === "string" && metadata.frame_type.trim()
      ? metadata.frame_type
      : typeof barcodeData.frame_type === "string" && barcodeData.frame_type.trim()
        ? barcodeData.frame_type
        : undefined;

  return {
    ...barcodeData,
    barcode_type: resolvedBarcodeType,
    color_metric: resolvedColorMetric,
    frame_type: resolvedFrameType,
    metric: resolvedColorMetric ?? barcodeData.metric,
  };
}
