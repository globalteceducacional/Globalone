import { IsOptional, IsString, MinLength, IsArray } from 'class-validator';

export class SubmitChecklistItemDto {
  @IsString()
  @MinLength(5)
  descricao: string;

  @IsOptional()
  @IsString()
  imagem?: string; // Base64 ou URL da imagem (deprecated - usar imagens)

  @IsOptional()
  @IsString()
  documento?: string; // Base64 ou URL do documento (deprecated - usar documentos)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagens?: string[]; // Array de imagens (base64 ou URLs)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentos?: string[]; // Array de documentos (base64 ou URLs)
}

