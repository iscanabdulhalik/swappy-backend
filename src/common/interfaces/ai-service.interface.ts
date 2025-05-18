export interface TextGenerationRequest {
  prompt: string;
  maxLength?: number;
  temperature?: number;
  model?: string; // İstenen model adını belirtmek için eklendi
}

export interface TextGenerationResponse {
  text: string;
  tokensUsed?: number;
}

export interface AIService {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResponse>;
}
