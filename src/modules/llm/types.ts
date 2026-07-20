import type { AssessmentOutput } from "./schema";
import type { PromptInput } from "./prompts/assessment-v1";

export interface LlmAssessment {
  output: AssessmentOutput;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LlmClient {
  readonly name: string;
  /** One assessment call. Throws if the model output fails schema validation
   *  after the allowed retry (docs/04 §4). */
  assess(input: PromptInput): Promise<LlmAssessment>;
}
