export function describeDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") {
    return error.message.includes("slug")
      ? "That slug is already in use. Choose a different one."
      : "That record already exists.";
  }
  if (error.code === "23503") return "A related record was not found.";
  return fallback;
}
