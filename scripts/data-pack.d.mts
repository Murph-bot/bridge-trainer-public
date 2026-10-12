export const ROOT: string;
export const PACK_FILES: string[];
export function packDir(): string | null;
export function dataPath(name: string): string;
export function redirect(absPath: string): string | null;
export function dataPackPlugin(): import("vite").Plugin;
export const dataPackEsbuild: { name: string; setup(build: unknown): void };
