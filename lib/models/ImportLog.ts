import mongoose, { Document, Model, Schema } from "mongoose";

type ImportStatus = "processing" | "success" | "error";
type LogLevel = "info" | "warn" | "error";

interface ImportStep {
  at: Date;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

interface ImportResultSummary {
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  pulled: number;
}

export interface IImportLog extends Document {
  requestId: string;
  filename: string;
  sourceType: "csv" | "apple-health";
  status: ImportStatus;
  startedAt: Date;
  finishedAt?: Date;
  steps: ImportStep[];
  result?: ImportResultSummary;
  error?: string;
}

const ImportStepSchema = new Schema<ImportStep>(
  {
    at: { type: Date, required: true },
    level: { type: String, enum: ["info", "warn", "error"], required: true },
    message: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const ImportResultSchema = new Schema<ImportResultSummary>(
  {
    inserted: { type: Number, required: true },
    updated: { type: Number, required: true },
    unchanged: { type: Number, required: true },
    skipped: { type: Number, required: true },
    pulled: { type: Number, required: true },
  },
  { _id: false }
);

const ImportLogSchema = new Schema<IImportLog>(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    sourceType: { type: String, enum: ["csv", "apple-health"], required: true },
    status: { type: String, enum: ["processing", "success", "error"], required: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    steps: { type: [ImportStepSchema], default: [] },
    result: { type: ImportResultSchema, default: undefined },
    error: { type: String, default: undefined },
  },
  { timestamps: false, collection: "import_logs" }
);

const ImportLog: Model<IImportLog> =
  mongoose.models.ImportLog ?? mongoose.model<IImportLog>("ImportLog", ImportLogSchema);

export default ImportLog;
