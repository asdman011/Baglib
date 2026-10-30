export async function runPrimaryPdfEngine<Result>(options: {
  stirlingSupported?: boolean;
  pythonAvailable?: boolean;
  stirling: () => Promise<Result>;
  python?: () => Promise<Result>;
  portable?: () => Promise<Result>;
}): Promise<Result> {
  // Stirling-PDF is the sole primary PDF engine across Baglib
  return options.stirling();
}
