import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserProfile extends Document {
  key: string;
  name: string;
  birthdate: string;
  weightKg: number;
  heightCm: number;
  imageUrl?: string | null;
  sex?: "female" | "male" | "other" | null;
  timezone?: string | null;
  notes?: string | null;
  updatedAt: Date;
}

const UserProfileSchema = new Schema<IUserProfile>(
  {
    key: { type: String, required: true, unique: true, default: "primary" },
    name: { type: String, required: true },
    birthdate: { type: String, required: true },
    weightKg: { type: Number, required: true },
    heightCm: { type: Number, required: true },
    imageUrl: { type: String, default: null },
    sex: { type: String, enum: ["female", "male", "other", null], default: null },
    timezone: { type: String, default: "Asia/Jerusalem" },
    notes: { type: String, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

const UserProfile: Model<IUserProfile> =
  mongoose.models.UserProfile ??
  mongoose.model<IUserProfile>("UserProfile", UserProfileSchema);

export default UserProfile;
