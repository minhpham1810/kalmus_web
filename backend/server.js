import express from "express";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import {
  submitJob,
  checkJobStatus,
  cancelJob,
  getJobResult,
} from "./services/slurmService.js";
import { authenticateUser } from "./middleware/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Upload to shared filesystem accessible by compute nodes
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename with timestamp to avoid collisions
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${timestamp}_${sanitizedName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 * 100, // 500MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|flv|wmv/;
    const extname = allowedTypes.test(
      file.originalname.toLowerCase().split(".").pop()
    );

    if (extname) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Allowed types: mp4, avi, mov, mkv, flv, wmv"
        )
      );
    }
  },
});

// Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    message: "KALMUS API (Node.js + SLURM) is running",
  });
});

// Get available options for barcode generation
app.get("/api/options", (req, res) => {
  res.json({
    color_metrics: [
      "Average",
      "Median",
      "Mode",
      "Top-dominant",
      "Weighted-dominant",
      "Brightest",
      "Bright",
    ],
    frame_types: [
      "Whole_frame",
      "High_contrast_region",
      "Low_contrast_region",
      "Foreground",
      "Background",
    ],
    barcode_types: ["Color", "Brightness"],
    partitions: ["short", "medium", "long", "lowpriority"],
  });
});

// Submit video for processing
app.post("/api/generate-barcode", authenticateUser, upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video file provided" });
    }

    // Extract generation parameters
    const config = {
      color_metric: req.body.color_metric || "Average",
      frame_type: req.body.frame_type || "Whole_frame",
      barcode_type: req.body.barcode_type || "Color",
      sampled_rate: parseInt(req.body.sampled_rate) || 2,
      skip_over: parseInt(req.body.skip_over) || 0,
      total_frames: parseInt(req.body.total_frames) || 100000000,
      frames_per_column: parseInt(req.body.frames_per_column) || 50,
      partition: req.body.partition || "short",
      email: req.body.email || null,
    };

    // Submit SLURM job
    const jobResult = await submitJob(req.file.path, req.file.filename, config, req.user);

    res.json({
      success: true,
      message: "Job submitted successfully",
      jobId: jobResult.jobId,
      filename: req.file.filename,
      estimatedTime: jobResult.estimatedTime,
    });
  } catch (error) {
    console.error("Error submitting job:", error);
    res.status(500).json({
      error: "Failed to submit job",
      details: error.message,
    });
  }
});

// Check job status
app.get("/api/job-status/:jobId", authenticateUser, async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await checkJobStatus(jobId);

    res.json({
      success: true,
      jobId,
      ...status,
    });
  } catch (error) {
    console.error("Error checking job status:", error);
    res.status(500).json({
      error: "Failed to check job status",
      details: error.message,
    });
  }
});

// Get job result
app.get("/api/job-result/:jobId", authenticateUser, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await getJobResult(jobId);

    if (!result) {
      return res.status(404).json({
        error: "Result not found or job not completed",
      });
    }

    res.json({
      success: true,
      jobId,
      ...result,
    });
  } catch (error) {
    console.error("Error getting job result:", error);
    res.status(500).json({
      error: "Failed to get job result",
      details: error.message,
    });
  }
});

// Cancel job
app.delete("/api/job/:jobId", authenticateUser, async (req, res) => {
  try {
    const { jobId } = req.params;
    await cancelJob(jobId);

    res.json({
      success: true,
      message: "Job cancelled successfully",
      jobId,
    });
  } catch (error) {
    console.error("Error cancelling job:", error);
    res.status(500).json({
      error: "Failed to cancel job",
      details: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File too large. Maximum size is 500MB",
      });
    }
    return res.status(400).json({
      error: "File upload error",
      details: err.message,
    });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   KALMUS Backend Server (Node.js)     ║
╚════════════════════════════════════════╝

Server running on: http://localhost:${PORT}
Upload directory: ${process.env.UPLOAD_DIR || "./uploads"}
Results directory: ${process.env.RESULTS_DIR || "./results"}

Ready to accept video uploads and submit SLURM jobs!
  `);
});
