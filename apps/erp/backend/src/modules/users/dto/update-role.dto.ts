import { IsNumber } from 'class-validator';

export class UpdateRoleDto {
  @IsNumber()
  cargoId: number; // ID do cargo
}
