import mongoose, { Document, Model, Schema } from "mongoose";

export interface IHealthEntryBackup extends Document {
  originalId: string;
  date: Date;
  backupAt: Date;
  reason: string;
  payload: Record<string, unknown>;
}

const HealthEntryBackupSchema = new Schema<IHealthEntryBackup>(
  {
    originalId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    backupAt: { type: Date, required: true, index: true },
    reason: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: false, collection: "health_entries_backup_temp" }
);

const HealthEntryBackup: Model<IHealthEntryBackup> =
  mongoose.models.HealthEntryBackup ??
  mongoose.model<IHealthEntryBackup>("HealthEntryBackup", HealthEntryBackupSchema);

export default HealthEntryBackup;
