import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

@Injectable()
export class ContentSanitizerService {
  sanitizeHtml(content: string): string {
    return sanitizeHtml(content, {
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      allowedAttributes: {
        a: ['href', 'target'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
    });
  }

  sanitizePlainText(content: string): string {
    return content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  sanitizeMarkdown(content: string): string {
    // Markdown için özel sanitize kuralları uygulanabilir
    // Basitçe tehlikeli HTML taglerini kaldır
    return this.sanitizePlainText(content);
  }
}
