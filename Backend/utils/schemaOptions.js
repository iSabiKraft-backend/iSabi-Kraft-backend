// Shared toJSON shape: expose `id` (not `_id`/`__v`) and never leak passwords.
export const toJSONOptions = {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.password;
    return ret;
  },
};

export const schemaOptions = { timestamps: true, toJSON: toJSONOptions };
