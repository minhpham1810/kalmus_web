import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      color_metrics: [
        'Average',
        'Median',
        'Mode',
        'Top-dominant',
        'Weighted-dominant',
        'Brightest',
        'Bright',
      ],
      frame_types: [
        'Whole_frame',
        'High_contrast_region',
        'Low_contrast_region',
        'Foreground',
        'Background',
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
