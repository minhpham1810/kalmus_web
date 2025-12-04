import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    // Check if SLURM is available
    let slurmAvailable = false;
    let slurmVersion = 'unknown';

    try {
      const { stdout } = await execAsync('sinfo --version');
      slurmAvailable = true;
      slurmVersion = stdout.trim();
    } catch (e) {
      // SLURM not available
    }

    return NextResponse.json({
      status: 'healthy',
      message: 'KALMUS Frontend API is running',
      slurm: {
        available: slurmAvailable,
        version: slurmVersion
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in health check:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}
