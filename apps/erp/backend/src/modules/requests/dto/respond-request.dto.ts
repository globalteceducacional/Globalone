import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondRequestDto {
  @IsString()
  @MaxLength(1500)
  resposta: string;

  /** URL única ou JSON array de URLs (`serializeAttachmentUrls` no front). */
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  anexoResposta?: string;
}
