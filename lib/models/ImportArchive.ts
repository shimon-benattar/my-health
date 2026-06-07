import mongoose, { Document, Model, Schema } from "mongoose";

type ArchiveCollectionName = "HealthEntry" | "AppleHealthWorkout";
type SourceType = "apple-health";

export interface IImportArchive extends Document {
  snapshotId: string;
  sourceType: SourceType;
  collectionName: ArchiveCollectionName;
  originalId: string;
  archivedAt: Date;
  expiresAt: Date;
  payload: Record<string, unknown>;
}

const ImportArchiveSchema = new Schema<IImportArchive>(
  {
    snapshotId: { type: String, required: true, index: true },
    sourceType: { type: String, enum: ["apple-health"], required: true, index: true },
    collectionName: { type: String, enum: ["HealthEntry", "AppleHealthWorkout"], required: true, index: true },
    originalId: { type: String, required: true, index: true },
    archivedAt: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: false, collection: "import_archives" }
);

ImportArchiveSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ImportArchiveSchema.index({ snapshotId: 1, collectionName: 1 });

const ImportArchive: Model<IImportArchive> =
  mongoose.models.ImportArchive ?? mongoose.model<IImportArchive>("ImportArchive", ImportArchiveSchema);

export default ImportArchive;