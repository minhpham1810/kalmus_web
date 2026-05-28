import { NextResponse } from 'next/server';

export async function GET() {
  try {
    return NextResponse.json({
      color_metrics: [
        'Average',
        'Median',
        'Mode',
        'Top-dominant',
        'Weighted-dominant',
      ],
      frame_types: [
        'whole_frame',
        'high_contrast',
        'low_contrast',
        'foreground',
        'background',
      ],
      barcode_types: ['Color', 'Brightness'],
      partitions: ['short', 'medium', 'long', 'lowpriority'],
    });
  } catch (error) {
    console.error('Error getting options:', error);
    return NextResponse.json(
      { error: 'Failed to get options' },
      { status: 500 }
    );
  }
}
