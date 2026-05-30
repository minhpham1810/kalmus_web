import path from "path";
import { findDuplicateAnalyses } from "@/lib/db";
import { buildClonedUploadPath, cloneUploadedVideo, deleteUploadedVideo } from "@/lib/hpc-transfer";
import { sendJobNotificationEmail, SLURM_CONFIG, submitSlurmJob } from "@/lib/slurm";
import { AnalysisConfigPayload, findDuplicateAnalysisSignatures } from "@/lib/multi-analysis";
import {
  createSubmissionBatch,
  createSubmissionBatchId,
  SubmissionBatchJobRecord,
  SubmissionBatchRecord,
  SubmissionBatchSharedConfig,
} from "@/lib/submission-batches";

interface SubmissionUser {
  username?: string;
  email?: string;
  fullName?: string;
}

export interface SubmitBarcodeBatchInput {
  videoPath: string;
  videoFilename: string;
  sharedConfig: SubmissionBatchSharedConfig;
  analysisConfigs: AnalysisConfigPayload[];
  movie?: Record<string, unknown>;
  user?: SubmissionUser;
}

export async function submitBarcodeBatch({
  videoPath,
  videoFilename,
  sharedConfig,
  analysisConfigs,
  movie,
  user,
}: SubmitBarcodeBatchInput): Promise<SubmissionBatchRecord> {
  const duplicateSignatures = findDuplicateAnalysisSignatures(analysisConfigs);
  if (duplicateSignatures.length > 0) {
    throw new Error(
      "Each batch option must be unique. Duplicate barcode type, frame type, and metric combination.",
    );
  }

  const videoTitle =
    movie && typeof movie.title === "string" && movie.title.trim()
      ? movie.title.trim()
      : videoFilename;

  const jobs: SubmissionBatchJobRecord[] = [];
  const duplicateJobs = new Map<string, SubmissionBatchJobRecord>();
  const submittedConfigs: AnalysisConfigPayload[] = [];

  for (const analysisConfig of analysisConfigs) {
    const duplicateMatch = findDuplicateAnalyses(
      (movie?.imdb_id as string | undefined) || null,
      analysisConfig,
    );

    if (duplicateMatch.exactMatch && !analysisConfig.force_reprocess) {
      if (sharedConfig.email) {
        try {
          await sendJobNotificationEmail({
            email: sharedConfig.email,
            status: "DUPLICATE",
            resultsUrl: `${SLURM_CONFIG.websiteUrl}/results/${duplicateMatch.exactMatch.job_id}`,
            videoTitle,
            metadataFile: path.join(SLURM_CONFIG.resultsDir, duplicateMatch.exactMatch.job_id, 'metadata.json'),
          });
        } catch (error) {
          console.error("Failed to send duplicate notification email:", error);
        }
      }

      duplicateJobs.set(analysisConfig.clientId, {
        clientId: analysisConfig.clientId,
        status: "duplicate",
        existingJobId: duplicateMatch.exactMatch.job_id,
        config: analysisConfig,
      });
      continue;
    }
    submittedConfigs.push(analysisConfig);
  }

  const videoPathByClientId = new Map<string, string>();
  for (const [index, analysisConfig] of submittedConfigs.entries()) {
    if (index === 0) {
      videoPathByClientId.set(analysisConfig.clientId, videoPath);
      continue;
    }

    const clonedPath = buildClonedUploadPath(videoPath, analysisConfig.clientId);
    await cloneUploadedVideo(videoPath, clonedPath);
    videoPathByClientId.set(analysisConfig.clientId, clonedPath);
  }

  for (const analysisConfig of analysisConfigs) {
    const duplicateJob = duplicateJobs.get(analysisConfig.clientId);
    if (duplicateJob) {
      jobs.push(duplicateJob);
      continue;
    }

    const result = await submitSlurmJob(
      videoPathByClientId.get(analysisConfig.clientId) || videoPath,
      videoFilename,
      {
        ...sharedConfig,
        color_metric: analysisConfig.color_metric,
        frame_type: analysisConfig.frame_type,
        barcode_type: analysisConfig.barcode_type,
        video_title: videoTitle,
        force_reprocess: analysisConfig.force_reprocess,
      },
      user,
      movie,
    );

    jobs.push({
      clientId: analysisConfig.clientId,
      status: "submitted",
      jobId: result.jobId,
      estimatedTime: result.estimatedTime,
      config: analysisConfig,
    });
  }

  if (submittedConfigs.length === 0) {
    await deleteUploadedVideo(videoPath);
  }

  return createSubmissionBatch({
    batchId: createSubmissionBatchId(),
    createdAt: new Date().toISOString(),
    filename: videoFilename,
    movie: movie || null,
    sharedConfig,
    jobs,
  });
}
