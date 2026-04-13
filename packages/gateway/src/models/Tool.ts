import mongoose, { Schema, Document } from 'mongoose';

export interface ITool extends Document {
  toolId: string;
  provider: string;
  price: string;
  category: string;
  endpoint: string;
  reputation: number;
}

const ToolSchema: Schema = new Schema({
  toolId: { type: String, required: true, unique: true },
  provider: { type: String, required: true },
  price: { type: String, required: true },
  category: { type: String, required: true },
  endpoint: { type: String, required: true },
  reputation: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model<ITool>('Tool', ToolSchema);
