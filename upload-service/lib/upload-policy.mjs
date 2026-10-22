// Public policy shared by the receiver, browser validation and visible upload hint.
export const MAX_FILES = 5;
export const MAX_FILE_MB = 90;
export const MAX_TOTAL_MB = 300;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;
export const UPLOAD_LIMIT_HINT = `1–${MAX_FILES} 个文件 · 单个 ≤ ${MAX_FILE_MB} MB · 合计 ≤ ${MAX_TOTAL_MB} MB`;
export const FILE_SIZE_ERROR = `单文件须为 1 B–${MAX_FILE_MB} MB`;
export const TOTAL_SIZE_ERROR = `文件总大小不能超过 ${MAX_TOTAL_MB} MB`;
