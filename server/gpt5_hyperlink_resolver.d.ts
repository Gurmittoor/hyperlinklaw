declare module './gpt5_hyperlink_resolver.js' {
  export function resolveHyperlink(
    ref: any,
    candidates: any[],
    minConfidence?: number,
    seed?: number
  ): Promise<{ decision: string; dest_page?: number; reason?: string }>;
}