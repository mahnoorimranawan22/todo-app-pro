const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 200 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: [true, 'Task text is required'],
      trim: true,
      maxlength: [200, 'Task text must be under 200 characters'],
    },
    category: {
      type: String,
      enum: ['Study', 'Work', 'Personal', 'Other'],
      default: 'Personal',
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: '', maxlength: 2000 },
    subtasks: { type: [subtaskSchema], default: [] },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound indexes for the common list/filter queries (user-scoped).
taskSchema.index({ user: 1, createdAt: -1 });
taskSchema.index({ user: 1, completed: 1 });

// Consistent serialization used by all routes.
taskSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    text: this.text,
    category: this.category,
    priority: this.priority,
    dueDate: this.dueDate,
    notes: this.notes,
    subtasks: this.subtasks.map((s) => ({
      id: s._id,
      text: s.text,
      completed: s.completed,
    })),
    completed: this.completed,
    completedAt: this.completedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Task', taskSchema);
