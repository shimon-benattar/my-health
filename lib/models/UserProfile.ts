import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserProfile extends Document {
  key: string;
  name: string;
  birthdate: string;
  weightKg: number;
  heightCm: number;
  updatedAt: Date;
}

const UserProfileSchema = new Schema<IUserProfile>(
  {
    key: { type: String, required: true, unique: true, default: "primary" },
    name: { type: String, required: true },
    birthdate: { type: String, required: true },
    weightKg: { type: Number, required: true },
    heightCm: { type: Number, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

const UserProfile: Model<IUserProfile> =
  mongoose.models.UserProfile ??
  mongoose.model<IUserProfile>("UserProfile", UserProfileSchema);

export default UserProfile;
